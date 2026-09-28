import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, SelectField, TextField, ToggleButtonGroup } from '@capra/core';
import { SearchOutlined } from '@capra/icons';
import { fetchDestinations, fetchPipelines, fetchSources } from '../api/metrics';
import { PageHeader } from '../App';
import { IoTable, PipelinesTable, toIoRows, toPipelineRows, type IoTableRow, type PipelineTableRow } from '../components/tables';
import { useFleet } from '../hooks/fleet';
import { useSettings } from '../hooks/settings';
import { usePolling } from '../hooks/usePolling';
import { formatCompact } from '../utils/format';

function useIoFilters() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const group = params.get('group') ?? '';
  const health = params.get('health') ?? 'all';
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return { q, group, health, set };
}

function useGroupItems() {
  const fleet = useFleet();
  return useMemo(() => [{ id: '', label: 'All fleets' }, ...(fleet.data?.groups ?? []).map((g) => ({ id: g.id, label: g.name }))], [fleet.data]);
}

/** Metrics rows come from every group on the Leader; keep only the Edge Fleets in scope. */
function useFleetScope() {
  const fleet = useFleet();
  const ids = fleet.data?.fleetIds;
  const key = ids ? Array.from(ids).sort().join(',') : '';
  return { ids, key };
}

function IoPage({ kind }: { kind: 'sources' | 'destinations' }) {
  const { range, settings } = useSettings();
  const { q, group, health, set } = useIoFilters();
  const groupItems = useGroupItems();
  const scope = useFleetScope();
  const poll = usePolling(
    async (signal) => {
      const fetcher = kind === 'sources' ? fetchSources : fetchDestinations;
      const [cur, prev] = await Promise.all([fetcher(range, signal), fetcher(range, signal, range.seconds).catch(() => undefined)]);
      const inScope = (g: string) => !scope.ids || scope.ids.has(g);
      return toIoRows(cur.filter((r) => inScope(r.group)), prev?.filter((r) => inScope(r.group)));
    },
    [kind, range.key, scope.key],
    settings.refreshSeconds * 1000,
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (poll.data ?? []).filter((r: IoTableRow) => {
      if (group && r.group !== group) return false;
      if (health === 'problems' && (r.health ?? 0) === 0) return false;
      if (needle && !`${r.name} ${r.type} ${r.group}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [poll.data, q, group, health]);

  const totalEps = filtered.reduce((a, r) => a + r.eps, 0);
  const title = kind === 'sources' ? 'Sources' : 'Destinations';

  return (
    <>
      <PageHeader title={title} subtitle={poll.data ? `${filtered.length} of ${poll.data.length} with metrics in the last ${range.label} · ${formatCompact(totalEps)} events/s · "vs prev" compares with the ${range.label} before` : 'Loading…'} />
      <div className="page-content">
        <div className="span-12">
          <div className="toolbar">
            <div className="toolbar-grow">
              <TextField aria-label={`Filter ${title.toLowerCase()}`} placeholder="Filter by name, type or group" size="sm" value={q} onChange={(v) => set('q', v)} leadingSlot={<SearchOutlined />} />
            </div>
            <div className="toolbar-select"><SelectField aria-label="Fleet" size="sm" items={groupItems} value={group} onChange={(k) => set('group', k ? String(k) : '')} shouldAutoSizeDropdown /></div>
            <ToggleButtonGroup aria-label="Health" size="sm" items={[{ key: 'all', text: 'Any health' }, { key: 'problems', text: 'Yellow / Red' }]} selectedKeys={[health]} disallowEmptySelection onSelectionChange={(keys) => set('health', String(Array.from(keys)[0] ?? 'all'))} />
          </div>
          {poll.data && poll.data.length === 0 ? (
            <div className="empty-wrap">
              <EmptyState illustration="EmptyBowl" title={`No ${title.toLowerCase()} reported metrics in this range`} description="Widen the time range, or check that Worker Groups are sending metrics to the Leader." />
            </div>
          ) : (
            <IoTable rows={filtered} loading={poll.loading} label={title} />
          )}
        </div>
      </div>
    </>
  );
}

export const SourcesPage = () => <IoPage kind="sources" />;
export const DestinationsPage = () => <IoPage kind="destinations" />;

export function PipelinesPage() {
  const { range, settings } = useSettings();
  const { q, group, health, set } = useIoFilters();
  const groupItems = useGroupItems();
  const scope = useFleetScope();
  const poll = usePolling(
    async (signal) => {
      const [cur, prev] = await Promise.all([fetchPipelines(range, signal), fetchPipelines(range, signal, range.seconds).catch(() => undefined)]);
      const inScope = (g: string) => !scope.ids || scope.ids.has(g);
      return toPipelineRows(cur.filter((r) => inScope(r.group)), prev?.filter((r) => inScope(r.group)));
    },
    [range.key, scope.key],
    settings.refreshSeconds * 1000,
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (poll.data ?? []).filter((r: PipelineTableRow) => {
      if (group && r.group !== group) return false;
      if (health === 'problems' && r.dropPct < 50) return false;
      if (needle && !`${r.id} ${r.group}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [poll.data, q, group, health]);

  return (
    <>
      <PageHeader title="Pipelines" subtitle={poll.data ? `${filtered.length} of ${poll.data.length} with metrics in the last ${range.label}` : 'Loading…'} />
      <div className="page-content">
        <div className="span-12">
          <div className="toolbar">
            <div className="toolbar-grow">
              <TextField aria-label="Filter pipelines" placeholder="Filter by pipeline or group" size="sm" value={q} onChange={(v) => set('q', v)} leadingSlot={<SearchOutlined />} />
            </div>
            <div className="toolbar-select"><SelectField aria-label="Fleet" size="sm" items={groupItems} value={group} onChange={(k) => set('group', k ? String(k) : '')} shouldAutoSizeDropdown /></div>
            <ToggleButtonGroup aria-label="Drop rate" size="sm" items={[{ key: 'all', text: 'All' }, { key: 'problems', text: 'Dropping ≥ 50%' }]} selectedKeys={[health]} disallowEmptySelection onSelectionChange={(keys) => set('health', String(Array.from(keys)[0] ?? 'all'))} />
          </div>
          {poll.data && poll.data.length === 0 ? (
            <div className="empty-wrap">
              <EmptyState illustration="EmptyBowl" title="No pipelines reported metrics in this range" description="Widen the time range, or check that Worker Groups are sending metrics to the Leader." />
            </div>
          ) : (
            <PipelinesTable rows={filtered} loading={poll.loading} />
          )}
        </div>
      </div>
    </>
  );
}
