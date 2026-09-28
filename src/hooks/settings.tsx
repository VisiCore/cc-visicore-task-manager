import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadKvSettings, saveKvSettings } from '../api/cribl';
import { rangeByKey, type RangeKey, type TimeRange } from '../api/metrics';

export interface Settings {
  /** Auto-refresh period in seconds; 0 disables auto-refresh. */
  refreshSeconds: number;
  /** Default time range for charts and throughput figures. */
  range: RangeKey;
  /** Rows shown in the Summary "top" lists. */
  topN: number;
  /** Read CPU, memory, disk and throughput from each Node (one small request per Node per refresh). */
  sampleCpu: boolean;
}

export const DEFAULT_SETTINGS: Settings = { refreshSeconds: 30, range: '1h', topN: 8, sampleCpu: true };

interface SettingsContextValue {
  settings: Settings;
  /** True once the KV store has been consulted (successfully or not). */
  ready: boolean;
  saving: boolean;
  saveError: string | undefined;
  update: (patch: Partial<Settings>) => void;
  /** The active time range, which pages may override for the session without persisting. */
  range: TimeRange;
  setRangeKey: (key: RangeKey) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function sanitize(raw: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  if (![0, 10, 30, 60, 300].includes(s.refreshSeconds)) s.refreshSeconds = DEFAULT_SETTINGS.refreshSeconds;
  s.range = rangeByKey(s.range).key;
  s.topN = Math.min(50, Math.max(3, Math.round(Number(s.topN) || DEFAULT_SETTINGS.topN)));
  s.sampleCpu = s.sampleCpu !== false;
  return s;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [rangeKey, setRangeKey] = useState<RangeKey>(DEFAULT_SETTINGS.range);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadKvSettings<Partial<Settings>>()
      .then((stored) => {
        if (cancelled) return;
        const s = sanitize(stored);
        setSettings(s);
        setRangeKey(s.range);
      })
      .catch(() => {
        // No stored settings (or no KV access yet): defaults apply.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = sanitize({ ...prev, ...patch });
      if (patch.range) setRangeKey(next.range);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setSaving(true);
        saveKvSettings(next)
          .then(() => setSaveError(undefined))
          .catch((err: unknown) => setSaveError(err instanceof Error ? err.message : String(err)))
          .finally(() => setSaving(false));
      }, 400);
      return next;
    });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, ready, saving, saveError, update, range: rangeByKey(rangeKey), setRangeKey }),
    [settings, ready, saving, saveError, update, rangeKey],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
