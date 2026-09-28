interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Series slot (1-based) into the categorical palette, or a status tone. */
  tone?: number | 'ok' | 'warning' | 'danger' | 'accent';
  max?: number;
  title?: string;
  /** Stretch to the container's width (strokes keep their thickness). */
  stretch?: boolean;
}

export function Sparkline({ values, width = 96, height = 24, tone = 1, max, title, stretch }: SparklineProps) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return <span className="spark-empty">--</span>;
  const top = max ?? Math.max(...pts, 1e-9);
  const stepX = width / (pts.length - 1);
  const y = (v: number) => height - 2 - (Math.min(v, top) / top) * (height - 4);
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;
  const cls = typeof tone === 'number' ? `series-${tone}` : `tone-${tone}`;
  const last = pts[pts.length - 1];
  return (
    <svg
      className={`spark ${cls}`}
      width={stretch ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'}
      role="img"
      aria-label={title ?? 'trend'}
    >
      <path className="spark-area" d={area} />
      <path className="spark-line" d={path} vectorEffect="non-scaling-stroke" />
      <circle className="spark-dot" cx={width} cy={y(last)} r={2.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
