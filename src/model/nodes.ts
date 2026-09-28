import type { ConfigGroup, MasterWorkerEntry, Product } from '../api/types';
import type { CpuSample, NodeSnapshot, Throughput } from '../api/metrics';
import { nodeCpuPct } from '../api/metrics';

export type Severity = 'ok' | 'warning' | 'danger';

export function pctSeverity(pct: number | undefined, warn = 75, danger = 90): Severity {
  if (pct === undefined) return 'ok';
  if (pct >= danger) return 'danger';
  if (pct >= warn) return 'warning';
  return 'ok';
}

export type NodeState = 'healthy' | 'unhealthy' | 'disconnected' | 'late' | 'unknown';

export interface NodeRow {
  id: string;
  hostname: string;
  group: string;
  product: Product;
  state: NodeState;
  rawStatus: string;
  disconnected: boolean;
  heartbeatAgeSec: number;
  hbPeriodSec: number;
  version: string;
  configVersion: string;
  platform: string;
  arch: string;
  cpus: number;
  workerProcesses: number;
  uptimeSec?: number;
  memTotal?: number;
  memUsed?: number;
  memPct?: number;
  load?: number;
  loadPct?: number;
  diskTotal?: number;
  diskUsed?: number;
  diskPct?: number;
  rss?: number;
  /** OS-level CPU estimate: 1-minute load as a share of cores (the Node's own processes are not in the Leader). */
  cpuPct?: number;
  /** CPU of Cribl's Worker Processes only, summed over cores. */
  criblCpuPct?: number;
  cpuProcesses?: number[];
  inEps?: number;
  outEps?: number;
  inBps?: number;
  outBps?: number;
  dropEps?: number;
  isSaas: boolean;
  isCaptain: boolean;
  connIp?: string;
  protocol?: string;
  deployable: boolean;
  entry: MasterWorkerEntry;
  [key: string]: unknown;
}

export function groupProduct(group: ConfigGroup | undefined): Product {
  return group?.type === 'edge' || group?.isFleet ? 'edge' : 'stream';
}

export function nodeState(entry: MasterWorkerEntry, now = Date.now()): NodeState {
  if (entry.disconnected) return 'disconnected';
  const hb = (entry.info?.cribl?.config?.hbPeriodSeconds ?? 10) * 1000;
  const age = now - (entry.lastMsgTime ?? 0);
  if (entry.lastMsgTime && age > Math.max(5 * hb, 5 * 60_000)) return 'late';
  const s = (entry.status ?? '').toLowerCase();
  if (s === 'healthy') return 'healthy';
  if (!s) return 'unknown';
  return 'unhealthy';
}

export interface FleetInputs {
  workers: MasterWorkerEntry[];
  groups: ConfigGroup[];
  snapshot?: Map<string, NodeSnapshot>;
  throughput?: Map<string, Throughput>;
  cpu?: Map<string, CpuSample>;
  now?: number;
}

