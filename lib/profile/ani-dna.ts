/**
 * AniDNA — «геном» анимешника (креативная фича профиля).
 *
 * Идея: по истории просмотров и спискам собрать узнаваемый портрет зрителя —
 * архетип, любимые жанры, часы, серию активности — и отдать это одной карточкой,
 * которую можно скачать картинкой и похвастаться.
 *
 * Почему отдельный чистый модуль: те же расчёты нужны и на сервере (страница),
 * и в браузере (canvas-карточка). Никаких зависимостей и Date.now() внутри —
 * всё, что зависит от времени, приходит аргументом, поэтому результат
 * детерминирован и проверяется unit-тестами.
 */

export interface DnaHistoryEntry {
  slug: string;
  episode: number;
  /** Секунды просмотренного в серии. */
  position: number;
  /** Полная длительность серии в секундах (0/undefined, если неизвестна). */
  duration: number;
  /** Момент последней активности, мс. */
  updatedAt: number;
}

export interface DnaTitleMeta {
  slug: string;
  name: string;
  genres: string[];
  episodes: number;
}

export interface DnaListEntry {
  slug: string;
  /** watching | completed | planned | dropped | on_hold | rewatching */
  status: string;
}

export interface AniDnaInput {
  history: DnaHistoryEntry[];
  lists?: DnaListEntry[];
  titles: Map<string, DnaTitleMeta>;
  /** Дата регистрации (мс) — влияет на «темп» зрителя. */
  createdAt?: number | null;
  /** «Сейчас», мс. Передаётся явно, чтобы расчёты были воспроизводимы. */
  now: number;
  /** Часовой пояс пользователя в минутах от UTC (для «ночных сессий»). */
  tzOffsetMinutes?: number;
}

export interface GenreSlice {
  name: string;
  count: number;
  share: number;
}

export interface Archetype {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  /** Два цвета для градиента карточки. */
  colors: [string, string];
}

export interface AniDna {
  episodes: number;
  hours: number;
  titles: number;
  completedTitles: number;
  completionRate: number;
  topGenres: GenreSlice[];
  archetype: Archetype;
  /** Дней подряд с активностью, заканчивая сегодня/вчера. */
  streakDays: number;
  /** Среднее число серий за активный день. */
  pace: number;
  /** «Ночной» или «дневной» зритель — по локальному времени просмотров. */
  chronotype: 'night' | 'day' | 'mixed';
  /** Короткий код-подпись, например `AP-7K3` — как «серийник» профиля. */
  code: string;
  /** true, когда данных слишком мало для осмысленного портрета. */
  isColdStart: boolean;
}

/** Жанры → архетипы. Порядок важен: первое совпадение выигрывает. */
const ARCHETYPES: Array<{
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  colors: [string, string];
  genres: string[];
}> = [
  {
    id: 'shonen-marathon',
    title: 'Сёнен-марафонец',
    tagline: 'Опенинг не пропускает, «ещё одну серию» говорит в 3 утра',
    emoji: '⚡',
    colors: ['#f97316', '#ef4444'],
    genres: ['экшен', 'сёнен', 'приключения', 'боевые искусства', 'супер сила'],
  },
  {
    id: 'isekai-explorer',
    title: 'Исекай-исследователь',
    tagline: 'Попаданец в другом мире — попаданец и в жизни',
    emoji: '🌀',
    colors: ['#8b5cf6', '#22d3ee'],
    genres: ['фэнтези', 'исэкай', 'исекай', 'магия', 'приключения'],
  },
  {
    id: 'romance-slice',
    title: 'Романтик слайсов',
    tagline: 'Пришёл за сюжетом, остался за чаем и разговорами на кухне',
    emoji: '🌸',
    colors: ['#f472b6', '#a78bfa'],
    genres: ['романтика', 'повседневность', 'сёдзё', 'музыка', 'драма'],
  },
  {
    id: 'mystery-night',
    title: 'Детектив ночных сессий',
    tagline: 'Смотрит по одной серии и всё равно не спит до утра',
    emoji: '🕵️',
    colors: ['#0ea5e9', '#6366f1'],
    genres: ['детектив', 'триллер', 'мистика', 'психологическое', 'напряжение'],
  },
  {
    id: 'comedy-relax',
    title: 'Комедийный релакс',
    tagline: 'Плейлист из опенингов и мемов вместо новостей',
    emoji: '😂',
    colors: ['#fbbf24', '#f97316'],
    genres: ['комедия', 'пародия', 'гарем', 'школа'],
  },
  {
    id: 'mecha-engineer',
    title: 'Меха-инженер',
    tagline: 'Знает, где у робота сервопривод, и зачем нужен третий акт',
    emoji: '🤖',
    colors: ['#22d3ee', '#0ea5e9'],
    genres: ['меха', 'фантастика', 'космос', 'военное'],
  },
  {
    id: 'dark-sommelier',
    title: 'Тёмный сомелье',
    tagline: 'Чем мрачнее тег, тем интереснее вечер',
    emoji: '🩸',
    colors: ['#ef4444', '#7c3aed'],
    genres: ['ужасы', 'триллер', 'жестокость', 'психологическое', 'сэйнэн'],
  },
  {
    id: 'season-scout',
    title: 'Сезонный скаут',
    tagline: 'Пробует всё новое в первый день сезона',
    emoji: '🧭',
    colors: ['#10b981', '#22d3ee'],
    genres: [],
  },
];

