import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True until the first successful load. */
  loading: boolean;
  /** True while a refresh is in flight after the first load. */
  refreshing: boolean;
  lastUpdated: Date | undefined;
  refresh: () => void;
}

/**
 * Runs `fn` immediately and every `intervalMs` (0 = manual only). Pauses while the tab is
 * hidden, refreshes when it becomes visible again, and cancels in-flight work on re-run.
 */
export function usePolling<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  intervalMs: number,
  enabled = true,
): PollState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRefreshing(true);
      try {
        const result = await fnRef.current(controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setData(result);
        setError(undefined);
        setLastUpdated(new Date());
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void run();
    let timer: ReturnType<typeof setInterval> | undefined;
    if (intervalMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void run();
      }, intervalMs);
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, tick, ...deps]);

  return { data, error, loading, refreshing, lastUpdated, refresh };
}