export function buildNodeRows({ workers, groups, snapshot, throughput, cpu, now = Date.now() }: FleetInputs): NodeRow[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  return workers.map((w) => {
    const info = w.info ?? {};
    const cribl = info.cribl ?? {};
    const snap = snapshot?.get(w.id);
    const cpuSample = cpu?.get(w.id);
    // Edge Nodes have no per-node rows in the Leader store; the Node's own sample fills in.
    const sampleTp: Throughput | undefined =
      cpuSample && cpuSample.inEvents !== undefined
        ? { inEvents: cpuSample.inEvents, outEvents: cpuSample.outEvents ?? 0, inBytes: cpuSample.inBytes ?? 0, outBytes: cpuSample.outBytes ?? 0, dropped: cpuSample.dropped ?? 0, seconds: cpuSample.span }
        : undefined;
    const tp = throughput?.get(w.id) ?? sampleTp;
    const cpus = info.cpus ?? 0;

    // Prefer the metrics store; fall back to heartbeat-reported figures.
    const memTotal = snap?.memTotal ?? cpuSample?.memTotal ?? info.totalmem;
    const memFree = snap?.memFree ?? cpuSample?.memFree ?? info.freemem;
    const memUsed = memTotal !== undefined && memFree !== undefined ? Math.max(0, memTotal - memFree) : undefined;
    const memPct = memTotal && memUsed !== undefined ? (memUsed / memTotal) * 100 : undefined;

    const diskTotal = snap?.diskTotal ?? cpuSample?.diskTotal ?? info.totalDiskSpace;
    const diskUsed =
      snap?.diskUsed ??
      cpuSample?.diskUsed ??
      (info.totalDiskSpace !== undefined && info.freeDiskSpace !== undefined
        ? info.totalDiskSpace - info.freeDiskSpace
        : undefined);
    const diskPct = diskTotal && diskUsed !== undefined ? (diskUsed / diskTotal) * 100 : undefined;

    const load = snap?.load ?? cpuSample?.load;
    const loadPct = load !== undefined && cpus > 0 ? Math.min(100, (load / cpus) * 100) : undefined;

    const startTime = cribl.startTime;
    return {
      id: w.id,
      hostname: info.hostname ?? w.id,
      group: w.group,
      product: groupProduct(groupById.get(w.group)),
      state: nodeState(w, now),
      rawStatus: w.status ?? 'unknown',
      disconnected: !!w.disconnected,
      heartbeatAgeSec: w.lastMsgTime ? Math.max(0, (now - w.lastMsgTime) / 1000) : Number.POSITIVE_INFINITY,
      hbPeriodSec: cribl.config?.hbPeriodSeconds ?? 10,
      version: cribl.version ?? '--',
      configVersion: cribl.config?.version ?? '--',
      platform: info.platform ?? '--',
      arch: info.architecture ?? '--',
      cpus,
      workerProcesses: w.workerProcesses ?? 0,
      uptimeSec: startTime ? Math.max(0, (now - startTime) / 1000) : undefined,
      memTotal,
      memUsed,
      memPct,
      load,
      loadPct,
      diskTotal,
      diskUsed,
      diskPct,
      rss: snap?.rss,
      cpuPct: loadPct ?? nodeCpuPct(cpuSample, cpus),
      criblCpuPct: nodeCpuPct(cpuSample, cpus),
      cpuProcesses: cpuSample?.processes,
      inEps: tp ? tp.inEvents / tp.seconds : undefined,
      outEps: tp ? tp.outEvents / tp.seconds : undefined,
      inBps: tp ? tp.inBytes / tp.seconds : undefined,
      outBps: tp ? tp.outBytes / tp.seconds : undefined,
      dropEps: tp ? tp.dropped / tp.seconds : undefined,
      isSaas: !!info.isSaasWorker,
      isCaptain: !!info.isCaptain,
      connIp: info.conn_ip,
      protocol: w.connectionProtocol,
      deployable: w.deployable !== false,
      entry: w,
    };
  });
}

export interface GroupRow {
  id: string;
  name: string;
  description: string;
  product: Product;
  kind: 'Worker Group' | 'Edge Fleet' | string;
  onPrem: boolean;
  cloud?: string;
  configVersion: string;
  inherits?: string;
  nodes: number;
  healthy: number;
  unhealthy: number;
  disconnected: number;
  versions: string[];
  configMismatch: number;
  inEps: number;
  outEps: number;
  dropEps: number;
  inBps: number;
  outBps: number;
  cpuPct?: number;
  memPct?: number;
  group: ConfigGroup;
  [key: string]: unknown;
}

/**
 * Group rows. Throughput prefers the Leader's per-group totals (they cover every Node, connected
 * or not); the sum of Node samples is the fallback.
 */
export function buildGroupRows(groups: ConfigGroup[], nodes: NodeRow[], groupThroughput?: Map<string, Throughput>): GroupRow[] {
  return groups
    .filter((g) => g.type !== 'search' && !g.isSearch)
    .map((g) => {
      const members = nodes.filter((n) => n.group === g.id);
      const versions = Array.from(new Set(members.map((m) => m.version))).sort();
      const cpuVals = members.map((m) => m.cpuPct).filter((v): v is number => v !== undefined);
      const memVals = members.map((m) => m.memPct).filter((v): v is number => v !== undefined);
      const product = groupProduct(g);
      const gt = groupThroughput?.get(g.id);
      return {
        id: g.id,
        name: g.name || g.id,
        description: g.description ?? '',
        product,
        kind: g.type === 'outpost' ? 'Outpost Group' : product === 'edge' ? 'Edge Fleet' : 'Worker Group',
        onPrem: g.onPrem !== false,
        cloud: g.cloud ? `${g.cloud.provider ?? ''} ${g.cloud.region ?? ''}`.trim() : undefined,
        configVersion: g.configVersion ?? '--',
        inherits: g.inherits,
        nodes: members.length,
        healthy: members.filter((m) => m.state === 'healthy').length,
        unhealthy: members.filter((m) => m.state === 'unhealthy' || m.state === 'late').length,
        disconnected: members.filter((m) => m.state === 'disconnected').length,
        versions,
        configMismatch: members.filter((m) => g.configVersion && !m.configVersion.startsWith(g.configVersion.split('-')[0]))
          .length,
        inEps: gt ? gt.inEvents / gt.seconds : members.reduce((a, m) => a + (m.inEps ?? 0), 0),
        outEps: gt ? gt.outEvents / gt.seconds : members.reduce((a, m) => a + (m.outEps ?? 0), 0),
        dropEps: gt ? gt.dropped / gt.seconds : members.reduce((a, m) => a + (m.dropEps ?? 0), 0),
        inBps: gt ? gt.inBytes / gt.seconds : members.reduce((a, m) => a + (m.inBps ?? 0), 0),
        outBps: gt ? gt.outBytes / gt.seconds : members.reduce((a, m) => a + (m.outBps ?? 0), 0),
        cpuPct: cpuVals.length ? cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length : undefined,
        memPct: memVals.length ? memVals.reduce((a, b) => a + b, 0) / memVals.length : undefined,
        group: g,
      };
    });
}

