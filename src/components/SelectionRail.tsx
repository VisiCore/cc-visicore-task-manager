import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

export interface RailStat {
  label: string;
  value: ReactNode;
  tone?: 'ok' | 'warning' | 'danger' | 'none';
}

export interface RailWatchItem {
  id: string;
  label: string;
  sublabel: string;
  value: string;
  /** Signed magnitude for the delta bar, normalized to -1..1. */
  delta: number;
  tone: 'ok' | 'warning' | 'danger' | 'accent';
  onClick?: () => void;
}

interface SelectionRailProps {
  eyebrow: string;
  title: string;
  path: string;
  metric: string;
  metricUnit?: string;
  metricCaption: string;
  stats: RailStat[];
  history?: number[];
  historyLabel?: string;
  watch: RailWatchItem[];
  watchTitle?: string;
  footer?: ReactNode;
  onClear?: () => void;
  onCollapse?: () => void;
}

/** Right rail: the current selection's headline number, deltas, trend and a watch list. */
export function SelectionRail({ eyebrow, title, path, metric, metricUnit, metricCaption, stats, history, historyLabel, watch, watchTitle = 'Worth a look', footer, onClear, onCollapse }: SelectionRailProps) {
  return (
    <aside className="rail" aria-label="Selection details">
      <div className="rail-eyebrow">
        <span className="panel-title">{eyebrow}</span>
        <span className="inline-actions">
          {onClear && (
            <button type="button" className="rail-clear" onClick={onClear}>
              esc clear
            </button>
          )}
          {onCollapse && (
            <button type="button" className="rail-clear" onClick={onCollapse} aria-label="Hide panel" title="Hide panel (r)">
              hide ›
            </button>
          )}
        </span>
      </div>
      <div className="rail-title" title={title}>
        {title}
      </div>
      <div className="rail-path">{path}</div>
      <div className="rail-metric">
        <span className="rail-metric-value">{metric}</span>
        {metricUnit && <span className="rail-metric-unit">{metricUnit}</span>}
      </div>
      <div className="rail-caption">{metricCaption}</div>
      <div className="rail-rule" />
      <dl className="rail-stats">
        {stats.map((s) => (
          <div key={s.label} className={`rail-stat tone-${s.tone ?? 'none'}`}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
      {history && history.length > 1 && (
        <div className="rail-trend">
          <Sparkline values={history} width={260} height={44} tone="accent" title={historyLabel ?? 'trend'} stretch />
          <div className="rail-trend-foot">
            <span>{historyLabel}</span>
            <span>{history.length} samples</span>
          </div>
        </div>
      )}
      <div className="rail-rule" />
      <div className="rail-eyebrow">
        <span className="panel-title">{watchTitle}</span>
        <span className="muted">{watch.length ? `${watch.length}` : ''}</span>
      </div>
      <div className="rail-watch">
        {watch.map((w) => {
          const inner = (
            <>
              <span className={`rail-watch-bar tone-${w.tone}`} aria-hidden="true" />
              <span className="cell-stack rail-watch-main">
                <span className="rail-watch-label">{w.label}</span>
                <span className="rail-watch-sub">{w.sublabel}</span>
                <span className={`rail-watch-track tone-${w.tone}`} aria-hidden="true">
                  <span className="rail-watch-fill" style={{ width: `${Math.min(100, Math.abs(w.delta) * 100)}%` }} />
                </span>
              </span>
              <span className="rail-watch-value">{w.value}</span>
            </>
          );
          return w.onClick ? (
            <button key={w.id} type="button" className="rail-watch-row" onClick={w.onClick}>
              {inner}
            </button>
          ) : (
            <div key={w.id} className="rail-watch-row">
              {inner}
            </div>
          );
        })}
        {!watch.length && <div className="muted">Nothing moved since the last refresh.</div>}
      </div>
      {footer && (
        <>
          <div className="rail-rule" />
          {footer}
        </>
      )}
    </aside>
  );
}
