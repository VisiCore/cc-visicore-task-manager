import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { SeriesPoint } from '../api/metrics';
import { formatTime } from '../utils/format';

export interface ChartSeries {
  id: string;
  label: string;
  points: SeriesPoint[];
  /** 1-based categorical slot, or a status tone. */
  tone?: number | 'ok' | 'warning' | 'danger' | 'accent' | 'highlight';
  area?: boolean;
}

interface LineChartProps {
  series: ChartSeries[];
  height?: number;
  yMax?: number;
  yMin?: number;
  yFormat?: (v: number) => string;
  /** Show the tabular alternative instead of the plot. */
  tableView?: boolean;
  emptyText?: string;
  ariaLabel: string;
}

const PAD = { top: 8, right: 12, bottom: 20, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Multi-series line chart with a shared crosshair tooltip and an optional table view. */
export function LineChart({ series, height = 180, yMax, yMin = 0, yFormat = (v) => v.toFixed(0), tableView, emptyText = 'No data in range', ariaLabel }: LineChartProps) {
  const [width, setWidth] = useState(600);
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | undefined>(undefined);
  const clipId = useId();

  const times = useMemo(() => {
    const set = new Set<number>();
    for (const s of series) for (const p of s.points) set.add(p.t);
    return Array.from(set).sort((a, b) => a - b);
  }, [series]);

  const tMin = times[0] ?? 0;
  const tMax = times[times.length - 1] ?? 1;
  const top = useMemo(() => {
    if (yMax !== undefined) return yMax;
    let m = 0;
    for (const s of series) for (const p of s.points) m = Math.max(m, p.v);
    return niceMax(m * 1.05);
  }, [series, yMax]);

  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = Math.max(10, height - PAD.top - PAD.bottom);
  const x = (t: number) => PAD.left + (tMax === tMin ? plotW / 2 : ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((Math.min(Math.max(v, yMin), top) - yMin) / (top - yMin || 1)) * plotH;

  // Track the container width so the SVG viewBox always matches the rendered size; otherwise
  // `preserveAspectRatio="none"` would stretch text when a panel resizes after first paint.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!times.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    times.forEach((t, i) => {
      const d = Math.abs(x(t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hasData = series.some((s) => s.points.length > 1);
  const yTicks = [0, 0.5, 1].map((f) => yMin + (top - yMin) * f);
  const xTicks = times.length ? [tMin, (tMin + tMax) / 2, tMax] : [];

  const toneClass = (s: ChartSeries, i: number) => (typeof s.tone === 'number' ? `series-${s.tone}` : s.tone ? `tone-${s.tone}` : `series-${i + 1}`);

  if (tableView) {
    return (
      <div className="chart-table-wrap">
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              {series.map((s) => (
                <th key={s.id} scope="col">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((t) => (
              <tr key={t}>
                <td>{formatTime(t)}</td>
                {series.map((s) => {
                  const p = s.points.find((q) => q.t === t);
                  return <td key={s.id}>{p ? yFormat(p.v) : '--'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const hoverT = hover !== undefined ? times[hover] : undefined;
  const tooltipLeft = hoverT !== undefined ? x(hoverT) : 0;
  const tooltipFlip = tooltipLeft > width * 0.65;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {!hasData && <div className="chart-empty">{emptyText}</div>}
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(undefined)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} />
            <text className="chart-tick" x={PAD.left - 6} y={y(v) + 3} textAnchor="end">{yFormat(v)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t} className="chart-tick" x={x(t)} y={height - 5} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
            {formatTime(t)}
          </text>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {series.map((s, i) => {
            if (s.points.length < 2) return null;
            const pts = [...s.points].sort((a, b) => a.t - b.t);
            const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
            const areaD = `${d} L${x(pts[pts.length - 1].t).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${x(pts[0].t).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;
            return (
              <g key={s.id} className={toneClass(s, i)}>
                {s.area !== false && <path className="chart-area" d={areaD} />}
                <path className="chart-line" d={d} />
              </g>
            );
          })}
        </g>
        {hoverT !== undefined && (
          <g>
            <line className="chart-crosshair" x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={PAD.top + plotH} />
            {series.map((s, i) => {
              const p = s.points.find((q) => q.t === hoverT);
              return p ? <circle key={s.id} className={`chart-marker ${toneClass(s, i)}`} cx={x(p.t)} cy={y(p.v)} r={4} /> : null;
            })}
          </g>
        )}
      </svg>
      {hoverT !== undefined && (
        <div className="chart-tooltip" style={tooltipFlip ? { right: width - tooltipLeft + 8 } : { left: tooltipLeft + 8 }}>
          <div className="chart-tooltip-time">{formatTime(hoverT)}</div>
          {series.map((s, i) => {
            const p = s.points.find((q) => q.t === hoverT);
            return (
              <div key={s.id} className="chart-tooltip-row">
                <span className={`chart-key ${toneClass(s, i)}`} aria-hidden="true" />
                <span className="chart-tooltip-value">{p ? yFormat(p.v) : '--'}</span>
                <span className="chart-tooltip-label">{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <div className="chart-legend">
      {series.map((s, i) => (
        <span key={s.id} className="chart-legend-item">
          <span className={`chart-key ${typeof s.tone === 'number' ? `series-${s.tone}` : s.tone ? `tone-${s.tone}` : `series-${i + 1}`}`} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  );
}
