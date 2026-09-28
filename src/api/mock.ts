/**
 * Dev-only synthetic Cribl API. Loaded lazily by `client.ts` when the app runs outside the
 * Cribl shell (no `window.CRIBL_API_URL`) or with `?mock=1`, so the UI can be exercised
 * without credentials. Shapes mirror real 4.20 responses; values are random walks.
 */
import type { MasterWorkerEntry, MetricRow } from './types';

type Json = unknown;

let seed = 7;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

const NOW = Date.now();

const GROUPS = [
  { id: 'default', name: 'default', description: 'Default Worker Group', type: 'stream', isFleet: false, onPrem: false, cloud: { provider: 'aws', region: 'us-east-1' }, configVersion: 'e61962d', tags: 'default', collectorsHaEnabled: true },
  { id: 'defaultHybrid', description: 'Default Hybrid Worker Group', type: 'stream', isFleet: false, onPrem: true, configVersion: '9e8ce79', maxWorkerAge: '8h' },
  { id: 'tenable', type: 'stream', isFleet: false, onPrem: true, configVersion: '4dac838' },
  { id: 'PaulStout_Local_SplunkTests', description: 'Send random stuff to my Splunk I will not be happy.', type: 'stream', isFleet: false, onPrem: true, configVersion: '5ee8689', maxWorkerAge: '14d' },
  { id: 'X10', name: 'x10', type: 'stream', isFleet: false, onPrem: false, cloud: { provider: 'aws', region: 'us-east-2' }, configVersion: '547990c' },
  { id: 'default_fleet', description: 'Default Fleet', type: 'edge', isFleet: true, onPrem: true, configVersion: '8e2d1aa' },
  { id: 'Linux_Fleet', type: 'edge', isFleet: true, onPrem: true, configVersion: '2b268b2' },
  { id: 'Windows_Fleet', type: 'edge', isFleet: true, onPrem: true, configVersion: 'a711997', upgradeVersion: '4.13.3-3c6c5bfd' },
  { id: 'pi', type: 'edge', isFleet: true, onPrem: true, configVersion: 'ae32e56', inherits: 'Linux_Fleet' },
  { id: 'home-assistant', type: 'edge', isFleet: true, onPrem: true, configVersion: 'cbc4c0e', inherits: 'Linux_Fleet' },
  { id: 'PS_Local_WinVM', description: "Do not configure this fleet without Paul's consent.", type: 'edge', isFleet: true, onPrem: true, configVersion: 'd5566cb' },
];

interface MockNode {
  id: string;
  hostname: string;
  group: string;
  cpus: number;
  mem: number;
  disk: number;
  version: string;
  procs: number;
  status: string;
  disconnected: boolean;
  platform: string;
  arch: string;
  saas: boolean;
  start: number;
  baseCpu: number;
  baseMem: number;
  baseDisk: number;
  eps: number;
}

