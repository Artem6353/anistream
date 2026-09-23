'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDebouncedValue } from '@/lib/hooks';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconCalendar, IconGrid, IconSearch, IconSparkles } from '@/components/ui/icons';

interface Item {
  id: string;
  label: string;
  hint?: string;
  href: string;
  poster?: string;
  seed?: string;
  group: string;
}

const ACTIONS: Item[] = [
  { id: 'a1', label: 'Открыть каталог', href: '/catalog', group: 'Действия', hint: 'Все тайтлы и фильтры' },
  { id: 'a2', label: 'Расписание выхода серий', href: '/schedule', group: 'Действия', hint: 'Неделя эфиров' },
  { id: 'a3', label: 'Мои закладки', href: '/profile/bookmarks', group: 'Действия' },
  { id: 'a4', label: 'История просмотров', href: '/profile/history', group: 'Действия' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounced = useDebouncedValue(q, 150);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const [remote, setRemote] = useState<Item[]>([]);
  useEffect(() => {
    if (!debounced) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/search?q=${encodeURIComponent(debounced)}&limit=7`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        setRemote(
          (j?.items ?? []).map((t: { slug: string; ru: string; year: number; score: number; poster: string }) => ({
            id: t.slug,
            label: t.ru,
            hint: `${t.year} · ${t.score.toFixed(1)}`,
            href: `/anime/${t.slug}`,
            poster: t.poster,
            seed: t.slug,
            group: 'Тайтлы',
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const items = useMemo<Item[]>(() => {
    const actions = debounced ? ACTIONS.filter((a) => a.label.toLowerCase().includes(debounced.toLowerCase())) : ACTIONS.slice(0, 3);
    return [...remote, ...actions];
  }, [remote, debounced]);

  useEffect(() => setCursor(0), [items.length]);

  if (!open) return null;

  const go = (item: Item) => {
    onClose();
    router.push(item.href);
  };

  return (
    <div
      className="palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Командная палитра поиска"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette">
        <div className="palette__head">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Тайтл, жанр или действие…"
            aria-label="Поисковый запрос"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(items.length - 1, c + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              }
              if (e.key === 'Enter' && items[cursor]) go(items[cursor]);
            }}
          />
          <kbd className="palette__esc">Esc</kbd>
        </div>
        <div className="palette__list" role="listbox">
          {items.length === 0 ? (
            <p className="palette__empty">
              <IconSparkles size={16} />
              Ничего не нашлось. Попробуйте «Фрирен» или «экшен».
            </p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                role="option"
                aria-selected={i === cursor}
                className={`palette__item ${i === cursor ? 'is-active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item)}
              >
                {item.poster && item.seed ? (
                  <span className="palette__poster">
                    <PosterArt src={item.poster} seed={item.seed} initials={item.label} alt="" />
                  </span>
                ) : (
                  <span className="palette__icon">
                    {item.group === 'Жанры' ? <IconGrid size={15} /> : <IconCalendar size={15} />}
                  </span>
                )}
                <span className="palette__label">{item.label}</span>
                <span className="palette__hint">{item.hint ?? item.group}</span>
              </button>
            ))
          )}
        </div>
        <div className="palette__foot">
          <span>↑↓ навигация</span>
          <span>Enter — открыть</span>
          <Link href="/search" onClick={onClose}>
            Расширенный поиск
          </Link>
        </div>
      </div>
    </div>
  );
}
