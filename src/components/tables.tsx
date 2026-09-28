import { useMemo, useState } from 'react';

type Key = string | number;
import { Link } from 'react-router-dom';
import { Table, defineColumns } from '@capra/core';
import type { IoMetricRow, PipelineMetricRow } from '../api/metrics';
import type { GroupRow, NodeRow } from '../model/nodes';
import { CellMeter } from './Meter';
import { HealthPill, NodeStatePill, StatusDot } from './Status';
import { formatBytes, formatCompact, formatDuration, formatPct, formatRate, shortVersion } from '../utils/format';

export interface SortDescriptor {
  column: Key;
  direction: 'ascending' | 'descending';
}

export type Selection = 'all' | Set<Key>;

export function useSorted<T extends Record<string, unknown>>(items: T[], initial: SortDescriptor) {
  const [sort, setSort] = useState<SortDescriptor>(initial);
  const sorted = useMemo(() => {
    const col = String(sort.column);
    const dir = sort.direction === 'ascending' ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      if (va === vb) return 0;
      if (va === undefined || va === null) return 1;
      if (vb === undefined || vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [items, sort]);
  return { sorted, sort, setSort };
}

// ---- Nodes ----------------------------------------------------------------------------

const nodeColumns = defineColumns<NodeRow>([
  { id: 'state', label: 'Status', allowsSorting: true, render: (v) => <NodeStatePill state={v as NodeRow['state']} /> },
  {
    id: 'hostname',
    label: 'Host',
    allowsSorting: true,
    render: (v, item) => (
      <span className="cell-stack">
        <Link className="cell-link" to={`/nodes/${encodeURIComponent(item.id)}`}>{v as string}</Link>
        <span className="muted mono" style={{ fontSize: '11px' }}>{item.id.slice(0, 8)}</span>
      </span>
    ),
  },
  { id: 'group', label: 'Group', allowsSorting: true, render: (v, item) => <Link className="cell-link" to={`/groups/${encodeURIComponent(item.group)}`}>{v as string}</Link> },
  { id: 'cpuPct', label: 'CPU', allowsSorting: true, render: (v) => <CellMeter value={v as number | undefined} /> },
  { id: 'memPct', label: 'Memory', allowsSorting: true, render: (v, item) => <CellMeter value={v as number | undefined} text={item.memUsed !== undefined ? `${formatBytes(item.memUsed, 1)}` : undefined} /> },
  { id: 'diskPct', label: 'Disk', allowsSorting: true, render: (v) => <CellMeter value={v as number | undefined} warn={80} danger={92} /> },
  { id: 'load', label: 'Load', allowsSorting: true, render: (v, item) => <span className="num">{v === undefined ? '--' : `${(v as number).toFixed(2)} / ${item.cpus}`}</span> },
  { id: 'inEps', label: 'In', allowsSorting: true, render: (v) => <span className="num">{formatRate(v as number | undefined, ' eps')}</span> },
  { id: 'outEps', label: 'Out', allowsSorting: true, render: (v) => <span className="num">{formatRate(v as number | undefined, ' eps')}</span> },
  { id: 'dropEps', label: 'Dropped', allowsSorting: true, render: (v) => <span className="num">{formatRate(v as number | undefined, ' eps')}</span> },
  { id: 'workerProcesses', label: 'Procs', allowsSorting: true, render: (v) => <span className="num">{String(v)}</span> },
  { id: 'version', label: 'Version', allowsSorting: true, render: (v) => <span className="num">{shortVersion(v as string)}</span> },
  { id: 'uptimeSec', label: 'Uptime', allowsSorting: true, render: (v) => <span className="num">{formatDuration(v as number | undefined)}</span> },
  { id: 'heartbeatAgeSec', label: 'Heartbeat', allowsSorting: true, render: (v) => <span className="num">{Number.isFinite(v as number) ? `${Math.round(v as number)}s ago` : '--'}</span> },
]);

const NODE_COLUMNS_DEFAULT = ['state', 'hostname', 'group', 'cpuPct', 'memPct', 'diskPct', 'load', 'inEps', 'outEps', 'dropEps', 'workerProcesses', 'version', 'uptimeSec'] as const;

interface NodesTableProps {
  nodes: NodeRow[];
  loading?: boolean;
  selectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  hideGroup?: boolean;
}

export function NodesTable({ nodes, loading, selectedKeys, onSelectionChange, hideGroup }: NodesTableProps) {
  const { sorted, sort, setSort } = useSorted(nodes, { column: 'cpuPct', direction: 'descending' });
  const visible = NODE_COLUMNS_DEFAULT.filter((c) => !(hideGroup && c === 'group'));
  return (
    <div className="table-wrap">
      <Table
        columns={nodeColumns}
        visibleColumns={[...visible]}
        items={sorted}
        density="compact"
        isLoading={loading}
        sortDescriptor={sort}
        onSortChange={(d) => setSort(d as SortDescriptor)}
        selectionMode={onSelectionChange ? 'multiple' : undefined}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange ? (k) => onSelectionChange(k as Selection) : undefined}
        aria-label="Nodes"
      />
    </div>
  );
}

// ---- Groups ---------------------------------------------------------------------------

const groupColumns = defineColumns<GroupRow>([
  {
    id: 'name',
    label: 'Group',
    allowsSorting: true,
    render: (v, item) => (
      <span className="cell-stack">
        <Link className="cell-link" to={`/groups/${encodeURIComponent(item.id)}`}>{v as string}</Link>
        {item.description && <span className="muted" style={{ fontSize: '11px' }}>{item.description}</span>}
      </span>
    ),
  },
  { id: 'kind', label: 'Type', allowsSorting: true },
  {
    id: 'nodes',
    label: 'Nodes',
    allowsSorting: true,
    render: (v, item) => (
      <span className="inline-actions num">
        <StatusDot tone={item.nodes === 0 ? 'muted' : item.disconnected || item.unhealthy ? (item.healthy ? 'warning' : 'danger') : 'ok'} label={`${item.healthy} healthy, ${item.unhealthy} unhealthy, ${item.disconnected} disconnected`} />
        {item.healthy}/{v as number}
        {item.disconnected > 0 && <span className="muted">({item.disconnected} off)</span>}
      </span>
    ),
  },
  { id: 'cpuPct', label: 'CPU avg', allowsSorting: true, render: (v) => <CellMeter value={v as number | undefined} /> },
  { id: 'memPct', label: 'Memory avg', allowsSorting: true, render: (v) => <CellMeter value={v as number | undefined} /> },
  { id: 'inEps', label: 'In', allowsSorting: true, render: (v) => <span className="num">{formatRate(v as number, ' eps')}</span> },
  { id: 'outEps', label: 'Out', allowsSorting: true, render: (v) => <span className="num">{formatRate(v as number, ' eps')}</span> },
  { id: 'dropEps', label: 'Dropped', allowsSorting: true, render: (v) => <span className="num">{formatRate(v as number, ' eps')}</span> },
  { id: 'versions', label: 'Versions', render: (v) => <span className="num">{(v as string[]).map(shortVersion).join(', ') || '--'}</span> },
  { id: 'configVersion', label: 'Config', allowsSorting: true, render: (v, item) => <span className="num">{(v as string).split('-')[0]}{item.configMismatch > 0 && <span className="status-warn"> ({item.configMismatch} behind)</span>}</span> },
  { id: 'cloud', label: 'Where', render: (v, item) => <span className="nowrap">{item.onPrem ? 'On-prem' : `Cloud ${v ?? ''}`.trim()}</span> },
]);

export function GroupsTable({ groups, loading }: { groups: GroupRow[]; loading?: boolean }) {
  const { sorted, sort, setSort } = useSorted(groups, { column: 'nodes', direction: 'descending' });
  return (
    <div className="table-wrap">
      <Table
        columns={groupColumns}
        visibleColumns={['name', 'kind', 'nodes', 'cpuPct', 'memPct', 'inEps', 'outEps', 'dropEps', 'versions', 'configVersion', 'cloud']}
        items={sorted}
        density="compact"
        isLoading={loading}
        sortDescriptor={sort}
        onSortChange={(d) => setSort(d as SortDescriptor)}
        aria-label="Groups"
      />
    </div>
  );
}

// ---- Sources / Destinations / Pipelines ------------------------------------------------

export type IoTableRow = IoMetricRow & { key: string; eps: number; bps: number; prevEvents?: number; deltaPct?: number; [k: string]: unknown };

/** Percentage change from `prev` to `cur`; undefined when there is no previous value to compare. */
export function pctChange(cur: number, prev: number | undefined): number | undefined {
  if (prev === undefined) return undefined;
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

export function toIoRows(rows: IoMetricRow[], prev?: IoMetricRow[]): IoTableRow[] {
  const prevBy = new Map((prev ?? []).map((r) => [`${r.group}|${r.id}`, r.events]));
  return rows.map((r) => {
    const key = `${r.group}|${r.id}`;
    const prevEvents = prev ? (prevBy.get(key) ?? 0) : undefined;
    return { ...r, key, eps: r.events / r.seconds, bps: r.bytes / r.seconds, prevEvents, deltaPct: pctChange(r.events, prevEvents) };
  });
}

/** Signed percentage with a tone: `upIsBad` flips the coloring for measures like drops or memory. */
export function DeltaTag({ pct, upIsBad = false, suffix = '' }: { pct: number | undefined; upIsBad?: boolean; suffix?: string }) {
  if (pct === undefined || !Number.isFinite(pct)) return <span className="muted num">--</span>;
  const flat = Math.abs(pct) < 0.5;
  const tone = flat ? 'muted' : (pct > 0) === upIsBad ? 'warning' : 'ok';
  const text = flat ? `±0%${suffix}` : `${pct > 0 ? '+' : '−'}${Math.abs(pct) >= 1000 ? '999+' : Math.abs(pct).toFixed(pct >= 10 ? 0 : 1)}%${suffix}`;
  return <span className={`delta-tag tone-${tone} num`}>{text}</span>;
}

const ioColumns = defineColumns<IoTableRow & { id: string }>([
  { id: 'health', label: 'Health', allowsSorting: true, render: (v) => <HealthPill level={v as IoMetricRow['health']} /> },
  { id: 'name', label: 'Name', allowsSorting: true, render: (v) => <span className="cell-link" style={{ color: 'inherit' }}>{v as string}</span> },
  { id: 'type', label: 'Type', allowsSorting: true },
  { id: 'group', label: 'Group', allowsSorting: true, render: (v) => <Link className="cell-link" to={`/groups/${encodeURIComponent(v as string)}`}>{v as string}</Link> },
  { id: 'eps', label: 'Events/s', allowsSorting: true, render: (v) => <span className="num">{formatCompact(v as number)}</span> },
  { id: 'bps', label: 'Bytes/s', allowsSorting: true, render: (v) => <span className="num">{formatBytes(v as number)}/s</span> },
  { id: 'events', label: 'Events (range)', allowsSorting: true, render: (v) => <span className="num">{formatCompact(v as number)}</span> },
  { id: 'deltaPct', label: 'vs prev', allowsSorting: true, render: (v, item) => <span title={item.prevEvents !== undefined ? `previous window: ${formatCompact(item.prevEvents)} events` : undefined}><DeltaTag pct={v as number | undefined} /></span> },
  { id: 'bytes', label: 'Bytes (range)', allowsSorting: true, render: (v) => <span className="num">{formatBytes(v as number)}</span> },
]);

const IO_COLUMNS = ['health', 'name', 'type', 'group', 'eps', 'bps', 'events', 'deltaPct', 'bytes'] as const;

export function IoTable({ rows, loading, hideGroup, label }: { rows: IoTableRow[]; loading?: boolean; hideGroup?: boolean; label: string }) {
  const items = useMemo(() => rows.map((r) => ({ ...r, id: r.key, ioId: r.id })), [rows]);
  const { sorted, sort, setSort } = useSorted(items, { column: 'eps', direction: 'descending' });
  const cols = IO_COLUMNS.filter((c) => !(hideGroup && c === 'group'));
  return (
    <div className="table-wrap">
      <Table columns={ioColumns} visibleColumns={cols} items={sorted} density="compact" isLoading={loading} sortDescriptor={sort} onSortChange={(d) => setSort(d as SortDescriptor)} aria-label={label} />
    </div>
  );
}

export type PipelineTableRow = PipelineMetricRow & { key: string; inEps: number; outEps: number; dropEps: number; dropPct: number; deltaPct?: number; dropDeltaPts?: number; [k: string]: unknown };

export function toPipelineRows(rows: PipelineMetricRow[], prev?: PipelineMetricRow[]): PipelineTableRow[] {
  const prevBy = new Map((prev ?? []).map((r) => [`${r.group}|${r.id}`, r]));
  return rows.map((r) => {
    const key = `${r.group}|${r.id}`;
    const p = prev ? prevBy.get(key) : undefined;
    const dropPct = r.inEvents ? (r.dropped / r.inEvents) * 100 : 0;
    const prevDropPct = p ? (p.inEvents ? (p.dropped / p.inEvents) * 100 : 0) : undefined;
    return {
      ...r,
      key,
      inEps: r.inEvents / r.seconds,
      outEps: r.outEvents / r.seconds,
      dropEps: r.dropped / r.seconds,
      dropPct,
      deltaPct: pctChange(r.inEvents, prev ? (p?.inEvents ?? 0) : undefined),
      dropDeltaPts: prevDropPct === undefined ? undefined : dropPct - prevDropPct,
    };
  });
}

const pipeColumns = defineColumns<PipelineTableRow & { pipelineId: string }>([
  { id: 'pipelineId', label: 'Pipeline', allowsSorting: true, render: (v) => <span className="mono">{v as string}</span> },
  { id: 'group', label: 'Group', allowsSorting: true, render: (v) => <Link className="cell-link" to={`/groups/${encodeURIComponent(v as string)}`}>{v as string}</Link> },
  { id: 'inEps', label: 'In events/s', allowsSorting: true, render: (v) => <span className="num">{formatCompact(v as number)}</span> },
  { id: 'outEps', label: 'Out events/s', allowsSorting: true, render: (v) => <span className="num">{formatCompact(v as number)}</span> },
  { id: 'dropEps', label: 'Dropped/s', allowsSorting: true, render: (v) => <span className="num">{formatCompact(v as number)}</span> },
  { id: 'dropPct', label: 'Drop rate', allowsSorting: true, render: (v, item) => <span className="inline-actions"><CellMeter value={v as number} warn={50} danger={90} text={formatPct(v as number, 0)} />{item.dropDeltaPts !== undefined && Math.abs(item.dropDeltaPts) >= 0.5 && <DeltaTag pct={item.dropDeltaPts} upIsBad suffix=" pts" />}</span> },
  { id: 'inEvents', label: 'In (range)', allowsSorting: true, render: (v) => <span className="num">{formatCompact(v as number)}</span> },
  { id: 'deltaPct', label: 'vs prev', allowsSorting: true, render: (v) => <DeltaTag pct={v as number | undefined} /> },
]);

const PIPE_COLUMNS = ['pipelineId', 'group', 'inEps', 'outEps', 'dropEps', 'dropPct', 'inEvents', 'deltaPct'] as const;

export function PipelinesTable({ rows, loading, hideGroup }: { rows: PipelineTableRow[]; loading?: boolean; hideGroup?: boolean }) {
  const items = useMemo(() => rows.map((r) => ({ ...r, pipelineId: r.id, id: r.key })), [rows]);
  const { sorted, sort, setSort } = useSorted(items, { column: 'inEps', direction: 'descending' });
  const cols = PIPE_COLUMNS.filter((c) => !(hideGroup && c === 'group'));
  return (
    <div className="table-wrap">
      <Table columns={pipeColumns} visibleColumns={cols} items={sorted} density="compact" isLoading={loading} sortDescriptor={sort} onSortChange={(d) => setSort(d as SortDescriptor)} aria-label="Pipelines" />
    </div>
  );
}
