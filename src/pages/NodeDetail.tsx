import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, EmptyState, IconButton, Skeleton, Table, Tag, Tooltip, defineColumns } from '@capra/core';
import { ArrowLeft, ChartLine, PowerOffOutlined, TableOutlined } from '@capra/icons';
import { getWorkerInfo, listWorkerInputs, listWorkerOutputs } from '../api/cribl';
import { fetchNodeCpuSeries, type SeriesPoint } from '../api/metrics';
import type { IoStatus } from '../api/types';
import { PageHeader } from '../App';
import { ChartLegend, LineChart, type ChartSeries } from '../components/LineChart';
import { Meter } from '../components/Meter';
import { Panel } from '../components/Panel';
import { confirmRestart } from '../components/restart';
import { HealthPill, NodeStatePill, healthFromColor } from '../components/Status';
import { TopProcessesPanel } from '../components/TopProcesses';
import { HostCard } from '../components/HostCard';
import { useFleet } from '../hooks/fleet';
import { useSettings } from '../hooks/settings';
import { usePolling } from '../hooks/usePolling';
import { formatAgo, formatBytes, formatCompact, formatDuration, formatInt, formatPct, formatRate } from '../utils/format';

type IoRow = { id: string; type: string; health: string; metric: string; [k: string]: unknown };

const ioColumns = defineColumns<IoRow>([
  { id: 'health', label: 'Health', allowsSorting: true, render: (v) => <HealthPill level={healthFromColor(v as string)} /> },
  { id: 'id', label: 'Name', allowsSorting: true, render: (v) => <span className="mono">{v as string}</span> },
  { id: 'type', label: 'Type', allowsSorting: true },
  { id: 'metric', label: 'Counters', render: (v) => <span className="num muted">{v as string}</span> },
]);

function pickCounters(m: Record<string, unknown> | undefined, keys: string[]): string {
  if (!m) return '--';
  const parts: string[] = [];
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'number') parts.push(`${k} ${formatCompact(v)}`);
  }
  return parts.join(' · ') || '--';
}

function toIoRows(items: IoStatus[], keys: string[]): IoRow[] {
  return items.map((i) => ({ id: i.id, type: i.type ?? '--', health: i.status?.health ?? '', metric: pickCounters(i.status?.metrics, keys) }));
}

function IoStatusTable({ items, keys, label }: { items: IoStatus[] | undefined; keys: string[]; label: string }) {
  const rows = useMemo(() => (items ? toIoRows(items, keys) : []), [items, keys]);
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.health === 'Red' ? 1 : 0) - (a.health === 'Red' ? 1 : 0) || a.id.localeCompare(b.id)), [rows]);
  if (!items) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (!items.length) return <div className="muted">None configured on this Node.</div>;
  return (
    <div className="table-wrap">
      <Table columns={ioColumns} visibleColumns={['health', 'id', 'type', 'metric']} items={sorted} density="tight" aria-label={label} />
    </div>
  );
}

