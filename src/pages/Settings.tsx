import { Alert, Card, NumberField, SelectField, Switch, Text } from '@capra/core';
import { TIME_RANGES, type RangeKey } from '../api/metrics';
import { isMockMode } from '../api/client';
import { PageHeader } from '../App';
import { useSettings } from '../hooks/settings';
import { Diagnostics } from '../components/Diagnostics';

const REFRESH_ITEMS = [
  { id: '0', label: 'Off (manual refresh)' },
  { id: '10', label: 'Every 10 seconds' },
  { id: '30', label: 'Every 30 seconds' },
  { id: '60', label: 'Every minute' },
  { id: '300', label: 'Every 5 minutes' },
];

export function DiagnosticsPage() {
  return (
    <>
      <PageHeader title="Diagnostics" subtitle="What the platform proxy returns for this app's requests." showRange={false} />
      <div className="page-content">
        <div className="span-12" style={{ maxWidth: 960 }}>
          <Diagnostics autoRun />
        </div>
      </div>
    </>
  );
}

export function SettingsPage() {
  const { settings, update, ready, saving, saveError } = useSettings();
  return (
    <>
      <PageHeader title="Settings" subtitle="Stored in this app's KV store, so they follow you across browsers and devices." showRange={false} />
      <div className="page-content">
        <div className="span-12" style={{ maxWidth: 720 }}>
          {saveError && (
            <div style={{ marginBottom: 16 }}>
              <Alert appearance="warning" title="Settings could not be saved">{saveError}. Changes still apply for this session.</Alert>
            </div>
          )}
          {isMockMode() && (
            <div style={{ marginBottom: 16 }}>
              <Alert appearance="info" title="Mock data mode">This app is running outside Cribl, so everything shown is synthetic. Open it from the Apps page in Cribl (or via live preview) to see your real fleet.</Alert>
            </div>
          )}
          <Card>
            <Card.Header>
              <Card.Title>Refresh and range</Card.Title>
              <Card.Description>{ready ? (saving ? 'Saving…' : 'Saved') : 'Loading…'}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="settings-form">
                <SelectField label="Auto-refresh" items={REFRESH_ITEMS} value={String(settings.refreshSeconds)} onChange={(k) => update({ refreshSeconds: Number(k ?? 30) })} helperText="How often Node lists, meters and charts reload while the tab is visible." />
                <SelectField label="Default time range" items={TIME_RANGES.map((r) => ({ id: r.key, label: r.label }))} value={settings.range} onChange={(k) => update({ range: (k ?? '1h') as RangeKey })} helperText="Charts and per-range throughput figures start with this window. The header buttons change it for the session." />
                <NumberField label="Rows in Summary lists" value={settings.topN} min={3} max={50} step={1} onChange={(v) => update({ topN: v })} helperText="How many Sources and Groups the Summary page lists." />
                <div className="settings-row">
                  <div className="cell-stack">
                    <Text as="div" variant="body-md-semibold">Read metrics from each Node</Text>
                    <Text as="div" variant="body-sm-normal" color="subtle">
                      The Leader keeps Edge metrics per Fleet only. CPU, memory, disk and per-Node throughput come from one small request to each connected Node on every refresh. Leave this on; with it off only Fleet-level throughput and heartbeat facts remain.
                    </Text>
                  </div>
                  <Switch aria-label="Read metrics from each Node" checked={settings.sampleCpu} onChange={(e) => update({ sampleCpu: e.target.checked })} />
                </div>
              </div>
            </Card.Content>
          </Card>
          <div style={{ height: 16 }} />
          <Diagnostics />
          <div style={{ height: 16 }} />
          <Card>
            <Card.Header>
              <Card.Title>About</Card.Title>
            </Card.Header>
            <Card.Content>
              <dl className="kv-list">
                <dt>What it reads</dt>
                <dd>Node list and Worker Groups from the Leader, the Leader metrics store (memory, disk, load, throughput, Source/Destination/Pipeline health) and, per Node, CPU per Worker Process and Source/Destination status.</dd>
                <dt>What it changes</dt>
                <dd>Nothing, except Node restarts you explicitly confirm. Restart is the only write this app performs.</dd>
                <dt>Author</dt>
                <dd>VisiCore Tech · Andrew Hendrix</dd>
              </dl>
            </Card.Content>
          </Card>
        </div>
      </div>
    </>
  );
}
