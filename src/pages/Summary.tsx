import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, IconButton, Skeleton, ToggleButtonGroup, Tooltip } from '@capra/core';
import { ChartLine, TableOutlined } from '@capra/icons';
import { fetchDestinations, fetchGroupThroughputSeries, fetchNodeCpuSeries, fetchSources, type CpuSample, type GroupThroughputRow, type SeriesPoint } from '../api/metrics';
import { PageHeader } from '../App';
import { KpiTile } from '../components/KpiTile';
import { ChartLegend, LineChart, type ChartSeries } from '../components/LineChart';
import { Meter } from '../components/Meter';
import { Panel } from '../components/Panel';
import { Sparkline } from '../components/Sparkline';
import { NodeStatePill, StatusDot } from '../components/Status';
import { DeltaTag, pctChange } from '../components/tables';
import { Treemap, type TreemapGroup, type TreemapSelection } from '../components/Treemap';
import { fetchProcessesForNodes, ProcessList } from '../components/TopProcesses';
import { findProblems, ProblemsPanel } from '../components/Problems';
import { useFleet } from '../hooks/fleet';
import type { NodeRow } from '../model/nodes';
import { usePolling } from '../hooks/usePolling';
import { useSettings } from '../hooks/settings';
import { formatBytes, formatCompact, formatDuration, formatInt, formatPct, formatRate } from '../utils/format';

function TableToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Tooltip title={on ? 'Show chart' : 'Show as table'}>
      <IconButton aria-label={on ? 'Show chart' : 'Show as table'} icon={on ? ChartLine : TableOutlined} size="xs" variant="tertiary" onClick={onToggle} />
    </Tooltip>
  );
}

