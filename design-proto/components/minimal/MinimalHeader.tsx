'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { ThemeToggle } from '@/components/proto/ThemeToggle';
import { anime } from '@/lib/mock';

const NAV = [
  { href: '/minimal', label: 'Главная' },
  { href: '/minimal/catalog', label: 'Каталог' },
  { href: '/minimal/comics', label: 'Комиксы' },
  { href: '/minimal/profile', label: 'Профиль' },
];

const isActive = (pathname: string, href: string) =>
  href === '/minimal' ? pathname === '/minimal' : pathname.startsWith(href);

export function MinimalHeader() {
  const pathname = usePathname() || '/minimal';
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const results = (query.trim()
    ? anime.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))
    : anime.slice(0, 5)
  ).slice(0, 6);

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <header className="m-header">
      <div className="m-wrap m-header-in">
        <Link href="/minimal" className="m-logo">
          <Pulse size={7} />
          AniNova
        </Link>

        <nav className="m-nav" aria-label="Основная навигация">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="m-header-actions">
          <button
            type="button"
            className="m-icon-btn"
            aria-expanded={searchOpen}
            aria-controls="m-search"
            aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск по каталогу'}
            onClick={() => {
              setSearchOpen((v) => !v);
              setMenuOpen(false);
            }}
          >
            <Icon name={searchOpen ? 'close' : 'search'} size={18} />
          </button>
          <ThemeToggle className="m-icon-btn" />
          <Link className="m-login" href="/minimal/login">
            Войти
          </Link>
          <button
            type="button"
            className="m-icon-btn m-burger"
            aria-expanded={menuOpen}
            aria-controls="m-drawer"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            onClick={() => {
              setMenuOpen((v) => !v);
              setSearchOpen(false);
            }}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={19} />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="m-search" id="m-search">
          <div className="m-wrap m-search-in">
            <div className="m-search-row-top">
              <Icon name="search" size={18} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchOpen(false);
                  if (e.key === 'Enter' && results[0]) router.push(`/minimal/anime/${results[0].slug}`);
                }}
                placeholder="Название, оригинал или студия"
                aria-label="Поиск по каталогу"
                type="search"
                autoComplete="off"
              />
              <span className="m-search-hint" aria-hidden="true">
                Enter
              </span>
            </div>
            <div className="m-search-results" role="list">
              {results.length === 0 ? (
                <p className="m-search-empty">Ничего не нашлось. Демо-каталог содержит 12 тайтлов.</p>
              ) : (
                results.map((a) => (
                  <Link key={a.slug} href={`/minimal/anime/${a.slug}`} className="m-search-row" role="listitem">
                    <Image className="m-search-thumb" src={a.poster} alt="" width={34} height={48} />
                    <span>
                      <span className="m-search-title">{a.title}</span>
                      <span className="m-search-meta" style={{ display: 'block' }}>
                        {a.year} · {a.original} · {a.genres[0]}
                      </span>
                    </span>
                    <Icon name="arrow" size={15} />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="m-drawer" id="m-drawer" role="dialog" aria-modal="true" aria-label="Меню">
          <nav className="m-drawer-list" aria-label="Мобильная навигация">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
                <Icon name="right" size={16} />
              </Link>
            ))}
          </nav>
          <div className="m-drawer-foot">
            <Link className="m-btn m-btn--primary" href="/minimal/login" onClick={() => setMenuOpen(false)}>
              Войти
            </Link>
            <Link className="m-btn" href="/minimal/register" onClick={() => setMenuOpen(false)}>
              Создать аккаунт
            </Link>
            <span>
              Демо-данные B1-A. Тема:{' '}
              <ThemeToggle showLabel />
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
