/* Демонстрационные данные прототипа B1-A.
   ВАЖНО: это mock. Никаких запросов к Supabase/провайдерам, никаких реальных
   метаданных AniList. Названия тайтлов узнаваемы, но цифры, эпизоды, даты и
   «прогресс» придуманы исключительно для проверки макета. */

export type AnimeStatus = 'Онгоинг' | 'Завершён' | 'Анонс';

export type Anime = {
  slug: string;
  title: string;
  original: string;
  year: number;
  kind: 'ТВ-сериал' | 'Фильм' | 'ONA';
  episodes: number;
  status: AnimeStatus;
  rating: number;
  studio: string;
  genres: string[];
  age: string;
  synopsis: string;
  poster: string;
  backdrop: string;
  progress?: { episode: number; percent: number };
  voice: string;
};

const poster = (i: number) => `/design/posters/${String(i).padStart(2, '0')}.jpg`;
const backdrop = (i: number) => `/design/backdrops/${String(((i - 1) % 4) + 1).padStart(2, '0')}.jpg`;

export const anime: Anime[] = [
  {
    slug: 'magicheskaya-bitva',
    title: 'Магическая битва',
    original: 'Jujutsu Kaisen',
    year: 2020,
    kind: 'ТВ-сериал',
    episodes: 47,
    status: 'Онгоинг',
    rating: 8.7,
    studio: 'MAPPA',
    genres: ['Сёнэн', 'Мистика', 'Экшен'],
    age: '16+',
    synopsis:
      'Юдзи Итадори попадает в мир проклятой энергии и поступает в магический техникум. Дальше — не столько битвы, сколько попытка остаться человеком среди тех, кому это уже не обязательно.',
    poster: poster(1),
    backdrop: backdrop(1),
    progress: { episode: 9, percent: 64 },
    voice: 'AniNova Voice',
  },
  {
    slug: 'ataka-titanov',
    title: 'Атака титанов',
    original: 'Shingeki no Kyojin',
    year: 2013,
    kind: 'ТВ-сериал',
    episodes: 89,
    status: 'Завершён',
    rating: 9.1,
    studio: 'WIT / MAPPA',
    genres: ['Сёнэн', 'Драма', 'Фэнтези'],
    age: '18+',
    synopsis:
      'Человечество живёт за стенами, а за стенами — титаны. История начинается как борьба за выживание и заканчивается вопросом о том, кому вообще принадлежит свобода.',
    poster: poster(2),
    backdrop: backdrop(2),
    progress: { episode: 61, percent: 22 },
    voice: 'AniNova Voice',
  },
  {
    slug: 'frieren',
    title: 'Провожающая в последний путь Фрирен',
    original: 'Sousou no Frieren',
    year: 2023,
    kind: 'ТВ-сериал',
    episodes: 28,
    status: 'Завершён',
    rating: 9.2,
    studio: 'Madhouse',
    genres: ['Фэнтези', 'Драма', 'Приключения'],
    age: '12+',
    synopsis:
      'Эльфийка-маг переживает своих спутников на десятилетия и только после их смерти начинает понимать, что именно она потеряла. Медленная история о времени и памяти.',
    poster: poster(3),
    backdrop: backdrop(3),
    voice: 'AniNova Voice',
  },
  {
    slug: 'chelovek-benzopila',
    title: 'Человек-бензопила',
    original: 'Chainsaw Man',
    year: 2022,
    kind: 'ТВ-сериал',
    episodes: 12,
    status: 'Онгоинг',
    rating: 8.6,
    studio: 'MAPPA',
    genres: ['Сёнэн', 'Триллер', 'Мистика'],
    age: '18+',
    synopsis:
      'Дэндзи мечтает о нормальной жизни, а работает охотником на демонов с бензопилой вместо головы. Грубо, смешно и внезапно очень грустно.',
    poster: poster(4),
    backdrop: backdrop(4),
    progress: { episode: 12, percent: 100 },
    voice: 'AniNova Voice',
  },
  {
    slug: 'kiberpank-begushchie-po-krayu',
    title: 'Киберпанк: Бегущие по краю',
    original: 'Cyberpunk: Edgerunners',
    year: 2022,
    kind: 'ONA',
    episodes: 10,
    status: 'Завершён',
    rating: 8.9,
    studio: 'Trigger',
    genres: ['Sci-Fi', 'Драма', 'Экшен'],
    age: '18+',
    synopsis:
      'Найт-Сити не предлагает выбора: либо ты часть города, либо расходник. Дэвид выбирает третий вариант и платит за него по полной.',
    poster: poster(5),
    backdrop: backdrop(1),
    voice: 'AniNova Voice',
  },
  {
    slug: 'vanpanchmen',
    title: 'Ванпанчмен',
    original: 'One Punch Man',
    year: 2015,
    kind: 'ТВ-сериал',
    episodes: 24,
    status: 'Завершён',
    rating: 8.4,
    studio: 'Madhouse',
    genres: ['Сёнэн', 'Комедия', 'Экшен'],
    age: '16+',
    synopsis:
      'Сайтама побеждает любого противника одним ударом — и это его главная проблема. Комедия о том, как скучно быть сильнейшим.',
    poster: poster(6),
    backdrop: backdrop(2),
    voice: 'AniNova Voice',
  },
  {
    slug: 'dorohodoro',
    title: 'Дорохедоро',
    original: 'Dorohedoro',
    year: 2020,
    kind: 'ТВ-сериал',
    episodes: 24,
    status: 'Онгоинг',
    rating: 8.5,
    studio: 'MAPPA',
    genres: ['Фэнтези', 'Триллер', 'Комедия'],
    age: '18+',
    synopsis:
      'Мир магов и мир людей соединены дверью, через которую ходят только проблемы. Кайман ищет лицо, которое у него отняли, и это только начало.',
    poster: poster(7),
    backdrop: backdrop(3),
    voice: 'AniNova Voice',
  },
  {
    slug: 'semya-shpiona',
    title: 'Семья шпиона',
    original: 'Spy x Family',
    year: 2022,
    kind: 'ТВ-сериал',
    episodes: 37,
    status: 'Онгоинг',
    rating: 8.5,
    studio: 'Wit × CloverWorks',
    genres: ['Комедия', 'Экшен', 'Повседневность'],
    age: '12+',
    synopsis:
      'Шпион, убийца и телепатка изображают идеальную семью. Получается не идеально, но каждый эпизод чуть теплее предыдущего.',
    poster: poster(8),
    backdrop: backdrop(4),
    progress: { episode: 4, percent: 31 },
    voice: 'AniNova Voice',
  },
  {
    slug: 'agenty-paranoyi',
    title: 'Агент паранойи',
    original: 'Mousou Dairinin',
    year: 2004,
    kind: 'ТВ-сериал',
    episodes: 13,
    status: 'Завершён',
    rating: 8.6,
    studio: 'Madhouse',
    genres: ['Триллер', 'Психологическое', 'Детектив'],
    age: '18+',
    synopsis:
      'Мальчик на роликах нападает на людей с битой. Каждый новый эпизод — новая версия одной и той же психики.',
    poster: poster(9),
    backdrop: backdrop(1),
    voice: 'AniNova Voice',
  },
  {
    slug: 'ozero',
    title: 'Озеро снов',
    original: 'Wonder Egg Priority',
    year: 2021,
    kind: 'ТВ-сериал',
    episodes: 12,
    status: 'Завершён',
    rating: 7.9,
    studio: 'CloverWorks',
    genres: ['Драма', 'Психологическое', 'Фэнтези'],
    age: '16+',
    synopsis:
      'Девочка покупает яйцо и спасает того, кого уже не спасти в реальности. Красивая и тревожная история о потере.',
    poster: poster(10),
    backdrop: backdrop(2),
    voice: 'AniNova Voice',
  },
  {
    slug: 'moya-gerojskaya-akademiya',
    title: 'Моя геройская академия',
    original: 'Boku no Hero Academia',
    year: 2016,
    kind: 'ТВ-сериал',
    episodes: 138,
    status: 'Онгоинг',
    rating: 8.3,
    studio: 'Bones',
    genres: ['Сёнэн', 'Экшен', 'Школа'],
    age: '12+',
    synopsis:
      'Суперспособности стали нормой, а самое ценное качество — всё ещё готовность идти вперёд без них.',
    poster: poster(11),
    backdrop: backdrop(3),
    voice: 'AniNova Voice',
  },
  {
    slug: 'tyohu',
    title: 'Тёху, скажи что-нибудь',
    original: 'Tōhu',
    year: 2026,
    kind: 'ТВ-сериал',
    episodes: 0,
    status: 'Анонс',
    rating: 0,
    studio: 'AniNova Originals',
    genres: ['Драма', 'Повседневность'],
    age: '12+',
    synopsis:
      'Оригинальный проект AniNova: пять разговоров, один город и очень много воздуха между словами.',
    poster: poster(12),
    backdrop: backdrop(4),
    voice: 'AniNova Voice',
  },
];