export function NodeDetailPage() {
  const { id = '' } = useParams();
  const fleet = useFleet();
  const { range, settings } = useSettings();
  const node = fleet.data?.nodes.find((n) => n.id === id);
  const [tables, setTables] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setTables((t) => ({ ...t, [k]: !t[k] }));

  const detail = usePolling(
    async (signal) => {
      // Everything per node is read from the Node itself (the Leader keeps Edge metrics per Fleet).
      const [cpu, info, inputs, outputs] = await Promise.all([
        fetchNodeCpuSeries(id, range, 40, signal).catch(() => []),
        getWorkerInfo(id, signal).catch(() => undefined),
        listWorkerInputs(id, signal).catch(() => undefined),
        listWorkerOutputs(id, signal).catch(() => undefined),
      ]);
      return { cpu, info, inputs, outputs };
    },
    [id, range.key],
    settings.refreshSeconds * 1000,
    !!id,
  );

  const cpuSeries: ChartSeries[] = useMemo(() => {
    const samples = detail.data?.cpu ?? [];
    const procs = Math.max(0, ...samples.map((s) => s.processes.length));
    return Array.from({ length: procs }, (_, p) => ({
      id: `wp${p}`,
      label: `Worker process ${p}`,
      tone: (p % 8) + 1,
      area: false,
      points: samples.map((s) => ({ t: s.t, v: s.processes[p] ?? 0 })),
    }));
  }, [detail.data]);

  const memPts: SeriesPoint[] = useMemo(
    () => (detail.data?.cpu ?? []).filter((smp) => smp.memTotal !== undefined && smp.memFree !== undefined).map((smp) => ({ t: smp.t, v: Math.max(0, (smp.memTotal ?? 0) - (smp.memFree ?? 0)) })),
    [detail.data],
  );
  const loadPts: SeriesPoint[] = useMemo(() => (detail.data?.cpu ?? []).filter((smp) => smp.load !== undefined).map((smp) => ({ t: smp.t, v: smp.load ?? 0 })), [detail.data]);
  const tpSeries: ChartSeries[] = useMemo(() => {
    const withTp = (detail.data?.cpu ?? []).filter((smp) => smp.inEvents !== undefined);
    return [
      { id: 'in', label: 'Events in /s', tone: 1, points: withTp.map((smp) => ({ t: smp.t, v: (smp.inEvents ?? 0) / smp.span })) },
      { id: 'out', label: 'Events out /s', tone: 3, points: withTp.map((smp) => ({ t: smp.t, v: (smp.outEvents ?? 0) / smp.span })) },
      { id: 'drop', label: 'Dropped /s', tone: 'warning', area: false, points: withTp.map((smp) => ({ t: smp.t, v: (smp.dropped ?? 0) / smp.span })) },
    ];
  }, [detail.data]);

  if (fleet.data && !node) {
    return (
      <>
        <PageHeader title="Node not found" showRange={false} />
        <div className="page-content">
          <div className="empty-wrap">
            <EmptyState illustration="MissingSock" title="This Node is not reporting to the Leader" description={`No Node with id ${id} is in the current Node list.`}>
              <Link className="cell-link" to="/nodes">Back to Nodes</Link>
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  const info = detail.data?.info;
  const memTotal = node?.memTotal ?? info?.memory?.total;
  const tableToggle = (k: string) => (
    <Tooltip title={tables[k] ? 'Show chart' : 'Show as table'}>
      <IconButton aria-label={tables[k] ? 'Show chart' : 'Show as table'} icon={tables[k] ? ChartLine : TableOutlined} size="xs" variant="tertiary" onClick={() => toggle(k)} />
    </Tooltip>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="inline-actions">
            <Link to="/nodes" className="cell-link" aria-label="Back to Nodes"><ArrowLeft /></Link>
            {node?.hostname ?? id}
            {node && <NodeStatePill state={node.state} bold />}
          </span>
        }
        subtitle={node ? <span className="inline-actions"><Tag color={node.product === 'edge' ? 'teal' : 'blue'} size="sm">{node.product === 'edge' ? 'Edge Fleet' : 'Worker Group'}</Tag><Link className="cell-link" to={`/groups/${encodeURIComponent(node.group)}`}>{node.group}</Link><span className="mono muted">{node.id}</span></span> : undefined}
        actions={node && <Button size="sm" appearance="danger" variant="secondary" leadingIcon={PowerOffOutlined} disabled={node.disconnected} onClick={() => confirmRestart([node], fleet.refresh)}>Restart Node</Button>}
      />
      <div className="page-content">
        {node?.state === 'disconnected' && (
          <div className="span-12">
            <Alert appearance="danger" title="Node is disconnected">The Leader last heard from this Node {formatAgo(node.entry.lastMsgTime)}. Live metrics and status below may be stale or unavailable.</Alert>
          </div>
        )}

        <Panel title="Now" span={3}>
          {node ? (
            <div className="meter-row">
              <Meter label="CPU" value={node.cpuPct} />
              <Meter label="Mem" value={node.memPct} />
              <Meter label="Disk" value={node.diskPct} warn={80} danger={92} />
              <Meter label="Load" value={node.loadPct} caption={node.load !== undefined ? node.load.toFixed(2) : '--'} />
            </div>
          ) : (
            <Skeleton active paragraph={{ rows: 5 }} />
          )}
          <div className="panel-foot">
            <span>{node ? `${node.cpus} cores · ${node.workerProcesses} procs` : ''}</span>
            <span>{node ? `${formatBytes(node.memUsed, 1)} / ${formatBytes(node.memTotal, 1)}` : ''}</span>
          </div>
        </Panel>

        <Panel title="Cribl worker process CPU" span={9} readout={node?.criblCpuPct !== undefined ? `Cribl ${formatPct(node.criblCpuPct)} · node ${formatPct(node.cpuPct)} of ${node.cpus} cores` : '--'} actions={tableToggle('cpu')}>
          <LineChart ariaLabel="CPU percent per Worker Process over time" series={cpuSeries} yMax={100} yFormat={(v) => `${v.toFixed(0)}%`} tableView={!!tables.cpu} height={200} emptyText={detail.loading ? 'Loading…' : 'No CPU samples from this Node in range'} />
          <ChartLegend series={cpuSeries} />
        </Panel>

        <Panel title="System" span={4}>
          {node ? (
            <dl className="kv-list">
              <dt>Version</dt><dd>{node.version}</dd>
              <dt>Config version</dt><dd>{node.configVersion}{fleet.data && (() => { const g = fleet.data.rawGroups.find((x) => x.id === node.group); return g?.configVersion && !node.configVersion.startsWith(g.configVersion.split('-')[0]) ? <span className="status-warn"> (group at {g.configVersion.split('-')[0]})</span> : null; })()}</dd>
              <dt>Platform</dt><dd>{node.platform} / {node.arch}{node.entry.info.release ? ` · ${node.entry.info.release}` : ''}</dd>
              <dt>Node.js</dt><dd>{node.entry.info.node ?? '--'}</dd>
              <dt>Install</dt><dd>{node.entry.info.cribl?.installType ?? '--'}{node.isSaas ? ' · Cribl.Cloud' : ''}</dd>
              <dt>Uptime</dt><dd>{formatDuration(node.uptimeSec)}</dd>
              <dt>Heartbeat</dt><dd>{formatAgo(node.entry.lastMsgTime)} · every {node.hbPeriodSec}s · {node.protocol ?? '--'}</dd>
              <dt>First seen</dt><dd>{new Date(node.entry.firstMsgTime).toLocaleString()}</dd>
              <dt>IP</dt><dd>{node.connIp ?? '--'}</dd>
              <dt>Disk</dt><dd>{node.diskTotal ? `${formatBytes(node.diskUsed, 1)} of ${formatBytes(node.diskTotal, 1)}` : '--'}{info?.diskUsage?.diskPath ? ` (${info.diskUsage.diskPath})` : ''}</dd>
              <dt>RSS</dt><dd>{formatBytes(node.rss)}</dd>
              <dt>Config</dt><dd>{info?.conf ? `${formatInt(info.conf.inputs)} sources · ${formatInt(info.conf.outputs)} destinations · ${formatInt(info.conf.pipelines)} pipelines · ${formatInt(info.conf.routes)} routes` : '--'}</dd>
              <dt>Captain</dt><dd>{node.isCaptain ? 'Yes' : 'No'}</dd>
            </dl>
          ) : (
            <Skeleton active paragraph={{ rows: 8 }} />
          )}
        </Panel>

        <Panel title="Memory" span={4} readout={node ? formatPct(node.memPct) : '--'} actions={tableToggle('mem')}>
          <LineChart ariaLabel="Memory used over time" series={[{ id: 'mem', label: 'Memory used', tone: 'highlight', points: memPts }]} yMax={memTotal} yFormat={(v) => formatBytes(v, 0)} tableView={!!tables.mem} height={160} />
        </Panel>

        <Panel title="Load average" span={4} readout={node?.load !== undefined ? node.load.toFixed(2) : '--'} actions={tableToggle('load')}>
          <LineChart ariaLabel="Load average over time" series={[{ id: 'load', label: 'Load (1m)', tone: 'accent', points: loadPts }]} yMax={node?.cpus || undefined} yFormat={(v) => v.toFixed(1)} tableView={!!tables.load} height={160} />
        </Panel>

        <Panel title="Throughput" span={12} readout={node ? `${formatRate(node.inEps, ' eps')} in · ${formatRate(node.outEps, ' eps')} out · ${formatBytes(node.inBps)}/s` : '--'} actions={tableToggle('tp')}>
          <LineChart ariaLabel="Events per second in, out and dropped on this Node" series={tpSeries} yFormat={(v) => formatCompact(v)} tableView={!!tables.tp} height={170} />
          <ChartLegend series={tpSeries} />
        </Panel>

        {node && <HostCard nodeId={node.id} enabled={!node.disconnected} />}
        {node && <TopProcessesPanel nodeId={node.id} enabled={!node.disconnected} refreshMs={Math.max(5000, settings.refreshSeconds * 1000)} span={8} />}

        <Panel title="Sources on this node" span={6} readout={detail.data?.inputs ? `${detail.data.inputs.length}` : '--'}>
          <IoStatusTable items={detail.data?.inputs} keys={['eventCount', 'numRequests', 'numErrors', 'numDropped', 'activeCxn']} label="Sources on this Node" />
        </Panel>
        <Panel title="Destinations on this node" span={6} readout={detail.data?.outputs ? `${detail.data.outputs.length}` : '--'}>
          <IoStatusTable items={detail.data?.outputs} keys={['sentCount', 'bytesOut', 'numDropped', 'numEventsInBuffer', 'retryBufferCount']} label="Destinations on this Node" />
        </Panel>
      </div>
    </>
  );
}
