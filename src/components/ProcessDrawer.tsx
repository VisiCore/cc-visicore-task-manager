import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Drawer, Table, Tag, defineColumns } from '@capra/core';
import type { EdgeLogFile } from '../api/edge';
import { stateLabel, type ProcessRow, type ProcessSocket } from '../api/processes';
import { Meter } from './Meter';
import { formatBytes, formatDuration } from '../utils/format';

type SocketRow = ProcessSocket & { id: string; [k: string]: unknown };

const socketColumns = defineColumns<SocketRow>([
  { id: 'proto', label: 'Proto', render: (v) => <span className="mono">{String(v).toUpperCase()}</span> },
  { id: 'local', label: 'Local', render: (v, s) => <span className="mono">{`${v}:${s.localPort}`}</span> },
  { id: 'remote', label: 'Remote', render: (v, s) => <span className="mono">{s.remotePort ? `${v}:${s.remotePort}` : '--'}</span> },
  { id: 'state', label: 'State', render: (v, s) => <span className={v === 'inbound' && !s.remotePort ? 'cell-strong' : 'muted'}>{v === 'inbound' && !s.remotePort ? 'Listening' : v === 'inbound' ? 'Inbound' : v === 'outbound' ? 'Outbound' : String(v)}</span> },
]);

const SENSITIVE = /(key|secret|token|pass|pwd|auth|cred|cookie|session)/i;

interface ProcessDrawerProps {
  row: ProcessRow | null;
  nodeId: string;
  hostname: string;
  logs?: EdgeLogFile[];
  cpus?: number;
  onClose: () => void;
}

/** Everything the Node reports about one process: identity, resources, IO, sockets, files, environment. */
export function ProcessDrawer({ row, nodeId, hostname, logs, cpus, onClose }: ProcessDrawerProps) {
  const [showEnv, setShowEnv] = useState(false);
  const openLogs = useMemo(() => (row && logs ? logs.filter((l) => l.processes.some((p) => p.pid === row.pid)) : []), [row, logs]);
  const socketRows = useMemo<SocketRow[]>(() => (row?.sockets ?? []).map((s, i) => ({ ...s, id: `${i}` })), [row]);
  const envKeys = useMemo(() => Object.keys(row?.env ?? {}).sort(), [row]);

  return (
    <Drawer isOpen={!!row} onClose={onClose} placement="right" width={620} title={row ? `${row.command} · pid ${row.pid}` : ''} aria-label="Process details">
      {row && (
        <div className="drawer-body">
          <div className="inline-actions">
            <Tag color={row.state === 'R' ? 'green' : row.state === 'Z' || row.state === 'D' ? 'red' : 'default'} size="sm">{stateLabel(row.state)}</Tag>
            <Tag size="sm">{row.user}</Tag>
            {row.service && <Tag color="blue" size="sm">{row.service}</Tag>}
            {row.container && <Tag color="teal" size="sm">{`container ${row.container}`}</Tag>}
            <span className="muted">on {hostname}</span>
          </div>

          <div className="meter-row drawer-meters">
            <Meter label="CPU" value={Math.min(100, row.cpu)} caption={`${row.cpu.toFixed(1)}%`} orientation="horizontal" warn={50} danger={85} />
            <Meter label="Mem" value={row.memPct} caption={`${formatBytes(row.memBytes)} · ${row.memPct.toFixed(1)}%`} orientation="horizontal" warn={25} danger={50} />
          </div>

          <dl className="kv-list">
            <dt>Command</dt><dd className="mono">{row.argv.length ? row.argv.join(' ') : row.command}</dd>
            <dt>Executable</dt><dd className="mono">{row.exePath || '--'}</dd>
            <dt>Parent</dt><dd>pid {row.ppid}</dd>
            <dt>Started</dt><dd>{row.startTime ? `${formatDuration(Date.now() / 1000 - row.startTime)} ago · ${new Date(row.startTime * 1000).toLocaleString()}` : '--'}</dd>
            <dt>CPU time</dt><dd>{formatDuration(row.cpuSeconds)}{cpus ? ` · ${(row.cpu / 100).toFixed(2)} of ${cpus} cores now` : ''}</dd>
            <dt>Threads</dt><dd>{row.threads}</dd>
            <dt>Open files</dt><dd>{row.fds ?? '--'}</dd>
            <dt>Priority</dt><dd>{row.priority ?? '--'}{row.nice ? ` (nice ${row.nice > 0 ? '+' : ''}${row.nice})` : ''}</dd>
            <dt>uid / gid</dt><dd>{row.uid ?? '--'} / {row.gid ?? '--'}</dd>
            <dt>Disk IO</dt><dd>{row.ioRead !== undefined ? `${formatBytes(row.ioRead)} read · ${formatBytes(row.ioWrite)} written` : '--'}</dd>
            <dt>All IO</dt><dd>{row.ioReadChars !== undefined ? `${formatBytes(row.ioReadChars)} read · ${formatBytes(row.ioWriteChars)} written (incl. sockets and cache)` : '--'}</dd>
          </dl>

          <div className="drawer-section">
            <span className="panel-title">Sockets</span>
            <span className="muted"> · {socketRows.length}{row.listening.length ? ` · listening on ${row.listening.join(', ')}` : ''}</span>
          </div>
          {socketRows.length ? (
            <div className="table-wrap">
              <Table columns={socketColumns} visibleColumns={['proto', 'local', 'remote', 'state']} items={socketRows} density="tight" aria-label="Sockets" />
            </div>
          ) : (
            <div className="muted">No TCP or UDP sockets.</div>
          )}

          <div className="drawer-section">
            <span className="panel-title">Log files open</span>
            <span className="muted"> · {logs ? openLogs.length : '…'}</span>
          </div>
          {openLogs.length ? (
            <div className="top-list">
              {openLogs.map((l) => (
                <Link key={l.path} className="top-list-row file-grid" to={`/files?node=${encodeURIComponent(nodeId)}&path=${encodeURIComponent(l.path)}`}>
                  <span className="cell-stack">
                    <span className="top-list-name mono">{l.path}</span>
                    <span className="top-list-sub">{l.mode}{l.modTime ? ` · modified ${formatDuration(Date.now() / 1000 - l.modTime)} ago` : ''}</span>
                  </span>
                  <span className="top-list-value">{formatBytes(l.size)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="muted">{logs ? 'None reported for this process.' : 'Loading log inventory…'}</div>
          )}

          <div className="drawer-section inline-actions">
            <span className="panel-title">Environment</span>
            <span className="muted">· {envKeys.length} variables</span>
            {envKeys.length > 0 && (
              <Button size="xs" variant="tertiary" onClick={() => setShowEnv((v) => !v)}>
                {showEnv ? 'Hide values' : 'Show values'}
              </Button>
            )}
          </div>
          {envKeys.length ? (
            <dl className="kv-list env-list">
              {envKeys.map((k) => (
                <div key={k} className="env-row">
                  <dt className="mono">{k}</dt>
                  <dd className="mono">{showEnv && !SENSITIVE.test(k) ? row.env[k] : '••••••'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="muted">Not readable for this process.</div>
          )}
          {showEnv && <div className="muted">Values of variables whose names look like secrets stay masked.</div>}
        </div>
      )}
    </Drawer>
  );
}
