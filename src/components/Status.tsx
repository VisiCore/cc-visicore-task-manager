import { Pill } from '@capra/core';
import type { HealthLevel } from '../api/metrics';
import type { NodeState } from '../model/nodes';

const NODE_STATE: Record<NodeState, { label: string; appearance: 'success' | 'danger' | 'warning' | 'default' | 'info' }> = {
  healthy: { label: 'Healthy', appearance: 'success' },
  unhealthy: { label: 'Unhealthy', appearance: 'danger' },
  disconnected: { label: 'Disconnected', appearance: 'danger' },
  late: { label: 'Late heartbeat', appearance: 'warning' },
  unknown: { label: 'Unknown', appearance: 'default' },
};

export function NodeStatePill({ state, bold }: { state: NodeState; bold?: boolean }) {
  const s = NODE_STATE[state];
  return (
    <Pill appearance={s.appearance} variant={bold ? 'bold' : 'muted'} inline>
      {s.label}
    </Pill>
  );
}

const HEALTH: Record<HealthLevel, { label: string; appearance: 'success' | 'warning' | 'danger' }> = {
  0: { label: 'Green', appearance: 'success' },
  1: { label: 'Yellow', appearance: 'warning' },
  2: { label: 'Red', appearance: 'danger' },
};

export function HealthPill({ level }: { level: HealthLevel | undefined }) {
  if (level === undefined) {
    return (
      <Pill appearance="default" variant="muted" inline>
        Unknown
      </Pill>
    );
  }
  const h = HEALTH[level];
  return (
    <Pill appearance={h.appearance} variant="muted" inline>
      {h.label}
    </Pill>
  );
}

export function healthFromColor(color: string | undefined): HealthLevel | undefined {
  if (!color) return undefined;
  const c = color.toLowerCase();
  return c === 'red' ? 2 : c === 'yellow' ? 1 : c === 'green' ? 0 : undefined;
}

/** A small colored dot with an accessible label; used in dense lists. */
export function StatusDot({ tone, label }: { tone: 'ok' | 'warning' | 'danger' | 'muted'; label: string }) {
  return <span className={`status-dot tone-${tone}`} role="img" aria-label={label} title={label} />;
}
