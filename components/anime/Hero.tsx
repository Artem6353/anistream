'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Title } from '@/lib/types';
import { artUri } from '@/lib/art';
import { imgLoader, isProxiable } from '@/lib/img';
import { TYPE_LABELS } from '@/lib/labels';
import { episodeCountLabel, isMultiEpisode } from '@/lib/episodes';
import { clampToSentence } from '@/lib/text';
import { IconChevronLeft, IconChevronRight, IconPlay, IconSparkles } from '@/components/ui/icons';

/** Герой-карусель: автопрокрутка, клавиатура, уважение к reduce-motion.
    S1.2/S1.3 (аудит 28.09): баннеры идут через next/image fill + loader → /img
    (avif/webp, ресайз под 100vw — srcset от deviceSizes), первый слайд priority →
    Next сам инжектит <link rel=preload> LCP-изображения при SSR. */
export function Hero({ slides }: { slides: Title[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Record<string, true>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((i: number) => setIndex(((i % slides.length) + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2) return;

    // On phones, don't rotate a full-bleed image every few seconds while the user
    // is reading or scrolling. It saves image work and avoids unexpected movement.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (reduceMotion || touchDevice) return;

    timer.current = setInterval(() => {
      // Don't trigger image loads or React updates for a hidden tab.
      if (document.visibilityState === 'visible') {
        setIndex((i) => (i + 1) % slides.length);
      }
    }, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, slides.length]);

  const active = slides[index];
  if (!active) return null;
  const bg = active.banner ?? active.poster ?? null;
  const backgroundClass = `hero__bg ${active.banner ? '' : 'hero__bg--blurred'}`;

  return (
    <section
      className="hero"
      aria-roledescription="карусель"
      aria-label="Рекомендуемое"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(index - 1);
        if (e.key === 'ArrowRight') go(index + 1);
      }}
    >
      {/* A single active image prevents hidden slides from decoding on phones. */}
      <div key={active.slug} className="hero__slide is-active" aria-hidden={false}>
        {!failed[active.slug] && isProxiable(bg) ? (
          <Image
            className={backgroundClass}
            loader={imgLoader}
            src={bg}
            alt=""
            fill
            sizes="100vw"
            quality={44}
            priority={index === 0}
            {...(index === 0 ? { fetchPriority: 'high' as const } : { loading: 'eager' as const, fetchPriority: 'auto' as const })}
            decoding="async"
            onError={() => setFailed((f) => ({ ...f, [active.slug]: true }))}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={failed[active.slug] || !bg ? 'hero__bg hero__bg--blurred' : backgroundClass}
            src={failed[active.slug] || !bg ? artUri(active.slug, active.romaji, true) : bg!}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority={index === 0 ? 'high' : 'auto'}
            onError={(e) => {
              (e.target as HTMLImageElement).src = artUri(active.slug, active.romaji, true);
            }}
          />
        )}
      </div>
      <div className="hero__scrim" aria-hidden />
      <div className="hero__content container">
        <div className="hero__inner">
          <p className="hero__meta">
            {[
              active.year ? String(active.year) : '',
              TYPE_LABELS[active.type],
              episodeCountLabel(active) ?? '',
              active.score > 0 ? `★ ${active.score.toFixed(1)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {/* S3.1: h1→h2 — единственный H1 страницы теперь page-level (sr-only в app/page.tsx) */}
          <h2 className="hero__title">{active.ru}</h2>
          {/* ТЗ 1.4: hero резал описание CSS-лайскампом посреди слова («…куда тебя»).
              Обрезаем по границе предложения до видимого объёма. */}
          <p className="hero__desc">{clampToSentence(active.description, 260)}</p>
          <div className="hero__actions">
            <Link className="btn btn--primary btn--lg" href={`/anime/${active.slug}/${isMultiEpisode(active) ? 1 : ''}`.replace(/\/$/, '')}>
              <IconPlay size={16} />
              Смотреть
            </Link>
            <Link className="btn btn--ghost btn--lg" href={`/anime/${active.slug}`}>
              <IconSparkles size={16} />
              {/* ТЗ5 3.5: «Подробнее» — неинформативный анкор (SuperSEO links 80);
                  описательный текст: куда ведёт ссылка. */}
              Описание и эпизоды
            </Link>
          </div>
          {/* S3.1/W3C: точки-слайды — не tabs (нет tabpanel), а группа кнопок-переключателей */}
          <div className="hero__dots" role="group" aria-label="Слайды">
            {slides.map((s, i) => (
              <button
                key={s.slug}
                type="button"
                aria-current={i === index}
                aria-label={`Слайд ${i + 1}: ${s.ru}`}
                className={`hero__dot ${i === index ? 'is-active' : ''}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </div>
      </div>
      <button type="button" className="icon-btn hero__arrow hero__arrow--left" onClick={() => go(index - 1)} aria-label="Предыдущий слайд">
        <IconChevronLeft size={18} />
      </button>
      <button type="button" className="icon-btn hero__arrow hero__arrow--right" onClick={() => go(index + 1)} aria-label="Следующий слайд">
        <IconChevronRight size={18} />
      </button>
    </section>
  );
}
