'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Мобильные жесты плеера (ТЗ 4.1, 3.5) — вынесено из PlayerShell (аудит 30.09,
 * декомпозиция): двойной тап слева/справа = ±10 с, горизонтальный свайп =
 * перемотка (до ±120 с). Работает только для нативного <video> (не embed).
 */
export function usePlayerGestures(videoRef: RefObject<HTMLVideoElement | null>, isEmbed: boolean) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isEmbed) return;
    let sx = 0;
    let sy = 0;
    let st = 0;
    let lastTapT = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dt = Date.now() - st;
      if (dt < 600 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Number.isFinite(v.duration)) {
        e.preventDefault();
        const secs = Math.max(-120, Math.min(120, Math.round(dx / 10)));
        v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + secs));
        return;
      }
      if (dt < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        const now = Date.now();
        if (now - lastTapT < 300) {
          const rect = v.getBoundingClientRect();
          v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + (t.clientX < rect.left + rect.width / 2 ? -10 : 10)));
          lastTapT = 0;
        } else {
          lastTapT = now;
        }
      }
    };
    v.addEventListener('touchstart', onStart, { passive: true });
    v.addEventListener('touchend', onEnd, { passive: false });
    return () => {
      v.removeEventListener('touchstart', onStart);
      v.removeEventListener('touchend', onEnd);
    };
  }, [videoRef, isEmbed]);
}
