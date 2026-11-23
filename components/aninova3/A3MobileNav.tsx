'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconCalendar, IconFilm, IconGrid, IconHome, IconUser } from '@/components/ui/icons';
import { A3_NAV, A3_ROOT as ROOT, isA3NavActive } from '@/lib/aninova3/nav';

const ICONS: Record<string, typeof IconHome> = {
  [ROOT]: IconHome,
  [`${ROOT}/catalog`]: IconGrid,
  [`${ROOT}/schedule`]: IconCalendar,
  [`${ROOT}/comics`]: IconFilm,
  [`${ROOT}/profile`]: IconUser,
};

const ITEMS = A3_NAV.map((item) => ({ ...item, icon: ICONS[item.href] ?? IconHome }));

/** Мобильная нижняя навигация из C: не исчезает на телефоне, учитывает safe-area.
 *  На ТВ (data-tv) скрыта CSS — там пульт и горизонтальное меню. */
export function A3MobileNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="a3-bottomnav" aria-label="Разделы">
      {ITEMS.map(({ href, label, icon: Icon, ...item }) => {
        const active = isA3NavActive(pathname, { href, label, ...item });
        return (
          <Link key={href} className="a3-bottomnav__item" href={href} aria-current={active ? 'page' : undefined} data-a3-focusable>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
