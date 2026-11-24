'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconSearch, IconX } from '@/components/ui/icons';
import { useFocusTrap } from './remote/focus';

interface Hit {
  slug: string;
  ru: string;
  year: number;
  score: number;
  poster: string;
}

/** Поиск по реальному каталогу: /api/search, без загрузки всего каталога в браузер. */
export function A3Search({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Hit[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useFocusTrap(panelRef, open, 'input[type="search"]');

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const value = q.trim();
    if (value.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс результатов при очистке поля
      setItems([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setStatus('loading');
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}&limit=8`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: Hit[] };
        setItems(data.items ?? []);
        setStatus('ready');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error');
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, open]);

  if (!open) return null;

  const resultsId = 'a3-search-results';

  return (
    <div
      className="a3-overlay a3-search"
      data-a3-overlay="true"
      role="dialog"
      aria-modal="true"
      aria-label="Поиск по каталогу"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="a3-search__panel" ref={panelRef}>
        <div className="a3-search__row">
          <IconSearch size={20} />
          <input
            ref={inputRef}
            className="a3-search__input"
            type="search"
            inputMode="search"
            placeholder="Название, жанр, год…"
            aria-label="Поисковый запрос"
            aria-controls={resultsId}
            aria-describedby="a3-search-hint"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                const first = panelRef.current?.querySelector<HTMLElement>('.a3-search__hit');
                if (first) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
            autoComplete="off"
          />
          <button className="a3-iconbtn" type="button" onClick={onClose} aria-label="Закрыть поиск">
            <IconX size={18} />
          </button>
        </div>

        <div className="a3-search__body" id={resultsId} aria-live="polite">
          {status === 'idle' ? <p className="a3-muted">Введите минимум 2 символа. Поиск идёт по реальному каталогу.</p> : null}
          {status === 'loading' ? <p className="a3-muted">Ищем…</p> : null}
          {status === 'error' ? (
            <p className="a3-error" role="alert">
              Поиск недоступен. Проверьте соединение и попробуйте ещё раз.
            </p>
          ) : null}
          {status === 'ready' && !items.length ? <p className="a3-muted">Ничего не найдено. Попробуйте другое название.</p> : null}
          {items.length ? (
            <ul className="a3-search__list">
              {items.map((hit) => (
                <li key={hit.slug}>
                  <Link
                    className="a3-search__hit"
                    href={`/preview/aninova-3/anime/${hit.slug}`}
                    onClick={onClose}
                    data-a3-focusable
                  >
                    <span className="a3-search__thumb">
                      <PosterArt src={hit.poster} seed={hit.slug} initials={hit.ru || '?'} alt="" width={44} />
                    </span>
                    <span className="a3-search__meta">
                      <span className="a3-search__title">{hit.ru}</span>
                      <span className="a3-muted">
                        {hit.year}
                        {hit.score > 0 ? ` · ★ ${hit.score.toFixed(1)}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="a3-search__hint" id="a3-search-hint">
          Enter — открыть · Esc — закрыть · Стрелки — по результатам
        </p>
      </div>
    </div>
  );
}
