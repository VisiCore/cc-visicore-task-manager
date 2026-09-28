import { Link } from 'react-router-dom';
import { Skeleton } from '@capra/core';
import { getEdgeMetadata } from '../api/edge';
import { Panel } from './Panel';
import { usePolling } from '../hooks/usePolling';
import { formatBytes } from '../utils/format';

/** Host facts from the Edge Node's metadata endpoint: OS, CPU, memory, interfaces, time zone. */
export function HostCard({ nodeId, enabled }: { nodeId: string; enabled: boolean }) {
  const meta = usePolling(async (signal) => getEdgeMetadata(nodeId, signal), [nodeId], 5 * 60_000, enabled);
  const os = meta.data?.os;
  const ifaces = Object.entries(os?.interfaces ?? {})
    .map(([name, addrs]) => ({ name, addrs: (addrs ?? []).filter((a) => !a.internal).map((a) => a.cidr ?? a.address ?? '').filter(Boolean) }))
    .filter((i) => i.addrs.length);
  const memTotal = typeof os?.memory === 'number' ? os.memory : os?.memory?.total;
  return (
    <Panel
      title="Host"
      span={4}
      readout={os?.os_name ? `${os.os_name} ${os.os_version ?? ''}`.trim() : '--'}
      actions={
        <span className="inline-actions">
          <Link className="cell-link" to={`/services?node=${encodeURIComponent(nodeId)}`}>Services</Link>
          <Link className="cell-link" to={`/files?node=${encodeURIComponent(nodeId)}`}>Files</Link>
        </span>
      }
    >
      {!enabled ? (
        <div className="muted">Host facts are read from the Node while it is connected.</div>
      ) : meta.data ? (
        <dl className="kv-list">
          <dt>OS</dt><dd>{os?.os_name ?? '--'} {os?.os_version ?? ''}{os?.release ? ` · kernel ${os.release}` : ''}</dd>
          <dt>CPU</dt><dd>{os?.cpu_type ?? '--'}{os?.cpu_count ? ` × ${os.cpu_count}` : ''}{os?.cpu_speed_mhz ? ` @ ${(os.cpu_speed_mhz / 1000).toFixed(1)} GHz` : ''}</dd>
          <dt>Memory</dt><dd>{memTotal ? formatBytes(memTotal, 1) : '--'}</dd>
          <dt>Arch</dt><dd>{os?.arch ?? '--'} · {os?.platform ?? '--'}</dd>
          <dt>Time zone</dt><dd>{os?.timezone ?? '--'}</dd>
          <dt>Runs as</dt><dd>{os?.username ?? '--'}</dd>
          <dt>Interfaces</dt>
          <dd>
            {ifaces.length ? ifaces.map((i) => <div key={i.name}><span className="cell-strong">{i.name}</span> <span className="mono muted">{i.addrs.join(', ')}</span></div>) : '--'}
          </dd>
          <dt>Machine id</dt><dd className="mono">{os?.machine_id ? os.machine_id.slice(0, 12) : '--'}</dd>
          <dt>Edge</dt><dd>{meta.data.cribl?.version ?? '--'} · {meta.data.cribl?.mode ?? ''}{meta.data.cribl?.config_version ? ` · config ${meta.data.cribl.config_version.split('-')[0]}` : ''}</dd>
        </dl>
      ) : meta.error ? (
        <div className="muted">{meta.error.message}</div>
      ) : (
        <Skeleton active paragraph={{ rows: 6 }} />
      )}
    </Panel>
  );
}
