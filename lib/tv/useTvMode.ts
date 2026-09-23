'use client';

import { useEffect } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

type Dir = [number, number];
const DIRS: Record<string, Dir> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/**
 * ТВ-навигация (D-pad): пространственный переход фокуса стрелками по всем
 * интерактивным элементам страницы — как в оригинальном lib/tv, но без
 * ручных реестров: геометрия rect + штраф поперечного смещения.
 */
export function useTvNavigation(enabled: boolean) {
  useEffect(() => {
    document.documentElement.dataset.tv = enabled ? 'true' : 'false';
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      const dir = DIRS[e.key];
      if (!dir) return;
      const current = document.activeElement as HTMLElement | null;
      if (current && ['INPUT', 'TEXTAREA', 'SELECT'].includes(current.tagName)) return;

      const items = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );
      if (!items.length) return;

      const center = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2] as const;
      };
      const [cx, cy] = current && items.includes(current) ? center(current) : [window.innerWidth / 2, window.innerHeight / 2];

      let best: HTMLElement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const el of items) {
        if (el === current) continue;
        const [ex, ey] = center(el);
        const dx = ex - cx;
        const dy = ey - cy;
        const along = dx * dir[0] + dy * dir[1];
        if (along <= 8) continue;
        const across = Math.abs(dx * dir[1] + dy * dir[0]);
        const score = along + across * 2.5;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) {
        e.preventDefault();
        best.focus();
        best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.dataset.tv = 'false';
    };
  }, [enabled]);
}