const DEFAULT_ARCHETYPE = ARCHETYPES[ARCHETYPES.length - 1];

export function pickArchetype(topGenres: GenreSlice[]): Archetype {
  const byName = new Map(topGenres.map((g) => [g.name.toLowerCase(), g.count]));
  let best = { score: -1, archetype: DEFAULT_ARCHETYPE };
  for (const candidate of ARCHETYPES) {
    let score = 0;
    for (const genre of candidate.genres) score += byName.get(genre) ?? 0;
    if (score > best.score) best = { score, archetype: candidate };
  }
  const { id, title, tagline, emoji, colors } = best.score > 0 ? best.archetype : DEFAULT_ARCHETYPE;
  return { id, title, tagline, emoji, colors };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Стрик: количество подряд идущих дней с просмотром, включая сегодня или вчера. */
export function computeStreak(entries: DnaHistoryEntry[], now: number, tzOffsetMinutes = 0): number {
  if (!entries.length) return 0;
  const dayOf = (ms: number) => {
    const shifted = ms + tzOffsetMinutes * 60_000;
    return Math.floor(shifted / 86_400_000);
  };
  const days = new Set(entries.map((e) => dayOf(e.updatedAt)));
  const today = dayOf(now);
  // Стрик «жив», если смотрели сегодня или вчера — иначе он уже прервался.
  let cursor = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
  if (cursor === null) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/** Ночной/дневной зритель по локальному часу последней активности каждой серии. */
export function computeChronotype(entries: DnaHistoryEntry[], tzOffsetMinutes = 0): 'night' | 'day' | 'mixed' {
  let night = 0;
  let day = 0;
  for (const entry of entries) {
    const localHour = new Date(entry.updatedAt + tzOffsetMinutes * 60_000).getUTCHours();
    if (localHour >= 22 || localHour < 5) night += 1;
    else if (localHour >= 9 && localHour < 18) day += 1;
  }
  if (night === day) return 'mixed';
  return night > day ? 'night' : 'day';
}

/** Короткий код профиля: архетип + объём + число жанров (детерминированный). */
export function dnaCode(archetypeId: string, episodes: number, genres: number): string {
  const prefix = archetypeId
    .split('-')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
  const bucket = episodes >= 500 ? '5' : episodes >= 200 ? '3' : episodes >= 50 ? '1' : '0';
  const tail = String((episodes * 7 + genres * 13) % 1000).padStart(3, '0');
  return `${prefix || 'AN'}-${bucket}${tail}`;
}

export function computeAniDna(input: AniDnaInput): AniDna {
  const { history, lists = [], titles, now, tzOffsetMinutes = 0 } = input;

  const genreCount = new Map<string, number>();
  const touched = new Set<string>();
  let episodes = 0;
  let seconds = 0;

  for (const entry of history) {
    episodes += 1;
    touched.add(entry.slug);
    // Неизвестная длительность: считаем 24 минуты — медиана ТВ-серии.
    seconds += entry.duration > 0 ? Math.min(entry.position, entry.duration) : Math.min(entry.position, 24 * 60);
    const meta = titles.get(entry.slug);
    if (meta) for (const genre of meta.genres) genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
  }

  const totalGenreHits = [...genreCount.values()].reduce((sum, n) => sum + n, 0);
  /* Тай-брейк — по первому появлению, а не алфавиту: так «любимый жанр»
     совпадает с порядком, в котором он встретился в истории (предсказуемо для UX). */
  const appearance = new Map([...genreCount.keys()].map((name, index) => [name, index]));
  const topGenres: GenreSlice[] = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1] || (appearance.get(a[0]) ?? 0) - (appearance.get(b[0]) ?? 0))
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, share: totalGenreHits ? round1((count / totalGenreHits) * 100) : 0 }));

  const completedTitles = lists.filter((l) => l.status === 'completed').length;
  const watchingTitles = lists.filter((l) => l.status === 'watching').length;
  const trackedTitles = lists.length || touched.size;
  const completionRate = trackedTitles ? Math.round((completedTitles / trackedTitles) * 100) : 0;

  const streakDays = computeStreak(history, now, tzOffsetMinutes);
  const activeDays = new Set(history.map((e) => Math.floor((e.updatedAt + tzOffsetMinutes * 60_000) / 86_400_000))).size;
  const pace = activeDays ? round1(episodes / activeDays) : 0;
  const hours = round1(seconds / 3600);

  return {
    episodes,
    hours,
    titles: touched.size,
    completedTitles: completedTitles || 0,
    completionRate,
    topGenres,
    archetype: pickArchetype(topGenres),
    streakDays,
    pace,
    chronotype: computeChronotype(history, tzOffsetMinutes),
    code: dnaCode(pickArchetype(topGenres).id, episodes, topGenres.length),
    isColdStart: episodes < 3 && watchingTitles === 0,
  };
}

/** Подписи для UI (архетип → цвет, хронотип → текст). */
export const CHRONOTYPE_LABEL: Record<AniDna['chronotype'], string> = {
  night: 'Ночные сессии',
  day: 'Дневные просмотры',
  mixed: 'В любое время',
};

export const STATUS_LABEL: Record<string, string> = {
  watching: 'Смотрю',
  completed: 'Просмотрено',
  planned: 'В планах',
  dropped: 'Брошено',
  on_hold: 'Отложено',
  rewatching: 'Пересматриваю',
};
