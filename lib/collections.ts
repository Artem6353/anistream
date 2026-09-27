import type { Title } from './types';

/** 6 готовых подборок (ТЗ 18.5): предикаты по каталогу, детерминированные. */
export interface Collection {
  slug: string;
  title: string;
  desc: string;
  pick: (t: Title) => boolean;
}

export const COLLECTIONS: Collection[] = [
  { slug: 'novichku', title: 'Что посмотреть новичку', desc: 'Признанная классика с высоким рейтингом — вход в аниме без боли.', pick: (t) => t.score >= 8.2 && t.favourites >= 20000 && t.status === 'finished' && t.episodes <= 51 },
  { slug: 'korotko-i-moshchno', title: 'Коротко и мощно', desc: 'Фильмы и мини-сериалы: одна вечность не потребуется.', pick: (t) => (t.type === 'movie' || t.episodes <= 13) && t.score >= 7.8 && t.favourites >= 3000 },
  { slug: 'poplakat', title: 'Поплакать', desc: 'Драмы, после которых хочется обнять кого-то близкого.', pick: (t) => (t.genres.includes('drama') || t.genres.includes('romance')) && t.score >= 8.0 && t.favourites >= 5000 },
  { slug: 'lyogkoe-na-vecher', title: 'Лёгкое на вечер', desc: 'Комедии и повседневность без тяжёлых сюжетов.', pick: (t) => (t.genres.includes('comedy') || t.genres.includes('slice-of-life')) && t.score >= 7.5 && t.episodes <= 24 },
  { slug: 'dlya-fanatov-fentezi', title: 'Для фанатов фэнтези', desc: 'Магия, миры и приключения — лучшие из лучших.', pick: (t) => t.genres.includes('fantasy') && t.score >= 7.8 && t.favourites >= 5000 },
  { slug: 'sovremennaya-klassika', title: 'Современная классика', desc: 'Тайтлы 2010+ с огромной армией фанатов.', pick: (t) => t.year >= 2010 && t.favourites >= 30000 && t.score >= 8.3 },
];

export function collectionTitles(slug: string, titles: Title[]): { collection: Collection; items: Title[] } | null {
  const collection = COLLECTIONS.find((c) => c.slug === slug);
  if (!collection) return null;
  return { collection, items: titles.filter(collection.pick).sort((a, b) => b.favourites - a.favourites).slice(0, 24) };
}
