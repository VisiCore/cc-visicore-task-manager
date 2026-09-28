import type { Severity } from '../model/nodes';
import { pctSeverity } from '../model/nodes';

export type MeterIntent = Severity | 'accent' | 'info' | 'highlight';

interface MeterProps {
  /** 0-100. `undefined` renders an empty meter with a "--" caption. */
  value: number | undefined;
  label?: string;
  /** Text under the meter (defaults to the percentage). */
  caption?: string;
  orientation?: 'vertical' | 'horizontal';
  segments?: number;
  /** Fixed color, or omit to derive from thresholds. */
  intent?: MeterIntent;
  warn?: number;
  danger?: number;
  'aria-label'?: string;
}

/** A segmented LED-style meter. All lit segments share one color chosen by severity. */
export function Meter({
  value,
  label,
  caption,
  orientation = 'vertical',
  segments = orientation === 'vertical' ? 24 : 20,
  intent,
  warn = 75,
  danger = 90,
  'aria-label': ariaLabel,
}: MeterProps) {
  const pct = value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const lit = value === undefined ? 0 : Math.round((pct / 100) * segments);
  const tone: MeterIntent = intent ?? pctSeverity(value, warn, danger);
  const text = caption ?? (value === undefined ? '--' : `${pct.toFixed(pct >= 10 ? 0 : 1)}%`);
  const cells = Array.from({ length: segments }, (_, i) => {
    // Vertical meters light from the bottom up, so the first cell in DOM order is the top.
    const index = orientation === 'vertical' ? segments - 1 - i : i;
    return <span key={i} className={index < lit ? 'meter-seg lit' : 'meter-seg'} />;
  });
  return (
    <div
      className={`meter meter-${orientation} tone-${tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === undefined ? undefined : Math.round(pct)}
      aria-label={ariaLabel ?? label ?? 'utilization'}
    >
      {label && <span className="meter-label">{label}</span>}
      <span className="meter-track">{cells}</span>
      <span className="meter-caption">{text}</span>
    </div>
  );
}

/** Compact inline meter for table cells: short bar + number. */
export function CellMeter({ value, warn, danger, text }: { value: number | undefined; warn?: number; danger?: number; text?: string }) {
  const tone = pctSeverity(value, warn ?? 75, danger ?? 90);
  const pct = value === undefined ? 0 : Math.max(0, Math.min(100, value));
  return (
    <span className={`cell-meter tone-${tone}`}>
      <span className="cell-meter-track" aria-hidden="true">
        <span className="cell-meter-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="cell-meter-text">{text ?? (value === undefined ? '--' : `${pct.toFixed(pct >= 10 ? 0 : 1)}%`)}</span>
    </span>
  );
}