export interface FleetTotals {
  nodes: number;
  healthy: number;
  unhealthy: number;
  disconnected: number;
  cpus: number;
  memTotal: number;
  memUsed: number;
  memPct?: number;
  diskTotal: number;
  diskUsed: number;
  diskPct?: number;
  cpuPct?: number;
  loadPct?: number;
  inEps: number;
  outEps: number;
  inBps: number;
  outBps: number;
  dropEps: number;
  healthPct: number;
}

export function fleetTotals(nodes: NodeRow[], groups?: GroupRow[]): FleetTotals {
  const withMem = nodes.filter((n) => n.memTotal && n.memUsed !== undefined);
  const withDisk = nodes.filter((n) => n.diskTotal && n.diskUsed !== undefined);
  const withCpu = nodes.filter((n) => n.cpuPct !== undefined);
  const withLoad = nodes.filter((n) => n.loadPct !== undefined);
  const memTotal = withMem.reduce((a, n) => a + (n.memTotal ?? 0), 0);
  const memUsed = withMem.reduce((a, n) => a + (n.memUsed ?? 0), 0);
  const diskTotal = withDisk.reduce((a, n) => a + (n.diskTotal ?? 0), 0);
  const diskUsed = withDisk.reduce((a, n) => a + (n.diskUsed ?? 0), 0);
  const cpus = nodes.reduce((a, n) => a + n.cpus, 0);
  const cpuWeighted = withCpu.reduce((a, n) => a + (n.cpuPct ?? 0) * Math.max(1, n.cpus), 0);
  const cpuCores = withCpu.reduce((a, n) => a + Math.max(1, n.cpus), 0);
  const loadWeighted = withLoad.reduce((a, n) => a + (n.loadPct ?? 0) * Math.max(1, n.cpus), 0);
  const loadCores = withLoad.reduce((a, n) => a + Math.max(1, n.cpus), 0);
  const healthy = nodes.filter((n) => n.state === 'healthy').length;
  return {
    nodes: nodes.length,
    healthy,
    unhealthy: nodes.filter((n) => n.state === 'unhealthy' || n.state === 'late' || n.state === 'unknown').length,
    disconnected: nodes.filter((n) => n.state === 'disconnected').length,
    cpus,
    memTotal,
    memUsed,
    memPct: memTotal ? (memUsed / memTotal) * 100 : undefined,
    diskTotal,
    diskUsed,
    diskPct: diskTotal ? (diskUsed / diskTotal) * 100 : undefined,
    cpuPct: cpuCores ? cpuWeighted / cpuCores : undefined,
    loadPct: loadCores ? loadWeighted / loadCores : undefined,
    inEps: groups ? groups.reduce((a, g) => a + g.inEps, 0) : nodes.reduce((a, n) => a + (n.inEps ?? 0), 0),
    outEps: groups ? groups.reduce((a, g) => a + g.outEps, 0) : nodes.reduce((a, n) => a + (n.outEps ?? 0), 0),
    inBps: groups ? groups.reduce((a, g) => a + g.inBps, 0) : nodes.reduce((a, n) => a + (n.inBps ?? 0), 0),
    outBps: groups ? groups.reduce((a, g) => a + g.outBps, 0) : nodes.reduce((a, n) => a + (n.outBps ?? 0), 0),
    dropEps: groups ? groups.reduce((a, g) => a + g.dropEps, 0) : nodes.reduce((a, n) => a + (n.dropEps ?? 0), 0),
    healthPct: nodes.length ? (healthy / nodes.length) * 100 : 100,
  };
}
