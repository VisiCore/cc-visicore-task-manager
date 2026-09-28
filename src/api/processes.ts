/**
 * Live OS process and container lists from Edge Nodes.
 *
 * Verified against a 4.20 Leader: `GET /w/{nodeId}/edge/processes` answers only for Edge Nodes
 * (Stream Workers return 404), ignores `top`, and pages with `limit`/`offset`. Each entry is a
 * raw /proc snapshot (~4 KB), so a node with 200 processes is ~0.4 MB per refresh.
 */
import { apiGet } from './client';
import type { Paginated } from './types';

interface RawEdgeProcess {
  id: string;
  pid: number;
  ppid?: number;
  uid?: number;
  gid?: number;
  user?: string;
  cpu?: number;
  cpu_seconds?: number;
  mem_percent?: number;
  mem_bytes?: number;
  starttime?: number;
  threads?: number;
  state?: string;
  command?: string;
  comm?: string;
  stat?: { comm?: string; state?: string; priority?: number; nice?: number; num_threads?: number; ppid?: number };
  statm?: { resident?: number; shared?: number; size?: number };
  cmdline?: { args?: string[] };
  args?: string[];
  exe?: { path?: string };
  exePath?: string;
  cgroup?: Record<string, string>;
  service?: string;
  environ?: Record<string, string>;
  container?: { type?: string; id?: string; name?: string } | string;
  container_name?: string;
  io?: { read_bytes?: number; write_bytes?: number; rchar?: number; wchar?: number };
  fds?: number | unknown[];
  net?: { tcp?: RawSocket[]; udp?: RawSocket[]; unix?: unknown[] };
  status?: Record<string, unknown>;
}

interface RawSocket {
  localIP?: string;
  localPort?: string | number;
  externalIP?: string;
  externalPort?: string | number;
  state?: string;
  ipv6?: boolean;
}

export interface ProcessSocket {
  proto: 'tcp' | 'udp';
  local: string;
  localPort: number;
  remote: string;
  remotePort: number;
  /** `inbound` = listening or accepted, `outbound` = a client connection. */
  state: string;
  ipv6: boolean;
}

export interface ProcessRow {
  id: string;
  pid: number;
  ppid: number;
  user: string;
  command: string;
  args: string;
  exePath: string;
  cpu: number;
  memPct: number;
  memBytes: number;
  cpuSeconds: number;
  threads: number;
  state: string;
  priority?: number;
  nice?: number;
  startTime?: number;
  service: string;
  container: string;
  ioRead?: number;
  ioWrite?: number;
  ioReadChars?: number;
  ioWriteChars?: number;
  fds?: number;
  uid?: number;
  gid?: number;
  sockets: ProcessSocket[];
  /** Listening (inbound, no remote peer) ports, deduplicated. */
  listening: number[];
  env: Record<string, string>;
  argv: string[];
  [key: string]: unknown;
}

const STATE_LABEL: Record<string, string> = {
  R: 'Running',
  S: 'Sleeping',
  D: 'Disk wait',
  Z: 'Zombie',
  T: 'Stopped',
  t: 'Traced',
  I: 'Idle',
  X: 'Dead',
};

export function stateLabel(state: string): string {
  return STATE_LABEL[state] ?? state ?? '--';
}

function cgroupService(cg: Record<string, string> | undefined): string {
  if (!cg) return '';
  const v = Object.values(cg)[0] ?? '';
  const last = v.split('/').filter(Boolean).pop() ?? '';
  return last.replace(/\.service$|\.scope$/, '');
}

function socketsOf(p: RawEdgeProcess): ProcessSocket[] {
  const out: ProcessSocket[] = [];
  const add = (proto: 'tcp' | 'udp', list: RawSocket[] | undefined) => {
    for (const s of list ?? []) {
      out.push({
        proto,
        local: s.localIP ?? '',
        localPort: Number(s.localPort ?? 0),
        remote: s.externalIP ?? '',
        remotePort: Number(s.externalPort ?? 0),
        state: s.state ?? '',
        ipv6: !!s.ipv6,
      });
    }
  };
  add('tcp', p.net?.tcp);
  add('udp', p.net?.udp);
  return out;
}

