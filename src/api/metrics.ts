/**
 * Query builders and parsers for the Leader metrics store (POST /system/metrics/query) and the
 * per-Node raw metrics endpoint (GET /w/:wid/system/metrics).
 *
 * Findings that shape these queries (verified against a 4.20 Leader):
 *  - `earliest`/`latest` must be epoch SECONDS; relative strings like "-15m" return nothing.
 *  - Metric names are quoted inside aggregation expressions: avg("system.load_avg").as("load").
 *  - Rows without `__worker_node` belong to the Leader itself.
 *  - `system.cpu_perc` is only stored per Node on the Node (per Worker Process), so CPU comes
 *    from the worker-scoped endpoint with a regex `metricNameFilter`.
 */
import { metricsQuery, workerMetrics } from './cribl';
import type { MetricRow, RawMetricBucket } from './types';

export type RangeKey = '15m' | '1h' | '6h' | '24h';

export interface TimeRange {
  key: RangeKey;
  label: string;
  seconds: number;
  /** Aggregation window for time series, in seconds. */
  window: number;
}

export const TIME_RANGES: TimeRange[] = [
  { key: '15m', label: '15 min', seconds: 15 * 60, window: 30 },
  { key: '1h', label: '1 hour', seconds: 3600, window: 60 },
  { key: '6h', label: '6 hours', seconds: 6 * 3600, window: 300 },
  { key: '24h', label: '24 hours', seconds: 24 * 3600, window: 900 },
];

export function rangeByKey(key: string | undefined): TimeRange {
  return TIME_RANGES.find((r) => r.key === key) ?? TIME_RANGES[1];
}

