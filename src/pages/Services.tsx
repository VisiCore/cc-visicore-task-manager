import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, EmptyState, Table, TextField, ToggleButtonGroup, defineColumns } from '@capra/core';
import { SearchOutlined } from '@capra/icons';
import { parseSize, querySystemState, type StateEvent } from '../api/edge';
import { listEdgeProcesses, type ProcessRow } from '../api/processes';
import { PageHeader } from '../App';
import { NodePicker } from '../components/NodePicker';
import { KpiTile } from '../components/KpiTile';
import { CellMeter } from '../components/Meter';
import { Panel } from '../components/Panel';
import { useSorted, type SortDescriptor } from '../components/tables';
import { useFleet } from '../hooks/fleet';
import { usePolling } from '../hooks/usePolling';
import { formatBytes, formatPct } from '../utils/format';

type Tab = 'services' | 'ports' | 'mounts' | 'network' | 'users';

function str(v: unknown): string {
  return v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
}

// ---- Rows ------------------------------------------------------------------------------

type ServiceRow = { id: string; name: string; status: string; sub: string; loaded: string; description: string; cpu?: number; memBytes?: number; pids: number; [k: string]: unknown };
type PortRow = { id: string; proto: string; port: number; address: string; pid: number; program: string; command: string; user: string; [k: string]: unknown };
type MountRow = { id: string; mountPoint: string; type: string; total: number; used: number; available: number; usedPct: number; [k: string]: unknown };
type IfaceRow = { id: string; name: string; addresses: string; mac: string; mtu: string; flags: string; [k: string]: unknown };
type UserRow = { id: string; username: string; uid: number; shell: string; home: string; groups: string; [k: string]: unknown };

function serviceRows(events: StateEvent[], procs: ProcessRow[]): ServiceRow[] {
  const byService = new Map<string, ProcessRow[]>();
  for (const p of procs) if (p.service) byService.set(p.service, [...(byService.get(p.service) ?? []), p]);
  return events.map((e) => {
    const name = str(e.name);
    const unit = name.replace(/\.service$/, '');
    const owned = byService.get(unit) ?? [];
    return {
      id: name,
      name,
      status: str(e.status),
      sub: str(e.sub),
      loaded: str(e.loaded),
      description: str(e.description),
      cpu: owned.length ? owned.reduce((a, p) => a + p.cpu, 0) : undefined,
      memBytes: owned.length ? owned.reduce((a, p) => a + p.memBytes, 0) : undefined,
      pids: owned.length,
    };
  });
}

function portRows(events: StateEvent[], procs: ProcessRow[]): PortRow[] {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const rows: PortRow[] = [];
  for (const e of events) {
    const proto = str(e.protocol).toUpperCase();
    if (proto === 'UNIX') continue;
    const port = Number(e.port ?? e.localPort ?? 0);
    const pid = Number(e.pid ?? 0);
    const p = byPid.get(pid);
    rows.push({
      id: `${proto}-${str(e.address ?? e.localAddress ?? e.ip)}-${port}-${pid}`,
      proto,
      port,
      address: str(e.address ?? e.localAddress ?? e.ip ?? '*'),
      pid,
      program: str(e.program),
      command: p?.command ?? (str(e.program).split('/').pop() || '--'),
      user: p?.user ?? '--',
    });
  }
  // Fall back to what the processes themselves report when the collector has no TCP/UDP rows.
  if (!rows.length) {
    for (const p of procs) {
      for (const s of p.sockets) {
        if (s.state !== 'inbound' || s.remotePort) continue;
        rows.push({ id: `${s.proto}-${s.local}-${s.localPort}-${p.pid}`, proto: s.proto.toUpperCase(), port: s.localPort, address: s.local, pid: p.pid, program: p.exePath, command: p.command, user: p.user });
      }
    }
  }
  return rows;
}

function mountRows(events: StateEvent[]): MountRow[] {
  return events
    .map((e) => {
      const total = parseSize(e.bytesTotal) ?? 0;
      const used = parseSize(e.bytesUsed) ?? 0;
      const available = parseSize(e.bytesAvailable) ?? Math.max(0, total - used);
      return { id: str(e.mountPoint), mountPoint: str(e.mountPoint), type: str(e.fileSystemType), total, used, available, usedPct: total ? (used / total) * 100 : 0 };
    })
    .filter((m) => m.total > 0);
}

