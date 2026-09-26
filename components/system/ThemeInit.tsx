'use client';

import { useEffect } from 'react';
import { useLibrary } from '@/lib/library';
import { ACCENTS } from '@/lib/labels';

/** Инлайн-скрипт применения темы/акцента ДО гидратации (ТЗ блоки 5 и 13):
    читает anistream:settings из localStorage и ставит data-theme + --accent
    на <html> в момент парсинга — без FOUC и скачка цвета. */
const PRE_HYDRATE = `
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('anistream:settings') || '{}');
    var root = document.documentElement;
    var theme = s.theme || 'system';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    var hex = /^#[0-9a-f]{6}$/i.test(s.customAccent || '') ? s.customAccent : null;
    if (hex) { root.style.setProperty('--accent', hex); root.style.setProperty('--accent-2', hex); }
  } catch (e) {}
})();
`;

/** Применяет акцент, кастомный цвет и reduce-motion из локальных настроек к <html>. */
export function ThemeInit() {
  const { settings } = useLibrary();
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const mode = settings.theme ?? 'system';
      root.dataset.theme = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode;
    };
    applyTheme();
    mq.addEventListener('change', applyTheme);
    const hex = typeof settings.customAccent === 'string' && /^#[0-9a-f]{6}$/i.test(settings.customAccent) ? settings.customAccent : null;
    const accent = ACCENTS[settings.accent] ?? ACCENTS.violet;
    root.style.setProperty('--accent', hex ?? accent.a);
    root.style.setProperty('--accent-2', hex ?? accent.b);
    root.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false';
    return () => mq.removeEventListener('change', applyTheme);
  }, [settings.accent, settings.customAccent, settings.reduceMotion, settings.theme]);
  return <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATE }} />;
}
