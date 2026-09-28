import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, EmptyState, Table, TextField, ToggleButtonGroup, defineColumns } from '@capra/core';
import { SearchOutlined } from '@capra/icons';
import { ApiError } from '../api/client';
import { listEdgeLogs, type EdgeLogFile } from '../api/edge';
import { listEdgeContainers, listEdgeProcesses, stateLabel, summarizeProcesses, type ContainerRow, type ProcessRow } from '../api/processes';
import { PageHeader } from '../App';
import { NodePicker } from '../components/NodePicker';
import { CellMeter } from '../components/Meter';
import { Panel } from '../components/Panel';
import { ProcessDrawer } from '../components/ProcessDrawer';
import { SelectionRail, type RailStat, type RailWatchItem } from '../components/SelectionRail';
import { useSorted, type Selection, type SortDescriptor } from '../components/tables';
import { Treemap, type TreemapGroup, type TreemapSelection } from '../components/Treemap';
import { useFleet } from '../hooks/fleet';
import { usePolling } from '../hooks/usePolling';
import { formatBytes, formatDuration, formatPct } from '../utils/format';

type View = 'table' | 'treemap';
type Measure = 'cpu' | 'mem';
type GroupBy = 'user' | 'service';

interface Delta {
  cpu: number;
  mem: number;
}

const REFRESH_ITEMS = [
  { key: '2', text: '2s' },
  { key: '5', text: '5s' },
  { key: '10', text: '10s' },
  { key: '30', text: '30s' },
  { key: '0', text: 'Paused' },
];

const HISTORY_LEN = 40;
const NODE_KEY = '__node__';
const EMPTY_DELTAS: Map<string, Delta> = new Map();

const processColumns = defineColumns<ProcessRow>([
  { id: 'pid', label: 'PID', allowsSorting: true, render: (v) => <span className="num mono">{String(v)}</span> },
  { id: 'user', label: 'User', allowsSorting: true },
  {
    id: 'command',
    label: 'Command',
    allowsSorting: true,
    render: (v, item) => (
      <span className="cell-stack" title={item.args || item.exePath}>
        <span className="cell-strong">{v as string}</span>
        {(item.service || item.container) && (
          <span className="muted" style={{ fontSize: '11px' }}>
            {item.container ? `container ${item.container}` : item.service}
          </span>
        )}
      </span>
    ),
  },
  { id: 'cpu', label: '% CPU', allowsSorting: true, render: (v) => <CellMeter value={v as number} warn={50} danger={85} text={`${(v as number).toFixed(1)}%`} /> },
  { id: 'memPct', label: '% Mem', allowsSorting: true, render: (v) => <CellMeter value={v as number} warn={25} danger={50} text={`${(v as number).toFixed(1)}%`} /> },
  { id: 'memBytes', label: 'Resident', allowsSorting: true, render: (v) => <span className="num">{formatBytes(v as number)}</span> },
  { id: 'threads', label: 'Threads', allowsSorting: true, render: (v) => <span className="num">{String(v)}</span> },
  {
    id: 'state',
    label: 'State',
    allowsSorting: true,
    render: (v) => <span className={v === 'R' ? 'cell-strong' : v === 'Z' || v === 'D' ? 'status-warn' : 'muted'}>{stateLabel(v as string)}</span>,
  },
  { id: 'cpuSeconds', label: 'CPU time', allowsSorting: true, render: (v) => <span className="num">{formatDuration(v as number)}</span> },
  { id: 'startTime', label: 'Started', allowsSorting: true, render: (v) => <span className="num">{v ? `${formatDuration(Date.now() / 1000 - (v as number))} ago` : '--'}</span> },
  { id: 'ppid', label: 'Parent', allowsSorting: true, render: (v) => <span className="num mono">{String(v)}</span> },
]);

const containerColumns = defineColumns<ContainerRow>([
  { id: 'name', label: 'Container', allowsSorting: true, render: (v) => <span className="cell-strong">{v as string}</span> },
  { id: 'image', label: 'Image', allowsSorting: true },
  { id: 'status', label: 'Status', allowsSorting: true },
  { id: 'type', label: 'Runtime' },
  { id: 'ports', label: 'Ports' },
  { id: 'ips', label: 'IPs' },
  { id: 'command', label: 'Command' },
]);

