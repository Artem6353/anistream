import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadTitles } from '@/lib/catalog';
import { computeAniDna, type AniDna, type DnaListEntry, type DnaTitleMeta } from './ani-dna';

/**
 * Серверная загрузка данных кабинета.
 *
 * Все запросы идут cookie-сессией пользователя: RLS (`auth.uid() = user_id`)
 * гарантирует, что чужие строки не вернутся, даже если подменить аргументы.
 * Ошибка сети/БД не роняет страницу — блок показывается пустым с подсказкой.
 */

export interface ProfileRow {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  updated_at: string | null;
}

export interface ListRow {
  slug: string;
  status: string;
  updated_at: string | null;
}

export interface HistoryRow {
  slug: string;
  episode: number;
  position: number | null;
  duration: number | null;
  updated_at: string | null;
}

export interface TitleCard {
  slug: string;
  name: string;
  poster: string | null;
  episodes: number;
  genres: string[];
}

export interface ProfileBundle {
  profile: ProfileRow | null;
  lists: ListRow[];
  history: HistoryRow[];
  titles: Map<string, TitleCard>;
  dna: AniDna;
  error: string | null;
}

/** Метаданные тайтлов из каталога (файл/БД) — по слагам из истории и списков. */
function titleIndex(slugs: Iterable<string>): Map<string, TitleCard> {
  const wanted = new Set(slugs);
  const out = new Map<string, TitleCard>();
  if (!wanted.size) return out;
  for (const title of loadTitles(true)) {
    if (!wanted.has(title.slug)) continue;
    out.set(title.slug, {
      slug: title.slug,
      name: title.ru || title.en || title.slug,
      poster: title.poster ?? null,
      episodes: title.episodes ?? 0,
      genres: Array.isArray(title.genres) ? title.genres : [],
    });
  }
  return out;
}

/** Данные кабинета для текущего пользователя. Кэшируется в пределах одного запроса. */
export const loadProfileBundle = cache(async (userId: string): Promise<ProfileBundle> => {
  const emptyDna = computeAniDna({ history: [], titles: new Map(), now: Date.now() });
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { profile: null, lists: [], history: [], titles: new Map(), dna: emptyDna, error: 'Supabase не настроен' };
  }

  let error: string | null = null;
  const [profileRes, listsRes, historyRes] = await Promise.all([
    supabase.from('profiles').select('user_id, username, avatar_url, banner_url, bio, updated_at').eq('user_id', userId).maybeSingle(),
    supabase.from('profile_lists').select('slug, status, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(500),
    supabase
      .from('profile_history')
      .select('slug, episode, position, duration, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(300),
  ]);

  if (profileRes.error) error = profileRes.error.message;
  if (listsRes.error) error = listsRes.error.message;
  if (historyRes.error) error = historyRes.error.message;

  const lists = (listsRes.data ?? []) as ListRow[];
  const history = (historyRes.data ?? []) as HistoryRow[];
  const titles = titleIndex([...history.map((h) => h.slug), ...lists.map((l) => l.slug)]);

  const dna = computeAniDna({
    history: history.map((h) => ({
      slug: h.slug,
      episode: h.episode,
      position: Number(h.position ?? 0),
      duration: Number(h.duration ?? 0),
      updatedAt: h.updated_at ? Date.parse(h.updated_at) : 0,
    })),
    lists: lists as DnaListEntry[],
    titles: new Map<string, DnaTitleMeta>(
      [...titles.entries()].map(([slug, card]) => [
        slug,
        { slug, name: card.name, genres: card.genres, episodes: card.episodes },
      ]),
    ),
    now: Date.now(),
  });

  return {
    profile: (profileRes.data as ProfileRow | null) ?? null,
    lists,
    history,
    titles,
    dna,
    error,
  };
});