function ifaceRows(events: StateEvent[]): IfaceRow[] {
  return events.map((e) => {
    const addrs = Array.isArray(e.addrInfo) ? (e.addrInfo as { ipAddress?: string; prefix?: number }[]).map((a) => `${a.ipAddress ?? ''}${a.prefix !== undefined ? `/${a.prefix}` : ''}`) : [];
    return { id: str(e.interface), name: str(e.interface), addresses: addrs.join(', '), mac: str(e.macAddress), mtu: str(e.mtu), flags: Array.isArray(e.flags) ? e.flags.join(' ') : str(e.flags) };
  });
}

function userRows(events: StateEvent[]): UserRow[] {
  return events.map((e) => ({ id: str(e.username), username: str(e.username), uid: Number(e.userId ?? 0), shell: str(e.loginShell), home: str(e.userHome), groups: Array.isArray(e.groups) ? e.groups.join(', ') : str(e.groups) }));
}

// ---- Columns -----------------------------------------------------------------------------

const serviceColumns = defineColumns<ServiceRow>([
  { id: 'name', label: 'Unit', allowsSorting: true, render: (v, r) => <span className="cell-stack"><span className="cell-strong">{v as string}</span>{r.description && <span className="muted" style={{ fontSize: '11px' }}>{r.description}</span>}</span> },
  { id: 'status', label: 'State', allowsSorting: true, render: (v, r) => <span className={v === 'active' ? 'cell-strong' : v === 'failed' ? 'status-warn' : 'muted'}>{`${v}${r.sub ? ` (${r.sub})` : ''}`}</span> },
  { id: 'loaded', label: 'Loaded', allowsSorting: true },
  { id: 'cpu', label: '% CPU', allowsSorting: true, render: (v) => (v === undefined ? <span className="muted">--</span> : <CellMeter value={v as number} warn={50} danger={85} text={`${(v as number).toFixed(1)}%`} />) },
  { id: 'memBytes', label: 'Memory', allowsSorting: true, render: (v) => <span className="num">{v === undefined ? '--' : formatBytes(v as number)}</span> },
  { id: 'pids', label: 'Procs', allowsSorting: true, render: (v) => <span className="num">{v ? String(v) : '--'}</span> },
]);

const portColumns = defineColumns<PortRow>([
  { id: 'port', label: 'Port', allowsSorting: true, render: (v) => <span className="mono cell-strong">{String(v)}</span> },
  { id: 'proto', label: 'Proto', allowsSorting: true },
  { id: 'address', label: 'Bind', allowsSorting: true, render: (v) => <span className="mono">{v as string}</span> },
  { id: 'command', label: 'Process', allowsSorting: true, render: (v, r) => <span className="cell-stack"><span className="cell-strong">{v as string}</span><span className="muted mono" style={{ fontSize: '11px' }}>{r.program}</span></span> },
  { id: 'pid', label: 'PID', allowsSorting: true, render: (v) => <span className="mono">{String(v)}</span> },
  { id: 'user', label: 'User', allowsSorting: true },
]);

const mountColumns = defineColumns<MountRow>([
  { id: 'mountPoint', label: 'Mount', allowsSorting: true, render: (v) => <span className="mono cell-strong">{v as string}</span> },
  { id: 'type', label: 'Type', allowsSorting: true },
  { id: 'usedPct', label: 'Used', allowsSorting: true, render: (v) => <CellMeter value={v as number} warn={80} danger={92} text={formatPct(v as number, 0)} /> },
  { id: 'used', label: 'Used bytes', allowsSorting: true, render: (v) => <span className="num">{formatBytes(v as number)}</span> },
  { id: 'available', label: 'Available', allowsSorting: true, render: (v) => <span className="num">{formatBytes(v as number)}</span> },
  { id: 'total', label: 'Total', allowsSorting: true, render: (v) => <span className="num">{formatBytes(v as number)}</span> },
]);

const ifaceColumns = defineColumns<IfaceRow>([
  { id: 'name', label: 'Interface', allowsSorting: true, render: (v) => <span className="cell-strong">{v as string}</span> },
  { id: 'addresses', label: 'Addresses', render: (v) => <span className="mono">{(v as string) || '--'}</span> },
  { id: 'mac', label: 'MAC', render: (v) => <span className="mono">{(v as string) || '--'}</span> },
  { id: 'mtu', label: 'MTU' },
  { id: 'flags', label: 'Flags', render: (v) => <span className="muted">{v as string}</span> },
]);

