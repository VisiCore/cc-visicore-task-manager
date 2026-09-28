import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@capra/core';
import { ApiError } from '../api/client';
import { listEdgeProcesses, type ProcessRow } from '../api/processes';
import { Panel } from './Panel';
import { usePolling } from '../hooks/usePolling';
import { formatBytes } from '../utils/format';

export type FleetProcess = ProcessRow & { hostname: string; nodeId: string };

/** Fetches processes from several Nodes with bounded concurrency; Nodes that fail are skipped. */
export async function fetchProcessesForNodes(
  nodes: { id: string; hostname: string }[],
  concurrency = 2,
  signal?: AbortSignal,
): Promise<{ rows: FleetProcess[]; sampled: number }> {
  const rows: FleetProcess[] = [];
  let sampled = 0;
  let next = 0;
  const worker = async () => {
    while (next < nodes.length && !signal?.aborted) {
      const n = nodes[next++];
      try {
        const procs = await listEdgeProcesses(n.id, signal);
        sampled++;
        for (const p of procs) rows.push({ ...p, hostname: n.hostname, nodeId: n.id });
      } catch {
        // Disconnected or non-Edge Node: nothing to add.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, nodes.length) }, worker));
  return { rows, sampled };
}

/** Rows of a compact process list shared by the Summary and Node detail pages. */
export function ProcessList({ rows, showHost, limit }: { rows: FleetProcess[] | ProcessRow[]; showHost?: boolean; limit: number }) {
  const top = useMemo(() => [...rows].sort((a, b) => b.cpu - a.cpu || b.memBytes - a.memBytes).slice(0, limit), [rows, limit]);
  return (
    <div className="top-list">
      <div className="top-list-head proc-grid">
        <span>PID</span>
        <span>Command</span>
        <span>% CPU</span>
        <span>Memory</span>
      </div>
      {top.map((p) => {
        const host = showHost && 'hostname' in p ? (p as FleetProcess).hostname : undefined;
        const nodeId = 'nodeId' in p ? (p as FleetProcess).nodeId : undefined;
        const inner = (
          <>
            <span className="mono muted">{p.pid}</span>
            <span className="cell-stack">
              <span className="top-list-name">{p.command}</span>
              <span className="top-list-sub">
                {host ? `${host} · ` : ''}
                {p.user}
                {p.service ? ` · ${p.service}` : ''}
              </span>
            </span>
            <span className="top-list-value">{p.cpu.toFixed(1)}%</span>
            <span className="top-list-value">{formatBytes(p.memBytes)}</span>
          </>
        );
        return nodeId ? (
          <Link key={`${nodeId}-${p.id}`} className="top-list-row proc-grid" to={`/processes?node=${encodeURIComponent(nodeId)}&q=${encodeURIComponent(p.command)}`}>
            {inner}
          </Link>
        ) : (
          <div key={p.id} className="top-list-row proc-grid">
            {inner}
          </div>
        );
      })}
      {top.length === 0 && <div className="muted">No processes reported.</div>}
    </div>
  );
}

/** Top processes by CPU on one Edge Node, for the Node detail page. */
export function TopProcessesPanel({ nodeId, enabled, refreshMs, limit = 10, span = 12 }: { nodeId: string; enabled: boolean; refreshMs: number; limit?: number; span?: number }) {
  const poll = usePolling(async (signal) => listEdgeProcesses(nodeId, signal), [nodeId], refreshMs, enabled);
  if (!enabled) return null;
  if (poll.error instanceof ApiError && poll.error.status === 404) return null;
  return (
    <Panel
      title={`Top ${limit} processes`}
      span={span}
      readout={poll.data ? `${poll.data.length} total` : '--'}
      actions={
        <Link className="cell-link" to={`/processes?node=${encodeURIComponent(nodeId)}`}>
          All processes
        </Link>
      }
    >
      {poll.data ? <ProcessList rows={poll.data} limit={limit} /> : poll.error ? <div className="muted">{poll.error.message}</div> : <Skeleton active paragraph={{ rows: 5 }} />}
    </Panel>
  );
}
