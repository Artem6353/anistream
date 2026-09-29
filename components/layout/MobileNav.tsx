'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconCalendar, IconGrid, IconHome, IconSearch, IconUser } from '@/components/ui/icons';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const CommandPalette = dynamic(() => import('./CommandPalette').then((m) => m.CommandPalette), { ssr: false });
import { useI18n } from '@/lib/i18n';

const ITEMS = [
  { href: '/', key: 'home', icon: IconHome },
  { href: '/catalog', key: 'catalog', icon: IconGrid },
  { href: '/search', key: 'search', icon: IconSearch },
  { href: '/schedule', key: 'schedule', icon: IconCalendar },
  { href: '/profile/bookmarks', key: 'profile', icon: IconUser },
] as const;

/** Нижняя навигация для мобильных и ТВ-режима указки. */
export function MobileNav() {
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          if (item.href === '/search') {
            return (
              <button key={item.href} type="button" className="mobile-nav__item" onClick={() => setPalette(true)}>
                <item.icon size={19} />
                <span>{t(item.key)}</span>
              </button>
            );
          }
          return (
            <Link key={item.href} className={`mobile-nav__item ${active ? 'is-active' : ''}`} href={item.href} aria-current={active ? 'page' : undefined}>
              <item.icon size={19} />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}
