'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Title } from '@/lib/types';
import { useLibrary } from '@/lib/library';
import { PREVIEW_ROOT, previewAnimeHref } from '@/lib/aninova3/watch-view';
import { A3BannerImg } from './A3BannerImg';

const PlayerShell = dynamic(() => import('@/components/player/PlayerShell').then((m) => m.PlayerShell), {
  loading: () => <div className="a3-stage__loading">Загружаем плеер…</div>,
});

/** Кнопка оверлея «Следующая серия» — единственный внутренний router.push плеера,
 *  который можно перехватить по клику. */
function isNextEpisodeButton(el: HTMLElement | null): boolean {
  if (!el) return false;
  const button = el.closest('button');
  if (!button || button.disabled) return false;
  return /^Серия\s+\d+/.test((button.textContent ?? '').trim());
}

/**
 * Кинематографичная оболочка вокруг действующего PlayerShell.
 * Логика воспроизведения, провайдеры, HLS и подписанные URL не меняются:
 * компонент получает те же props, что и production-страница серии.
 *
 * В preview меняется только навигация: ссылки плеера `/anime/...` ведут на
 * production-маршруты, поэтому они переписываются на `/preview/aninova-3/anime/...`
 * на уровне сцены, без правок PlayerShell. Так же обрабатываются автопереход по
 * окончании видео, кнопка «Серия N» и горячая клавиша N.
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
  const stageRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { settings } = useLibrary();
  const nextEpisode = episode < totalEpisodes ? episode + 1 : null;
  const nextHref = nextEpisode ? `${PREVIEW_ROOT}/anime/${title.slug}/${nextEpisode}` : null;

  /* Preview-навигация внутри замороженного PlayerShell. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;

      const anchor = el.closest('a[href]') as HTMLAnchorElement | null;
      if (anchor && stage.contains(anchor)) {
        if (anchor.target && anchor.target !== '_self') return;
        const to = previewAnimeHref(anchor.getAttribute('href'));
        if (!to) return;
        e.preventDefault();
        e.stopPropagation();
        router.push(to);
        return;
      }

      if (nextHref && el.closest('.player__next') && isNextEpisodeButton(el)) {
        e.preventDefault();
        e.stopPropagation();
        router.push(nextHref);
      }
    };

    const onEnded = (e: Event) => {
      if (!nextHref || !settings.autoplayNext) return;
      /* Событие media не всплывает, но capture-фаза сцены идёт раньше
         обработчика на самом <video>. Гасим его, иначе PlayerShell успеет
         увести на production-маршрут вторым router.push. */
      e.stopPropagation();
      router.push(nextHref);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      /* Не уводим со страницы открытую форму жалобы. */
      if (target?.closest('[role="dialog"]')) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!nextHref) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      router.push(nextHref);
    };

    stage.addEventListener('click', onClick, true);
    stage.addEventListener('ended', onEnded, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      stage.removeEventListener('click', onClick, true);
      stage.removeEventListener('ended', onEnded, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [nextHref, router, settings.autoplayNext]);

  /* Клавиши сцены. Слушаем в capture и не пропускаем событие дальше: иначе
     PlayerShell обработает те же Space/стрелки второй раз (двойная пауза,
     перемотка на 20 секунд вместо 10). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const stage = stageRef.current;
      if (!stage || document.activeElement !== stage) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      /* Вверх/вниз — выход из сцены, а не ловушка фокуса: RemoteNav на
         сфокусированной сцене намеренно не двигает фокус стрелками. */
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const next =
          e.key === 'ArrowDown'
            ? stage.querySelector<HTMLElement>('.player .icon-btn')
            : stage.querySelector<HTMLElement>('.player-bar .icon-btn') ??
              document.querySelector<HTMLElement>('.a3-watchhead__nav .a3-btn');
        next?.focus();
        return;
      }
      const video = stage.querySelector('video');
      if (!video) return;
      if (e.key === ' ' || e.key.toLowerCase() === 'k' || e.key === 'MediaPlayPause') {
        e.preventDefault();
        e.stopPropagation();
        if (video.paused) void video.play().catch(() => {});
        else video.pause();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.key === 'ArrowRight' ? 10 : -10;
        const max = Number.isFinite(video.duration) ? video.duration : video.currentTime + Math.abs(delta);
        video.currentTime = Math.max(0, Math.min(max, video.currentTime + delta));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="a3-theatre">
      <div
        className="a3-stage"
        ref={stageRef}
        tabIndex={0}
        role="region"
        data-a3-player
        data-a3-stage
        aria-label="Сцена плеера. Стрелки влево и вправо — перемотка на 10 секунд, пробел — пауза."
      >
        {backdrop ? (
          <div className="a3-stage__poster" aria-hidden>
            <A3BannerImg src={backdrop} quality={42} />
          </div>
        ) : null}
        <div className="a3-stage__scrim" aria-hidden />
        <PlayerShell title={title} episode={episode} totalEpisodes={totalEpisodes} totalUnknown={totalUnknown} />
      </div>
    </div>
  );
}
