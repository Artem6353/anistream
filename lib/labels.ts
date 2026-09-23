import type { Season, TitleStatus, TitleType } from './types';

export const TYPE_LABELS: Record<TitleType, string> = {
  tv: 'ТВ-сериал',
  movie: 'Фильм',
  ona: 'ONA',
  ova: 'OVA',
  special: 'Спешл',
};

export const STATUS_LABELS: Record<TitleStatus, string> = {
  ongoing: 'Онгоинг',
  finished: 'Завершён',
  upcoming: 'Анонс',
};

export const SEASON_LABELS: Record<Season, string> = {
  winter: 'зима',
  spring: 'весна',
  summer: 'лето',
  fall: 'осень',
};

export const GENRE_LABELS: Record<string, string> = {
  action: 'Экшен',
  adventure: 'Приключения',
  comedy: 'Комедия',
  drama: 'Драма',
  fantasy: 'Фэнтези',
  horror: 'Ужасы',
  mystery: 'Детектив',
  psychological: 'Психологическое',
  romance: 'Романтика',
  'sci-fi': 'Фантастика',
  'slice-of-life': 'Повседневность',
  sports: 'Спорт',
  supernatural: 'Сверхъестественное',
  thriller: 'Триллер',
  music: 'Музыка',
  mecha: 'Меха',
  ecchi: 'Этти',
  'mahou-shoujo': 'Махо-сёдзё',
  school: 'Школа',
  seinen: 'Сэйнэн',
  shoujo: 'Сёдзё',
  shounen: 'Сёнэн',
  josei: 'Дзёсэй',
  kids: 'Детское',
};

export const genreLabel = (slug: string) => GENRE_LABELS[slug] ?? slug;

export const WEEKDAYS = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export const LIST_STATUS_LABELS: Record<string, string> = {
  watching: 'Смотрю',
  completed: 'Просмотрено',
  onhold: 'Отложено',
  dropped: 'Брошено',
  planned: 'Запланировано',
  rewatching: 'Пересматриваю',
};

export const SOURCE_LABELS: Record<string, string> = {
  MANGA: 'Манга',
  LIGHT_NOVEL: 'Ранобэ',
  VISUAL_NOVEL: 'Визуальная новелла',
  NOVEL: 'Роман',
  ORIGINAL: 'Оригинал',
  GAME: 'Игра',
  BOOK: 'Книга',
  COMIC: 'Комикс',
  MUSIC: 'Музыка',
  PICTURE_BOOK: 'Пicture-бук',
  OTHER: 'Другое',
  WEB_NOVEL: 'Веб-новелла',
  CARD_GAME: 'Карточная игра',
  MULTIMEDIA_PROJECT: 'Мультимедиа-проект',
  DONGHUA: 'Дунхуа',
};

export const LENGTH_BUCKETS: Record<string, { label: string; test: (n: number) => boolean }> = {
  short: { label: 'Короткие (до 12)', test: (n) => n < 12 },
  medium: { label: 'Средние (12–26)', test: (n) => n >= 12 && n <= 26 },
  long: { label: 'Длинные (27–51)', test: (n) => n >= 27 && n <= 51 },
  xlong: { label: 'Очень длинные (52+)', test: (n) => n >= 52 },
};

export const SORT_LABELS: Record<string, string> = {
  pop: 'По популярности',
  score: 'По рейтингу',
  new: 'Сначала новые',
  az: 'По алфавиту',
};

export const ACCENTS: Record<string, { label: string; a: string; b: string }> = {
  violet: { label: 'Фиолетовый', a: '#8b5cf6', b: '#f472b6' },
  ice: { label: 'Ледяной', a: '#38bdf8', b: '#818cf8' },
  emerald: { label: 'Изумруд', a: '#34d399', b: '#22d3ee' },
  sunset: { label: 'Закат', a: '#fb923c', b: '#f43f5e' },
};
