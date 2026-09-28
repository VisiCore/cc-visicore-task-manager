const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '--';
  if (Math.abs(n) < 1) return `${n.toFixed(0)} B`;
  const i = Math.max(0, Math.min(UNITS.length - 1, Math.floor(Math.log(Math.abs(n)) / Math.log(1024))));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${UNITS[i]}`;
}

export function formatRate(n: number | undefined | null, unit = '/s'): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '--';
  return `${formatCompact(n)}${unit}`;
}

export function formatCompact(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(abs === 0 ? 0 : 2);
}

export function formatInt(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '--';
  return new Intl.NumberFormat().format(Math.round(n));
}

export function formatPct(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '--';
  return `${n.toFixed(digits)}%`;
}

export function formatDuration(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--';
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatAgo(ms: number | undefined | null, now = Date.now()): string {
  if (!ms) return '--';
  const sec = Math.max(0, (now - ms) / 1000);
  if (sec < 60) return `${Math.round(sec)}s ago`;
  return `${formatDuration(sec)} ago`;
}

export function formatTime(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function shortVersion(v: string | undefined): string {
  if (!v) return '--';
  return v.split('-')[0];
}

export function shortId(id: string, n = 8): string {
  return id.length > n ? id.slice(0, n) : id;
}