export function SummaryPage() {
  const fleet = useFleet();
  const { range, settings } = useSettings();
  const [tables, setTables] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setTables((t) => ({ ...t, [k]: !t[k] }));
  const d = fleet.data;
  const t = d?.totals;
  const fleetIds = d?.fleetIds;
  const fleetKey = fleetIds ? Array.from(fleetIds).sort().join(',') : '';

  // Per-node history is read from each Node: the Leader store keeps Edge metrics at Fleet level
  // only. Throughput comes from those Fleet-level rows so it covers every Node.
  const SERIES_NODE_CAP = 12;
  const seriesNodes = useMemo(
    () => (d?.nodes ?? []).filter((n) => !n.disconnected).slice(0, SERIES_NODE_CAP).map((n) => ({ id: n.id, cpus: n.cpus })),
    [d],
  );
  const seriesKey = seriesNodes.map((n) => n.id).join(',');

  const series = usePolling(
    async (signal) => {
      const [groupTp, prevGroupTp, sources, destinations, nodeSeries, prevNodeNow] = await Promise.all([
        fetchGroupThroughputSeries(range, signal),
        fetchGroupThroughputSeries(range, signal, range.seconds).catch(() => undefined),
        fetchSources(range, signal),
        fetchDestinations(range, signal),
        Promise.all(
          seriesNodes.map((n) =>
            fetchNodeCpuSeries(n.id, range, 30, signal)
              .then((samples) => ({ ...n, samples }))
              .catch(() => ({ ...n, samples: [] as CpuSample[] })),
          ),
        ),
        Promise.all(seriesNodes.map((n) => fetchNodeCpuSeries(n.id, range, 1, signal, range.seconds).then((r) => r[0]).catch(() => undefined))),
      ]);
      const inScope = (g: string) => !fleetIds || fleetIds.has(g);
      return {
        groupTp: groupTp.filter((r) => inScope(r.group)),
        prevGroupTp: prevGroupTp?.filter((r) => inScope(r.group)),
        sources: sources.filter((r) => inScope(r.group)),
        destinations: destinations.filter((r) => inScope(r.group)),
        nodeSeries,
        prevNodeNow,
      };
    },
    [range.key, fleetKey, seriesKey],
    settings.refreshSeconds * 1000,
  );

  // Live OS processes from the connected Edge Nodes (capped: each Node's list is ~0.4 MB).
  const PROCESS_NODE_CAP = 6;
  const processNodes = useMemo(
    () => (d?.nodes ?? []).filter((n) => !n.disconnected).slice(0, PROCESS_NODE_CAP).map((n) => ({ id: n.id, hostname: n.hostname })),
    [d],
  );
  const processKey = processNodes.map((n) => n.id).join(',');
  const processes = usePolling(
    async (signal) => fetchProcessesForNodes(processNodes, 2, signal),
    [processKey],
    Math.max(10_000, settings.refreshSeconds * 1000),
    processNodes.length > 0,
  );

  // Fleet memory used and load, summed across the sampled Nodes per bucket.
  const memory = useMemo(() => {
    const used = new Map<number, number>();
    const total = new Map<number, number>();
    const loadNum = new Map<number, number>();
    const loadDen = new Map<number, number>();
    for (const n of series.data?.nodeSeries ?? []) {
      for (const smp of n.samples) {
        if (smp.memTotal !== undefined && smp.memFree !== undefined) {
          used.set(smp.t, (used.get(smp.t) ?? 0) + Math.max(0, smp.memTotal - smp.memFree));
          total.set(smp.t, (total.get(smp.t) ?? 0) + smp.memTotal);
        }
        if (smp.load !== undefined) {
          const cpus = Math.max(1, n.cpus);
          loadNum.set(smp.t, (loadNum.get(smp.t) ?? 0) + Math.min(smp.load, cpus));
          loadDen.set(smp.t, (loadDen.get(smp.t) ?? 0) + cpus);
        }
      }
    }
    const usedPts: SeriesPoint[] = Array.from(used, ([tt, v]) => ({ t: tt, v })).sort((a, b) => a.t - b.t);
    const totalMax = Math.max(0, ...total.values());
    const loadPts: SeriesPoint[] = Array.from(loadNum, ([tt, v]) => ({ t: tt, v: (v / (loadDen.get(tt) || 1)) * 100 })).sort((a, b) => a.t - b.t);
    return { usedPts, totalMax, loadPts };
  }, [series.data]);

  // Fleet throughput per window from the Leader's per-Fleet rows.
  const throughput = useMemo(() => {
    const inM = new Map<number, number>();
    const outM = new Map<number, number>();
    const dropM = new Map<number, number>();
    for (const r of series.data?.groupTp ?? []) {
      inM.set(r.t, (inM.get(r.t) ?? 0) + r.inEvents / r.seconds);
      outM.set(r.t, (outM.get(r.t) ?? 0) + r.outEvents / r.seconds);
      dropM.set(r.t, (dropM.get(r.t) ?? 0) + r.dropped / r.seconds);
    }
    const toPts = (m: Map<number, number>) => Array.from(m, ([tt, v]) => ({ t: tt, v })).sort((a, b) => a.t - b.t);
    return { inPts: toPts(inM), outPts: toPts(outM), dropPts: toPts(dropM) };
  }, [series.data]);

  // Change versus the previous window of the same length.
  const change = useMemo(() => {
    const sumTp = (rows: GroupThroughputRow[] | undefined) => {
      const acc = { i: 0, o: 0, dr: 0 };
      for (const r of rows ?? []) {
        acc.i += r.inEvents;
        acc.o += r.outEvents;
        acc.dr += r.dropped;
      }
      return acc;
    };
    const cur = sumTp(series.data?.groupTp);
    const prev = series.data?.prevGroupTp ? sumTp(series.data.prevGroupTp) : undefined;
    const memNow = memory.usedPts.length ? memory.usedPts.reduce((a, pt) => a + pt.v, 0) / memory.usedPts.length : undefined;
    const prevSamples = (series.data?.prevNodeNow ?? []).filter((smp): smp is CpuSample => !!smp && smp.memTotal !== undefined && smp.memFree !== undefined);
    const memPrev = prevSamples.length ? prevSamples.reduce((a, smp) => a + Math.max(0, (smp.memTotal ?? 0) - (smp.memFree ?? 0)), 0) : undefined;
    return {
      inPct: pctChange(cur.i, prev?.i),
      outPct: pctChange(cur.o, prev?.o),
      dropPct: pctChange(cur.dr, prev?.dr),
      memPct: memNow !== undefined && memPrev !== undefined ? pctChange(memNow, memPrev) : undefined,
    };
  }, [series.data, memory]);

  // Fleet map: Fleets as groups, Nodes as tiles.
  const navigate = useNavigate();
  const [mapMeasure, setMapMeasure] = useState<'eps' | 'mem' | 'cpu'>('eps');
  const [mapSel, setMapSel] = useState<TreemapSelection | null>(null);
  const mapValue = (n: NodeRow) => (mapMeasure === 'eps' ? (n.inEps ?? 0) : mapMeasure === 'mem' ? (n.memUsed ?? 0) : ((n.cpuPct ?? 0) / 100) * Math.max(1, n.cpus));
  const mapFmt = (v: number) => (mapMeasure === 'eps' ? `${formatCompact(v)} eps` : mapMeasure === 'mem' ? formatBytes(v) : `${v.toFixed(2)} cores`);
  const mapGroups = useMemo<TreemapGroup[]>(
    () =>
      (d?.groups ?? []).map((g) => ({
        id: g.id,
        label: g.name,
        items: d!.nodes.filter((n) => n.group === g.id).map((n) => ({ id: n.id, label: n.hostname, sublabel: n.state === 'healthy' ? undefined : n.state, value: mapValue(n) })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, mapMeasure],
  );
  const mapNode = mapSel?.kind === 'item' ? d?.nodes.find((n) => n.id === mapSel.id) : undefined;
  const mapGroup = mapSel?.kind === 'group' ? d?.groups.find((g) => g.id === mapSel.id) : undefined;
  const mapTotal = (d?.nodes ?? []).reduce((a, n) => a + mapValue(n), 0);

  const topSources = useMemo(
    () => [...(series.data?.sources ?? [])].sort((a, b) => b.events - a.events).slice(0, settings.topN),
    [series.data, settings.topN],
  );
  const destHealth = useMemo(() => {
    const rows = series.data?.destinations ?? [];
    return { total: rows.length, red: rows.filter((r) => r.health === 2).length, yellow: rows.filter((r) => r.health === 1).length };
  }, [series.data]);
  const srcHealth = useMemo(() => {
    const rows = series.data?.sources ?? [];
    return { total: rows.length, red: rows.filter((r) => r.health === 2).length, yellow: rows.filter((r) => r.health === 1).length };
  }, [series.data]);

  const leaderErrors = (d?.leader?.messages ?? []).filter((m) => m.severity === 'error');
  // Live OS CPU from the sampled process lists (sum of process CPU over cores); load average otherwise.
  const osCpu = useMemo(() => {
    const rows = processes.data?.rows;
    if (!rows || !d) return undefined;
    const byNode = new Map<string, number>();
    for (const r of rows) byNode.set(r.nodeId, (byNode.get(r.nodeId) ?? 0) + r.cpu);
    let used = 0;
    let cores = 0;
    for (const [id, sum] of byNode) {
      const n = d.nodes.find((x) => x.id === id);
      const c = Math.max(1, n?.cpus ?? 1);
      used += Math.min(sum, c * 100);
      cores += c;
    }
    return cores ? used / cores : undefined;
  }, [processes.data, d]);
  const cpuValue = osCpu ?? t?.cpuPct;
  const cpuLabel = 'CPU';

  const problems = useMemo(
    () => (d ? findProblems({ nodes: d.nodes, groups: d.groups, sources: series.data?.sources, destinations: series.data?.destinations, processes: processes.data?.rows }) : []),
    [d, series.data, processes.data],
  );

  const throughputSeries: ChartSeries[] = [
    { id: 'in', label: 'Events in /s', points: throughput.inPts, tone: 1 },
    { id: 'out', label: 'Events out /s', points: throughput.outPts, tone: 3 },
  ];

  return (
    <>
      <PageHeader title="Summary" subtitle={d ? `${d.totals.nodes} Edge Nodes across ${d.groups.length} Fleets` : 'Loading fleet…'} />
      <div className="page-content">
        {d?.warnings.length ? (
          <div className="span-12">
            <Alert appearance="warning" layout="inline" title="Some data sources did not answer">
              {d.warnings.join(' · ')}
            </Alert>
          </div>
        ) : null}

        <ProblemsPanel problems={problems} loading={!d || series.loading} />

        <Panel title="Sys" span={3} readout={t ? `${t.healthy}/${t.nodes} up` : '--'}>
          {t ? (
            <div className="meter-row">
              <Meter label={cpuLabel} value={cpuValue} />
              <Meter label="Mem" value={t.memPct} />
              <Meter label="Disk" value={t.diskPct} warn={80} danger={92} />
              <Meter label="Health" value={t.healthPct} intent={t.healthPct >= 100 ? 'ok' : t.healthPct >= 80 ? 'warning' : 'danger'} />
            </div>
          ) : (
            <Skeleton active paragraph={{ rows: 5 }} />
          )}
          <div className="panel-foot">
            <span>{t ? `${formatInt(t.cpus)} cores` : ''}</span>
            <span>{t ? `${formatBytes(t.memUsed, 1)} / ${formatBytes(t.memTotal, 1)}` : ''}</span>
          </div>
        </Panel>

        <Panel
          title="Load overview"
          span={5}
          readout={cpuValue !== undefined ? formatPct(cpuValue) : '--'}
          actions={<TableToggle on={!!tables.load} onToggle={() => toggle('load')} />}
        >
          <LineChart
            ariaLabel="Fleet load average as a percentage of cores over time"
            series={[{ id: 'load', label: 'Load % of cores', points: memory.loadPts, tone: 'accent' }]}
            yMax={100}
            yFormat={(v) => `${v.toFixed(0)}%`}
            tableView={!!tables.load}
            height={200}
          />
          <div className="panel-foot">
            <span>{t ? `${t.nodes} nodes · ${formatInt(t.cpus)} logical cores · ${seriesNodes.length} sampled` : ''}</span>
            <span>{osCpu !== undefined ? `processes ${formatPct(osCpu)} · load ${formatPct(t?.loadPct)}` : t?.loadPct !== undefined ? `load ${formatPct(t.loadPct)}` : settings.sampleCpu ? 'sampling…' : 'sampling off'}</span>
          </div>
        </Panel>

        <Panel
          title={`Top ${settings.topN} CPU processes`}
          span={4}
          readout={processes.data ? `${processes.data.rows.length} procs · ${processes.data.sampled} node${processes.data.sampled === 1 ? '' : 's'}` : '--'}
          actions={<Link className="cell-link" to="/processes">All</Link>}
        >
          {processes.data ? (
            <ProcessList rows={processes.data.rows} showHost limit={settings.topN} />
          ) : processNodes.length === 0 && d ? (
            <div className="muted">No connected Edge Nodes to read processes from.</div>
          ) : processes.error ? (
            <div className="muted">{processes.error.message}</div>
          ) : (
            <Skeleton active paragraph={{ rows: 6 }} />
          )}
          {d && d.nodes.filter((n) => !n.disconnected).length > PROCESS_NODE_CAP && (
            <div className="panel-foot">
              <span>Sampling the first {PROCESS_NODE_CAP} connected Nodes; open Processes for any Node.</span>
            </div>
          )}
        </Panel>

        <Panel
          title="Memory utilization"
          span={12}
          readout={
            t ? (
              <>
                {formatBytes(t.memUsed, 1)} / {formatBytes(t.memTotal, 1)} <DeltaTag pct={change.memPct} upIsBad />
              </>
            ) : (
              '--'
            )
          }
          actions={<TableToggle on={!!tables.mem} onToggle={() => toggle('mem')} />}
        >
          <div className="memory-layout">
            <Meter value={t?.memPct} caption={t ? formatPct(t.memPct) : '--'} aria-label="Fleet memory utilization" />
            <div>
              <LineChart
                ariaLabel="Fleet memory used over time"
                series={[{ id: 'mem', label: 'Memory used', points: memory.usedPts, tone: 'highlight' }]}
                yMax={memory.totalMax || undefined}
                yFormat={(v) => formatBytes(v, 0)}
                tableView={!!tables.mem}
                height={170}
              />
              <div className="panel-foot">
                <span>{t ? `Available ${formatBytes(Math.max(0, t.memTotal - t.memUsed), 1)}` : ''}</span>
                <span>{t ? `Disk ${formatBytes(t.diskUsed, 0)} of ${formatBytes(t.diskTotal, 0)} used (${formatPct(t.diskPct, 0)})` : ''}</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Fleet map"
          span={12}
          readout={d ? `${d.groups.length} fleets · ${d.totals.nodes} nodes · ${mapFmt(mapTotal)}` : '--'}
          actions={
            <ToggleButtonGroup
              aria-label="Size nodes by"
              size="sm"
              items={[{ key: 'eps', text: 'Events/s' }, { key: 'mem', text: 'Memory' }, { key: 'cpu', text: 'CPU' }]}
              selectedKeys={[mapMeasure]}
              disallowEmptySelection
              onSelectionChange={(k) => setMapMeasure((Array.from(k)[0] as 'eps' | 'mem' | 'cpu') ?? 'eps')}
            />
          }
        >
          {d ? (
            <>
              <Treemap
                groups={mapGroups}
                height={260}
                selected={mapSel}
                onSelect={setMapSel}
                onDrill={() => undefined}
                onOpenItem={(id) => navigate(`/nodes/${encodeURIComponent(id)}`)}
                onOpenGroup={(id) => navigate(`/groups/${encodeURIComponent(id)}`)}
                formatValue={mapFmt}
                ariaLabel={`Edge Nodes grouped by Fleet, sized by ${mapMeasure === 'eps' ? 'events per second' : mapMeasure === 'mem' ? 'memory used' : 'busy cores'}`}
              />
              <div className="map-readout">
                {mapNode ? (
                  <>
                    <span className="map-readout-title">{mapNode.hostname}</span>
                    <dl className="map-readout-stat"><dt>Status</dt><dd><NodeStatePill state={mapNode.state} /></dd></dl>
                    <dl className="map-readout-stat"><dt>CPU</dt><dd>{mapNode.cpuPct !== undefined ? formatPct(mapNode.cpuPct) : '--'}</dd></dl>
                    <dl className="map-readout-stat"><dt>Memory</dt><dd>{mapNode.memPct !== undefined ? `${formatPct(mapNode.memPct)} · ${formatBytes(mapNode.memUsed, 1)}` : '--'}</dd></dl>
                    <dl className="map-readout-stat"><dt>In / out</dt><dd>{formatRate(mapNode.inEps, ' eps')} / {formatRate(mapNode.outEps, ' eps')}</dd></dl>
                    <Link className="cell-link" to={`/nodes/${encodeURIComponent(mapNode.id)}`}>Open node</Link>
                  </>
                ) : mapGroup ? (
                  <>
                    <span className="map-readout-title">{mapGroup.name}</span>
                    <dl className="map-readout-stat"><dt>Nodes</dt><dd>{mapGroup.healthy}/{mapGroup.nodes} healthy</dd></dl>
                    <dl className="map-readout-stat"><dt>CPU avg</dt><dd>{mapGroup.cpuPct !== undefined ? formatPct(mapGroup.cpuPct) : '--'}</dd></dl>
                    <dl className="map-readout-stat"><dt>Memory avg</dt><dd>{mapGroup.memPct !== undefined ? formatPct(mapGroup.memPct) : '--'}</dd></dl>
                    <dl className="map-readout-stat"><dt>In / out</dt><dd>{formatRate(mapGroup.inEps, ' eps')} / {formatRate(mapGroup.outEps, ' eps')}</dd></dl>
                    <Link className="cell-link" to={`/groups/${encodeURIComponent(mapGroup.id)}`}>Open fleet</Link>
                  </>
                ) : (
                  <>
                    <span className="map-readout-title">All Edge Nodes</span>
                    <dl className="map-readout-stat"><dt>Nodes</dt><dd>{d.totals.healthy}/{d.totals.nodes} healthy</dd></dl>
                    <dl className="map-readout-stat"><dt>CPU</dt><dd>{d.totals.cpuPct !== undefined ? formatPct(d.totals.cpuPct) : '--'}</dd></dl>
                    <dl className="map-readout-stat"><dt>Memory</dt><dd>{formatPct(d.totals.memPct)} · {formatBytes(d.totals.memUsed, 1)}</dd></dl>
                    <dl className="map-readout-stat"><dt>In / out</dt><dd>{formatRate(d.totals.inEps, ' eps')} / {formatRate(d.totals.outEps, ' eps')}</dd></dl>
                    <span className="muted">click a tile · double-click to open</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <Skeleton active paragraph={{ rows: 6 }} />
          )}
        </Panel>

        <Panel
          title="Throughput"
          span={8}
          readout={
            t ? (
              <>
                {formatRate(t.inEps, ' eps')} in <DeltaTag pct={change.inPct} /> · {formatRate(t.outEps, ' eps')} out <DeltaTag pct={change.outPct} />
              </>
            ) : (
              '--'
            )
          }
          actions={<TableToggle on={!!tables.tp} onToggle={() => toggle('tp')} />}
        >
          <LineChart ariaLabel="Events per second in and out across the fleet" series={throughputSeries} yFormat={(v) => formatCompact(v)} tableView={!!tables.tp} height={170} />
          <ChartLegend series={throughputSeries} />
        </Panel>

        <Panel title="Leader" span={4} readout={d?.leader?.BUILD?.VERSION ? `v${d.leader.BUILD.VERSION}` : '--'}>
          {d?.leader ? (
            <dl className="kv-list">
              <dt>Host</dt>
              <dd>{d.leader.hostname ?? '--'}</dd>
              <dt>Uptime</dt>
              <dd>{formatDuration(d.leader.uptime)}</dd>
              <dt>Load</dt>
              <dd>{d.leader.loadavg?.map((v) => v.toFixed(2)).join(' / ') ?? '--'}</dd>
              <dt>Memory</dt>
              <dd>
                {d.leader.memory ? `${formatBytes(d.leader.memory.total - d.leader.memory.free, 1)} of ${formatBytes(d.leader.memory.total, 1)} (${formatPct(((d.leader.memory.total - d.leader.memory.free) / d.leader.memory.total) * 100, 0)})` : '--'}
              </dd>
              <dt>Disk</dt>
              <dd>{d.leader.diskUsage ? `${formatBytes(d.leader.diskUsage.bytesUsed, 1)} used · ${formatBytes(d.leader.diskUsage.bytesAvailable, 1)} free` : '--'}</dd>
              <dt>Messages</dt>
              <dd className={leaderErrors.length ? 'status-warn' : undefined}>
                {leaderErrors.length ? `${leaderErrors.length} error${leaderErrors.length > 1 ? 's' : ''}: ${leaderErrors.slice(0, 2).map((m) => m.title).join('; ')}${leaderErrors.length > 2 ? '…' : ''}` : 'No errors'}
              </dd>
            </dl>
          ) : (
            <Skeleton active paragraph={{ rows: 5 }} />
          )}
        </Panel>

        <KpiTile
          label="Nodes"
          value={t ? `${t.healthy} / ${t.nodes}` : '--'}
          detail={t ? `${t.disconnected} disconnected · ${t.unhealthy} unhealthy` : ''}
          tone={t ? (t.disconnected || t.unhealthy ? (t.healthy ? 'warning' : 'danger') : 'ok') : 'none'}
          footer={<Link className="cell-link" to="/nodes">All Edge Nodes</Link>}
        />
        <KpiTile
          label="Dropped"
          value={t ? formatRate(t.dropEps, ' eps') : '--'}
          detail={
            <>
              {t && t.inEps ? `${formatPct((t.dropEps / t.inEps) * 100, 1)} of inbound events` : 'of inbound events'} <DeltaTag pct={change.dropPct} upIsBad />
            </>
          }
          aside={<Sparkline values={throughput.dropPts.map((p) => p.v)} tone="warning" title="Dropped events per second trend" />}
          tone={t && t.inEps && t.dropEps / t.inEps > 0.5 ? 'warning' : 'none'}
          footer={<Link className="cell-link" to="/pipelines">Pipelines</Link>}
        />
        <KpiTile
          label="Sources"
          value={series.data ? `${srcHealth.total - srcHealth.red - srcHealth.yellow} / ${srcHealth.total}` : '--'}
          detail={series.data ? `${srcHealth.red} red · ${srcHealth.yellow} yellow` : ''}
          tone={series.data ? (srcHealth.red ? 'danger' : srcHealth.yellow ? 'warning' : 'ok') : 'none'}
          footer={<Link className="cell-link" to="/sources">All sources</Link>}
        />
        <KpiTile
          label="Destinations"
          value={series.data ? `${destHealth.total - destHealth.red - destHealth.yellow} / ${destHealth.total}` : '--'}
          detail={series.data ? `${destHealth.red} red · ${destHealth.yellow} yellow` : ''}
          tone={series.data ? (destHealth.red ? 'danger' : destHealth.yellow ? 'warning' : 'ok') : 'none'}
          footer={<Link className="cell-link" to="/destinations">All destinations</Link>}
        />

        <Panel title={`Top ${settings.topN} sources`} span={6} readout={`${formatRate(t?.inEps, ' eps')} in`}>
          {series.loading && !series.data ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : topSources.length ? (
            <div className="top-list">
              <div className="top-list-head">
                <span />
                <span>Source</span>
                <span>Events/s</span>
                <span>Bytes/s</span>
              </div>
              {topSources.map((s) => (
                <Link key={`${s.group}|${s.id}`} className="top-list-row" to={`/sources?group=${encodeURIComponent(s.group)}&q=${encodeURIComponent(s.name)}`}>
                  <StatusDot tone={s.health === 2 ? 'danger' : s.health === 1 ? 'warning' : 'ok'} label={s.health === 2 ? 'Red' : s.health === 1 ? 'Yellow' : 'Green'} />
                  <span className="cell-stack">
                    <span className="top-list-name">{s.name}</span>
                    <span className="top-list-sub">{s.type} · {s.group}</span>
                  </span>
                  <span className="top-list-value">{formatCompact(s.events / s.seconds)}</span>
                  <span className="top-list-value">{formatBytes(s.bytes / s.seconds)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="muted">No Source metrics in the selected range.</div>
          )}
        </Panel>

        <Panel title="Fleets" span={6} readout={d ? `${d.groups.length} fleets` : '--'}>
          {d ? (
            <div className="top-list">
              <div className="top-list-head">
                <span />
                <span>Fleet</span>
                <span>Nodes</span>
                <span>In</span>
              </div>
              {[...d.groups]
                .sort((a, b) => b.nodes - a.nodes || a.id.localeCompare(b.id))
                .slice(0, settings.topN)
                .map((g) => (
                  <Link key={g.id} className="top-list-row" to={`/groups/${encodeURIComponent(g.id)}`}>
                    <StatusDot tone={g.nodes === 0 ? 'muted' : g.disconnected || g.unhealthy ? (g.healthy ? 'warning' : 'danger') : 'ok'} label={`${g.healthy} of ${g.nodes} healthy`} />
                    <span className="cell-stack">
                      <span className="top-list-name">{g.name}</span>
                      <span className="top-list-sub">{g.kind}{g.cpuPct !== undefined ? ` · CPU ${formatPct(g.cpuPct, 0)}` : ''}{g.memPct !== undefined ? ` · Mem ${formatPct(g.memPct, 0)}` : ''}</span>
                    </span>
                    <span className="top-list-value">{g.healthy}/{g.nodes}</span>
                    <span className="top-list-value">{formatCompact(g.inEps)} eps</span>
                  </Link>
                ))}
            </div>
          ) : (
            <Skeleton active paragraph={{ rows: 6 }} />
          )}
        </Panel>

      </div>
    </>
  );
}
