'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconSearch, IconX } from '@/components/ui/icons';
import { useFocusTrap } from './remote/focus';

const SEARCH_PATH = '/preview/aninova-3/search';

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
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Hit[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  /** Сброс в обработчике закрытия, а не в effect: открытие всегда чистое,
   *  без каскадного setState на монтировании. */
  const close = useCallback(() => {
    setQ('');
    setItems([]);
    setStatus('idle');
    onClose();
  }, [onClose]);

  useFocusTrap(panelRef, open, 'input[type="search"]');

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const value = q.trim();
    if (value.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setStatus('loading');
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}&limit=8&preview=1`, { signal: controller.signal });
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
  const submit = () => {
    const value = q.trim();
    if (value.length < 2) return;
    close();
    router.push(`${SEARCH_PATH}?q=${encodeURIComponent(value)}`);
  };

  return (
    <div
      className="a3-overlay a3-search"
      id="a3-search-dialog"
      data-a3-overlay="true"
      role="dialog"
      aria-modal="true"
      aria-label="Поиск по каталогу"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="a3-search__panel"
        ref={panelRef}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          const hits = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('.a3-search__hit') ?? []);
          if (!hits.length) return;
          const current = document.activeElement as HTMLElement | null;
          const index = hits.indexOf(current as HTMLElement);
          e.preventDefault();
          if (e.key === 'ArrowDown') hits[Math.min(hits.length - 1, index + 1)]?.focus();
          else if (index <= 0) inputRef.current?.focus();
          else hits[index - 1]?.focus();
        }}
      >
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
            onChange={(e) => {
              const value = e.target.value;
              setQ(value);
              if (value.trim().length < 2) {
                setItems([]);
                setStatus('idle');
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            autoComplete="off"
          />
          <button className="a3-iconbtn" type="button" onClick={close} aria-label="Закрыть поиск">
            <IconX size={18} />
          </button>
        </div>

        <div className="a3-search__body" id={resultsId} aria-live="polite" aria-busy={status === 'loading'}>
          {status === 'idle' ? <p className="a3-muted">Введите минимум 2 символа. Поиск идёт по реальному каталогу.</p> : null}
          {status === 'loading' ? <p className="a3-muted">Ищем…</p> : null}
          {status === 'error' ? (
            <div className="a3-empty a3-empty--inline" role="alert">
              <p className="a3-empty__title">Поиск недоступен</p>
              <p className="a3-muted">Проверьте соединение и попробуйте ещё раз.</p>
            </div>
          ) : null}
          {status === 'ready' && !items.length ? (
            <div className="a3-empty a3-empty--inline">
              <p className="a3-empty__title">Ничего не найдено</p>
              <p className="a3-muted">Попробуйте другое название или проверьте раскладку.</p>
            </div>
          ) : null}
          {items.length ? (
            <ul className="a3-search__list">
              {items.map((hit) => (
                <li key={hit.slug}>
                  <Link
                    className="a3-search__hit"
                    href={`/preview/aninova-3/anime/${hit.slug}`}
                    onClick={close}
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
          {status === 'ready' && q.trim().length >= 2 ? (
            <button className="a3-btn a3-btn--ghost a3-search__all" type="button" onClick={submit}>
              Все результаты по запросу «{q.trim()}» →
            </button>
          ) : null}
        </div>

        <p className="a3-search__hint" id="a3-search-hint">
          Enter — все результаты · Esc — закрыть · Стрелки — по подсказкам
        </p>
      </div>
    </div>
  );
}
