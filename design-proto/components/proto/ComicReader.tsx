'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/* Читалка комиксов: одна логика на три концепции.
   Управление: кнопки, стрелки ←/→, свайп на мобильном, клик по половине
   страницы. Вид (тёмный кинозал / бумага / утилитарный) — в CSS концепций. */
export function ComicReader({
  title,
  comicHref,
  pages,
  chapter,
  startPage = 0,
}: {
  title: string;
  comicHref: string;
  pages: { n: number; src: string }[];
  chapter: number;
  startPage?: number;
}) {
  const [index, setIndex] = useState(() => Math.min(startPage, pages.length - 1));
  const stageRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.min(Math.max(i + delta, 0), pages.length - 1);
        return next;
      });
    },
    [pages.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  useEffect(() => {
    const el = stageRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [index]);

  const page = pages[index];
  const progress = ((index + 1) / pages.length) * 100;

  return (
    <div className="rd" role="region" aria-label={`Читалка: ${title}, глава ${chapter}`}>
      <div className="rd-top">
        <Link className="rd-close" href={comicHref}>
          <Icon name="left" size={15} /> К комиксу
        </Link>
        <div className="rd-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="rd-count" aria-live="polite">
          {index + 1} / {pages.length}
        </span>
      </div>

      <div
        className="rd-stage"
        ref={stageRef}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
          if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <button className="rd-zone rd-zone--prev" type="button" onClick={() => go(-1)} aria-label="Предыдущая страница" disabled={index === 0} />
        <figure className="rd-page">
          <Image
            key={page.src}
            src={page.src}
            alt={`Страница ${index + 1} — ${title}, глава ${chapter}`}
            width={720}
            height={1080}
            sizes="(max-width: 800px) 100vw, 760px"
            priority={index === 0}
          />
          <span className="rd-margin" aria-hidden="true">
            {String(index + 1).padStart(3, '0')}
          </span>
        </figure>
        <button className="rd-zone rd-zone--next" type="button" onClick={() => go(1)} aria-label="Следующая страница" disabled={index === pages.length - 1} />
      </div>

      <div className="rd-bar">
        <button type="button" className="rd-btn" onClick={() => go(-1)} disabled={index === 0}>
          <Icon name="left" size={16} /> Назад
        </button>
        <p className="rd-chapter">
          {title} · глава {chapter}
        </p>
        <button type="button" className="rd-btn" onClick={() => go(1)} disabled={index === pages.length - 1}>
          Дальше <Icon name="right" size={16} />
        </button>
      </div>
      <p className="rd-note">Стрелки ← → или свайп. Демонстрационные страницы, не реальная глава.</p>
    </div>
  );
}
