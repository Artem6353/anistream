/**
 * B2-A: единый список разделов нового интерфейса.
 *
 * Один источник правды для шапки, нижней навигации и футера: подписи и активные
 * состояния не могут разойтись между тремя местами. Раздел «Аниме» отдельным
 * пунктом не нужен — страница произведения принадлежит каталогу.
 */

export const A3_ROOT = '/preview/aninova-3';

export interface A3NavItem {
  href: string;
  label: string;
  /** Совпадать только точно (для главной). */
  exact?: boolean;
  /** Дополнительные префиксы, которые подсвечивают тот же раздел. */
  also?: string[];
}

export const A3_NAV: readonly A3NavItem[] = [
  { href: A3_ROOT, label: 'Главная', exact: true },
  { href: `${A3_ROOT}/catalog`, label: 'Каталог', also: [`${A3_ROOT}/anime`] },
  { href: `${A3_ROOT}/schedule`, label: 'Расписание' },
  { href: `${A3_ROOT}/comics`, label: 'Comics' },
  { href: `${A3_ROOT}/profile`, label: 'Профиль' },
];

/** Активен ли раздел для текущего пути. Query и хеш не влияют на подсветку. */
export function isA3NavActive(pathname: string, item: A3NavItem): boolean {
  const path = (pathname ?? '').split(/[?#]/)[0] ?? '';
  if (!path) return false;
  if (item.exact) return path === item.href;
  if (path === item.href || path.startsWith(`${item.href}/`)) return true;
  return (item.also ?? []).some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
