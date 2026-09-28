/**
 * Thin fetch wrapper for the Cribl product API.
 *
 * Inside Cribl the platform defines `window.CRIBL_API_URL` and proxies every fetch to it
 * (auth is injected by the shell). Outside the shell, during `npm run dev` opened directly
 * in a browser, there is no API: the app then serves synthetic data from `./mock` so the UI
 * can be exercised without credentials. The mock is a dev-only dynamic import and never
 * reaches the production bundle.
 */

declare global {
  interface Window {
    CRIBL_API_URL?: string;
    CRIBL_BASE_PATH?: string;
    getCriblUser?: () => Promise<{ id: string; username: string; firstName?: string; lastName?: string }>;
  }
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, url: string) {
    super(`${status} from ${url}${body ? `: ${body.slice(0, 200)}` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function isMockMode(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('mock') === '1') return true;
  return typeof window.CRIBL_API_URL !== 'string';
}

function apiBase(): string {
  return window.CRIBL_API_URL ?? '/api/v1';
}

export type Query = Record<string, string | number | boolean | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

const REQUEST_TIMEOUT_MS = 25_000;

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: { query?: Query; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const url = withQuery(path, options.query);

  if (import.meta.env.DEV && isMockMode()) {
    const { mockRequest } = await import('./mock');
    return mockRequest(method, url, options.body) as Promise<T>;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  options.signal?.addEventListener('abort', () => controller.abort());
  try {
    const res = await fetch(apiBase() + url, {
      method,
      headers: options.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text, url);
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet = <T,>(path: string, query?: Query, signal?: AbortSignal) =>
  apiRequest<T>('GET', path, { query, signal });
export const apiPost = <T,>(path: string, body: unknown, signal?: AbortSignal) =>
  apiRequest<T>('POST', path, { body, signal });
export const apiPut = <T,>(path: string, body: unknown) => apiRequest<T>('PUT', path, { body });
export const apiPatch = <T,>(path: string, body: unknown) => apiRequest<T>('PATCH', path, { body });