export const LEADER_KEY = '__leader__';

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function num(v: string | number | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function nodeKey(row: MetricRow): string {
  const id = row.__worker_node;
  return typeof id === 'string' && id ? id : LEADER_KEY;
}

// ---- Node resource snapshot -------------------------------------------------------------

export interface NodeSnapshot {
  load?: number;
  memTotal?: number;
  memFree?: number;
  diskUsed?: number;
  diskTotal?: number;
  rss?: number;
  heap?: number;
}

/** Latest resource figures per Node, averaged over the last two minutes. */
export async function fetchNodeSnapshot(signal?: AbortSignal): Promise<Map<string, NodeSnapshot>> {
  const latest = nowSec();
  const res = await metricsQuery(
    {
      earliest: latest - 120,
      latest,
      aggs: {
        aggregations: [
          'avg("system.load_avg").as("load")',
          'max("system.total_mem").as("memTotal")',
          'avg("system.free_mem").as("memFree")',
          'avg("system.disk_used").as("diskUsed")',
          'max("system.total_disk").as("diskTotal")',
          'max("system.mem_rss").as("rss")',
          'max("system.mem_heap_used").as("heap")',
        ],
        cumulative: true,
        splitBys: ['__worker_node'],
      },
    },
    signal,
  );
  const out = new Map<string, NodeSnapshot>();
  for (const row of res.results ?? []) {
    out.set(nodeKey(row), {
      load: num(row.load),
      memTotal: num(row.memTotal),
      memFree: num(row.memFree),
      diskUsed: num(row.diskUsed),
      diskTotal: num(row.diskTotal),
      rss: num(row.rss),
      heap: num(row.heap),
    });
  }
  return out;
}

// ---- Throughput ------------------------------------------------------------------------

export interface Throughput {
  inEvents: number;
  outEvents: number;
  inBytes: number;
  outBytes: number;
  dropped: number;
  /** Seconds the totals cover, for rate conversion. */
  seconds: number;
}

const THROUGHPUT_AGGS = [
  'sum("total.in_events").as("inEvents")',
  'sum("total.out_events").as("outEvents")',
  'sum("total.in_bytes").as("inBytes")',
  'sum("total.out_bytes").as("outBytes")',
  'sum("total.dropped_events").as("dropped")',
];

function rowThroughput(row: MetricRow, seconds: number): Throughput {
  return {
    inEvents: num(row.inEvents) ?? 0,
    outEvents: num(row.outEvents) ?? 0,
    inBytes: num(row.inBytes) ?? 0,
    outBytes: num(row.outBytes) ?? 0,
    dropped: num(row.dropped) ?? 0,
    seconds,
  };
}

/** Totals per Node over the trailing `seconds` (default: last 2 minutes), as a Map by Node id. */
export async function fetchNodeThroughput(seconds = 120, signal?: AbortSignal): Promise<Map<string, Throughput>> {
  const latest = nowSec();
  const res = await metricsQuery(
    {
      earliest: latest - seconds,
      latest,
      where: 'has_no_dimensions',
      aggs: { aggregations: THROUGHPUT_AGGS, cumulative: true, splitBys: ['__worker_node'] },
    },
    signal,
  );
  const out = new Map<string, Throughput>();
  for (const row of res.results ?? []) out.set(nodeKey(row), rowThroughput(row, seconds));
  return out;
}

// ---- Time series -----------------------------------------------------------------------

export interface SeriesPoint {
  t: number;
  v: number;
}

export interface NodeSeriesRow {
  node: string;
  t: number;
  load?: number;
  memTotal?: number;
  memFree?: number;
  diskUsed?: number;
  diskTotal?: number;
}

/**
 * Resource time series per Node (one row per Node per window). `shift` moves the window back by
 * that many seconds, which is how "versus the previous period" comparisons are fetched.
 */
export async function fetchNodeResourceSeries(range: TimeRange, signal?: AbortSignal, shift = 0): Promise<NodeSeriesRow[]> {
  const latest = nowSec() - shift;
  const res = await metricsQuery(
    {
      earliest: latest - range.seconds,
      latest,
      aggs: {
        aggregations: [
          'avg("system.load_avg").as("load")',
          'max("system.total_mem").as("memTotal")',
          'avg("system.free_mem").as("memFree")',
          'avg("system.disk_used").as("diskUsed")',
          'max("system.total_disk").as("diskTotal")',
        ],
        timeWindowSeconds: range.window,
        splitBys: ['__worker_node'],
      },
    },
    signal,
  );
  return (res.results ?? [])
    .filter((r) => typeof r.starttime === 'number')
    .map((r) => ({
      node: nodeKey(r),
      t: r.starttime as number,
      load: num(r.load),
      memTotal: num(r.memTotal),
      memFree: num(r.memFree),
      diskUsed: num(r.diskUsed),
      diskTotal: num(r.diskTotal),
    }));
}

export interface ThroughputSeriesRow extends Throughput {
  node: string;
  t: number;
}

/** Throughput time series per Node (one row per Node per window). */
export async function fetchThroughputSeries(range: TimeRange, signal?: AbortSignal, shift = 0): Promise<ThroughputSeriesRow[]> {
  const latest = nowSec() - shift;
  const res = await metricsQuery(
    {
      earliest: latest - range.seconds,
      latest,
      where: 'has_no_dimensions',
      aggs: { aggregations: THROUGHPUT_AGGS, timeWindowSeconds: range.window, splitBys: ['__worker_node'] },
    },
    signal,
  );
  return (res.results ?? [])
    .filter((r) => typeof r.starttime === 'number')
    .map((r) => ({ node: nodeKey(r), t: r.starttime as number, ...rowThroughput(r, range.window) }));
}

// ---- Sources / Destinations / Pipelines ------------------------------------------------

/** 0 = green, 1 = yellow, 2 = red in the `health.inputs` / `health.outputs` metrics. */
export type HealthLevel = 0 | 1 | 2;

export function healthLevel(v: number | undefined): HealthLevel | undefined {
  if (v === undefined) return undefined;
  return v >= 2 ? 2 : v >= 1 ? 1 : 0;
}

export interface IoMetricRow {
  group: string;
  id: string;
  type: string;
  name: string;
  events: number;
  bytes: number;
  health?: HealthLevel;
  seconds: number;
}

function splitIoId(full: string): { type: string; name: string } {
  const i = full.indexOf(':');
  return i === -1 ? { type: '', name: full } : { type: full.slice(0, i), name: full.slice(i + 1) };
}

export async function fetchSources(range: TimeRange, signal?: AbortSignal, shift = 0): Promise<IoMetricRow[]> {
  const latest = nowSec() - shift;
  const res = await metricsQuery(
    {
      earliest: latest - range.seconds,
      latest,
      where: 'input!=undefined && __worker_group!=undefined',
      aggs: {
        aggregations: [
          'sum("total.in_events").as("events")',
          'sum("total.in_bytes").as("bytes")',
          'max("health.inputs").as("health")',
        ],
        cumulative: true,
        splitBys: ['__worker_group', 'input'],
      },
    },
    signal,
  );
  return parseIoRows(res.results ?? [], 'input', range.seconds);
}

export async function fetchDestinations(range: TimeRange, signal?: AbortSignal, shift = 0): Promise<IoMetricRow[]> {
  const latest = nowSec() - shift;
  const res = await metricsQuery(
    {
      earliest: latest - range.seconds,
      latest,
      where: 'output!=undefined && __worker_group!=undefined',
      aggs: {
        aggregations: [
          'sum("total.out_events").as("events")',
          'sum("total.out_bytes").as("bytes")',
          'max("health.outputs").as("health")',
        ],
        cumulative: true,
        splitBys: ['__worker_group', 'output'],
      },
    },
    signal,
  );
  return parseIoRows(res.results ?? [], 'output', range.seconds);
}

function parseIoRows(rows: MetricRow[], dim: 'input' | 'output', seconds: number): IoMetricRow[] {
  const out: IoMetricRow[] = [];
  for (const r of rows) {
    const id = r[dim];
    const group = r.__worker_group;
    if (typeof id !== 'string' || typeof group !== 'string') continue;
    const { type, name } = splitIoId(id);
    out.push({
      group,
      id,
      type,
      name,
      events: num(r.events) ?? 0,
      bytes: num(r.bytes) ?? 0,
      health: healthLevel(num(r.health)),
      seconds,
    });
  }
  return out;
}

export interface PipelineMetricRow {
  group: string;
  id: string;
  inEvents: number;
  outEvents: number;
  dropped: number;
  seconds: number;
}

export async function fetchPipelines(range: TimeRange, signal?: AbortSignal, shift = 0): Promise<PipelineMetricRow[]> {
  const latest = nowSec() - shift;
  const res = await metricsQuery(
    {
      earliest: latest - range.seconds,
      latest,
      where: 'id!=undefined && __worker_group!=undefined',
      aggs: {
        aggregations: [
          'sum("pipe.in_events").as("inEvents")',
          'sum("pipe.out_events").as("outEvents")',
          'sum("pipe.dropped_events").as("dropped")',
        ],
        cumulative: true,
        splitBys: ['__worker_group', 'id'],
      },
    },
    signal,
  );
  const out: PipelineMetricRow[] = [];
  for (const r of res.results ?? []) {
    if (typeof r.id !== 'string' || typeof r.__worker_group !== 'string') continue;
    out.push({
      group: r.__worker_group,
      id: r.id,
      inEvents: num(r.inEvents) ?? 0,
      outEvents: num(r.outEvents) ?? 0,
      dropped: num(r.dropped) ?? 0,
      seconds: range.seconds,
    });
  }
  return out;
}

// ---- Per-Node CPU (worker-scoped endpoint) ---------------------------------------------

/**
 * One time bucket read from a Node itself. For Edge Nodes this is the ONLY source of per-node
 * memory, load, disk and throughput: the Leader store keeps Edge metrics at Fleet level only.
 */
export interface CpuSample {
  t: number;
  /** CPU % per Worker Process, indexed by process number. */
  processes: number[];
  load?: number;
  memFree?: number;
  memTotal?: number;
  diskUsed?: number;
  diskTotal?: number;
  inEvents?: number;
  outEvents?: number;
  inBytes?: number;
  outBytes?: number;
  dropped?: number;
  /** Seconds this bucket covers, for turning the throughput totals into rates. */
  span: number;
}

// `_time` must be in the filter or the buckets come back without timestamps.
const NODE_FILTER = '^(_time|system\\.(cpu_perc|load_avg|free_mem|total_mem|disk_used|total_disk)|total\\.(in_events|out_events|in_bytes|out_bytes|dropped_events))$';

function bucketVal(bucket: RawMetricBucket, name: string): number | undefined {
  const arr = bucket[name];
  return arr && arr.length ? arr[0].val : undefined;
}

/** The Node-wide total of a `total.*` counter is the entry tagged `__internal`, not the per-Source ones. */
function totalVal(bucket: RawMetricBucket, name: string): number | undefined {
  const arr = bucket[name];
  if (!arr || !arr.length) return undefined;
  const tot = arr.find((e) => e.model.__internal === '1' || Object.keys(e.model).length === 0);
  return tot ? tot.val : undefined;
}

function parseNodeBucket(bucket: RawMetricBucket, span: number, fallbackTime: number): CpuSample | undefined {
  // Some Leaders omit `_time` when a metricNameFilter is set; fall back to the bucket's grid time.
  const t = bucketVal(bucket, '_time') ?? fallbackTime;
  if (!Object.keys(bucket).some((k) => k !== '_time')) return undefined;
  const procs: number[] = [];
  for (const entry of bucket['system.cpu_perc'] ?? []) {
    const idx = Number(entry.model.__worker_process ?? procs.length);
    procs[Number.isFinite(idx) ? idx : procs.length] = entry.val;
  }
  return {
    t,
    span,
    processes: Array.from(procs, (v) => v ?? 0),
    load: bucketVal(bucket, 'system.load_avg'),
    memFree: bucketVal(bucket, 'system.free_mem'),
    memTotal: bucketVal(bucket, 'system.total_mem'),
    diskUsed: bucketVal(bucket, 'system.disk_used'),
    diskTotal: bucketVal(bucket, 'system.total_disk'),
    inEvents: totalVal(bucket, 'total.in_events'),
    outEvents: totalVal(bucket, 'total.out_events'),
    inBytes: totalVal(bucket, 'total.in_bytes'),
    outBytes: totalVal(bucket, 'total.out_bytes'),
    dropped: totalVal(bucket, 'total.dropped_events'),
  };
}

/**
 * Resource and throughput history for one Node: `numBuckets` samples across the range, read
 * from the Node. `shift` moves the window back for previous-period comparisons.
 */
export async function fetchNodeCpuSeries(nodeId: string, range: TimeRange, numBuckets = 30, signal?: AbortSignal, shift = 0) {
  const latest = nowSec() - shift;
  const span = range.seconds / Math.max(1, numBuckets);
  const res = await workerMetrics(
    nodeId,
    { earliest: latest - range.seconds, latest, numBuckets, metricNameFilter: NODE_FILTER },
    signal,
  );
  const earliest = latest - range.seconds;
  return (res.results?.metrics ?? [])
    .map((b, i) => parseNodeBucket(b, span, Math.floor(earliest + i * span)))
    .filter((s): s is CpuSample => s !== undefined);
}

/** Latest sample for one Node (last 60 seconds, one bucket). */
export async function fetchNodeCpuNow(nodeId: string, signal?: AbortSignal): Promise<CpuSample | undefined> {
  const latest = nowSec();
  const res = await workerMetrics(
    nodeId,
    { earliest: latest - 60, latest, numBuckets: 1, metricNameFilter: NODE_FILTER },
    signal,
  );
  const buckets = res.results?.metrics ?? [];
  for (let i = buckets.length - 1; i >= 0; i--) {
    const s = parseNodeBucket(buckets[i], 60, latest - 60);
    if (s && (s.processes.length || s.memTotal !== undefined)) return s;
  }
  return undefined;
}

// ---- Fleet-level throughput (the Leader keeps Edge throughput per group) -----------------

export interface GroupThroughputRow extends Throughput {
  group: string;
  t: number;
}

/** Totals per group over the trailing `seconds`, from the Leader store. Works for Edge Fleets. */
export async function fetchGroupThroughput(seconds = 120, signal?: AbortSignal, shift = 0): Promise<Map<string, Throughput>> {
  const latest = nowSec() - shift;
  const res = await metricsQuery(
    {
      earliest: latest - seconds,
      latest,
      where: 'has_no_dimensions && __worker_group!=undefined',
      aggs: { aggregations: THROUGHPUT_AGGS, cumulative: true, splitBys: ['__worker_group'] },
    },
    signal,
  );
  const out = new Map<string, Throughput>();
  for (const row of res.results ?? []) if (typeof row.__worker_group === 'string') out.set(row.__worker_group, rowThroughput(row, seconds));
  return out;
}

/** Throughput time series per group (one row per group per window). */
export async function fetchGroupThroughputSeries(range: TimeRange, signal?: AbortSignal, shift = 0): Promise<GroupThroughputRow[]> {
  const latest = nowSec() - shift;
  const res = await metricsQuery(
    {
      earliest: latest - range.seconds,
      latest,
      where: 'has_no_dimensions && __worker_group!=undefined',
      aggs: { aggregations: THROUGHPUT_AGGS, timeWindowSeconds: range.window, splitBys: ['__worker_group'] },
    },
    signal,
  );
  return (res.results ?? [])
    .filter((r) => typeof r.starttime === 'number' && typeof r.__worker_group === 'string')
    .map((r) => ({ group: r.__worker_group as string, t: r.starttime as number, ...rowThroughput(r, range.window) }));
}

/**
 * Node CPU as a share of the whole machine: the Worker Processes' CPU (each 0-100% of one
 * core) summed and divided by the core count.
 */
export function nodeCpuPct(sample: CpuSample | undefined, cpus: number | undefined): number | undefined {
  if (!sample || !sample.processes.length) return undefined;
  const sum = sample.processes.reduce((a, b) => a + b, 0);
  const cores = cpus && cpus > 0 ? cpus : sample.processes.length;
  return Math.min(100, sum / cores);
}

/** Fetch the latest CPU sample for many Nodes with bounded concurrency. Failures are skipped. */
export async function fetchCpuForNodes(
  nodeIds: string[],
  concurrency = 4,
  signal?: AbortSignal,
): Promise<Map<string, CpuSample>> {
  const out = new Map<string, CpuSample>();
  let next = 0;
  const worker = async () => {
    while (next < nodeIds.length && !signal?.aborted) {
      const id = nodeIds[next++];
      try {
        const s = await fetchNodeCpuNow(id, signal);
        if (s) out.set(id, s);
      } catch {
        // A Node that is disconnected or slow simply shows no CPU figure.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, nodeIds.length) }, worker));
  return out;
}
