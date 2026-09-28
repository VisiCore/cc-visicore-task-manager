import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Alert, IconButton, Text, Toast, ToggleButtonGroup, Tooltip, VerticalNavigation } from '@capra/core';
import { BookOutlined, Cog, Connected, Destinations, FileTextOutlined, FleetOutlined, HomeOutlined, ListTree, Pipeline, ReloadOutlined, Sources, WorkersOutlined } from '@capra/icons';
import { TIME_RANGES, type RangeKey } from './api/metrics';
import { isMockMode } from './api/client';
import { FleetProvider, useFleet } from './hooks/fleet';
import { SettingsProvider, useSettings } from './hooks/settings';
import { formatClock } from './utils/format';
import { SummaryPage } from './pages/Summary';
import { NodesPage } from './pages/Nodes';
import { NodeDetailPage } from './pages/NodeDetail';
import { GroupsPage } from './pages/Groups';
import { GroupDetailPage } from './pages/GroupDetail';
import { SourcesPage, DestinationsPage, PipelinesPage } from './pages/Io';
import { DiagnosticsPage, SettingsPage } from './pages/Settings';
import { ProcessesPage } from './pages/Processes';
import { FilesPage } from './pages/Files';
import { ServicesPage } from './pages/Services';
import { RestartModalHost } from './components/restart';
import { ErrorBoundary } from './components/ErrorBoundary';

const NAV = [
  { to: '/', label: 'Summary', icon: HomeOutlined, exact: true },
  { to: '/processes', label: 'Processes', icon: ListTree },
  { to: '/files', label: 'Files', icon: FileTextOutlined },
  { to: '/services', label: 'Services & ports', icon: Connected },
  { to: '/nodes', label: 'Edge Nodes', icon: WorkersOutlined },
  { to: '/groups', label: 'Fleets', icon: FleetOutlined },
  { to: '/sources', label: 'Sources', icon: Sources },
  { to: '/destinations', label: 'Destinations', icon: Destinations },
  { to: '/pipelines', label: 'Pipelines', icon: Pipeline },
];

const DOCS_URL = 'https://docs.cribl.io/edge/';

function NavItem({ to, label, icon: Icon, exact }: { to: string; label: string; icon: typeof HomeOutlined; exact?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  return (
    <VerticalNavigation.Item
      label={label}
      icon={<Icon />}
      isActive={active}
      href={to}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Task Manager">
        <VerticalNavigation aria-label="Task Manager pages">
          <VerticalNavigation.ItemList>
            {NAV.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </VerticalNavigation.ItemList>
          <VerticalNavigation.Footer>
            <NavItem to="/settings" label="Settings" icon={Cog} />
            <VerticalNavigation.Item label="Documentation" icon={<BookOutlined />} href={DOCS_URL} target="_blank" rel="noreferrer" />
          </VerticalNavigation.Footer>
        </VerticalNavigation>
      </nav>
      <div className="app-main">{children}</div>
    </div>
  );
}

/** Page header with the global TimeScope and refresh control. */
export function PageHeader({ title, subtitle, actions, showRange = true }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; showRange?: boolean }) {
  const { range, setRangeKey, settings } = useSettings();
  const fleet = useFleet();
  return (
    <header className="page-header">
      <div className="page-header-titles">
        <Text as="h1" variant="heading-md">{title}</Text>
        {subtitle && (
          <Text as="div" variant="body-sm-normal" color="subtle">
            {subtitle}
          </Text>
        )}
      </div>
      <div className="page-header-actions">
        {actions}
        {showRange && (
          <ToggleButtonGroup
            aria-label="Time range"
            size="sm"
            items={TIME_RANGES.map((r) => ({ key: r.key, text: r.key }))}
            selectedKeys={[range.key]}
            disallowEmptySelection
            onSelectionChange={(keys) => {
              const k = Array.from(keys)[0];
              if (k) setRangeKey(String(k) as RangeKey);
            }}
          />
        )}
        <Tooltip title={fleet.lastUpdated ? `Updated ${formatClock(fleet.lastUpdated)}${settings.refreshSeconds ? ` · auto every ${settings.refreshSeconds}s` : ' · auto-refresh off'}` : 'Refresh'}>
          <IconButton aria-label="Refresh now" icon={ReloadOutlined} size="sm" variant="tertiary" pending={fleet.refreshing} onClick={fleet.refresh} />
        </Tooltip>
      </div>
    </header>
  );
}

function StatusBar() {
  const fleet = useFleet();
  const d = fleet.data;
  const leaderOk = d?.leaderHealth?.status?.toLowerCase() === 'healthy';
  return (
    <footer className="status-bar">
      <span className={`status-dot tone-${d ? (leaderOk ? 'ok' : 'warning') : 'muted'}`} aria-hidden="true" />
      <span>{d ? `Leader ${d.leaderHealth?.status ?? 'unknown'}` : 'Connecting…'}</span>
      {d?.leader?.BUILD?.VERSION && <span>· v{d.leader.BUILD.VERSION.split('-')[0]}</span>}
      {d && <span>· {d.totals.nodes} Edge Nodes · {d.groups.length} Fleets</span>}
      {d && !d.metricsAvailable && <span className="status-warn">· metrics store unavailable</span>}
      {fleet.error && <span className="status-warn">· {fleet.error.message}</span>}
      {isMockMode() && <span className="status-warn">· MOCK DATA</span>}
      <span className="status-spacer" />
      {fleet.lastUpdated && <span>Updated {formatClock(fleet.lastUpdated)}</span>}
    </footer>
  );
}

function FleetErrorBanner() {
  const fleet = useFleet();
  if (!fleet.error || fleet.data) return null;
  return (
    <div className="page-alert">
      <Alert appearance="danger" title="Could not load Nodes from the Leader">
        {fleet.error.message}. Check that the app's policies grant GET /master/workers and /master/groups, then refresh.
      </Alert>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector('.app-main')?.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function RoutedBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <SettingsProvider>
      <FleetProvider>
        <Toast.Provider />
        <RestartModalHost />
        <Shell>
          <ScrollToTop />
          <FleetErrorBanner />
          <RoutedBoundary>
          <Routes>
            <Route path="/" element={<SummaryPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/nodes/:id" element={<NodeDetailPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/:id" element={<GroupDetailPage />} />
            <Route path="/processes" element={<ProcessesPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/destinations" element={<DestinationsPage />} />
            <Route path="/pipelines" element={<PipelinesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </RoutedBoundary>
          <StatusBar />
        </Shell>
      </FleetProvider>
    </SettingsProvider>
  );
}

