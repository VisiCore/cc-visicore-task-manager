/**
 * Node-scoped Edge endpoints for files and host metadata. All are reads and work without any
 * Source or ingestion: they inspect the host the Edge Node runs on.
 */
import { apiGet, apiPost } from './client';
import type { Paginated } from './types';

function nodePath(nodeId: string, rest: string): string {
  return `/w/${encodeURIComponent(nodeId)}${rest}`;
}

/** Encodes an absolute path segment by segment, keeping the slashes. */
export function encodePath(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

export function parentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}`;
}

// ---- Log file inventory ---------------------------------------------------------------

interface RawEdgeLog {
  id: string;
  filePath: string;
  owner?: number;
  modTime?: number;
  size?: number;
  mode?: string;
  processInfo?: { pid: number; process: string }[];
}

export interface EdgeLogFile {
  id: string;
  path: string;
  name: string;
  dir: string;
  owner?: number;
  modTime?: number;
  size: number;
  mode: string;
  processes: { pid: number; process: string }[];
  [key: string]: unknown;
}

/** Log files the Node knows about, with the processes that have them open. */
export async function listEdgeLogs(nodeId: string, signal?: AbortSignal): Promise<EdgeLogFile[]> {
  // The endpoint rejects paging params despite the spec listing them; it returns everything.
  const res = await apiGet<Paginated<RawEdgeLog>>(nodePath(nodeId, '/edge/logs'), undefined, signal);
  return (res.items ?? []).map((l) => ({
    id: l.filePath,
    path: l.filePath,
    name: l.filePath.split('/').pop() ?? l.filePath,
    dir: parentPath(l.filePath),
    owner: l.owner,
    modTime: l.modTime,
    size: l.size ?? 0,
    mode: l.mode ?? '',
    processes: l.processInfo ?? [],
  }));
}

// ---- Directory listing ----------------------------------------------------------------

interface RawDirEntry {
  name: string;
  type: string;
  mode?: string;
  stats?: { size?: number; mtimeMs?: number; uid?: number; gid?: number; mode?: number };
}

export interface DirEntry {
  id: string;
  name: string;
  path: string;
  type: 'dir' | 'file' | 'link' | string;
  mode: string;
  size?: number;
  mtimeMs?: number;
  uid?: number;
  [key: string]: unknown;
}

export async function listDir(nodeId: string, path: string, signal?: AbortSignal): Promise<DirEntry[]> {
  const res = await apiGet<Paginated<RawDirEntry>>(nodePath(nodeId, `/edge/ls${encodePath(path)}`), { stats: true, limit: 2000 }, signal);
  const dir = path.startsWith('/') ? path : `/${path}`;
  return (res.items ?? []).map((e) => ({
    id: e.name,
    name: e.name,
    path: joinPath(dir, e.name),
    type: e.type,
    mode: e.mode ?? '',
    size: e.stats?.size,
    mtimeMs: e.stats?.mtimeMs,
    uid: e.stats?.uid,
  }));
}

// ---- File contents --------------------------------------------------------------------

export interface FileSample {
  text: string;
  bytesRead: number;
  length: number;
}

/** The first `bytes` of a file (the API reads from the start). */
export async function sampleFile(nodeId: string, path: string, bytes = 32 * 1024, signal?: AbortSignal): Promise<FileSample> {
  const res = await apiGet<Paginated<{ bytes?: string; bytesRead?: number; length?: number }>>(nodePath(nodeId, '/edge/file/sample'), { path, bytesRequested: bytes }, signal);
  const it = res.items?.[0] ?? {};
  return { text: it.bytes ?? '', bytesRead: it.bytesRead ?? 0, length: it.length ?? 0 };
}

export interface FileInspect {
  stat: string;
  md5?: string;
  sha256?: string;
  head?: string;
}

export async function inspectFile(nodeId: string, path: string, signal?: AbortSignal): Promise<FileInspect | undefined> {
  const res = await apiGet<Paginated<FileInspect>>(nodePath(nodeId, '/edge/fileinspect'), { path }, signal);
  return res.items?.[0];
}

export interface FileEvent {
  raw: string;
  time?: number;
}

export interface FileSearchResult {
  events: FileEvent[];
  /** Byte offset the search started from, as reported by the Node. */
  offset?: number;
}

/**
 * Searches a file in place. With no `query` it just reads events from `offset`, which is how
 * the tail of a large file is fetched: offset = length - N.
 */
export async function searchFile(nodeId: string, file: string, query: string, options: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<FileSearchResult> {
  const body: Record<string, unknown> = { file, limit: options.limit ?? 200 };
  if (query.trim()) body.query = query.trim();
  if (options.offset !== undefined) body.offset = Math.max(0, Math.floor(options.offset));
  const res = await apiPost<{ items?: { offset?: number; items?: { _raw?: string; _time?: number }[] }[] }>(nodePath(nodeId, '/edge/search/file'), body, signal);
  const first = res.items?.[0];
  return { offset: first?.offset, events: (first?.items ?? []).map((e) => ({ raw: e._raw ?? '', time: e._time })) };
}

// ---- Host metadata --------------------------------------------------------------------

export interface EdgeMetadata {
  timestamp?: number;
  cribl?: { version?: string; mode?: string; group?: string; config_version?: string; tags?: string[] };
  os?: {
    arch?: string;
    cpu_count?: number;
    cpu_speed_mhz?: number;
    cpu_type?: string;
    hostname?: string;
    memory?: number | { total?: number; free?: number };
    os_name?: string;
    os_version?: string;
    os_id?: string;
    platform?: string;
    release?: string;
    timezone?: string;
    timezone_offset?: number;
    machine_id?: string;
    username?: string;
    interfaces?: Record<string, { address?: string; family?: string; internal?: boolean; cidr?: string; mac?: string }[]>;
  };
}

export async function getEdgeMetadata(nodeId: string, signal?: AbortSignal): Promise<EdgeMetadata | undefined> {
  const res = await apiGet<Paginated<EdgeMetadata>>(nodePath(nodeId, '/edge/metadata'), undefined, signal);
  return res.items?.[0];
}

// ---- System state collectors (services, ports, mounts, interfaces, users) ----------------

export type StateCollector = 'services' | 'ports' | 'fileSystem' | 'interfaces' | 'user' | 'dns' | 'routes' | 'disk';

export type StateEvent = Record<string, unknown> & { _time?: number };

/**
 * Latest snapshot of a system_state collector, read from the Node's own state files. The
 * collector runs every few minutes and keeps several snapshots; only the newest is returned.
 */
export async function querySystemState(nodeId: string, collector: StateCollector, signal?: AbortSignal, lookbackSec = 3600): Promise<StateEvent[]> {
  const lt = Math.floor(Date.now() / 1000);
  const res = await apiGet<{ items?: { events?: StateEvent[] }[] }>(nodePath(nodeId, '/edge/events/query'), { source: `system_state/${collector}`, et: lt - lookbackSec, lt, limit: 1000 }, signal);
  const events = res.items?.[0]?.events ?? [];
  if (!events.length) return [];
  // Snapshots share a timestamp to the second; keep the newest one.
  const newest = Math.max(...events.map((e) => Math.floor(Number(e._time ?? 0))));
  return events.filter((e) => Math.floor(Number(e._time ?? 0)) === newest);
}

/** Parses the collector's human sizes ("64.00GB", "1.50MB") into bytes. */
export function parseSize(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return undefined;
  const m = v.trim().match(/^([\d.]+)\s*([KMGTP]?)B?$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const mult: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };
  return n * (mult[m[2].toUpperCase()] ?? 1);
}