export const getAnime = (slug: string) => anime.find((a) => a.slug === slug) ?? anime[0];
export const featured = anime[0];

const episodeTitles = [
  'Вход и выход',
  'Первый провал',
  'Тишина в кадре',
  'Тот, кто рядом',
  'Обратный отсчёт',
  'Дождь не будет ждать',
  'Лишний свидетель',
  'Правило трёх секунд',
  'Не оглядывайся',
  'Всё ещё здесь',
  'Полый рассвет',
  'После титров',
];

export type Episode = {
  n: number;
  title: string;
  duration: string;
  date: string;
  watched?: boolean;
  progress?: number;
  quality: '1080p' | '720p';
};

export function episodesOf(slug: string): Episode[] {
  const title = getAnime(slug);
  const total = Math.min(title.episodes || 12, 12);
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    return {
      n,
      title: episodeTitles[i % episodeTitles.length],
      duration: `${22 + (i % 3)} мин`,
      date: `${String((n % 28) + 1).padStart(2, '0')}.09.2026`,
      watched: (title.progress?.episode ?? 0) > n,
      progress: title.progress?.episode === n ? title.progress.percent : undefined,
      quality: n % 4 === 0 ? '720p' : '1080p',
    };
  });
}

export const catalogFilters = {
  genres: ['Сёнэн', 'Драма', 'Фэнтези', 'Мистика', 'Sci-Fi', 'Комедия', 'Триллер', 'Приключения'],
  years: ['2026', '2025', '2023', '2020', '2015', '2004'],
  statuses: ['Онгоинг', 'Завершён', 'Анонс'] as AnimeStatus[],
};

