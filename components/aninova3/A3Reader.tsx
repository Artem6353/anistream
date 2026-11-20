'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DEMO_PAGES } from '@/lib/aninova3/comics-demo';
import { saveComicProgress } from './A3ComicContinue';
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons';

/** Минималистичная читалка A: страница, прогресс, клавиатура и свайп.
 *  Изображения — демонстрационные (сгенерированные страницы), не главы из каталога. */
export function A3Reader({
  slug,
  comicTitle,
  chapter,
  initialPage,
}: {
  slug: string;
  comicTitle: string;
  chapter: number;
  initialPage: number;
}) {
  const router = useRouter();
  const [page, setPage] = useState(Math.min(Math.max(1, initialPage), DEMO_PAGES.length));
  const touchX = useRef<number | null>(null);
  const total = DEMO_PAGES.length;

  const go = useCallback(
    (next: number) => {
      setPage((prev) => {
        const value = Math.min(Math.max(1, next), total);
        if (value !== prev) saveComicProgress({ slug, chapter, page: value, updatedAt: Date.now() });
        return value;
      });
    },
    [chapter, slug, total],
  );

  useEffect(() => {
    saveComicProgress({ slug, chapter, page, updatedAt: Date.now() });
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(page));
      window.history.replaceState(null, '', url);
    } catch {}
  }, [page, slug, chapter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        go(page + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(page - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(total);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, page, total]);

  const current = DEMO_PAGES[page - 1];

  return (
    <div
      className="a3-reader"
      data-a3-native-keys
      data-a3-reader
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (Math.abs(dx) > 48) go(page + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div className="a3-reader__bar">
        <button className="a3-iconbtn" type="button" onClick={() => router.push(`/preview/aninova-3/comics/${slug}`)} aria-label="Закрыть читалку">
          <IconChevronLeft size={18} />
        </button>
        <div className="a3-reader__meta">
          <h1 className="a3-reader__title">{comicTitle}</h1>
          <span className="a3-muted">
            Глава {chapter} · {total} страницы · демо
          </span>
        </div>
        <span className="a3-reader__count" aria-live="polite">
          {page} / {total}
        </span>
      </div>

      <div className="a3-reader__progress" aria-hidden>
        <span style={{ width: `${(page / total) * 100}%` }} />
      </div>

      <div className="a3-reader__stage">
        <button className="a3-reader__zone a3-reader__zone--prev" type="button" onClick={() => go(page - 1)} aria-label="Предыдущая страница" disabled={page === 1} />
        <figure className="a3-page" aria-label={`${current.label}. ${current.caption}`}>
          <Image
            key={current.image}
            className="a3-page__img"
            src={current.image}
            alt={`${current.label}: демонстрационная страница комикса`}
            width={720}
            height={1080}
            sizes="(max-width: 900px) 92vw, 720px"
            priority={page === 1}
          />
          <figcaption className="a3-page__caption">
            {current.label} · {current.caption}
          </figcaption>
        </figure>
        <button className="a3-reader__zone a3-reader__zone--next" type="button" onClick={() => go(page + 1)} aria-label="Следующая страница" disabled={page === total} />
      </div>

      <div className="a3-reader__foot">
        <button className="a3-btn a3-btn--ghost" type="button" onClick={() => go(page - 1)} disabled={page === 1}>
          <IconChevronLeft size={16} /> Назад
        </button>
        <p className="a3-muted">← → · свайп · демонстрационные страницы</p>
        {page < total ? (
          <button className="a3-btn a3-btn--primary" type="button" onClick={() => go(page + 1)}>
            Дальше <IconChevronRight size={16} />
          </button>
        ) : (
          <Link className="a3-btn a3-btn--primary" href={`/preview/aninova-3/comics/${slug}`}>
            К главам
          </Link>
        )}
      </div>
    </div>
  );
}
