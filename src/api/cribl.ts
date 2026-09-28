import { apiGet, apiPatch, apiPost, apiPut, ApiError } from './client';
import type {
  ConfigGroup,
  DistributedSummary,
  IoStatus,
  LeaderHealth,
  MasterWorkerEntry,
  MetricsQueryResponse,
  Paginated,
  Product,
  RawMetricsResponse,
  RestartResponse,
  SystemInfo,
} from './types';

const PAGE = 200;

/** Every Worker and Edge Node known to the Leader. Paginates until the last page. */
export async function listWorkers(signal?: AbortSignal): Promise<MasterWorkerEntry[]> {
  const all: MasterWorkerEntry[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await apiGet<Paginated<MasterWorkerEntry>>('/master/workers', { limit: PAGE, offset }, signal);
    all.push(...page.items);
    if (page.items.length < PAGE) break;
  }
  return all;
}

/** Worker Groups and Edge Fleets (the Leader returns both from /master/groups). */
export async function listGroups(signal?: AbortSignal): Promise<ConfigGroup[]> {
  const res = await apiGet<Paginated<ConfigGroup>>('/master/groups', undefined, signal);
  return res.items;
}

export async function getSystemInfo(signal?: AbortSignal): Promise<SystemInfo | undefined> {
  const res = await apiGet<Paginated<SystemInfo>>('/system/info', undefined, signal);
  return res.items?.[0];
}

export async function getLeaderHealth(signal?: AbortSignal): Promise<LeaderHealth | undefined> {
  try {
    return await apiGet<LeaderHealth>('/health', undefined, signal);
  } catch {
    return undefined;
  }
}

export async function getGroupSummary(product: Product, groupId: string, signal?: AbortSignal) {
  const res = await apiGet<Paginated<DistributedSummary>>(
    `/products/${product}/groups/${encodeURIComponent(groupId)}/summary`,
    undefined,
    signal,
  );
  return res.items?.[0];
}

export async function getWorkerInfo(nodeId: string, signal?: AbortSignal): Promise<SystemInfo | undefined> {
  const res = await apiGet<Paginated<SystemInfo>>(`/w/${encodeURIComponent(nodeId)}/system/info`, undefined, signal);
  return res.items?.[0];
}

async function listWorkerIo(nodeId: string, kind: 'inputs' | 'outputs', signal?: AbortSignal): Promise<IoStatus[]> {
  const all: IoStatus[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await apiGet<Paginated<IoStatus>>(
      `/w/${encodeURIComponent(nodeId)}/system/status/${kind}`,
      { metrics: true, offset, limit: PAGE },
      signal,
    );
    all.push(...page.items);
    if (page.items.length < PAGE) break;
  }
  return all;
}

export const listWorkerInputs = (nodeId: string, signal?: AbortSignal) => listWorkerIo(nodeId, 'inputs', signal);
export const listWorkerOutputs = (nodeId: string, signal?: AbortSignal) => listWorkerIo(nodeId, 'outputs', signal);

/** Volatile: restarts the given Nodes. Callers must confirm with the user first. */
export async function restartWorkers(product: Product, guids: string[]): Promise<RestartResponse[]> {
  const res = await apiPatch<Paginated<RestartResponse>>(`/products/${product}/workers/restart`, { guids });
  return res.items ?? [];
}

export function metricsQuery(body: unknown, signal?: AbortSignal): Promise<MetricsQueryResponse> {
  return apiPost<MetricsQueryResponse>('/system/metrics/query', body, signal);
}

export function workerMetrics(
  nodeId: string,
  query: { earliest: number; latest: number; numBuckets?: number; metricNameFilter?: string },
  signal?: AbortSignal,
): Promise<RawMetricsResponse> {
  return apiGet<RawMetricsResponse>(`/w/${encodeURIComponent(nodeId)}/system/metrics`, query, signal);
}

// ---- App-scoped KV store (settings) ----

const SETTINGS_KEY = '/kvstore/task-manager/settings';

export async function loadKvSettings<T>(): Promise<T | undefined> {
  try {
    const raw = await apiGet<unknown>(SETTINGS_KEY);
    if (raw === undefined || raw === null) return undefined;
    // The store may hand back the value directly or wrapped as { value }.
    const value = typeof raw === 'object' && raw !== null && 'value' in raw ? (raw as { value: unknown }).value : raw;
    return (typeof value === 'string' ? JSON.parse(value) : value) as T;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

export function saveKvSettings<T>(value: T): Promise<void> {
  return apiPut<void>(SETTINGS_KEY, value);
}
