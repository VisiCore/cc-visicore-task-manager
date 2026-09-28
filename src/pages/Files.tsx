import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, EmptyState, Skeleton, Table, TextField, ToggleButtonGroup, defineColumns } from '@capra/core';
import { SearchOutlined } from '@capra/icons';
import { inspectFile, listDir, listEdgeLogs, parentPath, sampleFile, searchFile, type DirEntry, type EdgeLogFile, type FileEvent, type FileInspect, type FileSample } from '../api/edge';
import { PageHeader } from '../App';
import { NodePicker } from '../components/NodePicker';
import { Panel } from '../components/Panel';
import { useSorted, type SortDescriptor } from '../components/tables';
import { useFleet } from '../hooks/fleet';
import { usePolling } from '../hooks/usePolling';
import { formatAgo, formatBytes } from '../utils/format';

type Tab = 'logs' | 'browse' | 'search';
const TAIL_BYTES = 48 * 1024;
const HEAD_BYTES = 32 * 1024;

function makeLogColumns(onOpenFile: (path: string) => void) {
  return defineColumns<EdgeLogFile>([
  { id: 'path', label: 'File', allowsSorting: true, render: (_v, r) => <span className="cell-stack"><button type="button" className="link-button mono" onClick={() => onOpenFile(r.path)}>{r.name}</button><span className="muted mono" style={{ fontSize: '11px' }}>{r.dir}</span></span> },
  { id: 'size', label: 'Size', allowsSorting: true, render: (v) => <span className="num">{formatBytes(v as number)}</span> },
  { id: 'modTime', label: 'Modified', allowsSorting: true, render: (v) => <span className="num">{v ? formatAgo((v as number) * 1000) : '--'}</span> },
  { id: 'processes', label: 'Open by', render: (v, r) => <span className="inline-actions">{(v as EdgeLogFile['processes']).length ? (v as EdgeLogFile['processes']).map((p) => <Link key={p.pid} className="cell-link" to={`/processes?node=${encodeURIComponent(String(r.nodeId ?? ''))}&q=${p.pid}`}>{p.process} ({p.pid})</Link>) : <span className="muted">--</span>}</span> },
  { id: 'mode', label: 'Mode', render: (v) => <span className="mono muted">{v as string}</span> },
  ]);
}

function makeDirColumns(onOpenDir: (path: string) => void, onOpenFile: (path: string) => void) {
  return defineColumns<DirEntry>([
    {
      id: 'name',
      label: 'Name',
      allowsSorting: true,
      render: (v, r) =>
        r.type === 'dir' ? (
          <button type="button" className="link-button mono" onClick={() => onOpenDir(r.path)}>{`${v as string}/`}</button>
        ) : r.type === 'file' ? (
          <button type="button" className="link-button mono" onClick={() => onOpenFile(r.path)}>{v as string}</button>
        ) : (
          <span className="mono muted">{v as string} →</span>
        ),
    },
    { id: 'type', label: 'Type', allowsSorting: true },
  { id: 'size', label: 'Size', allowsSorting: true, render: (v, r) => <span className="num">{r.type === 'file' && v !== undefined ? formatBytes(v as number) : '--'}</span> },
    { id: 'mtimeMs', label: 'Modified', allowsSorting: true, render: (v) => <span className="num">{v ? formatAgo(v as number) : '--'}</span> },
    { id: 'mode', label: 'Mode', render: (v) => <span className="mono muted">{v as string}</span> },
  ]);
}

function Crumbs({ path, onGo }: { path: string; onGo: (p: string) => void }) {
  const parts = path.split('/').filter(Boolean);
  return (
    <nav className="crumbs" aria-label="Path">
      <button type="button" onClick={() => onGo('/')}>/</button>
      {parts.map((p, i) => (
        <span key={i}>
          <button type="button" onClick={() => onGo(`/${parts.slice(0, i + 1).join('/')}`)}>{p}</button>
          {i < parts.length - 1 ? '/' : ''}
        </span>
      ))}
    </nav>
  );
}

function highlight(text: string, needle: string) {
  if (!needle) return text;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + needle.length)}</mark>
      {text.slice(idx + needle.length)}
    </>
  );
}

interface ViewerState {
  inspect?: FileInspect;
  head?: FileSample;
  tail?: FileEvent[];
  error?: string;
}

