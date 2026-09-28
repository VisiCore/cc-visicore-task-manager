/** Shapes of the Cribl API responses this app reads (subset of openapi.json). */

export type Product = 'stream' | 'edge';

export interface ConfigGroup {
  id: string;
  name?: string;
  description?: string;
  type?: 'stream' | 'edge' | 'search' | 'outpost' | string;
  isFleet?: boolean;
  isSearch?: boolean;
  onPrem?: boolean;
  provisioned?: boolean;
  configVersion?: string;
  inherits?: string;
  tags?: string;
  streamtags?: string[];
  maxWorkerAge?: string;
  estimatedIngestRate?: number;
  upgradeVersion?: string;
  cloud?: { provider?: string; region?: string };
  workerCount?: number;
  incompatibleWorkerCount?: number;
  deployingWorkerCount?: number;
  workerRemoteAccess?: boolean;
  collectorsHaEnabled?: boolean;
}

export interface NodeProvidedInfo {
  hostname?: string;
  platform?: string;
  architecture?: string;
  release?: string;
  cpus?: number;
  totalmem?: number;
  freemem?: number;
  node?: string;
  freeDiskSpace?: number;
  totalDiskSpace?: number;
  isSaasWorker?: boolean;
  isCaptain?: boolean;
  apiPort?: number;
  apiScheme?: string;
  conn_ip?: string;
  localTime?: number;
  os?: { addresses?: string[] } | Record<string, unknown>;
  cribl?: {
    version?: string;
    distMode?: string;
    installType?: string;
    group?: string;
    startTime?: number;
    pid?: number;
    guid?: string;
    tags?: string[];
    config?: { version?: string; hbPeriodSeconds?: number };
    master?: { host?: string; port?: number; tls?: boolean };
  };
}

export interface MasterWorkerEntry {
  id: string;
  group: string;
  status?: string;
  disconnected?: boolean;
  deployable?: boolean;
  firstMsgTime: number;
  lastMsgTime: number;
  workerProcesses: number;
  connectionProtocol?: string;
  provisioningTokenId?: string;
  info: NodeProvidedInfo;
  lastMetrics?: Record<string, unknown>;
  nodeUpgradeStatus?: unknown;
}

export interface Paginated<T> {
  items: T[];
  count?: number;
  offset?: number;
  limit?: number;
  totalCount?: number;
}

export interface SystemMessage {
  severity: 'error' | 'warning' | 'info' | string;
  title: string;
  text?: string;
  time?: number;
  group?: string;
  id?: string;
  workerId?: string;
}

export interface SystemInfo {
  BUILD?: { VERSION?: string; BRANCH?: string; TIMESTAMP?: string };
  distMode?: string;
  hostname?: string;
  startTime?: number;
  uptime?: number;
  loadavg?: number[];
  memory?: { free: number; total: number };
  os?: { platform?: string; arch?: string; release?: string; type?: string };
  diskUsage?: { diskPath?: string; totalDiskSize?: number; bytesAvailable?: number; bytesUsed?: number };
  workerProcesses?: number;
  guid?: string;
  messages?: SystemMessage[];
  conf?: { pipelines?: number; routes?: number; outputs?: number; inputs?: number; confVersion?: string };
}

export interface LeaderHealth {
  status: string;
  startTime?: number;
  role?: string;
  isCaptain?: boolean;
}

export interface DistributedSummary {
  groups: {
    count: number;
    routes: number;
    pipelines: number;
    sources: number;
    destinations: number;
    quickConnects: number;
    packs: number;
  };
  workers?: {
    count: number;
    disconnectedCount: number;
    alive: number;
    unhealthy: number;
    groups: number;
    softwareVersions: number;
    confVersions: number;
  };
}

export type HealthColor = 'Green' | 'Yellow' | 'Red' | string;

export interface IoStatus {
  id: string;
  type?: string;
  status?: {
    timestamp?: number;
    health?: HealthColor;
    healthCounts?: Record<string, number>;
    metrics?: Record<string, unknown>;
    items?: { name: string; status?: { health?: HealthColor; metrics?: Record<string, unknown> } }[];
  };
}

export interface RestartResponse {
  id: string;
  status: 'Restarting' | 'Error' | string;
  message?: string;
}

/** One row of a POST /system/metrics/query result: aggregation aliases + split dimensions. */
export type MetricRow = Record<string, string | number | undefined> & {
  starttime?: number;
  endtime?: number;
};

export interface MetricsQueryResponse {
  results: MetricRow[];
}

/** One time bucket of GET /w/:wid/system/metrics. */
export type RawMetricBucket = Record<string, { model: Record<string, string>; val: number }[]>;

export interface RawMetricsResponse {
  results: { exactMatch?: boolean; metrics: RawMetricBucket[] };
}