export type Comic = {
  slug: string;
  title: string;
  author: string;
  artist: string;
  year: number;
  status: 'Выходит' | 'Завершён' | 'Анонс';
  genres: string[];
  chapters: number;
  rated: string;
  synopsis: string;
  cover: string;
  accentIndex: number;
  updated: string;
  progress?: { chapter: number; page: number; pages: number };
};

const comicCover = (i: number) => `/design/comics/${String(i).padStart(2, '0')}.jpg`;

export const comics: Comic[] = [
  {
    slug: 'steklyannyj-gorod',
    title: 'Стеклянный город',
    author: 'М. Ветрова',
    artist: 'И. Ким',
    year: 2025,
    status: 'Выходит',
    genres: ['Драма', 'Мистика'],
    chapters: 42,
    rated: '16+',
    synopsis:
      'Город выстроен из стекла, и каждый житель видит всех насквозь. Архитектор, который придумал прозрачность, теперь ищет комнату без окон.',
    cover: comicCover(1),
    accentIndex: 0,
    updated: 'вчера',
    progress: { chapter: 12, page: 7, pages: 24 },
  },
  {
    slug: 'nol-meridian',
    title: 'Ноль-меридиан',
    author: 'А. Северов',
    artist: 'А. Северов',
    year: 2026,
    status: 'Выходит',
    genres: ['Sci-Fi', 'Триллер'],
    chapters: 18,
    rated: '16+',
    synopsis:
      'Экипаж научной станции обнаруживает, что карта звёздного неба не совпадает с реальностью ровно на один градус. Дальше — хуже.',
    cover: comicCover(2),
    accentIndex: 1,
    updated: '2 дня назад',
  },
  {
    slug: 'pyl',
    title: 'Пыль',
    author: 'К. Орлова',
    artist: 'К. Орлова',
    year: 2024,
    status: 'Выходит',
    genres: ['Мистика', 'Психологическое'],
    chapters: 24,
    rated: '18+',
    synopsis:
      'В квартире на девятом этаже каждую ночь появляется слой пыли, повторяющий контуры людей. Хозяйка перестаёт вытирать полки.',
    cover: comicCover(3),
    accentIndex: 2,
    updated: 'сегодня',
    progress: { chapter: 3, page: 2, pages: 18 },
  },
  {
    slug: 'krasnyj-shum',
    title: 'Красный шум',
    author: 'В. Дуб',
    artist: 'Т. Лапин',
    year: 2026,
    status: 'Выходит',
    genres: ['Триллер', 'Драма'],
    chapters: 9,
    rated: '18+',
    synopsis:
      'Звукорежиссёр записывает город и слышит на плёнке то, чего не было. Продюсер говорит, что это артефакт. Плёнка говорит другое.',
    cover: comicCover(4),
    accentIndex: 3,
    updated: '4 дня назад',
  },
  {
    slug: 'severnyj-veter',
    title: 'Северный ветер',
    author: 'Е. Гром',
    artist: 'Е. Гром',
    year: 2023,
    status: 'Завершён',
    genres: ['Приключения', 'Драма'],
    chapters: 31,
    rated: '12+',
    synopsis:
      'Две сестры идут через зимний лес к радиостанции, которая перестала выходить в эфир три месяца назад.',
    cover: comicCover(5),
    accentIndex: 4,
    updated: 'завершён',
  },
  {
    slug: 'tihij-okean',
    title: 'Тихий океан',
    author: 'Л. Мару',
    artist: 'Л. Мару',
    year: 2025,
    status: 'Анонс',
    genres: ['Повседневность'],
    chapters: 12,
    rated: '12+',
    synopsis:
      'Восемь историй о людях, которые живут у воды и почти не разговаривают. Первая глава — 10 декабря.',
    cover: comicCover(6),
    accentIndex: 5,
    updated: 'анонс',
  },
];

