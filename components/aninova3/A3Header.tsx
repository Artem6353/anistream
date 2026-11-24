'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AUTH_CHANGE_EVENT } from '@/lib/auth-gate';
import { isSessionValid } from '@/lib/sync';
import { A3Logo } from './A3Logo';
import { useA3Ui } from './A3Ui';
import { A3Menu } from './A3Menu';
import { IconSearch, IconTv, IconUser } from '@/components/ui/icons';
import { A3_NAV, A3_ROOT as ROOT, isA3NavActive } from '@/lib/aninova3/nav';

export function A3Header({ onSearch, searchOpen = false }: { onSearch: () => void; searchOpen?: boolean }) {
  const pathname = usePathname() ?? '';
  const { tv, setTv } = useA3Ui();
  // null — ещё не знаем; так вошедший человек не видит вспышку «Войти».
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setSignedIn(isSessionValid());
    sync();
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, sync);
  }, []);

  return (
    <header className="a3-header" data-a3-group="header">
      <div className="a3-wrap a3-header__in">
        <A3Logo />
        <nav className="a3-nav" aria-label="Основная навигация">
          {A3_NAV.map((item) => (
            <Link
              key={item.href}
              className="a3-nav__link"
              href={item.href}
              aria-current={isA3NavActive(pathname, item) ? 'page' : undefined}
              data-a3-focusable
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="a3-header__actions">
          <button
            className="a3-iconbtn"
            type="button"
            onClick={onSearch}
            aria-label="Поиск по каталогу"
            aria-keyshortcuts="/"
            aria-haspopup="dialog"
            aria-controls="a3-search-dialog"
            aria-expanded={searchOpen}
          >
            <IconSearch size={18} />
            <span className="a3-iconbtn__label">Поиск</span>
          </button>
          <button
            className={`a3-iconbtn a3-tvtoggle${tv ? ' is-on' : ''}`}
            type="button"
            aria-pressed={tv}
            onClick={() => setTv(!tv)}
            title="Крупный интерфейс и управление стрелками"
          >
            <IconTv size={18} />
            <span className="a3-iconbtn__label">ТВ</span>
          </button>
          <Link className="a3-iconbtn" href={`${ROOT}/profile`} aria-label="Профиль">
            <IconUser size={18} />
            <span className="a3-iconbtn__label">Профиль</span>
          </Link>
          <A3Menu />
          {signedIn === false ? (
            <Link className="a3-btn a3-btn--ghost a3-header__login" href={`${ROOT}/auth`}>
              Войти
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
