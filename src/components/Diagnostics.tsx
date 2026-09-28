import { useEffect, useState } from 'react';
import { Button, Card } from '@capra/core';
import { apiGet, apiPost } from '../api/client';
import { useFleet } from '../hooks/fleet';

interface CheckResult {
  name: string;
  ok: boolean;
  ms: number;
  summary: string;
  head: string;
}

function head(v: unknown): string {
  try {
    return JSON.stringify(v).slice(0, 160);
  } catch {
    return String(v).slice(0, 160);
  }
}

/**
 * Runs the app's real requests through the platform proxy and shows what came back. Meant for
 * permission and data-shape troubleshooting: every check is a read.
 */
export function Diagnostics({ autoRun = false }: { autoRun?: boolean }) {
  const fleet = useFleet();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const node = fleet.data?.nodes.find((n) => !n.disconnected);
    const now = Math.floor(Date.now() / 1000);
    const filter = '^(system\\.(cpu_perc|load_avg|free_mem|total_mem|disk_used|total_disk)|total\\.(in_events|out_events|in_bytes|out_bytes|dropped_events))$';
    const checks: { name: string; run: () => Promise<{ summary: string; raw: unknown }> }[] = [
      {
        name: 'GET /master/workers',
        run: async () => {
          const r = await apiGet<{ items?: unknown[] }>('/master/workers', { limit: 5, offset: 0 });
          return { summary: `${r.items?.length ?? 0} items`, raw: r };
        },
      },
      {
        name: 'POST /system/metrics/query (fleet throughput, 2m)',
        run: async () => {
          const r = await apiPost<{ results?: unknown[] }>('/system/metrics/query', {
            earliest: now - 120,
            latest: now,
            where: 'has_no_dimensions && __worker_group!=undefined',
            aggs: { aggregations: ['sum("total.in_events").as("inEvents")'], cumulative: true, splitBys: ['__worker_group'] },
          });
          return { summary: `${r.results?.length ?? 0} rows`, raw: r };
        },
      },
      {
        name: 'POST /system/metrics/query (sources, 10m)',
        run: async () => {
          const r = await apiPost<{ results?: unknown[] }>('/system/metrics/query', {
            earliest: now - 600,
            latest: now,
            where: 'input!=undefined && __worker_group!=undefined',
            aggs: { aggregations: ['sum("total.in_events").as("events")'], cumulative: true, splitBys: ['__worker_group', 'input'] },
          });
          return { summary: `${r.results?.length ?? 0} rows`, raw: r };
        },
      },
      {
        name: `GET /w/:wid/system/metrics (filtered, 60s)${node ? ` on ${node.hostname}` : ''}`,
        run: async () => {
          if (!node) throw new Error('no connected Node');
          const r = await apiGet<{ results?: { metrics?: Record<string, unknown>[] } }>(`/w/${encodeURIComponent(node.id)}/system/metrics`, { earliest: now - 60, latest: now, numBuckets: 1, metricNameFilter: filter });
          const buckets = r.results?.metrics ?? [];
          return { summary: `${buckets.length} buckets · keys: ${Object.keys(buckets[0] ?? {}).join(', ') || 'none'}`, raw: r };
        },
      },
      {
        name: 'GET /w/:wid/system/metrics (no filter, 60s)',
        run: async () => {
          if (!node) throw new Error('no connected Node');
          const r = await apiGet<{ results?: { metrics?: Record<string, unknown>[] } }>(`/w/${encodeURIComponent(node.id)}/system/metrics`, { earliest: now - 60, latest: now, numBuckets: 1 });
          const buckets = r.results?.metrics ?? [];
          const keys = Object.keys(buckets[0] ?? {});
          return { summary: `${buckets.length} buckets · ${keys.length} keys · has system.cpu_perc: ${keys.includes('system.cpu_perc')}`, raw: { keys: keys.slice(0, 30) } };
        },
      },
      {
        name: 'GET /w/:wid/edge/processes?limit=1',
        run: async () => {
          if (!node) throw new Error('no connected Node');
          const r = await apiGet<{ items?: unknown[]; count?: number }>(`/w/${encodeURIComponent(node.id)}/edge/processes`, { limit: 1, offset: 0 });
          return { summary: `${r.items?.length ?? 0} items returned for limit=1 (count ${r.count ?? '?'})`, raw: { count: r.count, items: r.items?.length } };
        },
      },
    ];
    // Node-scoped checks first: they are the ones that tell Edge data problems apart.
    checks.sort((a, b) => Number(b.name.startsWith('GET /w/')) - Number(a.name.startsWith('GET /w/')));
    const out: CheckResult[] = [];
    for (const c of checks) {
      const t0 = performance.now();
      try {
        const { summary, raw } = await c.run();
        out.push({ name: c.name, ok: true, ms: Math.round(performance.now() - t0), summary, head: head(raw) });
      } catch (err) {
        out.push({ name: c.name, ok: false, ms: Math.round(performance.now() - t0), summary: err instanceof Error ? err.message : String(err), head: '' });
      }
      setResults([...out]);
    }
    setRunning(false);
  };

  const ready = !!fleet.data;
  useEffect(() => {
    if (autoRun && ready && !results && !running) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, ready]);

  return (
    <Card>
      <Card.Header>
        <Card.Title>Connection diagnostics</Card.Title>
        <Card.Description>Runs the app's own requests through the platform proxy and shows what comes back. All checks are reads.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="settings-form">
          <div>
            <Button size="sm" variant="secondary" pending={running} onClick={() => void run()}>
              Run checks
            </Button>
          </div>
          {results && (
            <div className="diag-list">
              {results.map((r) => (
                <div key={r.name} className={`diag-row tone-${r.ok ? 'ok' : 'danger'}`}>
                  <span className="status-dot" aria-hidden="true" />
                  <div className="cell-stack">
                    <span className="cell-strong">{r.name}</span>
                    <span className={r.ok ? undefined : 'status-warn'}>{r.summary} · {r.ms} ms</span>
                    {r.head && <code className="diag-head">{r.head}</code>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