const userColumns = defineColumns<UserRow>([
  { id: 'username', label: 'User', allowsSorting: true, render: (v) => <span className="cell-strong">{v as string}</span> },
  { id: 'uid', label: 'UID', allowsSorting: true, render: (v) => <span className="mono">{String(v)}</span> },
  { id: 'shell', label: 'Shell', render: (v) => <span className="mono">{v as string}</span> },
  { id: 'home', label: 'Home', render: (v) => <span className="mono">{v as string}</span> },
  { id: 'groups', label: 'Groups', render: (v) => <span className="muted">{v as string}</span> },
]);

// ---- Page --------------------------------------------------------------------------------

export function ServicesPage() {
  const fleet = useFleet();
  const [params, setParams] = useSearchParams();
  const nodes = fleet.data?.nodes ?? [];
  const connected = nodes.filter((n) => !n.disconnected);
  const nodeId = params.get('node') ?? connected[0]?.id ?? '';
  const node = nodes.find((n) => n.id === nodeId);
  const tab = (params.get('tab') as Tab | null) ?? 'services';
  const q = params.get('q') ?? '';
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const poll = usePolling(
    async (signal) => {
      const [services, ports, mounts, ifaces, users, procs] = await Promise.all([
        querySystemState(nodeId, 'services', signal).catch(() => [] as StateEvent[]),
        querySystemState(nodeId, 'ports', signal).catch(() => [] as StateEvent[]),
        querySystemState(nodeId, 'fileSystem', signal).catch(() => [] as StateEvent[]),
        querySystemState(nodeId, 'interfaces', signal).catch(() => [] as StateEvent[]),
        querySystemState(nodeId, 'user', signal).catch(() => [] as StateEvent[]),
        listEdgeProcesses(nodeId, signal).catch(() => [] as ProcessRow[]),
      ]);
      return {
        services: serviceRows(services, procs),
        ports: portRows(ports, procs),
        mounts: mountRows(mounts),
        ifaces: ifaceRows(ifaces),
        users: userRows(users),
        snapshotAt: services[0]?._time ?? ports[0]?._time,
        hasState: services.length + ports.length + mounts.length + ifaces.length + users.length > 0,
      };
    },
    [nodeId],
    60_000,
    !!nodeId,
  );

  const needle = q.trim().toLowerCase();
  const match = (parts: unknown[]) => !needle || parts.map(str).join(' ').toLowerCase().includes(needle);
  const services = useMemo(() => (poll.data?.services ?? []).filter((r) => match([r.name, r.description, r.status, r.sub])), [poll.data, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const ports = useMemo(() => (poll.data?.ports ?? []).filter((r) => match([r.port, r.proto, r.address, r.command, r.program, r.user])), [poll.data, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const mounts = useMemo(() => (poll.data?.mounts ?? []).filter((r) => match([r.mountPoint, r.type])), [poll.data, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const ifaces = useMemo(() => (poll.data?.ifaces ?? []).filter((r) => match([r.name, r.addresses, r.mac])), [poll.data, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const users = useMemo(() => (poll.data?.users ?? []).filter((r) => match([r.username, r.groups, r.shell])), [poll.data, needle]); // eslint-disable-line react-hooks/exhaustive-deps

  const svc = useSorted(services, { column: 'cpu', direction: 'descending' });
  const prt = useSorted(ports, { column: 'port', direction: 'ascending' });
  const mnt = useSorted(mounts, { column: 'usedPct', direction: 'descending' });
  const ifc = useSorted(ifaces, { column: 'name', direction: 'ascending' });
  const usr = useSorted(users, { column: 'uid', direction: 'ascending' });

  const d = poll.data;
  const active = d?.services.filter((s) => s.status === 'active').length ?? 0;
  const failed = d?.services.filter((s) => s.status === 'failed').length ?? 0;
  const fullest = d?.mounts.length ? [...d.mounts].sort((a, b) => b.usedPct - a.usedPct)[0] : undefined;

  return (
    <>
      <PageHeader
        title="Services & ports"
        subtitle={node ? `systemd units, listening ports, mounts, interfaces and users on ${node.hostname}${d?.snapshotAt ? ` · snapshot ${new Date(d.snapshotAt * 1000).toLocaleTimeString()}` : ''}` : 'Host state from the Edge Node'}
        showRange={false}
        actions={
          <NodePicker value={nodeId} onChange={(id) => set('node', id)} />
        }
      />
      <div className="page-content page-content-start">
        {fleet.data && nodes.length === 0 && (
          <div className="empty-wrap">
            <EmptyState illustration="Hibernating" title="No Edge Nodes are connected" description="Host state is read from the Edge Node's system_state collectors." />
          </div>
        )}
        {d && !d.hasState && (
          <div className="span-12">
            <Alert appearance="warning" title="No system state on this Node">The `system_state` Source is not collecting on this Node, or its collectors are disabled. Enable it in the Fleet's Sources to see services, ports, mounts, interfaces and users.</Alert>
          </div>
        )}
        {poll.error && (
          <div className="span-12">
            <Alert appearance="danger" title="Could not read host state">{poll.error.message}</Alert>
          </div>
        )}
        {nodeId && (
          <>
            <KpiTile span={3} label="Services" value={d ? `${active} active` : '--'} detail={d ? `${d.services.length} units · ${failed} failed` : ''} tone={failed ? 'danger' : 'none'} />
            <KpiTile span={3} label="Listening ports" value={d ? d.ports.length : '--'} detail={d ? `${new Set(d.ports.map((p) => p.pid)).size} processes` : ''} />
            <KpiTile span={3} label="Fullest mount" value={fullest ? formatPct(fullest.usedPct, 0) : '--'} detail={fullest ? `${fullest.mountPoint} · ${formatBytes(fullest.available)} free` : ''} tone={fullest && fullest.usedPct >= 92 ? 'danger' : fullest && fullest.usedPct >= 80 ? 'warning' : 'none'} />
            <KpiTile span={3} label="Interfaces · users" value={d ? `${d.ifaces.length} · ${d.users.length}` : '--'} detail={d ? d.ifaces.map((i) => i.name).slice(0, 4).join(', ') : ''} />

            <div className="span-12">
              <div className="toolbar">
                <ToggleButtonGroup
                  aria-label="Section"
                  size="sm"
                  items={[{ key: 'services', text: `Services${d ? ` (${d.services.length})` : ''}` }, { key: 'ports', text: `Ports${d ? ` (${d.ports.length})` : ''}` }, { key: 'mounts', text: `Mounts${d ? ` (${d.mounts.length})` : ''}` }, { key: 'network', text: `Interfaces${d ? ` (${d.ifaces.length})` : ''}` }, { key: 'users', text: `Users${d ? ` (${d.users.length})` : ''}` }]}
                  selectedKeys={[tab]}
                  disallowEmptySelection
                  onSelectionChange={(k) => set('tab', String(Array.from(k)[0] ?? 'services'))}
                />
                <div className="toolbar-grow">
                  <TextField aria-label="Filter" placeholder="Filter this section" size="sm" value={q} onChange={(v) => set('q', v)} leadingSlot={<SearchOutlined />} />
                </div>
              </div>
              <Panel title={tab === 'network' ? 'Interfaces' : tab} span={12} readout={d ? `${{ services: services.length, ports: ports.length, mounts: mounts.length, network: ifaces.length, users: users.length }[tab]} shown` : '--'}>
                <div className="table-wrap">
                  {tab === 'services' && <Table columns={serviceColumns} visibleColumns={['name', 'status', 'loaded', 'cpu', 'memBytes', 'pids']} items={svc.sorted} density="compact" isLoading={poll.loading && !d} sortDescriptor={svc.sort} onSortChange={(s) => svc.setSort(s as SortDescriptor)} aria-label="Services" />}
                  {tab === 'ports' && <Table columns={portColumns} visibleColumns={['port', 'proto', 'address', 'command', 'pid', 'user']} items={prt.sorted} density="compact" isLoading={poll.loading && !d} sortDescriptor={prt.sort} onSortChange={(s) => prt.setSort(s as SortDescriptor)} aria-label="Listening ports" />}
                  {tab === 'mounts' && <Table columns={mountColumns} visibleColumns={['mountPoint', 'type', 'usedPct', 'used', 'available', 'total']} items={mnt.sorted} density="compact" isLoading={poll.loading && !d} sortDescriptor={mnt.sort} onSortChange={(s) => mnt.setSort(s as SortDescriptor)} aria-label="Mounts" />}
                  {tab === 'network' && <Table columns={ifaceColumns} visibleColumns={['name', 'addresses', 'mac', 'mtu', 'flags']} items={ifc.sorted} density="compact" isLoading={poll.loading && !d} sortDescriptor={ifc.sort} onSortChange={(s) => ifc.setSort(s as SortDescriptor)} aria-label="Interfaces" />}
                  {tab === 'users' && <Table columns={userColumns} visibleColumns={['username', 'uid', 'shell', 'home', 'groups']} items={usr.sorted} density="compact" isLoading={poll.loading && !d} sortDescriptor={usr.sort} onSortChange={(s) => usr.setSort(s as SortDescriptor)} aria-label="Users" />}
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </>
  );
}
