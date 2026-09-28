import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export interface TreemapItem {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
}

export interface TreemapGroup {
  id: string;
  label: string;
  items: TreemapItem[];
}

export interface TreemapSelection {
  kind: 'group' | 'item';
  id: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap layout (Bruls, Huizing, van Wijk). Values must be > 0 and sorted descending. */
export function squarify(values: number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array(values.length);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total || rect.w <= 0 || rect.h <= 0) return values.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }));
  const scale = (rect.w * rect.h) / total;
  let x = rect.x;
  let y = rect.y;
  let w = rect.w;
  let h = rect.h;
  let i = 0;

  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    if (!s || !side) return Number.POSITIVE_INFINITY;
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  while (i < values.length) {
    const horizontal = w >= h; // lay the row along the shorter side
    const side = horizontal ? h : w;
    const row: number[] = [];
    const start = i;
    let area = 0;
    while (i < values.length) {
      const a = values[i] * scale;
      const candidate = [...row, a];
      if (row.length && worst(candidate, side) > worst(row, side)) break;
      row.push(a);
      area += a;
      i++;
    }
    const thickness = side > 0 ? area / side : 0;
    let offset = 0;
    for (let k = 0; k < row.length; k++) {
      const len = thickness > 0 ? row[k] / thickness : 0;
      out[start + k] = horizontal ? { x, y: y + offset, w: thickness, h: len } : { x: x + offset, y, w: len, h: thickness };
      offset += len;
    }
    if (horizontal) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
  }
  return out;
}

const HEADER = 22;
const GAP = 2;
const MIN_LABEL_W = 40;
const MIN_LABEL_H = 18;
const MIN_VALUE_H = 32;
const MIN_VALUE_W = 64;

interface TreemapProps {
  groups: TreemapGroup[];
  height?: number;
  selected?: TreemapSelection | null;
  onSelect: (sel: TreemapSelection | null) => void;
  /** When set, only this group is shown, filling the whole area. */
  drill?: string | null;
  onDrill: (groupId: string | null) => void;
  formatValue: (v: number) => string;
  ariaLabel: string;
  /** When given, double-clicking a tile calls this instead of drilling into its group. */
  onOpenItem?: (itemId: string) => void;
  /** When given, double-clicking a group header calls this instead of drilling. */
  onOpenGroup?: (groupId: string) => void;
}

/**
 * Two-level treemap: groups sized by their total, items squarified inside each group. Tiles are
 * buttons: click selects, double-click drills into the group, Backspace drills back out.
 */
export function Treemap({ groups, height = 440, selected, onSelect, drill, onDrill, formatValue, ariaLabel, onOpenItem, onOpenGroup }: TreemapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setWidth((p) => (p === w ? p : w));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colorIndex = useMemo(() => new Map(groups.map((g, i) => [g.id, (i % 8) + 1])), [groups]);

  const layout = useMemo(() => {
    const visible = (drill ? groups.filter((g) => g.id === drill) : groups)
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value),
        total: g.items.reduce((a, it) => a + Math.max(0, it.value), 0),
      }))
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);
    const rects = squarify(visible.map((g) => g.total), { x: 0, y: 0, w: width, h: height });
    return visible.map((g, i) => {
      const r = rects[i];
      const inner: Rect = { x: r.x + GAP, y: r.y + HEADER, w: Math.max(0, r.w - GAP * 2), h: Math.max(0, r.h - HEADER - GAP) };
      const itemRects = squarify(g.items.map((it) => it.value), inner);
      return { group: g, rect: r, items: g.items.map((it, k) => ({ item: it, rect: itemRects[k] })) };
    });
  }, [groups, drill, width, height]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Backspace' && drill) {
      e.preventDefault();
      onDrill(null);
    }
  };

  return (
    <div className="treemap" ref={ref} style={{ height }} role="group" aria-label={ariaLabel} onKeyDown={onKey}>
      {layout.length === 0 && <div className="chart-empty">Nothing to show</div>}
      {layout.map(({ group, rect, items }) => {
        const tone = `series-${colorIndex.get(group.id) ?? 1}`;
        const isSel = selected?.kind === 'group' && selected.id === group.id;
        return (
          <div key={group.id} className={`tm-group ${tone}${isSel ? ' selected' : ''}`} style={{ left: rect.x, top: rect.y, width: Math.max(0, rect.w - GAP), height: Math.max(0, rect.h - GAP) }}>
            <button
              type="button"
              className="tm-group-head"
              title={`${group.label} · ${formatValue(group.total)}${onOpenGroup ? ' · double-click to open' : drill ? ' · double-click to go back' : ' · double-click to drill in'}`}
              onClick={() => onSelect(isSel ? null : { kind: 'group', id: group.id })}
              onDoubleClick={() => (onOpenGroup ? onOpenGroup(group.id) : onDrill(drill ? null : group.id))}
              aria-label={`${group.label}, ${formatValue(group.total)}`}
              aria-pressed={isSel}
            >
              <span className="tm-label">{group.label}</span>
              <span className="tm-value">{formatValue(group.total)}</span>
            </button>
            {items.map(({ item, rect: ir }) => {
              const w = Math.max(0, ir.w - GAP);
              const h = Math.max(0, ir.h - GAP);
              if (w < 3 || h < 3) return null;
              const sel = selected?.kind === 'item' && selected.id === item.id;
              const showLabel = w >= MIN_LABEL_W && h >= MIN_LABEL_H;
              const showValue = showLabel && h >= MIN_VALUE_H && w >= MIN_VALUE_W;
              const showSub = showValue && h >= MIN_VALUE_H + 14 && !!item.sublabel;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`tm-tile${sel ? ' selected' : ''}`}
                  style={{ left: ir.x - rect.x, top: ir.y - rect.y, width: w, height: h }}
                  title={`${item.label}${item.sublabel ? ` · ${item.sublabel}` : ''} · ${formatValue(item.value)}${onOpenItem ? ' · double-click to open' : ''}`}
                  aria-label={`${item.label}, ${formatValue(item.value)}`}
                  aria-pressed={sel}
                  onClick={() => onSelect(sel ? null : { kind: 'item', id: item.id })}
                  onDoubleClick={() => (onOpenItem ? onOpenItem(item.id) : onDrill(drill ? null : group.id))}
                >
                  {showLabel && <span className={`tm-label${showValue ? '' : ' tm-label-tight'}`}>{item.label}</span>}
                  {showValue && (
                    <span className="tm-sub">
                      {formatValue(item.value)}
                      {showSub ? ` · ${item.sublabel}` : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
