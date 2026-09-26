'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import dynamic from 'next/dynamic';

// CommandPalette — тяжёлый оверлей: грузим лениво только на клиенте (ТЗ блок 8)
const CommandPalette = dynamic(() => import('./CommandPalette').then((m) => m.CommandPalette), { ssr: false });
import { useLibrary } from '@/lib/library';
import { IconBookmark, IconCommand, IconSearch, IconSettings } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n'; // LanguageSwitcher убран (ТЗ блок 7): сайт только RU; код i18n оставлен на будущее

const NAV = [
  { href: '/catalog', key: 'catalog' },
  { href: '/top', key: 'top' },
  { href: '/genres', key: 'genres' },
  { href: '/schedule', key: 'schedule' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { bookmarks } = useLibrary();
  const { t } = useI18n();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <a className="skip-link" href="#content">
        Перейти к содержимому
      </a>
      <header className={`header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="container header__inner">
          <Link className="header__brand" href="/" aria-label="AniNova — на главную">
            <Logo />
            <span className="header__brand-text">
              AniNova
              <em>каталог аниме</em>
            </span>
          </Link>

          <nav className="header__nav" aria-label="Основные разделы">
            {NAV.map((n) => (
              <Link key={n.href} className={`header__link ${pathname?.startsWith(n.href) ? 'is-active' : ''}`} href={n.href}>
                {t(n.key)}
              </Link>
            ))}
          </nav>

          <div className="header__actions">
            <button type="button" className="header__search" onClick={() => setPaletteOpen(true)} aria-label="Поиск по каталогу (Ctrl+K)">
              <IconSearch size={15} />
              <span>{t('search')}</span>
              <kbd>
                <IconCommand size={11} />K
              </kbd>
            </button>
            <Link className="icon-btn header__icon" href="/profile/bookmarks" aria-label={`Закладки (${bookmarks.length})`} title="Закладки">
              <IconBookmark size={17} />
              {bookmarks.length > 0 ? <span className="header__count">{bookmarks.length}</span> : null}
            </Link>
            <Link className="icon-btn header__icon" href="/profile/settings" aria-label="Настройки" title="Настройки">
              <IconSettings size={17} />
            </Link>
          </div>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
