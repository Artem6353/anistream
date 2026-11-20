/* Реестр прототипа: три концепции и одинаковый набор демонстрационных экранов.
   Один реестр нужен, чтобы (1) док мог переключать концепцию на том же экране,
   (2) скриншот-скрипт обходил ровно один и тот же список, (3) index показывал
   симметричную матрицу «экран × концепция». */

export type ConceptId = 'minimal' | 'editorial' | 'cinematic';

export type Concept = {
  id: ConceptId;
  letter: 'A' | 'B' | 'C';
  path: string;
  name: string;
  ru: string;
  tagline: string;
  summary: string;
  themeDefault: 'dark' | 'light';
  colors: { name: string; value: string }[];
  type: { display: string; body: string };
  strengths: string[];
  risks: string[];
};

export const concepts: Concept[] = [
  {
    id: 'minimal',
    letter: 'A',
    path: '/minimal',
    name: 'Nova Minimal',
    ru: 'Тихая утилитарность',
    tagline: 'Интерфейс, которого не замечаешь',
    summary:
      'Плотные списки вместо плиток, волосяные линии вместо карточек, один акцент. Главная задача — быстро найти тайтл и вернуться к просмотру.',
    themeDefault: 'dark',
    colors: [
      { name: 'Ink', value: '#0C0C0E' },
      { name: 'Paper', value: '#FBFAF7' },
      { name: 'Nova', value: '#7C6BFF' },
    ],
    type: { display: 'Системный гротеск, 500/600, tracking −2%', body: 'Тот же гротеск, 14/22' },
    strengths: ['Самая высокая плотность каталога', 'Минимум JS и изображений', 'Быстро читается на мобильном'],
    risks: ['Может выглядеть «инструментом», а не сервисом', 'Мало эмоций для промо-страниц'],
  },
  {
    id: 'editorial',
    letter: 'B',
    path: '/editorial',
    name: 'Nova Editorial',
    ru: 'Журнальная вёрстка',
    tagline: 'Каталог как выпуск журнала',
    summary:
      'Крупная антиква, асимметричная сетка 7/5, линейки и подписи. Комиксы и обзоры получают собственный голос, аниме-каталог превращается в индекс.',
    themeDefault: 'light',
    colors: [
      { name: 'Paper', value: '#F7F3EA' },
      { name: 'Ink', value: '#16150F' },
      { name: 'Seal', value: '#A8342B' },
    ],
    type: { display: 'Georgia / serif, 400, крупный кегль', body: 'Serif 17/28 + sans для служебного' },
    strengths: ['Сильная идентичность и «читаемость» комиксов', 'Хорошо продаёт редакционный контент', 'Светлая тема выглядит премиально'],
    risks: ['Серif требует дисциплины в плотных UI-зонах', 'Таблицы и фильтры тяжелее в мобильной вёрстке'],
  },
  {
    id: 'cinematic',
    letter: 'C',
    path: '/cinematic',
    name: 'Nova Cinematic',
    ru: 'Тёмный кинозал',
    tagline: 'Экран важнее интерфейса',
    summary:
      'Полноэкранные кадры, тёплый янтарный акцент, видео-центричная иерархия. Главная страница — афиша, страница тайтла — вход в кинозал.',
    themeDefault: 'dark',
    colors: [
      { name: 'Theatre', value: '#07070A' },
      { name: 'Ember', value: '#F0A868' },
      { name: 'Bone', value: '#F4F1EA' },
    ],
    type: { display: 'Гротеск, 700, uppercase, tracking −3%', body: 'Гротеск 15/24' },
    strengths: ['Максимальный эффект от арта и плеера', 'Естественно работает на ТВ 1920', 'Запоминается с первого экрана'],
    risks: ['Тяжелее по изображениям и LCP', 'Светлая тема требует отдельной проверки контраста'],
  },
];

export type Screen = {
  id: string;
  label: string;
  short: string;
  path: string;
  note: string;
};

/* Путь внутри концепции. Док и index подставляют префикс /minimal | /editorial | /cinematic. */
export const screens: Screen[] = [
  { id: 'home', label: 'Главная', short: 'Главная', path: '', note: 'первый экран, навигация, поиск' },
  { id: 'catalog', label: 'Каталог аниме', short: 'Каталог', path: '/catalog', note: 'фильтры, плотность, сортировка' },
  {
    id: 'anime',
    label: 'Страница аниме',
    short: 'Аниме',
    path: '/anime/magicheskaya-bitva',
    note: 'метаданные, эпизоды, похожие',
  },
  {
    id: 'watch',
    label: 'Видеоплеер',
    short: 'Плеер',
    path: '/anime/magicheskaya-bitva/watch',
    note: 'сцена, контролы, список серий',
  },
  { id: 'comics', label: 'Главная Comics', short: 'Comics', path: '/comics', note: 'продолжить чтение, новинки' },
  {
    id: 'comic',
    label: 'Страница комикса',
    short: 'Комикс',
    path: '/comics/steklyannyj-gorod',
    note: 'обложка, главы, права',
  },
  {
    id: 'read',
    label: 'Чтение комикса',
    short: 'Читалка',
    path: '/comics/steklyannyj-gorod/read',
    note: 'reader, свайп/клавиши, прогресс',
  },
  { id: 'profile', label: 'Профиль', short: 'Профиль', path: '/profile', note: 'статистика, вкладки, история' },
  { id: 'login', label: 'Вход', short: 'Вход', path: '/login', note: 'форма, состояния полей' },
  { id: 'register', label: 'Регистрация', short: 'Регистрация', path: '/register', note: 'форма, валидация, согласие' },
];

export const conceptById = (id: string) => concepts.find((c) => c.id === id) ?? concepts[0];

export const conceptPath = (id: ConceptId, path: string) => `/${id}${path}`;

export const screenByPath = (path: string) =>
  screens.find((s) => s.path === path) ?? screens.find((s) => s.path !== '' && path.startsWith(s.path));
