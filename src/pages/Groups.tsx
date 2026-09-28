import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, TextField } from '@capra/core';
import { SearchOutlined } from '@capra/icons';
import { PageHeader } from '../App';
import { GroupsTable } from '../components/tables';
import { useFleet } from '../hooks/fleet';

export function GroupsPage() {
  const fleet = useFleet();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const product = params.get('product') ?? 'all';
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const groups = fleet.data?.groups;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (groups ?? []).filter((g) => {
      if (product !== 'all' && g.product !== product) return false;
      if (needle && !`${g.id} ${g.name} ${g.description} ${g.kind}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [groups, q, product]);

  return (
    <>
      <PageHeader title="Fleets" subtitle={groups ? `${filtered.length} of ${groups.length} Edge Fleets` : 'Loading…'} showRange={false} />
      <div className="page-content">
        <div className="span-12">
          <div className="toolbar">
            <div className="toolbar-grow">
              <TextField aria-label="Filter fleets" placeholder="Filter by name or description" size="sm" value={q} onChange={(v) => set('q', v)} leadingSlot={<SearchOutlined />} />
            </div>
          </div>
          {groups && groups.length === 0 ? (
            <div className="empty-wrap">
              <EmptyState illustration="EmptyFolder" title="No Edge Fleets" description="Fleets configured on the Leader appear here." />
            </div>
          ) : (
            <GroupsTable groups={filtered} loading={fleet.loading} />
          )}
        </div>
      </div>
    </>
  );
}
