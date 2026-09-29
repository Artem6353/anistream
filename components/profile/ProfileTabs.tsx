'use client';

import type { Metadata } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AUTH_CHANGE_EVENT } from '@/lib/auth-gate';
import { isSessionValid } from '@/lib/sync';

export const metadata: Metadata = {
  title: 'Профиль',
};

const TABS = [
  { href: '/profile/list', label: 'Мой список' },
  { href: '/profile/bookmarks', label: 'Закладки' },
  { href: '/profile/history', label: 'История' },
  { href: '/profile/settings', label: 'Настройки' },
  /* Достижения — геймификация зарегистрированных (копится только при входе). */
  { href: '/profile/achievements', label: 'Достижения', auth: true },
];

export function ProfileTabs() {
  const pathname = usePathname();
  const [logged, setLogged] = useState(false);
  useEffect(() => {
    const refresh = () => setLogged(isSessionValid());
    refresh();
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
  }, []);
  return (
    <nav className="profile-tabs" aria-label="Разделы профиля">
      {TABS.filter((t) => !('auth' in t && t.auth) || logged).map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? 'is-active' : ''}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
