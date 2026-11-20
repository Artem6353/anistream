'use client';

import { useCallback, useEffect, useState } from 'react';

export type ProtoTheme = 'dark' | 'light';

const KEY = 'aninova-proto-theme';
const EVENT = 'aninova-proto-theme';

/* Тема прототипа живёт на <html data-theme>, выставляется inline-скриптом до
   гидратации (см. app/layout.tsx), поэтому переключение не даёт вспышки.
   Все переключатели на странице синхронизируются через CustomEvent. */
export function useProtoTheme() {
  const [theme, setTheme] = useState<ProtoTheme>('dark');

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
    const sync = (e: Event) => setTheme((e as CustomEvent<ProtoTheme>).detail);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const apply = useCallback((next: ProtoTheme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* приватный режим — тема просто не сохранится */
    }
    window.dispatchEvent(new CustomEvent<ProtoTheme>(EVENT, { detail: next }));
  }, []);

  const toggle = useCallback(() => apply(theme === 'dark' ? 'light' : 'dark'), [apply, theme]);

  return { theme, setTheme: apply, toggle };
}
