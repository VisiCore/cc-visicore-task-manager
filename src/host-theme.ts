export type HostTheme = 'light' | 'dark';

function apply(theme: HostTheme) {
  document.body.classList.toggle('dark', theme === 'dark');
}

/**
 * Applies the Cribl shell's theme to this document. The shell posts CRIBL_APP_LAYOUT shortly
 * after load and on every toggle; until then `prefers-color-scheme` (which the host points at
 * the Cribl theme) is used as a first-paint guess. Returns a teardown fn.
 */
export function installThemeBridge(onTheme?: (theme: HostTheme) => void): () => void {
  const initial: HostTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  apply(initial);
  onTheme?.(initial);

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data as { type?: string; theme?: HostTheme } | null;
    if (data?.type !== 'CRIBL_APP_LAYOUT') return;
    if (data.theme !== 'light' && data.theme !== 'dark') return;
    apply(data.theme);
    onTheme?.(data.theme);
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
