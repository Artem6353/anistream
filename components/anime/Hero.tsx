'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Title } from '@/lib/types';
import { artUri } from '@/lib/art';
import { imgLoader, isProxiable } from '@/lib/img';
import { TYPE_LABELS } from '@/lib/labels';
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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, slides.length]);

  const active = slides[index];
  if (!active) return null;

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
      {slides.map((s, i) => {
        const bg = s.banner ?? s.poster ?? null;
        const cls = `hero__bg ${s.banner ? '' : 'hero__bg--blurred'}`;
        return (
          <div
            key={s.slug}
            className={`hero__slide ${i === index ? 'is-active' : ''}`}
            aria-hidden={i !== index}
          >
            {!failed[s.slug] && isProxiable(bg) ? (
              <Image
                className={cls}
                loader={imgLoader}
                src={bg}
                alt=""
                fill
                sizes="100vw"
                quality={64}
                priority={i === 0}
                {...(i === 0 ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const, fetchPriority: 'low' as const })}
                onError={() => setFailed((f) => ({ ...f, [s.slug]: true }))}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={failed[s.slug] || !bg ? 'hero__bg hero__bg--blurred' : cls}
                src={failed[s.slug] || !bg ? artUri(s.slug, s.romaji, true) : bg!}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'low'}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = artUri(s.slug, s.romaji, true);
                }}
              />
            )}
          </div>
        );
      })}
      <div className="hero__scrim" aria-hidden />
      <div className="hero__content container">
        <div className="hero__inner">
          <p className="hero__meta">
            {[
              active.year ? String(active.year) : '',
              TYPE_LABELS[active.type],
              active.episodes > 1 ? `${active.episodes} сер.` : '',
              active.score > 0 ? `★ ${active.score.toFixed(1)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {/* S3.1: h1→h2 — единственный H1 страницы теперь page-level (sr-only в app/page.tsx) */}
          <h2 className="hero__title">{active.ru}</h2>
          <p className="hero__desc">{active.description}</p>
          <div className="hero__actions">
            <Link className="btn btn--primary btn--lg" href={`/anime/${active.slug}/${active.episodes > 1 ? 1 : ''}`.replace(/\/$/, '')}>
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