export const getComic = (slug: string) => comics.find((c) => c.slug === slug) ?? comics[0];

const chapterTitles = [
  'Первый этаж',
  'Комната без окон',
  'Стёкла потеют',
  'Гость с седьмого',
  'Тише, чем шум',
  'Проекция',
  'Свой среди стен',
  'Ночь прозрачна',
  'Никто не смотрит',
  'Второй этаж',
  'Свет выключили',
  'Имена',
];

export type Chapter = { n: number; title: string; pages: number; date: string; new?: boolean };

export function chaptersOf(slug: string): Chapter[] {
  const comic = getComic(slug);
  const count = Math.min(comic.chapters, 12);
  return Array.from({ length: count }, (_, i) => {
    const n = count - i;
    return {
      n,
      title: chapterTitles[(n + 3) % chapterTitles.length],
      pages: 16 + ((n * 3) % 12),
      date: `${String((n % 27) + 1).padStart(2, '0')}.11.2026`,
      new: i === 0,
    };
  });
}

export const readerPages = [1, 2, 3, 4].map((n) => ({
  n,
  src: `/design/pages/${String(n).padStart(2, '0')}.jpg`,
}));

export const profile = {
  name: 'Артём',
  handle: '@artem',
  since: 'март 2023',
  avatar: '/design/avatars/01.jpg',
  stats: [
    { label: 'Просмотрено', value: '128' },
    { label: 'Закладки', value: '34' },
    { label: 'Комиксов', value: '12' },
    { label: 'Часов', value: '96' },
  ],
  history: [
    { slug: 'magicheskaya-bitva', episode: 9, percent: 64, when: 'сегодня, 21:40' },
    { slug: 'ataka-titanov', episode: 61, percent: 22, when: 'вчера, 23:10' },
    { slug: 'semya-shpiona', episode: 4, percent: 31, when: '19 ноября' },
    { slug: 'chelovek-benzopila', episode: 12, percent: 100, when: '17 ноября' },
  ],
  bookmarks: ['frieren', 'kiberpank-begushchie-po-krayu', 'agenty-paranoyi', 'dorohodoro'],
  lists: [
    { name: 'Зимний пересмотр', count: 8, note: 'медленное, тёплое, без экшена' },
    { name: 'Хочу начать', count: 14, note: 'первый эпизод уже скачан' },
    { name: 'Комиксы на вечер', count: 5, note: 'только RU-оригиналы' },
  ],
  achievements: [
    { title: '100 эпизодов', note: 'ноябрь 2026' },
    { title: 'Первый клуб', note: 'август 2025' },
    { title: 'Ночной марафон', note: 'июль 2025' },
  ],
};

export const searchSuggestions = anime.slice(0, 5).map((a) => ({
  slug: a.slug,
  title: a.title,
  meta: `${a.year} · ${a.kind} · ${a.rating > 0 ? a.rating.toFixed(1) : 'анонс'}`,
  poster: a.poster,
}));
