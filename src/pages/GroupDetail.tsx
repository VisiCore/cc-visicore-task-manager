import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Skeleton, Tag } from '@capra/core';
import { ArrowLeft, PowerOffOutlined } from '@capra/icons';
import { getGroupSummary } from '../api/cribl';
import { fetchDestinations, fetchPipelines, fetchSources } from '../api/metrics';
import { PageHeader } from '../App';
import { KpiTile } from '../components/KpiTile';
import { Meter } from '../components/Meter';
import { Panel } from '../components/Panel';
import { confirmRestart } from '../components/restart';
import { IoTable, NodesTable, PipelinesTable, toIoRows, toPipelineRows, type Selection } from '../components/tables';
import { useFleet } from '../hooks/fleet';
import { useSettings } from '../hooks/settings';
import { usePolling } from '../hooks/usePolling';
import { formatBytes, formatInt, formatPct, formatRate } from '../utils/format';

export function GroupDetailPage() {
  const { id = '' } = useParams();
  const fleet = useFleet();
  const { range, settings } = useSettings();
  const group = fleet.data?.groups.find((g) => g.id === id);
  const nodes = useMemo(() => (fleet.data?.nodes ?? []).filter((n) => n.group === id), [fleet.data, id]);
  const [selected, setSelected] = useState<Selection>(new Set());
  const product = group?.product ?? 'stream';

  const detail = usePolling(
    async (signal) => {
      const mine = <T extends { group: string }>(rows: T[]) => rows.filter((x) => x.group === id);
      const [summary, sources, destinations, pipelines, prevSources, prevDestinations, prevPipelines] = await Promise.all([
        getGroupSummary(product, id, signal).catch(() => undefined),
        fetchSources(range, signal).then(mine).catch(() => []),
        fetchDestinations(range, signal).then(mine).catch(() => []),
        fetchPipelines(range, signal).then(mine).catch(() => []),
        fetchSources(range, signal, range.seconds).then(mine).catch(() => undefined),
        fetchDestinations(range, signal, range.seconds).then(mine).catch(() => undefined),
        fetchPipelines(range, signal, range.seconds).then(mine).catch(() => undefined),
      ]);
      return { summary, sources: toIoRows(sources, prevSources), destinations: toIoRows(destinations, prevDestinations), pipelines: toPipelineRows(pipelines, prevPipelines) };
    },
    [id, product, range.key],
    settings.refreshSeconds * 1000,
    !!group,
  );

  const selectedNodes = useMemo(() => (selected === 'all' ? nodes : nodes.filter((n) => selected.has(n.id))), [selected, nodes]);

  if (fleet.data && !group) {
    return (
      <>
        <PageHeader title="Group not found" showRange={false} />
        <div className="page-content page-content-start">
          <div className="empty-wrap">
            <EmptyState illustration="MissingSock" title="No such Worker Group or Edge Fleet" description={`The Leader has no group with id ${id}.`}>
              <Link className="cell-link" to="/groups">Back to Groups</Link>
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  const s = detail.data?.summary;
  const memUsed = nodes.reduce((a, n) => a + (n.memUsed ?? 0), 0);
  const memTotal = nodes.reduce((a, n) => a + (n.memTotal ?? 0), 0);
  const redSources = detail.data?.sources.filter((r) => r.health === 2).length ?? 0;
  const redDests = detail.data?.destinations.filter((r) => r.health === 2).length ?? 0;

  return (
    <>
      <PageHeader
        title={
          <span className="inline-actions">
            <Link to="/groups" className="cell-link" aria-label="Back to Groups"><ArrowLeft /></Link>
            {group?.name ?? id}
            {group && <Tag color={group.product === 'edge' ? 'teal' : 'blue'} size="sm">{group.kind}</Tag>}
          </span>
        }
        subtitle={group ? `${group.description || 'No description'} · config ${group.configVersion.split('-')[0]}${group.inherits ? ` · inherits ${group.inherits}` : ''} · ${group.onPrem ? 'on-prem' : `cloud ${group.cloud ?? ''}`}` : undefined}
        actions={
          <Button size="sm" appearance="danger" variant="secondary" leadingIcon={PowerOffOutlined} disabled={selectedNodes.length === 0} onClick={() => confirmRestart(selectedNodes, () => { setSelected(new Set()); fleet.refresh(); })}>
            {selectedNodes.length ? `Restart ${selectedNodes.length} selected` : 'Restart selected'}
          </Button>
        }
      />
      <div className="page-content">
        <Panel title="Group" span={4} readout={group ? `${group.healthy}/${group.nodes} up` : '--'}>
          {group ? (
            <div className="meter-row">
              <Meter label="CPU" value={group.cpuPct} />
              <Meter label="Mem" value={memTotal ? (memUsed / memTotal) * 100 : undefined} />
              <Meter label="Health" value={group.nodes ? (group.healthy / group.nodes) * 100 : undefined} intent={group.nodes === 0 ? 'accent' : group.healthy === group.nodes ? 'ok' : group.healthy ? 'warning' : 'danger'} />
            </div>
          ) : (
            <Skeleton active paragraph={{ rows: 5 }} />
          )}
          <div className="panel-foot">
            <span>{group ? `${formatRate(group.inEps, ' eps')} in` : ''}</span>
            <span>{memTotal ? `${formatBytes(memUsed, 1)} / ${formatBytes(memTotal, 1)}` : ''}</span>
          </div>
        </Panel>
        <KpiTile span={2} label="Nodes" value={group ? `${group.healthy} / ${group.nodes}` : '--'} detail={group ? `${group.disconnected} disconnected · ${group.unhealthy} unhealthy · ${group.versions.length} version${group.versions.length === 1 ? '' : 's'}` : ''} tone={group ? (group.nodes === 0 ? 'none' : group.disconnected || group.unhealthy ? (group.healthy ? 'warning' : 'danger') : 'ok') : 'none'} />
        <KpiTile span={2} label="Sources" value={s ? formatInt(s.groups.sources) : detail.loading ? '…' : '--'} detail={detail.data ? `${detail.data.sources.length} active in range · ${redSources} red` : ''} tone={redSources ? 'danger' : 'none'} />
        <KpiTile span={2} label="Destinations" value={s ? formatInt(s.groups.destinations) : detail.loading ? '…' : '--'} detail={detail.data ? `${detail.data.destinations.length} active in range · ${redDests} red` : ''} tone={redDests ? 'danger' : 'none'} />
        <KpiTile label="Pipelines · Routes · Packs" value={s ? `${formatInt(s.groups.pipelines)} · ${formatInt(s.groups.routes)} · ${formatInt(s.groups.packs)}` : '--'} detail={group ? `dropping ${formatRate(group.dropEps, ' eps')}${group.inEps ? ` (${formatPct((group.dropEps / group.inEps) * 100, 0)})` : ''}` : ''} span={2} />

        <Panel title="Nodes" span={12} readout={`${nodes.length}`}>
          {nodes.length ? (
            <NodesTable nodes={nodes} loading={fleet.loading} hideGroup selectedKeys={selected} onSelectionChange={setSelected} />
          ) : (
            <div className="muted">No Nodes are currently connected to this group.</div>
          )}
        </Panel>

        <Panel title="Sources" span={6} readout={detail.data ? `${detail.data.sources.length}` : '--'}>
          {detail.data && detail.data.sources.length === 0 ? <div className="muted">No Source metrics in range.</div> : <IoTable rows={detail.data?.sources ?? []} loading={detail.loading} hideGroup label="Sources in this group" />}
        </Panel>
        <Panel title="Destinations" span={6} readout={detail.data ? `${detail.data.destinations.length}` : '--'}>
          {detail.data && detail.data.destinations.length === 0 ? <div className="muted">No Destination metrics in range.</div> : <IoTable rows={detail.data?.destinations ?? []} loading={detail.loading} hideGroup label="Destinations in this group" />}
        </Panel>
        <Panel title="Pipelines" span={12} readout={detail.data ? `${detail.data.pipelines.length}` : '--'}>
          {detail.data && detail.data.pipelines.length === 0 ? <div className="muted">No Pipeline metrics in range.</div> : <PipelinesTable rows={detail.data?.pipelines ?? []} loading={detail.loading} hideGroup />}
        </Panel>
      </div>
    </>
  );
}