export function FilesPage() {
  const fleet = useFleet();
  const [params, setParams] = useSearchParams();
  const nodes = fleet.data?.nodes ?? [];
  const connected = nodes.filter((n) => !n.disconnected);
  const nodeId = params.get('node') ?? connected[0]?.id ?? '';
  const node = nodes.find((n) => n.id === nodeId);
  const filePath = params.get('path') ?? '';
  const dir = params.get('dir') ?? '/var/log';
  const tab = (params.get('tab') as Tab | null) ?? (filePath ? 'browse' : 'logs');
  const q = params.get('q') ?? '';
  const [searchQuery, setSearchQuery] = useState(params.get('find') ?? '');
  const [search, setSearch] = useState<{ file: string; query: string; events: FileEvent[]; error?: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerPath, setViewerPath] = useState('');
  const [viewerLoading, setViewerLoading] = useState(false);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const logs = usePolling(async (signal) => (await listEdgeLogs(nodeId, signal)).map((l) => ({ ...l, nodeId })), [nodeId], 60_000, !!nodeId);
  const listing = usePolling(async (signal) => listDir(nodeId, dir, signal), [nodeId, dir], 0, !!nodeId && tab === 'browse');

  const openFile = async (path: string) => {
    setViewerPath(path);
    setViewer(null);
    setViewerLoading(true);
    set({ path, tab: 'browse' });
    try {
      const [inspect, head] = await Promise.all([inspectFile(nodeId, path).catch(() => undefined), sampleFile(nodeId, path, HEAD_BYTES)]);
      let tail: FileEvent[] | undefined;
      if (head.length > head.bytesRead) {
        tail = (await searchFile(nodeId, path, '', { limit: 300, offset: Math.max(0, head.length - TAIL_BYTES) }).catch(() => ({ events: [] as FileEvent[] }))).events;
      }
      setViewer({ inspect, head, tail });
    } catch (err) {
      setViewer({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setViewerLoading(false);
    }
  };

  const runSearch = async () => {
    const file = params.get('path') || viewerPath;
    if (!file || !searchQuery.trim()) return;
    setSearching(true);
    set({ find: searchQuery, tab: 'search' });
    try {
      const r = await searchFile(nodeId, file, searchQuery, { limit: 300 });
      setSearch({ file, query: searchQuery, events: r.events });
    } catch (err) {
      setSearch({ file, query: searchQuery, events: [], error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSearching(false);
    }
  };

  const logColumns = useMemo(() => makeLogColumns((path) => void openFile(path)), [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirColumns = useMemo(() => makeDirColumns((path) => set({ dir: path }), (path) => void openFile(path)), [nodeId, params]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = q.trim().toLowerCase();
  const logRows = useMemo(() => (logs.data ?? []).filter((l) => !needle || `${l.path} ${l.processes.map((p) => p.process).join(' ')}`.toLowerCase().includes(needle)), [logs.data, needle]);
  const dirRows = useMemo(() => (listing.data ?? []).filter((e) => !needle || e.name.toLowerCase().includes(needle)), [listing.data, needle]);
  const lg = useSorted(logRows, { column: 'modTime', direction: 'descending' });
  const dr = useSorted(dirRows, { column: 'name', direction: 'ascending' });
  const dirSorted = useMemo(() => [...dr.sorted].sort((a, b) => Number(b.type === 'dir') - Number(a.type === 'dir')), [dr.sorted]);

  const currentFile = params.get('path') || viewerPath;

  return (
    <>
      <PageHeader
        title="Files"
        subtitle={node ? `Files on ${node.hostname}, read in place · nothing is ingested` : 'Browse, tail and search files on an Edge Node'}
        showRange={false}
        actions={
          <NodePicker value={nodeId} onChange={(id) => set({ node: id, path: '', dir: '' })} />
        }
      />
      <div className="page-content page-content-start">
        {fleet.data && nodes.length === 0 && (
          <div className="empty-wrap">
            <EmptyState illustration="EmptyFolder" title="No Edge Nodes are connected" description="Files are read from the Edge Node's host." />
          </div>
        )}
        {nodeId && (
          <div className="span-12">
            <div className="toolbar">
              <ToggleButtonGroup
                aria-label="View"
                size="sm"
                items={[{ key: 'logs', text: `Log files${logs.data ? ` (${logs.data.length})` : ''}` }, { key: 'browse', text: 'Browse' }, { key: 'search', text: 'Search' }]}
                selectedKeys={[tab]}
                disallowEmptySelection
                onSelectionChange={(k) => set({ tab: String(Array.from(k)[0] ?? 'logs') })}
              />
              {tab !== 'search' && (
                <div className="toolbar-grow">
                  <TextField aria-label="Filter" placeholder={tab === 'logs' ? 'Filter by path or process' : 'Filter names'} size="sm" value={q} onChange={(v) => set({ q: v })} leadingSlot={<SearchOutlined />} />
                </div>
              )}
            </div>

            {tab === 'logs' && (
              <Panel title="Log files" span={12} readout={logs.data ? `${logRows.length} of ${logs.data.length} · newest first` : '--'}>
                {logs.error ? (
                  <Alert appearance="danger" title="Could not list log files">{logs.error.message}</Alert>
                ) : logs.loading && !logs.data ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : (
                  <div className="table-wrap">
                    <Table columns={logColumns} visibleColumns={['path', 'size', 'modTime', 'processes', 'mode']} items={lg.sorted} density="compact" sortDescriptor={lg.sort} onSortChange={(s) => lg.setSort(s as SortDescriptor)} aria-label="Log files" renderActionColumn={(r) => <Button size="xs" variant="tertiary" onClick={() => void openFile(r.path)}>View</Button>} />
                  </div>
                )}
              </Panel>
            )}

            {tab === 'browse' && (
              <Panel title="Browse" span={12} readout={<Crumbs path={dir} onGo={(p) => set({ dir: p })} />} actions={dir !== '/' ? <Button size="xs" variant="tertiary" onClick={() => set({ dir: parentPath(dir) })}>Up</Button> : undefined}>
                {listing.error ? (
                  <Alert appearance="danger" title={`Could not list ${dir}`}>{listing.error.message}</Alert>
                ) : listing.loading && !listing.data ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : (
                  <div className="table-wrap">
                    <Table
                      columns={dirColumns}
                      visibleColumns={['name', 'type', 'size', 'mtimeMs', 'mode']}
                      items={dirSorted}
                      density="tight"
                      sortDescriptor={dr.sort}
                      onSortChange={(s) => dr.setSort(s as SortDescriptor)}
                      aria-label={`Contents of ${dir}`}
                      renderActionColumn={(e) =>
                        e.type === 'dir' ? (
                          <Button size="xs" variant="tertiary" onClick={() => set({ dir: e.path })}>Open</Button>
                        ) : e.type === 'file' ? (
                          <Button size="xs" variant="tertiary" onClick={() => void openFile(e.path)}>View</Button>
                        ) : (
                          // Capra tables require a cell for every column, so links get an empty one.
                          <span className="muted">--</span>
                        )
                      }
                    />
                  </div>
                )}
              </Panel>
            )}

            {tab === 'search' && (
              <Panel title="Search in file" span={12} readout={currentFile ? <span className="mono">{currentFile}</span> : 'pick a file from Log files or Browse'}>
                <div className="toolbar">
                  <div className="toolbar-grow">
                    <TextField aria-label="Search text" placeholder="Text to find, e.g. error" size="sm" value={searchQuery} onChange={setSearchQuery} onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }} leadingSlot={<SearchOutlined />} />
                  </div>
                  <Button size="sm" variant="primary" pending={searching} disabled={!currentFile || !searchQuery.trim()} onClick={() => void runSearch()}>Search</Button>
                </div>
                {search?.error && <Alert appearance="danger" title="Search failed">{search.error}</Alert>}
                {search && !search.error && (
                  <div className="file-viewer" role="region" aria-label="Search results">
                    {search.events.length === 0 && <span className="muted">No matches for "{search.query}" in {search.file}.</span>}
                    {search.events.map((e, i) => (
                      <div key={i}>
                        {e.time && <span className="file-line-time">{new Date(e.time * 1000).toLocaleTimeString()}</span>}
                        {highlight(e.raw, search.query)}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            )}

            {(viewerLoading || viewer) && currentFile && (
              <div style={{ marginTop: 16 }}>
                <Panel
                  title="Viewer"
                  span={12}
                  readout={<span className="mono">{currentFile}</span>}
                  actions={
                    <span className="inline-actions">
                      <Button size="xs" variant="tertiary" onClick={() => set({ tab: 'search' })}>Search this file</Button>
                      <Button size="xs" variant="tertiary" onClick={() => { setViewer(null); setViewerPath(''); set({ path: '' }); }}>Close</Button>
                    </span>
                  }
                >
                  {viewerLoading && <Skeleton active paragraph={{ rows: 6 }} />}
                  {viewer?.error && <Alert appearance="danger" title="Could not read file">{viewer.error}</Alert>}
                  {viewer && !viewer.error && (
                    <>
                      <div className="panel-foot" style={{ marginTop: 0, marginBottom: 8 }}>
                        <span>{viewer.head ? `${formatBytes(viewer.head.length)} total` : ''}{viewer.inspect?.md5 ? ` · md5 ${viewer.inspect.md5}` : ''}</span>
                        <span>{viewer.tail ? `showing first ${formatBytes(viewer.head?.bytesRead)} and last ${formatBytes(TAIL_BYTES)}` : 'showing whole file'}</span>
                      </div>
                      <div className="file-viewer" role="region" aria-label="File contents">
                        {viewer.head?.text || <span className="muted">(empty)</span>}
                        {viewer.tail && viewer.tail.length > 0 && (
                          <>
                            {'\n\n… … …\n\n'}
                            {viewer.tail.map((e) => e.raw).join('\n')}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </Panel>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
