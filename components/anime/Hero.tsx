'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Title } from '@/lib/types';
import { artUri } from '@/lib/art';
import { MetaBadges } from './MetaBadges';
import { IconChevronLeft, IconChevronRight, IconPlay, IconSparkles } from '@/components/ui/icons';

/** Герой-карусель: автопрокрутка, клавиатура, уважение к reduce-motion. */
export function Hero({ slides }: { slides: Title[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
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
      {slides.map((s, i) => (
        <div
          key={s.slug}
          className={`hero__slide ${i === index ? 'is-active' : ''}`}
          aria-hidden={i !== index}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="hero__bg"
            src={s.banner ?? artUri(s.slug, s.romaji, true)}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : 'low'}
            onError={(e) => {
              (e.target as HTMLImageElement).src = artUri(s.slug, s.romaji, true);
            }}
          />
        </div>
      ))}
      <div className="hero__scrim" aria-hidden />
      <div className="hero__content container">
        <MetaBadges title={active} />
        <h1 className="hero__title">{active.ru}</h1>
        <p className="hero__desc">{active.description}</p>
        <div className="hero__actions">
          <Link className="btn btn--primary btn--lg" href={`/anime/${active.slug}/${active.episodes > 1 ? 1 : ''}`.replace(/\/$/, '')}>
            <IconPlay size={16} />
            Смотреть
          </Link>
          <Link className="btn btn--outline btn--lg" href={`/anime/${active.slug}`}>
            <IconSparkles size={16} />
            Подробнее
          </Link>
        </div>
        <div className="hero__dots" role="tablist" aria-label="Слайды">
          {slides.map((s, i) => (
            <button
              key={s.slug}
              role="tab"
              aria-selected={i === index}
              aria-label={`Слайд ${i + 1}: ${s.ru}`}
              className={`hero__dot ${i === index ? 'is-active' : ''}`}
              onClick={() => go(i)}
            />
          ))}
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