function normalize(p: RawEdgeProcess): ProcessRow {
  const args = p.cmdline?.args ?? p.args ?? [];
  const comm = (p.stat?.comm ?? p.comm ?? p.command ?? '').trim();
  const command = comm || (args[0] ? args[0].split('/').pop() ?? args[0] : `pid ${p.pid}`);
  const container = typeof p.container === 'string' ? p.container : p.container?.name ?? p.container?.id ?? p.container_name ?? '';
  const sockets = socketsOf(p);
  return {
    id: String(p.id ?? p.pid),
    pid: p.pid,
    ppid: p.ppid ?? p.stat?.ppid ?? 0,
    user: p.user ?? p.environ?.USER ?? (p.uid === 0 ? 'root' : p.uid !== undefined ? `uid ${p.uid}` : '--'),
    command,
    args: args.join(' '),
    exePath: p.exe?.path ?? p.exePath ?? '',
    cpu: p.cpu ?? 0,
    memPct: p.mem_percent ?? 0,
    memBytes: p.mem_bytes ?? (p.statm?.resident !== undefined ? p.statm.resident * 4096 : 0),
    cpuSeconds: p.cpu_seconds ?? 0,
    threads: p.threads ?? p.stat?.num_threads ?? 0,
    state: p.state ?? p.stat?.state ?? '',
    priority: p.stat?.priority,
    nice: p.stat?.nice,
    startTime: p.starttime,
    service: p.service ?? cgroupService(p.cgroup),
    container,
    ioRead: p.io?.read_bytes,
    ioWrite: p.io?.write_bytes,
    ioReadChars: p.io?.rchar,
    ioWriteChars: p.io?.wchar,
    fds: typeof p.fds === 'number' ? p.fds : Array.isArray(p.fds) ? p.fds.length : undefined,
    uid: p.uid,
    gid: p.gid,
    sockets,
    listening: Array.from(new Set(sockets.filter((s) => s.state === 'inbound' && (s.remotePort === 0 || s.remote === '0.0.0.0' || s.remote === '::')).map((s) => s.localPort))).sort((a, b) => a - b),
    env: p.environ ?? {},
    argv: args,
  };
}

const PAGE = 500;

/** Every OS process on an Edge Node, normalized. Throws 404 for Stream Workers. */
export async function listEdgeProcesses(nodeId: string, signal?: AbortSignal): Promise<ProcessRow[]> {
  const all: ProcessRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await apiGet<Paginated<RawEdgeProcess>>(`/w/${encodeURIComponent(nodeId)}/edge/processes`, { limit: PAGE, offset }, signal);
    all.push(...page.items.map(normalize));
    if (page.items.length < PAGE) break;
  }
  return all;
}

export interface ContainerRow {
  id: string;
  name: string;
  type: string;
  image: string;
  status: string;
  command: string;
  created?: number;
  ports: string;
  ips: string;
  [key: string]: unknown;
}

interface RawContainer {
  type?: string;
  id: string;
  name?: string;
  image?: string;
  created?: number;
  status?: string;
  command?: string;
  ports?: { privatePort?: number; publicPort?: number }[];
  ips?: string[];
}

export async function listEdgeContainers(nodeId: string, signal?: AbortSignal): Promise<ContainerRow[]> {
  const res = await apiGet<Paginated<RawContainer>>(`/w/${encodeURIComponent(nodeId)}/edge/containers`, undefined, signal);
  return (res.items ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? c.id.slice(0, 12),
    type: c.type ?? '',
    image: c.image ?? '',
    status: c.status ?? '',
    command: c.command ?? '',
    created: c.created,
    ports: (c.ports ?? []).map((p) => (p.publicPort ? `${p.publicPort}→${p.privatePort}` : String(p.privatePort ?? ''))).join(', '),
    ips: (c.ips ?? []).join(', '),
  }));
}

export interface ProcessSummary {
  total: number;
  running: number;
  sleeping: number;
  zombie: number;
  cpuTotal: number;
  memTotal: number;
  threads: number;
  topCpu?: ProcessRow;
  topMem?: ProcessRow;
}

export function summarizeProcesses(rows: ProcessRow[]): ProcessSummary {
  let topCpu: ProcessRow | undefined;
  let topMem: ProcessRow | undefined;
  const s: ProcessSummary = { total: rows.length, running: 0, sleeping: 0, zombie: 0, cpuTotal: 0, memTotal: 0, threads: 0 };
  for (const r of rows) {
    if (r.state === 'R') s.running++;
    else if (r.state === 'S' || r.state === 'I') s.sleeping++;
    else if (r.state === 'Z') s.zombie++;
    s.cpuTotal += r.cpu;
    s.memTotal += r.memBytes;
    s.threads += r.threads;
    if (!topCpu || r.cpu > topCpu.cpu) topCpu = r;
    if (!topMem || r.memBytes > topMem.memBytes) topMem = r;
  }
  s.topCpu = topCpu;
  s.topMem = topMem;
  return s;
}
