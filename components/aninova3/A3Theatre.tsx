'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Title } from '@/lib/types';
import { useA3Ui } from './A3Ui';
import { A3BannerImg } from './A3BannerImg';

const PlayerShell = dynamic(() => import('@/components/player/PlayerShell').then((m) => m.PlayerShell), {
  loading: () => <div className="a3-stage__loading">Загружаем плеер…</div>,
});

/**
 * Кинематографичная оболочка вокруг действующего PlayerShell.
 * Логика воспроизведения, провайдеры, HLS и подписанные URL не меняются:
 * компонент получает те же props, что и production-страница серии.
 */
export function A3Theatre({
  title,
  episode,
  totalEpisodes,
  totalUnknown,
  backdrop,
}: {
  title: Title;
  episode: number;
  totalEpisodes: number;
  totalUnknown: boolean;
  backdrop?: string | null;
}) {
  const { tv } = useA3Ui();
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tv) return;
    // Сцена получает фокус как «поверхность управления»: стрелки — ±10 с, Space — пауза.
    // На кнопках контролов RemoteNav двигает фокус, поэтому здесь ничего не перехватываем.
    const onKey = (e: KeyboardEvent) => {
      const stage = stageRef.current;
      if (!stage || document.activeElement !== stage) return;
      const video = stage.querySelector('video');
      if (!video) return;
      if (e.key === ' ' || e.key.toLowerCase() === 'k' || e.key === 'MediaPlayPause') {
        e.preventDefault();
        if (video.paused) void video.play().catch(() => {});
        else video.pause();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 10 : -10;
        const max = Number.isFinite(video.duration) ? video.duration : video.currentTime + Math.abs(delta);
        video.currentTime = Math.max(0, Math.min(max, video.currentTime + delta));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tv]);

  return (
    <div className="a3-theatre">
      <div
        className="a3-stage"
        ref={stageRef}
        tabIndex={0}
        data-a3-player
        data-a3-stage
        aria-label="Сцена плеера. Стрелки влево и вправо — перемотка на 10 секунд, пробел — пауза."
      >
        {backdrop ? (
          <div className="a3-stage__poster" aria-hidden>
            <A3BannerImg src={backdrop} quality={42} />
          </div>
        ) : null}
        <PlayerShell title={title} episode={episode} totalEpisodes={totalEpisodes} totalUnknown={totalUnknown} />
      </div>
    </div>
  );
}
