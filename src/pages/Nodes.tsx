import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, SelectField, TextField, ToggleButtonGroup } from '@capra/core';
import { PowerOffOutlined, SearchOutlined } from '@capra/icons';
import { PageHeader } from '../App';
import { confirmRestart } from '../components/restart';
import { NodesTable, type Selection } from '../components/tables';
import { useFleet } from '../hooks/fleet';
import type { NodeRow } from '../model/nodes';

type StateFilter = 'all' | 'problems';

function useNodeFilters(nodes: NodeRow[] | undefined) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const group = params.get('group') ?? '';
  const product = params.get('product') ?? 'all';
  const state = (params.get('state') as StateFilter | null) ?? 'all';
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (nodes ?? []).filter((n) => {
      if (group && n.group !== group) return false;
      if (product !== 'all' && n.product !== product) return false;
      if (state === 'problems' && n.state === 'healthy') return false;
      if (needle && !`${n.hostname} ${n.id} ${n.group} ${n.version} ${n.connIp ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [nodes, q, group, product, state]);
  return { q, group, product, state, set, filtered };
}

export function NodesPage() {
  const fleet = useFleet();
  const nodes = fleet.data?.nodes;
  const { q, group, state, set, filtered } = useNodeFilters(nodes);
  const [selected, setSelected] = useState<Selection>(new Set());

  const groupItems = useMemo(
    () => [{ id: '', label: 'All groups' }, ...(fleet.data?.groups ?? []).map((g) => ({ id: g.id, label: `${g.name} (${g.nodes})` }))],
    [fleet.data],
  );
  const selectedNodes = useMemo(() => {
    if (!nodes) return [];
    if (selected === 'all') return filtered;
    return filtered.filter((n) => selected.has(n.id));
  }, [selected, filtered, nodes]);

  return (
    <>
      <PageHeader title="Edge Nodes" subtitle={nodes ? `${filtered.length} of ${nodes.length} Edge Nodes` : 'Loading…'} showRange={false} />
      <div className="page-content">
        <div className="span-12">
          <div className="toolbar">
            <div className="toolbar-grow">
              <TextField aria-label="Filter nodes" placeholder="Filter by host, id, group, version or IP" size="sm" value={q} onChange={(v) => set('q', v)} leadingSlot={<SearchOutlined />} />
            </div>
            <div className="toolbar-select"><SelectField aria-label="Fleet" size="sm" items={groupItems} value={group} onChange={(k) => set('group', k ? String(k) : '')} shouldAutoSizeDropdown /></div>
            <ToggleButtonGroup
              aria-label="Health"
              size="sm"
              items={[{ key: 'all', text: 'Any status' }, { key: 'problems', text: 'Problems' }]}
              selectedKeys={[state]}
              disallowEmptySelection
              onSelectionChange={(keys) => set('state', String(Array.from(keys)[0] ?? 'all'))}
            />
            <div className="toolbar-actions">
              <Button
                size="sm"
                appearance="danger"
                variant="secondary"
                leadingIcon={PowerOffOutlined}
                disabled={selectedNodes.length === 0}
                onClick={() => confirmRestart(selectedNodes, () => { setSelected(new Set()); fleet.refresh(); })}
              >
                {selectedNodes.length ? `Restart ${selectedNodes.length} selected` : 'Restart selected'}
              </Button>
            </div>
          </div>
          {nodes && nodes.length === 0 ? (
            <div className="empty-wrap">
              <EmptyState illustration="Hibernating" title="No Nodes are reporting to this Leader" description="Worker and Edge Nodes appear here as soon as they connect." />
            </div>
          ) : (
            <NodesTable nodes={filtered} loading={fleet.loading} selectedKeys={selected} onSelectionChange={setSelected} />
          )}
        </div>
      </div>
    </>
  );
}
