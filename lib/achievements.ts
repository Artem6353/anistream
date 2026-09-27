'use client';

/** Реестр 32 ачивок (ТЗ блок 18.1). Уровни: bronze/silver/gold/platinum/secret.
    Хранение разблокировок: anistream:achievements = { [id]: unlockedAt } (см. блок 18). */
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'secret';

export interface AchievementMeta {
  id: string;
  tier: AchievementTier;
  title: string;
  desc: string;
  /** Условие человека читаемым языком (для страницы деталей). */
  how: string;
  /** Целевое значение прогресса (для прогресс-баров). */
  goal: number;
}

export const ACHIEVEMENTS: AchievementMeta[] = [
  // 🥉 Бронза (10)
  { id: 'first-step', tier: 'bronze', title: 'Первый шаг', desc: 'Посмотреть первую серию', how: 'Откройте любую серию и досмотрите хотя бы минуту', goal: 1 },
  { id: 'ten', tier: 'bronze', title: 'Десятка', desc: '10 серий просмотрено', how: 'Суммарно 10 серий в истории', goal: 10 },
  { id: 'hello', tier: 'bronze', title: 'Знакомство', desc: 'Первый тайтл в списке', how: 'Добавьте тайтл в «Мой список»', goal: 1 },
  { id: 'orator', tier: 'bronze', title: 'Оратор', desc: 'Первый отзыв', how: 'Напишите отзыв на странице тайтла', goal: 1 },
  { id: 'first-like', tier: 'bronze', title: 'Первый лайк', desc: 'Поставить первый лайк', how: 'Оцените чужой отзыв лайком', goal: 1 },
  { id: 'collector', tier: 'bronze', title: 'Коллекционер', desc: '10 тайтлов в списке', how: '10 тайтлов в «Моём списке»', goal: 10 },
  { id: 'explorer', tier: 'bronze', title: 'Исследователь', desc: '5 жанров в истории', how: 'Посмотрите тайтлы пяти разных жанров', goal: 5 },
  { id: 'stylist', tier: 'bronze', title: 'Стилист', desc: 'Сменить акцент или тему', how: 'Поменяйте цвет акцента или тему оформления', goal: 1 },
  { id: 'bullseye', tier: 'bronze', title: 'В точку', desc: 'Оценка совпала со средней', how: 'Ваша оценка тайтла совпала со средней оценкой каталога', goal: 1 },
  { id: 'hour-one', tier: 'bronze', title: 'Первый час', desc: 'Час просмотров', how: 'Суммарная длительность просмотренного — 1 час', goal: 60 },
  // 🥈 Серебро (10)
  { id: 'hundred', tier: 'silver', title: 'Сотка', desc: '100 серий просмотрено', how: 'Суммарно 100 серий в истории', goal: 100 },
  { id: 'marathoner', tier: 'silver', title: 'Марафонец', desc: '10 серий за один день', how: '10 серий с датой просмотра в один день', goal: 10 },
  { id: 'hours-100', tier: 'silver', title: 'Сто часов', desc: '100 часов просмотров', how: 'Суммарная длительность — 100 часов', goal: 6000 },
  { id: 'collector-plus', tier: 'silver', title: 'Коллекционер+', desc: '50 тайтлов в списке', how: '50 тайтлов в «Моём списке»', goal: 50 },
  { id: 'critic', tier: 'silver', title: 'Критик', desc: '10 отзывов', how: 'Напишите 10 отзывов', goal: 10 },
  { id: 'commentator', tier: 'silver', title: 'Комментатор', desc: '10 комментариев', how: 'Ответьте в ветках отзывов 10 раз', goal: 10 },
  { id: 'romantic', tier: 'silver', title: 'Романтик', desc: '5 романтик-тайтлов', how: 'Посмотрите 5 тайтлов жанра romance', goal: 5 },
  { id: 'action-master', tier: 'silver', title: 'Экшен-мастер', desc: '5 экшен-тайтлов', how: 'Посмотрите 5 тайтлов жанра action', goal: 5 },
  { id: 'omnivore', tier: 'silver', title: 'Всеядный', desc: '10 жанров в истории', how: 'Тайтлы 10 разных жанров в истории', goal: 10 },
  { id: 'night-owl', tier: 'silver', title: 'Ночной житель', desc: '10 серий после полуночи', how: '10 серий, начатых между 00:00 и 05:00', goal: 10 },
  // 🥇 Золото (5)
  { id: 'five-hundred', tier: 'gold', title: 'Полтысячи', desc: '500 серий просмотрено', how: 'Суммарно 500 серий', goal: 500 },
  { id: 'cinephile', tier: 'gold', title: 'Киноман', desc: '20 фильмов', how: 'Посмотрите 20 полных метров (type movie)', goal: 20 },
  { id: 'regular-30', tier: 'gold', title: 'Постоянный', desc: '30 дней подряд', how: 'Заходите на сайт 30 дней без перерыва', goal: 30 },
  { id: 'librarian', tier: 'gold', title: 'Библиотекарь', desc: '200 тайтлов в списке', how: '200 тайтлов в «Моём списке»', goal: 200 },
  { id: 'reviewer-50', tier: 'gold', title: 'Рецензент', desc: '50 отзывов', how: 'Напишите 50 отзывов', goal: 50 },
  // 💎 Платина (3)
  { id: 'legend-1000', tier: 'platinum', title: 'Легенда', desc: '1000 серий', how: 'Суммарно 1000 серий', goal: 1000 },
  { id: 'hours-1000', tier: 'platinum', title: 'Тысяча часов', desc: '1000 часов просмотров', how: 'Суммарная длительность — 1000 часов', goal: 60000 },
  { id: 'devoted-100', tier: 'platinum', title: 'Преданный', desc: '100 дней подряд', how: '100 дней подряд на сайте', goal: 100 },
  // 🌟 Секретные (4)
  { id: 'night-marathon', tier: 'secret', title: 'Ночной марафон', desc: '24 часа просмотра за сутки', how: 'Секрет: суммарно 24 часа просмотра в одни сутки', goal: 1440 },
  { id: 'speed-x2', tier: 'secret', title: 'Скорость', desc: 'x2 пятьдесят раз', how: 'Секрет: включите скорость x2 50 раз', goal: 50 },
  { id: 'voices-many', tier: 'secret', title: 'Озвучек много', desc: '10 озвучек в одной серии', how: 'Секрет: откройте серию с 10 озвучками', goal: 10 },
  { id: 'legendary-all', tier: 'secret', title: 'Легендарный', desc: 'Все 28 обычных ачивок', how: 'Секрет: соберите все обычные ачивки', goal: 28 },
];

export const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: '🥉 Бронза',
  silver: '🥈 Серебро',
  gold: '🥇 Золото',
  platinum: '💎 Платина',
  secret: '🌟 Секретные',
};

/** Чтение разблокировок: anistream:achievements = { id: unlockedAt } (ключ не переименовывать). */
export function readUnlocked(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('anistream:achievements') ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
export function writeUnlocked(v: Record<string, number>) {
  try {
    localStorage.setItem('anistream:achievements', JSON.stringify(v));
  } catch {
    /* приватный режим */
  }
}
