'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

/** Лёгкий i18n (ТЗ 2.3): словари chrome-строк RU/EN, переключатель в шапке, cookie lang. */
const DICT = {
  ru: {
    catalog: 'Каталог',
    top: 'ТОП-250',
    genres: 'Жанры',
    schedule: 'Расписание',
    search: 'Поиск аниме…',
    home: 'Главная',
    profile: 'Профиль',
    sections: 'Разделы',
    about: 'О проекте',
    rights: 'Правообладателям',
    continue: 'Продолжить просмотр',
    popular: 'Сейчас популярно',
    fresh: 'Новинки последних лет',
    topRated: 'Топ по оценкам',
    movies: 'Полнометражки',
    genresPick: 'Подборки по жанрам',
    forYou: 'Для вас',
  },
  en: {
    catalog: 'Catalog',
    top: 'TOP-250',
    genres: 'Genres',
    schedule: 'Schedule',
    search: 'Search anime…',
    home: 'Home',
    profile: 'Profile',
    sections: 'Sections',
    about: 'About',
    rights: 'Rights holders',
    continue: 'Continue watching',
    popular: 'Popular now',
    fresh: 'Recent releases',
    topRated: 'Top rated',
    movies: 'Movies',
    genresPick: 'Browse by genre',
    forYou: 'For you',
  },
} as const;

export type Lang = keyof typeof DICT;
export type MsgKey = keyof (typeof DICT)['ru'];

const Ctx = createContext<{ lang: Lang; t: (k: MsgKey) => string; setLang: (l: Lang) => void }>({
  lang: 'ru',
  t: (k) => DICT.ru[k],
  setLang: () => {},
});

export const useI18n = () => useContext(Ctx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof document === 'undefined') return 'ru';
    return (document.cookie.match(/lang=(ru|en)/)?.[1] as Lang) ?? 'ru';
  });
  const setLang = (l: Lang) => {
    document.cookie = `lang=${l}; path=/; max-age=31536000`;
    setLangState(l);
  };
  const t = (k: MsgKey) => DICT[lang][k];
  return <Ctx.Provider value={{ lang, t, setLang }}>{children}</Ctx.Provider>;
}

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <button type="button" className="icon-btn" style={{ width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 700 }} onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} aria-label="Switch language">
      {lang.toUpperCase()}
    </button>
  );
}