function signed(n: number, digits = 1, suffix = ''): string {
  if (!Number.isFinite(n) || Math.abs(n) < 10 ** -digits / 2) return `±0${suffix}`;
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}${suffix}`;
}

function signedBytes(n: number): string {
  if (Math.abs(n) < 1024) return '±0 B';
  return `${n > 0 ? '+' : '−'}${formatBytes(Math.abs(n))}`;
}

function groupKeyOf(row: ProcessRow, by: GroupBy): string {
  return by === 'user' ? row.user || 'unknown' : row.service || row.container || 'other';
}

export function ProcessesPage() {
  const fleet = useFleet();
  const [params, setParams] = useSearchParams();
  const nodes = fleet.data?.nodes ?? [];
  const connected = nodes.filter((n) => !n.disconnected);
  const nodeId = params.get('node') ?? connected[0]?.id ?? '';
  const node = nodes.find((n) => n.id === nodeId);
  const q = params.get('q') ?? '';
  const [refresh, setRefresh] = useState(5);
  const [view, setView] = useState<View>('treemap');
  const [measure, setMeasure] = useState<Measure>('cpu');
  const [groupBy, setGroupBy] = useState<GroupBy>('user');
  const [selected, setSelected] = useState<TreemapSelection | null>(null);
  const [drill, setDrill] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const railOpen = params.get('rail') !== '0';
  const [viewportH, setViewportH] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Fill the viewport below the toolbars, but never smaller than a useful map.
  const mapHeight = Math.max(460, viewportH - 330);
  const [logs, setLogs] = useState<{ node: string; files: EdgeLogFile[] } | undefined>(undefined);
  const openDrawer = useCallback(
    (id: string) => {
      setDrawerId(id);
      if (logs?.node !== nodeId) listEdgeLogs(nodeId).then((files) => setLogs({ node: nodeId, files })).catch(() => setLogs({ node: nodeId, files: [] }));
    },
    [logs, nodeId],
  );
  // Refresh-to-refresh memory, mutated only inside the poll callback (never during render).
  const memoryRef = useRef<{ node: string; prev?: Map<string, ProcessRow>; history: Map<string, number[]>; cpu: number; mem: number } | undefined>(undefined);
  const filterRef = useRef<HTMLInputElement>(null);

  const set = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const poll = usePolling(
    async (signal) => {
      const [processes, containers] = await Promise.all([
        listEdgeProcesses(nodeId, signal),
        listEdgeContainers(nodeId, signal).catch(() => [] as ContainerRow[]),
      ]);
      // Deltas versus the previous refresh, plus a short CPU history per process and for the node.
      const mem = memoryRef.current?.node === nodeId ? memoryRef.current : { node: nodeId, history: new Map<string, number[]>(), cpu: 0, mem: 0 };
      const deltas = new Map<string, Delta>();
      const cur = new Map<string, ProcessRow>();
      let cpuTotal = 0;
      let memTotal = 0;
      for (const r of processes) {
        cur.set(r.id, r);
        cpuTotal += r.cpu;
        memTotal += r.memBytes;
        const p = mem.prev?.get(r.id);
        if (p) deltas.set(r.id, { cpu: r.cpu - p.cpu, mem: r.memBytes - p.memBytes });
        const h = mem.history.get(r.id) ?? [];
        h.push(r.cpu);
        if (h.length > HISTORY_LEN) h.shift();
        mem.history.set(r.id, h);
      }
      for (const id of Array.from(mem.history.keys())) if (id !== NODE_KEY && !cur.has(id)) mem.history.delete(id);
      const nh = mem.history.get(NODE_KEY) ?? [];
      nh.push(cpuTotal);
      if (nh.length > HISTORY_LEN) nh.shift();
      mem.history.set(NODE_KEY, nh);
      const nodeDelta: Delta | undefined = mem.prev ? { cpu: cpuTotal - mem.cpu, mem: memTotal - mem.mem } : undefined;
      memoryRef.current = { node: nodeId, prev: cur, history: mem.history, cpu: cpuTotal, mem: memTotal };
      const history = new Map(Array.from(mem.history, ([k, v]) => [k, [...v]]));
      return { processes, containers, at: Date.now(), deltas, nodeDelta, history };
    },
    [nodeId],
    refresh * 1000,
    !!nodeId,
  );
  const deltas = poll.data?.deltas ?? EMPTY_DELTAS;
  const nodeDelta = poll.data?.nodeDelta;
  const historyMap = poll.data?.history;

  const chooseNode = (id: string) => {
    setSelected(null);
    setDrill(null);
    set('node', id);
  };

  const clear = useCallback(() => {
    if (drawerId) return setDrawerId(null);
    if (selected) return setSelected(null);
    if (drill) return setDrill(null);
    if (q) set('q', '');
  }, [drawerId, selected, drill, q, set]);

  // Keyboard chords: 1/2 view, m measure, g grouping, / filter, Esc clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Escape') {
        if (typing) (target as HTMLElement).blur();
        clear();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' && selected?.kind === 'item') openDrawer(selected.id);
      else if (e.key === '1') setView('table');
      else if (e.key === '2') setView('treemap');
      else if (e.key === 'm') setMeasure((m) => (m === 'cpu' ? 'mem' : 'cpu'));
      else if (e.key === 'g') setGroupBy((g) => (g === 'user' ? 'service' : 'user'));
      else if (e.key === 'r') set('rail', railOpen ? '0' : '');
      else if (e.key === '/') {
        e.preventDefault();
        filterRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear, selected, openDrawer, railOpen, set]);

  const all = useMemo(() => poll.data?.processes ?? [], [poll.data]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) => `${r.pid} ${r.user} ${r.command} ${r.args} ${r.service} ${r.container}`.toLowerCase().includes(needle));
  }, [all, q]);
  const { sorted, sort, setSort } = useSorted(filtered, { column: 'cpu', direction: 'descending' });
  const summary = useMemo(() => summarizeProcesses(all), [all]);
  const notEdge = poll.error instanceof ApiError && poll.error.status === 404;

  const valueOf = useCallback((r: ProcessRow) => (measure === 'cpu' ? r.cpu : r.memBytes), [measure]);
  const fmt = useCallback((v: number) => (measure === 'cpu' ? `${v.toFixed(1)}%` : formatBytes(v)), [measure]);

  const treeGroups = useMemo<TreemapGroup[]>(() => {
    const map = new Map<string, TreemapGroup>();
    for (const r of filtered) {
      const key = groupKeyOf(r, groupBy);
      let g = map.get(key);
      if (!g) {
        g = { id: key, label: key, items: [] };
        map.set(key, g);
      }
      g.items.push({ id: r.id, label: r.command, sublabel: `pid ${r.pid}`, value: valueOf(r) });
    }
    return Array.from(map.values());
  }, [filtered, groupBy, valueOf]);
  const hidden = filtered.filter((r) => valueOf(r) <= 0).length;

  // ---- Selection rail -------------------------------------------------------------------
  const total = measure === 'cpu' ? summary.cpuTotal : summary.memTotal;
  const selectedRow = selected?.kind === 'item' ? all.find((r) => r.id === selected.id) : undefined;
  const selectedGroupRows = selected?.kind === 'group' ? all.filter((r) => groupKeyOf(r, groupBy) === selected.id) : undefined;
  const nodeName = node?.hostname ?? 'Node';
  const measureNoun = measure === 'cpu' ? 'process CPU' : 'resident memory';
  const updated = poll.lastUpdated ? poll.lastUpdated.toLocaleTimeString() : '--';

  let railTitle = `Whole node · ${nodeName}`;
  let railPath = `${nodeName} › ${groupBy === 'user' ? 'users' : 'services'} › processes`;
  let railValue = total;
  let stats: RailStat[] = [];
  let history: number[] | undefined = historyMap?.get(NODE_KEY);
  let historyLabel = `${nodeName} · total process CPU %`;

  if (selectedRow) {
    const d = deltas.get(selectedRow.id);
    railTitle = selectedRow.command;
    railPath = `${nodeName} › ${groupKeyOf(selectedRow, groupBy)} › pid ${selectedRow.pid}`;
    railValue = valueOf(selectedRow);
    history = historyMap?.get(selectedRow.id);
    historyLabel = `${selectedRow.command} · CPU %`;
    const dv = measure === 'cpu' ? d?.cpu : d?.mem;
    stats = [
      { label: 'vs prev refresh', value: d ? (measure === 'cpu' ? signed(d.cpu, 1, ' pts') : signedBytes(d.mem)) : '--', tone: dv === undefined ? 'none' : dv > 0 ? 'warning' : dv < 0 ? 'ok' : 'none' },
      { label: measure === 'cpu' ? 'memory' : 'cpu', value: measure === 'cpu' ? `${formatBytes(selectedRow.memBytes)} (${formatPct(selectedRow.memPct)})` : formatPct(selectedRow.cpu) },
      { label: 'user', value: selectedRow.user },
      { label: 'state', value: stateLabel(selectedRow.state), tone: selectedRow.state === 'Z' || selectedRow.state === 'D' ? 'danger' : 'none' },
      { label: 'threads', value: selectedRow.threads },
      { label: 'cpu time', value: formatDuration(selectedRow.cpuSeconds) },
      { label: 'started', value: selectedRow.startTime && poll.data ? `${formatDuration(poll.data.at / 1000 - selectedRow.startTime)} ago` : '--' },
      { label: 'parent', value: `pid ${selectedRow.ppid}` },
    ];
  } else if (selectedGroupRows && selected) {
    const gTotal = selectedGroupRows.reduce((a, r) => a + valueOf(r), 0);
    const gDelta = selectedGroupRows.reduce((a, r) => a + ((measure === 'cpu' ? deltas.get(r.id)?.cpu : deltas.get(r.id)?.mem) ?? 0), 0);
    const top = [...selectedGroupRows].sort((a, b) => valueOf(b) - valueOf(a))[0];
    railTitle = selected.id;
    railPath = `${nodeName} › ${groupBy === 'user' ? 'user' : 'service'}`;
    railValue = gTotal;
    history = undefined;
    stats = [
      { label: 'processes', value: selectedGroupRows.length },
      { label: 'vs prev refresh', value: measure === 'cpu' ? signed(gDelta, 1, ' pts') : signedBytes(gDelta), tone: gDelta > 0 ? 'warning' : gDelta < 0 ? 'ok' : 'none' },
      { label: 'threads', value: selectedGroupRows.reduce((a, r) => a + r.threads, 0) },
      { label: 'running', value: selectedGroupRows.filter((r) => r.state === 'R').length },
      { label: 'largest', value: top ? `${top.command} · ${fmt(valueOf(top))}` : '--' },
    ];
  } else {
    const dv = measure === 'cpu' ? nodeDelta?.cpu : nodeDelta?.mem;
    stats = [
      { label: 'processes', value: summary.total },
      { label: 'vs prev refresh', value: nodeDelta ? (measure === 'cpu' ? signed(nodeDelta.cpu, 1, ' pts') : signedBytes(nodeDelta.mem)) : '--', tone: dv === undefined ? 'none' : dv > 0 ? 'warning' : dv < 0 ? 'ok' : 'none' },
      { label: 'running', value: summary.running },
      { label: 'zombie', value: summary.zombie, tone: summary.zombie ? 'warning' : 'none' },
      { label: 'threads', value: summary.threads },
      { label: 'node cpu', value: poll.data && node?.cpus ? formatPct(Math.min(100, summary.cpuTotal / node.cpus)) : node?.cpuPct !== undefined ? formatPct(node.cpuPct) : '--' },
      { label: 'node memory', value: node?.memPct !== undefined ? `${formatPct(node.memPct)} · ${formatBytes(node.memUsed, 1)}` : '--' },
      { label: 'load', value: node?.load !== undefined ? `${node.load.toFixed(2)} / ${node.cpus}` : '--' },
    ];
  }
  const share = total > 0 ? (railValue / total) * 100 : 0;

  const watch = useMemo<RailWatchItem[]>(() => {
    const items: RailWatchItem[] = [];
    const select = (r: ProcessRow) => {
      setDrill((dr) => (dr && dr !== groupKeyOf(r, groupBy) ? null : dr));
      setSelected({ kind: 'item', id: r.id });
    };
    const movers = all
      .map((r) => ({ r, d: deltas.get(r.id) }))
      .filter((x): x is { r: ProcessRow; d: Delta } => !!x.d && Math.abs(x.d.cpu) >= 0.5)
      .sort((a, b) => Math.abs(b.d.cpu) - Math.abs(a.d.cpu))
      .slice(0, 5);
    const maxMove = Math.max(1, ...movers.map((m) => Math.abs(m.d.cpu)));
    for (const { r, d } of movers) {
      items.push({
        id: `cpu-${r.id}`,
        label: r.command,
        sublabel: `pid ${r.pid} · ${r.user} · ${(r.cpu - d.cpu).toFixed(1)}% → ${r.cpu.toFixed(1)}% CPU`,
        value: signed(d.cpu, 1, ' pts'),
        delta: d.cpu / maxMove,
        tone: d.cpu > 0 ? (r.cpu >= 85 ? 'danger' : 'warning') : 'ok',
        onClick: () => select(r),
      });
    }
    const memGrowers = all
      .map((r) => ({ r, d: deltas.get(r.id) }))
      .filter((x): x is { r: ProcessRow; d: Delta } => !!x.d && x.d.mem >= 8 * 1024 * 1024)
      .sort((a, b) => b.d.mem - a.d.mem)
      .slice(0, 2);
    const maxMem = Math.max(1, ...memGrowers.map((m) => m.d.mem));
    for (const { r, d } of memGrowers) {
      items.push({ id: `mem-${r.id}`, label: r.command, sublabel: `pid ${r.pid} · resident ${formatBytes(r.memBytes)} · growing`, value: signedBytes(d.mem), delta: d.mem / maxMem, tone: 'warning', onClick: () => select(r) });
    }
    for (const r of all.filter((x) => x.state === 'Z' || x.state === 'D').slice(0, 3)) {
      items.push({ id: `state-${r.id}`, label: r.command, sublabel: `pid ${r.pid} · ${stateLabel(r.state)} · parent ${r.ppid}`, value: stateLabel(r.state), delta: 1, tone: 'danger', onClick: () => select(r) });
    }
    return items.slice(0, 8);
  }, [all, deltas, groupBy]);

  const tableSelection: Selection = selected?.kind === 'item' ? new Set([selected.id]) : new Set();

  return (
    <>
      <PageHeader
        title="Processes"
        subtitle={
          node ? (
            <span className="inline-actions">
              {summary.total ? `${summary.total} processes` : 'OS processes'} on <Link className="cell-link" to={`/nodes/${encodeURIComponent(node.id)}`}>{node.hostname}</Link> · live · updated {updated}
            </span>
          ) : (
            'Live OS process list for Edge Nodes'
          )
        }
        showRange={false}
        actions={
          <>
            <NodePicker value={nodeId} onChange={chooseNode} />
            <ToggleButtonGroup aria-label="Refresh interval" size="sm" items={REFRESH_ITEMS} selectedKeys={[String(refresh)]} disallowEmptySelection onSelectionChange={(keys) => setRefresh(Number(Array.from(keys)[0] ?? 5))} />
          </>
        }
      />
      <div className="page-content page-content-start">
        {fleet.data && nodes.length === 0 && (
          <div className="empty-wrap">
            <EmptyState illustration="Hibernating" title="No Edge Nodes are connected" description="Processes are read live from Cribl Edge Nodes. Connect a Node to a Fleet and it appears here." />
          </div>
        )}
        {notEdge && (
          <div className="span-12">
            <Alert appearance="warning" title="This Node does not expose processes">Only Edge Nodes answer the process API. Pick another Node above.</Alert>
          </div>
        )}
        {poll.error && !notEdge && (
          <div className="span-12">
            <Alert appearance="danger" title="Could not read processes">{poll.error.message}</Alert>
          </div>
        )}

        {nodeId && (
          <>
            <div className={railOpen ? 'processes-main' : 'processes-main processes-main-wide'}>
              <div className="view-toolbar">
                <ToggleButtonGroup aria-label="View" size="sm" items={[{ key: 'treemap', text: 'Treemap' }, { key: 'table', text: 'Table' }]} selectedKeys={[view]} disallowEmptySelection onSelectionChange={(k) => setView((Array.from(k)[0] as View) ?? 'treemap')} />
                <ToggleButtonGroup aria-label="Size by" size="sm" items={[{ key: 'cpu', text: '% CPU' }, { key: 'mem', text: 'Memory' }]} selectedKeys={[measure]} disallowEmptySelection onSelectionChange={(k) => setMeasure((Array.from(k)[0] as Measure) ?? 'cpu')} />
                <ToggleButtonGroup aria-label="Group by" size="sm" items={[{ key: 'user', text: 'By user' }, { key: 'service', text: 'By service' }]} selectedKeys={[groupBy]} disallowEmptySelection onSelectionChange={(k) => setGroupBy((Array.from(k)[0] as GroupBy) ?? 'user')} />
                <div className="toolbar-grow">
                  <TextField ref={filterRef} aria-label="Filter processes" placeholder="Filter by command, user, PID, service or container  ( / )" size="sm" value={q} onChange={(v) => set('q', v)} leadingSlot={<SearchOutlined />} />
                </div>
                <Button size="sm" variant="tertiary" onClick={() => set('rail', railOpen ? '0' : '')}>
                  {railOpen ? 'Hide panel' : 'Show panel'}
                </Button>
              </div>

              {view === 'treemap' ? (
                <>
                  <Treemap groups={treeGroups} selected={selected} onSelect={setSelected} drill={drill} onDrill={setDrill} formatValue={fmt} ariaLabel={`Processes on ${nodeName} sized by ${measureNoun}`} height={mapHeight} />
                  <div className="legend-strip">
                    {drill && (
                      <button type="button" className="rail-clear" onClick={() => setDrill(null)}>
                        ← all {groupBy === 'user' ? 'users' : 'services'}
                      </button>
                    )}
                    {treeGroups
                      .map((g, i) => ({ g, i, total: g.items.reduce((a, it) => a + it.value, 0) }))
                      .filter((x) => x.total > 0)
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 8)
                      .map(({ g, i, total: gt }) => (
                        <span key={g.id} className={`series-${(i % 8) + 1}`}>
                          <span className="legend-swatch" aria-hidden="true" />
                          {g.label} {fmt(gt)}
                        </span>
                      ))}
                    <span className="status-spacer" />
                    <span>
                      {filtered.length - hidden} of {all.length} shown · {hidden} idle hidden · sized by {measureNoun}
                    </span>
                  </div>
                </>
              ) : (
                <div className="table-wrap">
                  <Table
                    columns={processColumns}
                    visibleColumns={['pid', 'user', 'command', 'cpu', 'memPct', 'memBytes', 'threads', 'state', 'cpuSeconds', 'startTime', 'ppid']}
                    items={sorted}
                    density="tight"
                    sortDescriptor={sort}
                    onSortChange={(d) => setSort(d as SortDescriptor)}
                    selectionMode="single"
                    selectedKeys={tableSelection}
                    onSelectionChange={(keys) => {
                      const k = keys === 'all' ? undefined : Array.from(keys)[0];
                      setSelected(k !== undefined ? { kind: 'item', id: String(k) } : null);
                    }}
                    aria-label="Processes"
                    renderActionColumn={(r) => (
                      <Button size="xs" variant="tertiary" onClick={() => openDrawer(r.id)}>
                        Details
                      </Button>
                    )}
                  />
                </div>
              )}

              {poll.data && poll.data.containers.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Panel title="Containers" span={12} readout={`${poll.data.containers.length}`}>
                    <div className="table-wrap">
                      <Table columns={containerColumns} visibleColumns={['name', 'image', 'status', 'type', 'ports', 'ips', 'command']} items={poll.data.containers} density="compact" aria-label="Containers" />
                    </div>
                  </Panel>
                </div>
              )}
            </div>

            {railOpen && (
            <div className="processes-rail">
              <SelectionRail
                eyebrow="Selection"
                title={railTitle}
                path={railPath}
                metric={measure === 'cpu' ? railValue.toFixed(1) : formatBytes(railValue)}
                metricUnit={measure === 'cpu' ? '%' : undefined}
                metricCaption={`${formatPct(share, 0)} of ${measureNoun} on ${nodeName} · every ${refresh ? `${refresh}s` : 'manual'}`}
                stats={stats}
                history={history}
                historyLabel={historyLabel}
                watch={watch}
                onClear={selected || drill || q ? clear : undefined}
                onCollapse={() => set('rail', '0')}
                footer={
                  <div className="inline-actions">
                    {selectedRow && (
                      <Button size="sm" variant="primary" onClick={() => openDrawer(selectedRow.id)}>
                        Process details
                      </Button>
                    )}
                    <span className="rail-caption">{node ? `${node.cpus} cores · ${formatBytes(node.memTotal, 1)} · ${node.version.split('-')[0]} · ${node.group}` : ''}</span>
                  </div>
                }
              />
            </div>
            )}

            <ProcessDrawer row={drawerId ? (all.find((r) => r.id === drawerId) ?? null) : null} nodeId={nodeId} hostname={nodeName} logs={logs?.node === nodeId ? logs.files : undefined} cpus={node?.cpus} onClose={() => setDrawerId(null)} />

            <div className="chord-bar">
              <span><kbd>click</kbd>select</span>
              <span><kbd>enter</kbd>details</span>
              <span><kbd>dbl-click</kbd>drill</span>
              <span><kbd>1</kbd><kbd>2</kbd>view</span>
              <span><kbd>m</kbd>cpu / memory</span>
              <span><kbd>g</kbd>group by</span>
              <span><kbd>r</kbd>panel</span>
              <span><kbd>/</kbd>filter</span>
              <span><kbd>esc</kbd>clear</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
