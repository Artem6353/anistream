'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { ThemeToggle } from '@/components/proto/ThemeToggle';
import { anime } from '@/lib/mock';

const NAV = [
  { href: '/editorial', label: 'Главная', n: '01' },
  { href: '/editorial/catalog', label: 'Каталог', n: '02' },
  { href: '/editorial/comics', label: 'Комиксы', n: '03' },
  { href: '/editorial/profile', label: 'Профиль', n: '04' },
];

const isActive = (pathname: string, href: string) =>
  href === '/editorial' ? pathname === '/editorial' : pathname.startsWith(href);

export function EditorialHeader() {
  const pathname = usePathname() || '/editorial';
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = (query.trim()
    ? anime.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))
    : anime.slice(0, 5)
  ).slice(0, 6);

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen, searchOpen]);

  return (
    <header className="e-masthead">
      <div className="e-wrap">
        <div className="e-topline">
          <div className="e-topline-left">
            <span className="e-date-long">Пятница, 20 ноября 2026</span>
            <span className="e-date-short">20.11.2026</span>
            <span aria-hidden="true">·</span>
            <span>№04</span>
          </div>
          <div className="e-topline-right">
            <button type="button" onClick={() => setSearchOpen((v) => !v)} aria-expanded={searchOpen} aria-controls="e-search">
              {searchOpen ? 'Закрыть' : 'Поиск'}
            </button>
            <ThemeToggle />
            <Link href="/editorial/login">Войти</Link>
            <button
              type="button"
              className="e-burger"
              aria-expanded={menuOpen}
              aria-controls="e-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              Меню <Icon name={menuOpen ? 'close' : 'menu'} size={16} />
            </button>
          </div>
        </div>

        <div className="e-brand-row">
          <Link href="/editorial" className="e-brand" aria-label="AniNova — на главную">
            AniNova
            <Pulse size={7} />
          </Link>
          <p className="e-brand-meta">
            <b>Независимый каталог</b>
            Аниме, комиксы и расписание. Без баннеров и всплывающих окон.
          </p>
        </div>

        <nav className="e-sections" aria-label="Рубрики">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {searchOpen ? (
        <div className="e-search" id="e-search">
          <div className="e-wrap e-search-in">
            <div className="e-search-line">
              <Icon name="search" size={18} />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти тайтл в демо-каталоге"
                aria-label="Поиск по демо-каталогу"
                onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
              />
              <span className="e-label">Найдено: {results.length}</span>
            </div>
            <div className="e-search-results">
              {results.length === 0 ? (
                <p className="e-search-empty">Ничего не найдено. В выпуске 12 демонстрационных тайтлов.</p>
              ) : (
                results.map((a) => (
                  <Link key={a.slug} href={`/editorial/anime/${a.slug}`} className="e-search-row">
                    <em>{a.title}</em>
                    <span>
                      {a.original} · {a.year}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="e-menu" id="e-menu" role="dialog" aria-modal="true" aria-label="Меню выпуска">
          <div className="e-menu-top">
            <span className="e-brand" style={{ fontSize: 30 }}>
              AniNova
              <Pulse size={6} />
            </span>
            <button type="button" className="e-burger" onClick={() => setMenuOpen(false)}>
              Закрыть <Icon name="close" size={16} />
            </button>
          </div>
          <nav className="e-menu-list" aria-label="Разделы">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
                <span>{item.n}</span>
              </Link>
            ))}
          </nav>
          <div className="e-menu-foot">
            <Link className="e-btn" href="/editorial/login" onClick={() => setMenuOpen(false)}>
              Войти
            </Link>
            <Link className="e-btn e-btn--solid" href="/editorial/register" onClick={() => setMenuOpen(false)}>
              Создать аккаунт
            </Link>
            <p className="e-label">Демо-данные B1-A · тема: <ThemeToggle showLabel /></p>
          </div>
        </div>
      ) : null}
    </header>
  );
}
