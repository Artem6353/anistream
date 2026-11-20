'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconFilm, IconGrid, IconHome, IconUser } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';
const ITEMS = [
  { href: ROOT, label: 'Главная', icon: IconHome, exact: true },
  { href: `${ROOT}/catalog`, label: 'Каталог', icon: IconGrid },
  { href: `${ROOT}/comics`, label: 'Comics', icon: IconFilm },
  { href: `${ROOT}/profile`, label: 'Профиль', icon: IconUser },
];

/** Мобильная нижняя навигация из C: не исчезает на телефоне, учитывает safe-area.
 *  На ТВ (data-tv) скрыта CSS — там пульт и горизонтальное меню. */
export function A3MobileNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="a3-bottomnav" aria-label="Разделы">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} className="a3-bottomnav__item" href={href} aria-current={active ? 'page' : undefined}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
