'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { ThemeToggle } from '@/components/proto/ThemeToggle';
import { anime, profile } from '@/lib/mock';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/cinematic', label: 'Главная', icon: 'home' },
  { href: '/cinematic/catalog', label: 'Каталог', icon: 'grid' },
  { href: '/cinematic/comics', label: 'Комиксы', icon: 'book' },
  { href: '/cinematic/profile', label: 'Профиль', icon: 'user' },
];

const isActive = (pathname: string, href: string) =>
  href === '/cinematic' ? pathname === '/cinematic' : pathname.startsWith(href);

export function CinematicHeader() {
  const pathname = usePathname() || '/cinematic';
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = (query.trim()
    ? anime.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))
    : anime.slice(0, 5)
  ).slice(0, 6);

  useEffect(() => setSearchOpen(false), [pathname]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSearchOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [searchOpen]);

  return (
    <>
      <header className="c-header">
        <div className="c-wrap c-header-in">
          <Link href="/cinematic" className="c-logo">
            <Pulse size={7} />
            AniNova
          </Link>
          <nav className="c-nav" aria-label="Основная навигация">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="c-header-actions">
            <button
              type="button"
              className="c-icon-btn"
              onClick={() => setSearchOpen((v) => !v)}
              aria-expanded={searchOpen}
              aria-controls="c-search"
              aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск'}
            >
              <Icon name={searchOpen ? 'close' : 'search'} size={19} />
            </button>
            <ThemeToggle className="c-icon-btn" />
            <Link className="c-avatar-link" href="/cinematic/profile" aria-label="Профиль">
              <Image src={profile.avatar} alt="" width={32} height={32} />
            </Link>
          </div>
        </div>
      </header>

      {searchOpen ? (
        <div className="c-search" id="c-search" role="dialog" aria-modal="true" aria-label="Поиск">
          <div className="c-wrap">
            <div className="c-search-line">
              <Icon name="search" size={20} />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Что смотрим?"
                aria-label="Поиск по каталогу"
              />
              <button type="button" className="c-chip" onClick={() => setSearchOpen(false)}>
                Esc
              </button>
            </div>
            <div className="c-search-results">
              {results.length === 0 ? (
                <p className="c-search-empty">Ничего не найдено. В демо-каталоге 12 тайтлов.</p>
              ) : (
                results.map((a) => (
                  <Link key={a.slug} href={`/cinematic/anime/${a.slug}`} className="c-search-row" onClick={() => setSearchOpen(false)}>
                    <Image src={a.poster} alt="" width={42} height={60} sizes="42px" />
                    <span>
                      <b>{a.title}</b>
                      <span>
                        {a.original} · {a.year} · {a.kind}
                      </span>
                    </span>
                    <Icon name="arrow" size={16} />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="c-bottomnav" aria-label="Мобильная навигация">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
            <Icon name={item.icon} size={19} />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