const NODES: MockNode[] = [
  { id: '4532d327-dd9e-4518-8e36-7e3bf5a1bee1', hostname: 'ip-10-254-7-69', group: 'default', cpus: 4, mem: 8140091392, disk: 31029854208, version: '4.20.1-590ec085', procs: 3, status: 'healthy', disconnected: false, platform: 'linux', arch: 'arm64', saas: true, start: NOW - 5.8e8, baseCpu: 6, baseMem: 32, baseDisk: 39, eps: 890 },
  { id: 'a3ce9cc4-ea19-403c-affb-2413a5ee8524', hostname: 'ip-10-254-10-54', group: 'default', cpus: 4, mem: 8140083200, disk: 31029854208, version: '4.20.1-590ec085', procs: 3, status: 'healthy', disconnected: false, platform: 'linux', arch: 'arm64', saas: true, start: NOW - 5.8e8, baseCpu: 8, baseMem: 33, baseDisk: 39, eps: 880 },
  { id: 'd4fdf607-f072-4fee-b532-c61b7b6f53c9', hostname: 'ip-10-254-1-183', group: 'default', cpus: 4, mem: 8140083200, disk: 31029854208, version: '4.20.1-590ec085', procs: 3, status: 'healthy', disconnected: false, platform: 'linux', arch: 'arm64', saas: true, start: NOW - 5.8e8, baseCpu: 5, baseMem: 31, baseDisk: 39, eps: 885 },
  { id: '5470c84e-299a-4da5-b5b1-0eaa3a0e3f40', hostname: 'default-hybrid-wg-node1', group: 'defaultHybrid', cpus: 1, mem: 2062135296, disk: 52218933248, version: '4.19.2-89cac507', procs: 2, status: 'healthy', disconnected: false, platform: 'linux', arch: 'x64', saas: false, start: NOW - 9.6e8, baseCpu: 62, baseMem: 78, baseDisk: 7, eps: 1800 },
  { id: 'b022ad32-9fd0-4190-b106-eb0e5d3251ba', hostname: 'tenable-wg-01', group: 'tenable', cpus: 8, mem: 16434483200, disk: 214748364800, version: '4.18.2-fd1f0d2f', procs: 7, status: 'healthy', disconnected: false, platform: 'linux', arch: 'x64', saas: false, start: NOW - 3.1e8, baseCpu: 41, baseMem: 55, baseDisk: 71, eps: 17400 },
  { id: 'c1e7f2aa-0d4c-4f3b-9d0e-3c1f4a5b6c7d', hostname: 'tenable-wg-02', group: 'tenable', cpus: 8, mem: 16434483200, disk: 214748364800, version: '4.18.2-fd1f0d2f', procs: 7, status: 'healthy', disconnected: false, platform: 'linux', arch: 'x64', saas: false, start: NOW - 3.1e8, baseCpu: 78, baseMem: 91, baseDisk: 72, eps: 21100 },
  { id: 'e9a1c2d3-4b5f-4a6e-8c7d-9e0f1a2b3c4d', hostname: 'localhost.localdomain', group: 'PaulStout_Local_SplunkTests', cpus: 8, mem: 16434483200, disk: 214748364800, version: '4.18.2-fd1f0d2f', procs: 7, status: 'unhealthy', disconnected: false, platform: 'linux', arch: 'x64', saas: false, start: NOW - 1.2e7, baseCpu: 22, baseMem: 47, baseDisk: 95, eps: 3200 },
  { id: 'f0b2d4e6-8a1c-4e3f-b5d7-9c1e3a5b7d9f', hostname: 'x10-worker-1', group: 'X10', cpus: 2, mem: 4143972352, disk: 21474836480, version: '4.20.1-590ec085', procs: 1, status: 'healthy', disconnected: true, platform: 'linux', arch: 'arm64', saas: true, start: NOW - 2.2e8, baseCpu: 0, baseMem: 20, baseDisk: 44, eps: 0 },
  { id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', hostname: 'ubuntu-edge-01', group: 'Linux_Fleet', cpus: 2, mem: 4143972352, disk: 42949672960, version: '4.20.1-590ec085', procs: 1, status: 'healthy', disconnected: false, platform: 'linux', arch: 'x64', saas: false, start: NOW - 2.9e8, baseCpu: 46, baseMem: 71, baseDisk: 88, eps: 210 },
  { id: '3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a', hostname: 'homeassistant', group: 'home-assistant', cpus: 4, mem: 8283553792, disk: 128849018880, version: '4.19.2-89cac507', procs: 1, status: 'healthy', disconnected: true, platform: 'linux', arch: 'arm64', saas: false, start: NOW - 6.1e8, baseCpu: 0, baseMem: 40, baseDisk: 35, eps: 0 },
  { id: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d', hostname: 'pi5-cribl', group: 'pi', cpus: 4, mem: 8283553792, disk: 62277025792, version: '4.20.1-590ec085', procs: 1, status: 'healthy', disconnected: false, platform: 'linux', arch: 'arm64', saas: false, start: NOW - 7.7e8, baseCpu: 14, baseMem: 38, baseDisk: 52, eps: 640 },
  { id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', hostname: 'DESKTOP-WIN11', group: 'Windows_Fleet', cpus: 16, mem: 34359738368, disk: 1099511627776, version: '4.13.3-3c6c5bfd', procs: 1, status: 'healthy', disconnected: false, platform: 'win32', arch: 'x64', saas: false, start: NOW - 4.4e7, baseCpu: 3, baseMem: 61, baseDisk: 83, eps: 120 },
];

const SOURCES: { group: string; id: string; eps: number; health: number }[] = [
  { group: 'default', id: 'cribl:CriblMetrics', eps: 420, health: 0 },
  { group: 'default', id: 'cribl:CriblLogs', eps: 21, health: 0 },
  { group: 'default', id: 'datagen:win-data-gen', eps: 60, health: 0 },
  { group: 'default', id: 'tcp:in_tcp', eps: 0.4, health: 0 },
  { group: 'default', id: 'syslog:in_syslog', eps: 0, health: 0 },
  { group: 'defaultHybrid', id: 'collection:vct_cribl_billing_licenses', eps: 0.1, health: 0 },
  { group: 'defaultHybrid', id: 'collection:druva-rest-collector', eps: 0, health: 2 },
  { group: 'defaultHybrid', id: 'datagen:cc-stream-datagen', eps: 60, health: 0 },
  { group: 'tenable', id: 'syslog:palo_alto', eps: 14800, health: 0 },
  { group: 'tenable', id: 'splunk_hec:crowdstrike_fdr', eps: 9400, health: 1 },
  { group: 'tenable', id: 'http_raw:okta_system_log', eps: 310, health: 0 },
  { group: 'tenable', id: 'kafka:zeek_conn', eps: 12100, health: 0 },
  { group: 'tenable', id: 'wef:windows_events', eps: 4300, health: 2 },
  { group: 'pi', id: 'file:pi-syslog2-demo', eps: 9, health: 0 },
  { group: 'pi', id: 'system_metrics:in_system_metrics', eps: 12, health: 0 },
  { group: 'Windows_Fleet', id: 'windows_metrics:in_windows_metrics', eps: 8, health: 0 },
];

const DESTINATIONS: { group: string; id: string; eps: number; health: number }[] = [
  { group: 'default', id: 'cribl_lake:default_logs', eps: 30, health: 0 },
  { group: 'default', id: 'cribl_lake:archive-windows', eps: 300, health: 0 },
  { group: 'default', id: 'splunk_lb:to-splunk-dev', eps: 0, health: 2 },
  { group: 'default', id: 'devnull:devnull', eps: 840, health: 0 },
  { group: 'defaultHybrid', id: 'cribl_http:out-pi-claude', eps: 12, health: 0 },
  { group: 'tenable', id: 'splunk_hec:splunk_prod', eps: 26400, health: 0 },
  { group: 'tenable', id: 's3:security_archive', eps: 40900, health: 0 },
  { group: 'tenable', id: 'sentinel:ms_sentinel', eps: 2100, health: 1 },
  { group: 'tenable', id: 'elastic:soc_elastic', eps: 0, health: 2 },
  { group: 'pi', id: 'cribl_http:defaultWG', eps: 21, health: 0 },
];

const PIPELINES: { group: string; id: string; inEps: number; dropPct: number }[] = [
  { group: 'default', id: 'cribl_metrics_rollup', inEps: 213, dropPct: 66 },
  { group: 'default', id: 'passthru', inEps: 44, dropPct: 0 },
  { group: 'default', id: 'devnull', inEps: 84, dropPct: 100 },
  { group: 'tenable', id: 'palo_alto_parse', inEps: 14800, dropPct: 2 },
  { group: 'tenable', id: 'crowdstrike_reduce', inEps: 9400, dropPct: 38 },
  { group: 'tenable', id: 'zeek_conn_enrich', inEps: 12100, dropPct: 0 },
  { group: 'tenable', id: 'windows_events_filter', inEps: 4300, dropPct: 71 },
  { group: 'pi', id: 'pi_tag', inEps: 21, dropPct: 0 },
];

const kv = new Map<string, Json>();

const PROC_NAMES = ['cribl', 'cribl', 'systemd', 'sshd', 'tailscaled', 'lightdm', 'wf-panel-pi', 'cupsd', 'dbus-daemon', 'NetworkManager', 'containerd', 'dockerd', 'journald', 'avahi-daemon', 'polkitd', 'python3', 'bash', 'kworker/0:1', 'kworker/1:2', 'rcu_preempt', 'irq/162-mmc1', 'agetty', 'login', 'cron', 'rsyslogd', 'chronyd', 'bluetoothd', 'wpa_supplicant', 'pipewire', 'Xorg', 'node', 'postgres', 'redis-server', 'nginx', 'unattended-upgr', 'snapd', 'udisksd', 'ModemManager', 'colord', 'gvfsd'];

function edgeProcesses(n: MockNode, params: URLSearchParams) {
  const t = Math.floor(Date.now() / 1000); // live clock so values move between refreshes
  const rows = PROC_NAMES.map((name, i) => {
    const pid = i < 2 ? 1539 + i * 433 : 1 + i * 37 + (i % 5) * 1000;
    const cribl = name === 'cribl';
    const kernel = name.startsWith('kworker') || name.startsWith('rcu') || name.startsWith('irq');
    const cpu = kernel ? 0 : cribl ? wave(t + i, 1.5, 1.2, 60) : wave(t + i * 7, i % 7 === 0 ? 4 : 0.3, 0.5, 90);
    const memBytes = kernel ? 0 : Math.round(n.mem * (cribl ? 0.04 : 0.002 + (i % 9) * 0.0015));
    return {
      id: String(pid),
      pid,
      ppid: i < 2 ? (i === 0 ? 1 : 1539) : 1,
      uid: cribl || i === 6 ? 1000 : 0,
      gid: 0,
      cpu: Number(cpu.toFixed(1)),
      cpu_seconds: Math.round((cribl ? 9000 : 40) * (1 + (i % 4))),
      mem_percent: Number(((memBytes / n.mem) * 100).toFixed(1)),
      mem_bytes: memBytes,
      starttime: t - 86400 * 3 - i * 600,
      stat: { comm: name.slice(0, 15), state: i % 11 === 3 ? 'R' : kernel ? 'I' : 'S', priority: kernel ? 0 : 20, nice: 0, num_threads: cribl ? 12 : kernel ? 1 : 1 + (i % 6) },
      statm: { resident: Math.round(memBytes / 4096), shared: Math.round(memBytes / 16384) },
      cmdline: { args: cribl ? ['/opt/cribl/bin/cribl', i === 0 ? 'server' : '--single-threaded'] : [`/usr/bin/${name}`] },
      exe: { path: cribl ? '/opt/cribl/bin/cribl' : `/usr/bin/${name}` },
      cgroup: { '0': cribl ? '/system.slice/cribl-edge.service' : kernel ? '/' : `/system.slice/${name}.service` },
      service: cribl ? 'cribl-edge' : kernel ? '' : name,
      environ: cribl ? { USER: 'cribl', HOME: '/home/cribl', CRIBL_HOME: '/opt/cribl', CRIBL_DIST_MASTER_URL: 'tls://token@leader:4200', PATH: '/usr/bin' } : name === 'sshd' ? { PATH: '/usr/sbin:/usr/bin' } : {},
      io: { read_bytes: memBytes * 3, write_bytes: memBytes, rchar: memBytes * 40, wchar: memBytes * 9 },
      fds: cribl ? 47 : 5 + (i % 7),
      net: {
        tcp: cribl && i === 0
          ? [{ localIP: '10.98.1.124', localPort: '60946', externalIP: '174.129.199.210', externalPort: '4200', ipv6: false, state: 'outbound' }, { localIP: '0.0.0.0', localPort: '4317', externalIP: '0.0.0.0', externalPort: '0', ipv6: false, state: 'inbound' }, { localIP: '127.0.0.1', localPort: '9420', externalIP: '0.0.0.0', externalPort: '0', ipv6: false, state: 'inbound' }]
          : name === 'sshd' ? [{ localIP: '0.0.0.0', localPort: '22', externalIP: '0.0.0.0', externalPort: '0', ipv6: false, state: 'inbound' }, { localIP: '10.98.1.124', localPort: '22', externalIP: '10.98.1.7', externalPort: '51022', ipv6: false, state: 'inbound' }]
          : name === 'nginx' ? [{ localIP: '0.0.0.0', localPort: '80', externalIP: '0.0.0.0', externalPort: '0', ipv6: false, state: 'inbound' }] : [],
        udp: name === 'chronyd' ? [{ localIP: '0.0.0.0', localPort: '323', externalIP: '0.0.0.0', externalPort: '0', ipv6: false, state: 'inbound' }] : [],
        unix: [],
      },
    };
  });
  const offset = Number(params.get('offset') ?? 0);
  const limit = Number(params.get('limit') ?? 500);
  return { items: rows.slice(offset, offset + limit), count: rows.length, offset, limit };
}

function workerEntry(n: MockNode): MasterWorkerEntry {
  return {
    id: n.id,
    group: n.group,
    status: n.status,
    disconnected: n.disconnected,
    deployable: true,
    firstMsgTime: n.start,
    lastMsgTime: n.disconnected ? NOW - 2.4e6 : NOW - 1000 * Math.round(rnd() * 9),
    workerProcesses: n.procs,
    connectionProtocol: n.saas ? 'http2' : 'tls',
    provisioningTokenId: 'legacy-auth-token',
    info: {
      hostname: n.hostname,
      platform: n.platform,
      architecture: n.arch,
      release: n.platform === 'win32' ? '10.0.22631' : '6.8.0-1060-aws',
      cpus: n.cpus,
      totalmem: n.mem,
      node: 'v22.22.2',
      freeDiskSpace: Math.round(n.disk * (1 - n.baseDisk / 100)),
      totalDiskSpace: n.disk,
      isSaasWorker: n.saas,
      apiPort: 9000,
      apiScheme: n.saas ? 'https' : 'http',
      isCaptain: false,
      conn_ip: `${10 + Math.floor(rnd() * 200)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}`,
      localTime: Math.floor(NOW / 1000),
      cribl: {
        version: n.version,
        distMode: n.group.endsWith('Fleet') || n.group === 'pi' ? 'managed-edge' : 'worker',
        installType: n.saas ? 'CONTAINER' : 'PACKAGE',
        group: n.group,
        startTime: n.start,
        pid: 51,
        guid: n.id,
        tags: [],
        config: { version: GROUPS.find((g) => g.id === n.group)?.configVersion, hbPeriodSeconds: 10 },
        master: { host: 'main-example.cribl.cloud', port: 4200, tls: true },
      },
    },
  };
}

function wave(t: number, base: number, amp: number, period: number): number {
  return Math.max(0, base + amp * Math.sin((t / period) * Math.PI * 2) + (rnd() - 0.5) * amp * 0.6);
}

function resourceRow(n: MockNode, t: number): MetricRow {
  const memPct = wave(t, n.baseMem, 6, 1800) / 100;
  const diskPct = Math.min(0.99, n.baseDisk / 100 + (t % 86400) / 86400 / 50);
  return {
    __worker_node: n.id,
    __worker_group: n.group,
    __worker_node_hostname: n.hostname,
    load: wave(t, (n.baseCpu / 100) * n.cpus, 0.3 * n.cpus, 900),
    memTotal: n.mem,
    memFree: Math.round(n.mem * (1 - memPct)),
    diskUsed: Math.round(n.disk * diskPct),
    diskTotal: n.disk,
    rss: Math.round(n.mem * 0.05),
    heap: Math.round(n.mem * 0.03),
  };
}

function throughputRow(n: MockNode, t: number, seconds: number): MetricRow {
  const eps = wave(t, n.eps, n.eps * 0.35, 1200);
  const inEvents = Math.round(eps * seconds);
  const dropped = Math.round(inEvents * (n.group === 'tenable' ? 0.24 : 0.05));
  return {
    __worker_node: n.id,
    inEvents,
    outEvents: inEvents - dropped,
    inBytes: inEvents * 910,
    outBytes: (inEvents - dropped) * 1080,
    dropped,
  };
}

function handleMetricsQuery(body: Record<string, unknown>): { results: MetricRow[] } {
  const aggs = body.aggs as { aggregations: string[]; splitBys?: string[]; timeWindowSeconds?: number; cumulative?: boolean };
  const earliest = Number(body.earliest);
  const latest = Number(body.latest);
  const where = String(body.where ?? '');
  const seconds = Math.max(1, latest - earliest);
  const splits = aggs.splitBys ?? [];
  const expr = aggs.aggregations.join(' ');
  const live = NODES.filter((n) => !n.disconnected);

  if (splits.includes('input') || splits.includes('output')) {
    const isIn = splits.includes('input');
    const list = isIn ? SOURCES : DESTINATIONS;
    return {
      results: list.map((s) => ({
        __worker_group: s.group,
        [isIn ? 'input' : 'output']: s.id,
        events: Math.round(s.eps * seconds),
        bytes: Math.round(s.eps * seconds * 940),
        health: s.health,
      })),
    };
  }
  if (splits.includes('id')) {
    return {
      results: PIPELINES.map((p) => {
        const inEvents = Math.round(p.inEps * seconds);
        const dropped = Math.round((inEvents * p.dropPct) / 100);
        return { __worker_group: p.group, id: p.id, inEvents, outEvents: inEvents - dropped, dropped };
      }),
    };
  }
  if (splits.includes('__worker_group')) {
    // Fleet-level throughput, the shape the Leader keeps for Edge.
    const byGroup = new Map<string, MockNode[]>();
    for (const n of live) byGroup.set(n.group, [...(byGroup.get(n.group) ?? []), n]);
    const agg = (ns: MockNode[], t: number, sec: number): MetricRow => {
      const acc = { inEvents: 0, outEvents: 0, inBytes: 0, outBytes: 0, dropped: 0 };
      for (const n of ns) {
        const r = throughputRow(n, t, sec);
        for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += r[k] as number;
      }
      return acc;
    };
    const rows: MetricRow[] = [];
    if (aggs.timeWindowSeconds) {
      const w = aggs.timeWindowSeconds;
      for (let t = Math.floor(earliest / w) * w; t < latest; t += w) for (const [g, ns] of byGroup) rows.push({ __worker_group: g, ...agg(ns, t, w), starttime: t, endtime: t + w });
    } else {
      for (const [g, ns] of byGroup) rows.push({ __worker_group: g, ...agg(ns, latest, seconds) });
    }
    return { results: rows };
  }
  const isThroughput = where.includes('has_no_dimensions') || expr.includes('total.in_events');
  if (aggs.timeWindowSeconds) {
    const w = aggs.timeWindowSeconds;
    const rows: MetricRow[] = [];
    for (let t = Math.floor(earliest / w) * w; t < latest; t += w) {
      for (const n of live) {
        const row = isThroughput ? throughputRow(n, t, w) : resourceRow(n, t);
        rows.push({ ...row, starttime: t, endtime: t + w });
      }
    }
    return { results: rows };
  }
  return {
    results: live.map((n) => (isThroughput ? throughputRow(n, latest, seconds) : resourceRow(n, latest))),
  };
}

function handleWorkerMetrics(nodeId: string, params: URLSearchParams) {
  const n = NODES.find((x) => x.id === nodeId);
  if (!n || n.disconnected) return { results: { exactMatch: true, metrics: [] } };
  const earliest = Number(params.get('earliest'));
  const latest = Number(params.get('latest'));
  const buckets = Math.max(1, Number(params.get('numBuckets') ?? 1));
  const step = (latest - earliest) / buckets;
  const metrics = [];
  for (let i = 0; i < buckets; i++) {
    const t = Math.floor(earliest + i * step);
    const procs = Array.from({ length: n.procs }, (_, p) => ({
      model: { __worker_process: String(p) },
      val: Math.min(100, wave(t + p * 37, (n.baseCpu / 100) * n.cpus * (100 / n.procs), 12, 700)),
    }));
    const r = resourceRow(n, t);
    const tp = throughputRow(n, t, Math.max(1, step));
    metrics.push({
      _time: [{ model: {}, val: t }],
      'system.cpu_perc': procs,
      'system.load_avg': [{ model: {}, val: r.load as number }],
      'system.free_mem': [{ model: {}, val: r.memFree as number }],
      'system.total_mem': [{ model: {}, val: r.memTotal as number }],
      'system.disk_used': [{ model: {}, val: r.diskUsed as number }],
      'system.total_disk': [{ model: {}, val: r.diskTotal as number }],
      'total.in_events': [{ model: { __internal: '1' }, val: tp.inEvents as number }, { model: { input: 'system_metrics:in_system_metrics' }, val: Math.round((tp.inEvents as number) * 0.6) }],
      'total.out_events': [{ model: { __internal: '1' }, val: tp.outEvents as number }],
      'total.in_bytes': [{ model: { __internal: '1' }, val: tp.inBytes as number }],
      'total.out_bytes': [{ model: { __internal: '1' }, val: tp.outBytes as number }],
      'total.dropped_events': [{ model: { __internal: '1' }, val: tp.dropped as number }],
    });
  }
  return { results: { exactMatch: true, metrics } };
}

function ioStatus(kind: 'inputs' | 'outputs', group: string) {
  const list = kind === 'inputs' ? SOURCES : DESTINATIONS;
  return list
    .filter((s) => s.group === group)
    .map((s) => {
      const [type, id] = s.id.split(':');
      return {
        id,
        type,
        status: {
          timestamp: NOW,
          health: s.health === 2 ? 'Red' : s.health === 1 ? 'Yellow' : 'Green',
          healthCounts: { Green: 3 },
          metrics: kind === 'inputs' ? { eventCount: Math.round(s.eps * 3600) } : { sentCount: Math.round(s.eps * 3600), numDropped: 0 },
        },
      };
    });
}

function delay<T>(v: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(v), 120 + rnd() * 250));
}

export async function mockRequest(method: string, url: string, body?: unknown): Promise<Json> {
  const [path, qs] = url.split('?');
  const params = new URLSearchParams(qs ?? '');

  if (path === '/master/workers') return delay({ items: NODES.map(workerEntry), count: NODES.length });
  if (path === '/master/groups') return delay({ items: GROUPS, count: GROUPS.length });
  if (path === '/health') return delay({ status: 'healthy', startTime: NOW - 5.8e9, role: 'primary', isCaptain: true });
  if (path === '/system/info') {
    return delay({
      items: [
        {
          BUILD: { VERSION: '4.20.1-590ec085', BRANCH: 'v4.20.1' },
          distMode: 'master',
          hostname: 'leader-main',
          startTime: NOW - 5.8e9,
          uptime: 5.8e6,
          loadavg: [0.44, 0.33, 0.35],
          memory: { free: 8658132992, total: 16434483200 },
          os: { platform: 'linux', arch: 'arm64' },
          diskUsage: { totalDiskSize: 31029854208, bytesAvailable: 17379180544, bytesUsed: 13633896448 },
          workerProcesses: 0,
          messages: [
            { severity: 'error', title: 'Failed to initialize Source "windows_events"', time: NOW - 3.6e6, group: 'tenable', workerId: 'e9a1c2d3-4b5f-4a6e-8c7d-9e0f1a2b3c4d' },
          ],
        },
      ],
    });
  }
  let m = path.match(/^\/products\/(stream|edge)\/groups\/([^/]+)\/summary$/);
  if (m) {
    const gid = decodeURIComponent(m[2]);
    const members = NODES.filter((n) => n.group === gid);
    return delay({
      items: [
        {
          groups: { count: 1, routes: 3 + (gid.length % 5), pipelines: 4 + (gid.length % 9), sources: SOURCES.filter((s) => s.group === gid).length + 6, destinations: DESTINATIONS.filter((s) => s.group === gid).length + 2, quickConnects: 1, packs: gid.length % 4 },
          workers: { count: members.length, disconnectedCount: members.filter((n) => n.disconnected).length, alive: members.filter((n) => !n.disconnected && n.status === 'healthy').length, unhealthy: members.filter((n) => n.status !== 'healthy').length, groups: 1, softwareVersions: new Set(members.map((n) => n.version)).size, confVersions: 1 },
        },
      ],
    });
  }
  m = path.match(/^\/w\/([^/]+)\/system\/info$/);
  if (m) {
    const n = NODES.find((x) => x.id === decodeURIComponent(m![1]));
    if (!n) throw new Error('404 unknown worker');
    const r = resourceRow(n, Math.floor(NOW / 1000));
    return delay({
      items: [
        {
          BUILD: { VERSION: n.version },
          distMode: 'worker',
          hostname: n.hostname,
          startTime: n.start,
          uptime: (NOW - n.start) / 1000,
          loadavg: [r.load, (r.load as number) * 0.9, (r.load as number) * 0.8],
          memory: { free: r.memFree, total: n.mem },
          os: { platform: n.platform, arch: n.arch, release: '6.8.0-1060-aws' },
          diskUsage: { diskPath: '/opt/cribl', totalDiskSize: n.disk, bytesAvailable: n.disk - (r.diskUsed as number), bytesUsed: r.diskUsed },
          workerProcesses: n.procs,
          messages: [],
          conf: { pipelines: 31, routes: 3, outputs: 19, inputs: 79, confVersion: GROUPS.find((g) => g.id === n.group)?.configVersion },
        },
      ],
    });
  }
  m = path.match(/^\/w\/([^/]+)\/edge\/processes$/);
  if (m) {
    const n = NODES.find((x) => x.id === decodeURIComponent(m![1]));
    const isEdge = n && GROUPS.find((g) => g.id === n.group)?.type === 'edge';
    if (!n || !isEdge) throw Object.assign(new Error(`404 from ${path}: Cannot GET /api/v1/edge/processes`), { status: 404 });
    return delay(edgeProcesses(n, params));
  }
  m = path.match(/^\/w\/([^/]+)\/edge\/containers$/);
  if (m) return delay({ items: [], count: 0 });
  m = path.match(/^\/w\/([^/]+)\/edge\/logs$/);
  if (m) {
    const t = NOW / 1000;
    const items = [
      { id: '0', filePath: '/opt/cribl/log/cribl.log', owner: 1000, modTime: t - 5, size: 5129363, mode: '-rw-r--r--', processInfo: [{ pid: 1539, process: 'cribl' }] },
      { id: '1', filePath: '/opt/cribl/log/metrics.log', owner: 1000, modTime: t - 12, size: 3175557, mode: '-rw-r--r--', processInfo: [{ pid: 1539, process: 'cribl' }] },
      { id: '2', filePath: '/opt/cribl/log/access.log', owner: 1000, modTime: t - 300, size: 816196, mode: '-rw-r--r--', processInfo: [{ pid: 1539, process: 'cribl' }] },
      { id: '3', filePath: '/var/log/syslog', owner: 0, modTime: t - 2, size: 20480000, mode: '-rw-r-----', processInfo: [{ pid: 1 + 24 * 37 + 4000, process: 'rsyslogd' }] },
      { id: '4', filePath: '/var/log/auth.log', owner: 0, modTime: t - 900, size: 102400, mode: '-rw-r-----', processInfo: [{ pid: 1 + 24 * 37 + 4000, process: 'rsyslogd' }] },
      { id: '5', filePath: '/var/log/nginx/access.log', owner: 0, modTime: t - 30, size: 4194304, mode: '-rw-r--r--', processInfo: [{ pid: 1 + 33 * 37 + 3000, process: 'nginx' }] },
    ];
    return delay({ items, count: items.length });
  }
  m = path.match(/^\/w\/([^/]+)\/edge\/ls(\/.*)?$/);
  if (m) {
    const dir = decodeURIComponent(m[2] || '/');
    const tree: Record<string, { name: string; type: string; size?: number }[]> = {
      '/': [{ name: 'bin', type: 'link' }, { name: 'etc', type: 'dir' }, { name: 'home', type: 'dir' }, { name: 'opt', type: 'dir' }, { name: 'var', type: 'dir' }, { name: 'tmp', type: 'dir' }],
      '/var': [{ name: 'log', type: 'dir' }, { name: 'lib', type: 'dir' }, { name: 'tmp', type: 'dir' }],
      '/var/log': [{ name: 'syslog', type: 'file', size: 20480000 }, { name: 'auth.log', type: 'file', size: 102400 }, { name: 'nginx', type: 'dir' }, { name: 'apt', type: 'dir' }, { name: 'kern.log', type: 'file', size: 65536 }],
      '/var/log/nginx': [{ name: 'access.log', type: 'file', size: 4194304 }, { name: 'error.log', type: 'file', size: 2048 }],
      '/opt': [{ name: 'cribl', type: 'dir' }],
      '/opt/cribl': [{ name: 'bin', type: 'dir' }, { name: 'log', type: 'dir' }, { name: 'local', type: 'dir' }, { name: 'state', type: 'dir' }],
      '/opt/cribl/log': [{ name: 'cribl.log', type: 'file', size: 5129363 }, { name: 'metrics.log', type: 'file', size: 3175557 }, { name: 'access.log', type: 'file', size: 816196 }, { name: 'audit.log', type: 'file', size: 255 }],
    };
    const items = (tree[dir.replace(/\/$/, '') || '/'] ?? []).map((e) => ({ ...e, mode: e.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--', stats: { size: e.size ?? 4096, mtimeMs: NOW - 60_000 * (e.name.length * 7), uid: 0, gid: 0 } }));
    return delay({ items, count: items.length });
  }
  m = path.match(/^\/w\/([^/]+)\/edge\/file\/sample$/);
  if (m) {
    const lines = Array.from({ length: 200 }, (_, i) => JSON.stringify({ time: new Date(NOW - (200 - i) * 1000).toISOString(), cid: 'api', channel: i % 9 === 0 ? 'rest:inputs' : 'ProcessMetrics', level: i % 17 === 0 ? 'error' : 'info', message: i % 17 === 0 ? 'failed to fetch notifications' : 'stats', cpuPerc: Number((rnd() * 3).toFixed(2)) }));
    const text = lines.join('\n');
    const want = Number(params.get('bytesRequested') ?? 32768);
    return delay({ items: [{ bytes: text.slice(0, want), bytesRead: Math.min(want, text.length), length: 5129363 }], count: 1 });
  }
  m = path.match(/^\/w\/([^/]+)\/edge\/fileinspect$/);
  if (m) return delay({ items: [{ stat: `File: ${params.get('path')}\nSize: 5129363`, md5: 'c11b35386b6338580c9b5b4b70fe6c21', sha256: 'b88ce6b7', head: '{"time":"..."}' }], count: 1 });
  m = path.match(/^\/w\/([^/]+)\/edge\/search\/file$/);
  if (m && method === 'POST') {
    const b = body as { query?: string; limit?: number; offset?: number };
    const n = Math.min(b.limit ?? 200, 60);
    const items = Array.from({ length: n }, (_, i) => {
      const err = b.query ? true : i % 13 === 0;
      const raw = JSON.stringify({ time: new Date(NOW - (n - i) * 7000).toISOString(), cid: 'api', channel: err ? 'rest:inputs' : 'ProcessMetrics', level: err ? 'error' : 'info', message: err ? `failed to fetch notifications (${b.query ?? 'error'})` : 'stats' });
      return { _raw: raw, _time: (NOW - (n - i) * 7000) / 1000 };
    });
    return delay({ items: [{ offset: b.offset ?? 0, count: items.length, items }], count: 1 });
  }
  m = path.match(/^\/w\/([^/]+)\/edge\/metadata$/);
  if (m) {
    const n = NODES.find((x) => x.id === decodeURIComponent(m![1]));
    return delay({ items: [{ timestamp: NOW / 1000, cribl: { version: n?.version ?? '4.20.1', mode: 'managed-edge', group: n?.group ?? 'pi', config_version: 'ae32e56-0ac2' }, os: { arch: n?.arch ?? 'arm64', cpu_count: n?.cpus ?? 4, cpu_speed_mhz: 2400, cpu_type: n?.arch === 'x64' ? 'Intel(R) Xeon(R) E-2288G' : 'Cortex-A76', hostname: n?.hostname, memory: n?.mem ?? 0, os_name: n?.platform === 'win32' ? 'Windows 11 Pro' : 'Debian GNU/Linux', os_version: n?.platform === 'win32' ? '23H2' : '12 (bookworm)', platform: n?.platform ?? 'linux', release: '6.12.25+rpt-rpi-2712', timezone: 'America/Denver', machine_id: 'a5d2cf0e5c7f4d64b0e7f4b7b1e3b5f2', username: 'cribl', interfaces: { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true, cidr: '127.0.0.1/8' }], wlan0: [{ address: '10.98.1.124', family: 'IPv4', internal: false, cidr: '10.98.1.124/24', mac: '2c:cf:67:51:de:f9' }], tailscale0: [{ address: '100.64.0.12', family: 'IPv4', internal: false, cidr: '100.64.0.12/32' }] } } }], count: 1 });
  }
  m = path.match(/^\/w\/([^/]+)\/edge\/events\/query$/);
  if (m) {
    const src = params.get('source') ?? '';
    const t = Math.floor(NOW / 1000) - 120;
    let events: Record<string, unknown>[] = [];
    if (src.endsWith('/services')) events = ['cribl-edge', 'ssh', 'nginx', 'tailscaled', 'cron', 'chronyd', 'cups', 'bluetooth', 'rsyslog', 'lightdm', 'NetworkManager', 'postgresql'].map((nme, i) => ({ _time: t, host: 'pi5-cribl', name: `${nme}.service`, loaded: 'loaded', status: i === 7 ? 'failed' : 'active', sub: i === 7 ? 'failed' : 'running', description: `${nme} daemon`, sequence: i }));
    else if (src.endsWith('/ports')) events = [{ _time: t, host: 'pi5-cribl', pid: 1539, program: '/opt/cribl/bin/cribl', protocol: 'TCP', port: 4317, address: '0.0.0.0' }, { _time: t, host: 'pi5-cribl', pid: 1539, program: '/opt/cribl/bin/cribl', protocol: 'TCP', port: 9420, address: '127.0.0.1' }, { _time: t, host: 'pi5-cribl', pid: 1 + 13 * 37 + 3000, program: '/usr/sbin/sshd', protocol: 'TCP', port: 22, address: '0.0.0.0' }, { _time: t, host: 'pi5-cribl', pid: 1 + 33 * 37 + 3000, program: '/usr/sbin/nginx', protocol: 'TCP', port: 80, address: '0.0.0.0' }, { _time: t, host: 'pi5-cribl', pid: 1 + 25 * 37 + 1000, program: '/usr/sbin/chronyd', protocol: 'UDP', port: 323, address: '0.0.0.0' }, { _time: t, host: 'pi5-cribl', pid: 1737, program: '/usr/libexec/gvfsd', protocol: 'UNIX', path: '/run/user/1000/gvfsd/socket' }];
    else if (src.endsWith('/fileSystem')) events = [{ _time: t, host: 'pi5-cribl', mountPoint: '/', fileSystemType: 'ext4', bytesTotal: '116.63GB', bytesUsed: '9.39GB', bytesAvailable: '102.44GB' }, { _time: t, host: 'pi5-cribl', mountPoint: '/boot/firmware', fileSystemType: 'vfat', bytesTotal: '510.00MB', bytesUsed: '76.00MB', bytesAvailable: '434.00MB' }, { _time: t, host: 'pi5-cribl', mountPoint: '/mnt/data', fileSystemType: 'ext4', bytesTotal: '1.82TB', bytesUsed: '1.71TB', bytesAvailable: '110.00GB' }];
    else if (src.endsWith('/interfaces')) events = [{ _time: t, host: 'pi5-cribl', interface: 'wlan0', mtu: '1500', macAddress: '2c:cf:67:51:de:f9', flags: ['UP', 'broadcast', 'multicast'], addrInfo: [{ family: 'ipv4', ipAddress: '10.98.1.124', prefix: 24 }] }, { _time: t, host: 'pi5-cribl', interface: 'tailscale0', mtu: '1280', macAddress: '', flags: ['UP', 'point-to-point'], addrInfo: [{ family: 'ipv4', ipAddress: '100.64.0.12', prefix: 32 }] }, { _time: t, host: 'pi5-cribl', interface: 'lo', mtu: '65536', macAddress: '00:00:00:00:00:00', flags: ['UP', 'loopback'], addrInfo: [{ family: 'ipv4', ipAddress: '127.0.0.1', prefix: 8 }] }];
    else if (src.endsWith('/user')) events = [{ _time: t, host: 'pi5-cribl', username: 'root', userId: 0, loginShell: '/bin/bash', userHome: '/root', primaryGroup: 'root', groups: ['root'] }, { _time: t, host: 'pi5-cribl', username: 'cribl', userId: 1000, loginShell: '/bin/bash', userHome: '/home/cribl', primaryGroup: 'cribl', groups: ['adm', 'sudo', 'cribl'] }];
    return delay({ items: [{ events, offset: [], endOfResults: true }], count: 1 });
  }
  m = path.match(/^\/w\/([^/]+)\/system\/metrics$/);
  if (m) return delay(handleWorkerMetrics(decodeURIComponent(m[1]), params));
  m = path.match(/^\/w\/([^/]+)\/system\/status\/(inputs|outputs)$/);
  if (m) {
    const n = NODES.find((x) => x.id === decodeURIComponent(m![1]));
    const items = n ? ioStatus(m[2] as 'inputs' | 'outputs', n.group) : [];
    return delay({ items, count: items.length, offset: 0, limit: 200, totalCount: items.length });
  }
  if (path === '/system/metrics/query' && method === 'POST') return delay(handleMetricsQuery(body as Record<string, unknown>));
  m = path.match(/^\/products\/(stream|edge)\/workers\/restart$/);
  if (m && method === 'PATCH') {
    const guids = ((body as { guids?: string[] })?.guids ?? []) as string[];
    return delay({ items: guids.map((id) => ({ id, status: 'Restarting' })), count: guids.length });
  }
  if (path.startsWith('/kvstore/')) {
    if (method === 'PUT') {
      kv.set(path, body);
      return delay(undefined);
    }
    if (!kv.has(path)) {
      const err = new Error(`404 from ${path}`) as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return delay(kv.get(path));
  }
  throw new Error(`mock: unhandled ${method} ${url}`);
}
