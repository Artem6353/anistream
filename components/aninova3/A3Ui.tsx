'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface A3UiState {
  tv: boolean;
  setTv: (v: boolean) => void;
  hint: boolean;
  dismissHint: () => void;
  showHint: () => void;
}

const Ctx = createContext<A3UiState | null>(null);

const K_TV = 'a3:tv';
const K_HINT = 'a3:hint-seen';

export function A3UiProvider({ children }: { children: React.ReactNode }) {
  const [tv, setTvState] = useState(false);
  const [hint, setHint] = useState(false);

  // ТВ-режим включается явно: ?tv=1 (киоск/пульт) или переключателем; выбор запоминается.
  useEffect(() => {
    let initial = false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tv') === '1') {
        localStorage.setItem(K_TV, '1');
        initial = true;
      } else {
        initial = localStorage.getItem(K_TV) === '1';
      }
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ТВ-режим читается из localStorage после монтирования
    setTvState(initial);
    if (initial && sessionStorage.getItem(K_HINT) !== '1') setHint(true);
  }, []);

  const setTv = useCallback((v: boolean) => {
    setTvState(v);
    try {
      localStorage.setItem(K_TV, v ? '1' : '0');
    } catch {}
    if (v && sessionStorage.getItem(K_HINT) !== '1') setHint(true);
  }, []);

  const dismissHint = useCallback(() => {
    setHint(false);
    try {
      sessionStorage.setItem(K_HINT, '1');
    } catch {}
  }, []);

  const showHint = useCallback(() => setHint(true), []);

  // Подсказка не висит вечно и не мешает контенту.
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => {
      setHint(false);
      try {
        sessionStorage.setItem(K_HINT, '1');
      } catch {}
    }, 12000);
    return () => clearTimeout(t);
  }, [hint]);

  const value = useMemo(() => ({ tv, setTv, hint, dismissHint, showHint }), [tv, setTv, hint, dismissHint, showHint]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useA3Ui(): A3UiState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useA3Ui: компонент вне A3UiProvider');
  return ctx;
}
