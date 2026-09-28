import { Link } from 'react-router-dom';
import type { IoMetricRow } from '../api/metrics';
import type { FleetProcess } from './TopProcesses';
import { Panel } from './Panel';
import { StatusDot } from './Status';
import type { GroupRow, NodeRow } from '../model/nodes';
import { formatAgo, formatBytes, formatPct } from '../utils/format';

export interface Problem {
  id: string;
  tone: 'danger' | 'warning';
  title: string;
  detail: string;
  to: string;
}

interface Inputs {
  nodes: NodeRow[];
  groups: GroupRow[];
  sources?: IoMetricRow[];
  destinations?: IoMetricRow[];
  processes?: FleetProcess[];
}

/** Client-side thresholds over data the Summary already has. Every entry links to where to act. */
export function findProblems({ nodes, groups, sources, destinations, processes }: Inputs): Problem[] {
  const out: Problem[] = [];
  for (const n of nodes) {
    const to = `/nodes/${encodeURIComponent(n.id)}`;
    if (n.state === 'disconnected') out.push({ id: `disc-${n.id}`, tone: 'danger', title: `${n.hostname} is disconnected`, detail: `last heartbeat ${formatAgo(n.entry.lastMsgTime)} · ${n.group}`, to });
    else if (n.state === 'late') out.push({ id: `late-${n.id}`, tone: 'warning', title: `${n.hostname} heartbeat is late`, detail: `last seen ${formatAgo(n.entry.lastMsgTime)} · expected every ${n.hbPeriodSec}s`, to });
    else if (n.state === 'unhealthy') out.push({ id: `unh-${n.id}`, tone: 'danger', title: `${n.hostname} reports ${n.rawStatus}`, detail: n.group, to });
    if (n.memPct !== undefined && n.memPct >= 90) out.push({ id: `mem-${n.id}`, tone: n.memPct >= 95 ? 'danger' : 'warning', title: `${n.hostname} memory at ${formatPct(n.memPct, 0)}`, detail: `${formatBytes(n.memUsed, 1)} of ${formatBytes(n.memTotal, 1)} used`, to });
    if (n.diskPct !== undefined && n.diskPct >= 90) out.push({ id: `disk-${n.id}`, tone: n.diskPct >= 95 ? 'danger' : 'warning', title: `${n.hostname} disk at ${formatPct(n.diskPct, 0)}`, detail: `${formatBytes((n.diskTotal ?? 0) - (n.diskUsed ?? 0), 1)} free`, to });
    if (n.cpuPct !== undefined && n.cpuPct >= 90) out.push({ id: `cpu-${n.id}`, tone: 'warning', title: `${n.hostname} CPU at ${formatPct(n.cpuPct, 0)}`, detail: 'sustained across worker processes', to: `/processes?node=${encodeURIComponent(n.id)}` });
    if (n.dropEps !== undefined && n.inEps && n.dropEps / n.inEps >= 0.5) out.push({ id: `drop-${n.id}`, tone: 'warning', title: `${n.hostname} dropping ${formatPct((n.dropEps / n.inEps) * 100, 0)} of events`, detail: `${n.dropEps.toFixed(1)} of ${n.inEps.toFixed(1)} eps`, to: '/pipelines' });
  }
  for (const g of groups) {
    if (g.configMismatch > 0) out.push({ id: `cfg-${g.id}`, tone: 'warning', title: `${g.name}: ${g.configMismatch} node${g.configMismatch > 1 ? 's' : ''} behind on config`, detail: `fleet at ${g.configVersion.split('-')[0]}`, to: `/groups/${encodeURIComponent(g.id)}` });
    if (g.versions.length > 1) out.push({ id: `ver-${g.id}`, tone: 'warning', title: `${g.name} runs ${g.versions.length} Edge versions`, detail: g.versions.join(', '), to: `/groups/${encodeURIComponent(g.id)}` });
  }
  for (const s of sources ?? []) if (s.health === 2) out.push({ id: `src-${s.group}-${s.id}`, tone: 'danger', title: `Source ${s.name} is red`, detail: `${s.type} · ${s.group}`, to: `/sources?group=${encodeURIComponent(s.group)}&q=${encodeURIComponent(s.name)}` });
  for (const d of destinations ?? []) if (d.health === 2) out.push({ id: `dst-${d.group}-${d.id}`, tone: 'danger', title: `Destination ${d.name} is red`, detail: `${d.type} · ${d.group}`, to: `/destinations?group=${encodeURIComponent(d.group)}&q=${encodeURIComponent(d.name)}` });
  for (const p of processes ?? []) {
    if (p.state === 'Z') out.push({ id: `z-${p.nodeId}-${p.pid}`, tone: 'warning', title: `Zombie process ${p.command} (pid ${p.pid}) on ${p.hostname}`, detail: `parent pid ${p.ppid}`, to: `/processes?node=${encodeURIComponent(p.nodeId)}&q=${p.pid}` });
    else if (p.cpu >= 90) out.push({ id: `pcpu-${p.nodeId}-${p.pid}`, tone: 'warning', title: `${p.command} using ${p.cpu.toFixed(0)}% CPU on ${p.hostname}`, detail: `pid ${p.pid} · ${p.user}`, to: `/processes?node=${encodeURIComponent(p.nodeId)}&q=${p.pid}` });
  }
  return out.sort((a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'));
}

export function ProblemsPanel({ problems, loading, limit = 8 }: { problems: Problem[]; loading?: boolean; limit?: number }) {
  const danger = problems.filter((p) => p.tone === 'danger').length;
  return (
    <Panel title="Problems" span={12} readout={loading && !problems.length ? '…' : problems.length ? `${problems.length} · ${danger} critical` : 'none'}>
      {problems.length ? (
        <div className="top-list problems-grid">
          {problems.slice(0, limit).map((p) => (
            <Link key={p.id} className="top-list-row problem-row" to={p.to}>
              <StatusDot tone={p.tone} label={p.tone === 'danger' ? 'Critical' : 'Warning'} />
              <span className="cell-stack">
                <span className="top-list-name">{p.title}</span>
                <span className="top-list-sub">{p.detail}</span>
              </span>
            </Link>
          ))}
          {problems.length > limit && <div className="muted">and {problems.length - limit} more</div>}
        </div>
      ) : (
        <div className="inline-actions">
          <StatusDot tone="ok" label="OK" />
          <span className="muted">{loading ? 'Checking…' : 'No problems detected: nodes healthy, memory and disk under 90%, no red Sources or Destinations, no zombies.'}</span>
        </div>
      )}
    </Panel>
  );
}
