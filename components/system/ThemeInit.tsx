'use client';

import { useEffect } from 'react';
import { useLibrary } from '@/lib/library';
import { ACCENTS } from '@/lib/labels';

/** Применяет акцент и reduce-motion из локальных настроек к <html>. */
export function ThemeInit() {
  const { settings } = useLibrary();
  useEffect(() => {
    const root = document.documentElement;
    const accent = ACCENTS[settings.accent] ?? ACCENTS.violet;
    root.style.setProperty('--accent', accent.a);
    root.style.setProperty('--accent-2', accent.b);
    root.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false';
  }, [settings.accent, settings.reduceMotion]);
  return null;
}
