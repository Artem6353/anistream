'use client';

import { useSyncExternalStore } from 'react';
import type { HistoryEntry, ListStatus, Settings } from './types';

/**
 * Локальная «библиотека» пользователя: закладки, история просмотров, настройки.
 * Хранится в localStorage, синхронизируется между вкладками и компонентами
 * через useSyncExternalStore — без Redux и серверных зависимостей.
 */

const K_BOOKMARKS = 'anistream:bookmarks';
const K_HISTORY = 'anistream:history';
const K_SETTINGS = 'anistream:settings';
const K_LISTS = 'anistream:lists';

export const DEFAULT_SETTINGS: Settings = {
  autoplayNext: true,
  accent: 'violet',
  customAccent: null,
  theme: 'system',
  reduceMotion: false,
  tvMode: false,
  defaultProvider: 'demo',
};

interface LibraryState {
  bookmarks: string[];
  history: HistoryEntry[];
  settings: Settings;
  lists: Record<string, ListStatus>;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим и т.п. */
  }
}

let state: LibraryState = { bookmarks: [], history: [], settings: DEFAULT_SETTINGS, lists: {} };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  state = {
    bookmarks: read<string[]>(K_BOOKMARKS, []),
    history: read<HistoryEntry[]>(K_HISTORY, []),
    settings: { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K_SETTINGS, {}) },
    lists: read<Record<string, ListStatus>>(K_LISTS, {}),
  };
  loaded = true;
}

function commit(next: Partial<LibraryState>) {
  state = { ...state, ...next };
  if (typeof window !== 'undefined') {
    if (next.bookmarks) write(K_BOOKMARKS, next.bookmarks);
    if (next.history) write(K_HISTORY, next.history);
    if (next.settings) write(K_SETTINGS, next.settings);
    if (next.lists) write(K_LISTS, next.lists);
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useLibrary(): LibraryState {
  useSyncExternalStore(subscribe, () => state, () => state);
  return state;
}

export const library = {
  get state() {
    load();
    return state;
  },
  toggleBookmark(slug: string): boolean {
    load();
    const has = state.bookmarks.includes(slug);
    commit({ bookmarks: has ? state.bookmarks.filter((s) => s !== slug) : [slug, ...state.bookmarks] });
    return !has;
  },
  removeBookmark(slug: string) {
    load();
    commit({ bookmarks: state.bookmarks.filter((s) => s !== slug) });
  },
  saveProgress(entry: HistoryEntry) {
    load();
    const rest = state.history.filter((h) => !(h.slug === entry.slug && h.episode === entry.episode));
    commit({ history: [entry, ...rest].slice(0, 60) });
  },
  removeHistory(slug: string, episode?: number) {
    load();
    commit({
      history: state.history.filter((h) => h.slug !== slug || (episode !== undefined && h.episode !== episode)),
    });
  },
  clearHistory() {
    commit({ history: [] });
  },
  /** Мерж истории из облака (побеждает свежий updatedAt), newest-first, лимит 60. */
  mergeHistory(remote: HistoryEntry[]) {
    load();
    const map = new Map<string, HistoryEntry>();
    for (const h of state.history) map.set(`${h.slug}:${h.episode}`, h);
    for (const r of remote) {
      const k = `${r.slug}:${r.episode}`;
      const cur = map.get(k);
      if (!cur || (r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) map.set(k, r);
    }
    commit({ history: [...map.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 60) });
  },
  clearAll() {
    commit({ bookmarks: [], history: [] });
  },
  setListStatus(slug: string, status: ListStatus | null) {
    load();
    const lists = { ...state.lists };
    if (status) lists[slug] = status;
    else delete lists[slug];
    commit({ lists });
  },
  setSettings(patch: Partial<Settings>) {
    load();
    commit({ settings: { ...state.settings, ...patch } });
  },
};

/** Позиция продолжения для тайтла (последняя просмотренная серия). */
export function continueEntry(history: HistoryEntry[], slug: string): HistoryEntry | undefined {
  return history.find((h) => h.slug === slug);
}
