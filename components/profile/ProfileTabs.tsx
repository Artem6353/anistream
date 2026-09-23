'use client';

import type { Metadata } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Профиль',
};

const TABS = [
  { href: '/profile/list', label: 'Мой список' },
  { href: '/profile/bookmarks', label: 'Закладки' },
  { href: '/profile/history', label: 'История' },
  { href: '/profile/settings', label: 'Настройки' },
];

export function ProfileTabs() {
  const pathname = usePathname();
  return (
    <nav className="profile-tabs" aria-label="Разделы профиля">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? 'is-active' : ''}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
