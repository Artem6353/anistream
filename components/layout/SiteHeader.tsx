'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import dynamic from 'next/dynamic';

// CommandPalette — тяжёлый оверлей: грузим лениво только на клиенте (ТЗ блок 8)
const CommandPalette = dynamic(() => import('./CommandPalette').then((m) => m.CommandPalette), { ssr: false });
import { library, useLibrary } from '@/lib/library';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { AUTH_CHANGE_EVENT } from '@/lib/auth-gate';
import { trackEvent } from '@/lib/achievements';
import { StreakBadge } from './StreakBadge';
import { DmIcon } from './DmIcon';
import { IconBookmark, IconCommand, IconSearch, IconSettings, IconMoon, IconSun, IconMonitor } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n'; // LanguageSwitcher убран (ТЗ блок 7): сайт только RU; код i18n оставлен на будущее

const NAV = [
  { href: '/catalog', key: 'catalog' },
  { href: '/top', key: 'top' },
  { href: '/genres', key: 'genres' },
  { href: '/schedule', key: 'schedule' },
  { href: '/feed', key: 'feed' },
  { href: '/clubs', key: 'clubs' },
  { href: '/forum', key: 'forum' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeMenu, setThemeMenu] = useState(false);
  const [logged, setLogged] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Фикс бага 5: при ЛЮБОМ auth-событии (вход/выход/смена аккаунта) перезапрашиваем
  // профиль с race-guard по порядковому номеру запроса; кэш не переживает logout.
  useEffect(() => {
    let seq = 0;
    const refresh = () => {
      const ok = isSessionValid();
      setLogged(ok);
      const my = ++seq;
      if (!ok) {
        setAvatarUrl(null);
        return;
      }
      supaWhoami()
        .then((uid) => supaRest('GET', `profiles?user_id=eq.${uid}&select=avatar_url&limit=1`))
        .then((r: Response | null) => (r?.ok ? (r.json() as Promise<Array<{ avatar_url: string | null }>>) : []))
        .then((rows: Array<{ avatar_url: string | null }>) => {
          if (my === seq) setAvatarUrl(rows?.[0]?.avatar_url ?? null);
        })
        .catch(() => {
          if (my === seq) setAvatarUrl(null);
        });
    };
    refresh();
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
  }, []);
  const { bookmarks, settings } = useLibrary();
  const initials = (settings.displayName ?? 'A').slice(0, 1).toUpperCase();
  const { t } = useI18n();

  // ачивка «Исследователь»: посещение 5 разделов (ТЗ 18.1)
  useEffect(() => {
    const sec = pathname === '/' ? 'home' : pathname?.startsWith('/catalog') ? 'catalog' : pathname?.startsWith('/top') ? 'top' : pathname?.startsWith('/schedule') ? 'schedule' : pathname?.startsWith('/profile') ? 'profile' : null;
    if (sec) trackEvent('section', { section: sec });
  }, [pathname]);

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
            <Link className="icon-btn header__icon" href="/random" aria-label="Случайный тайтл" title="Случайный тайтл">
              🎲
              {/* S3.3: якорный текст для парсеров (аудит: неинформативный анкор «🎲») */}
              <span className="sr-only">Случайный тайтл</span>
            </Link>
            <StreakBadge />
            {/* откат 30.09: достижения — геймификация зарегистрированных;
                закладки и настройки доступны и гостям (локальные данные). */}
            {logged && (
              <Link className="icon-btn header__icon" href="/profile/achievements" aria-label="Достижения" title="Достижения">
                🏆
                <span className="sr-only">Достижения</span>
              </Link>
            )}
            <DmIcon />
            {!logged ? (
              <button
                type="button"
                className="btn btn--outline btn--md header__login"
                onClick={() => window.dispatchEvent(new CustomEvent('anistream:open-auth'))}
              >
                Войти
              </button>
            ) : (
              <Link className="header__avatar" href="/profile/settings" aria-label="Профиль" title="Профиль">
                {/* Аватар из Supabase Storage — произвольный host вне remotePatterns
                    next/image; маленький (28px), lazy не критичен. Осознанный <img>. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials}</span>}
                <span className="sr-only">Профиль и настройки</span>
              </Link>
            )}
            <div className="theme-switch">
              <button
                type="button"
                className="icon-btn header__icon"
                aria-label="Тема оформления"
                title="Тема оформления"
                onClick={() => {
                  if (window.innerWidth < 640) {
                    const order = ['dark', 'light', 'system'] as const;
                    const cur = order.indexOf((settings.theme ?? 'system') as (typeof order)[number]);
                    library.setSettings({ theme: order[(cur + 1) % 3] });
                  } else {
                    setThemeMenu((v) => !v);
                  }
                }}
              >
                {settings.theme === 'light' ? <IconSun size={17} /> : settings.theme === 'dark' ? <IconMoon size={17} /> : <IconMonitor size={17} />}
              </button>
              {themeMenu ? (
                <div className="theme-menu" role="menu">
                  {(['dark', 'light', 'system'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="menuitem"
                      className={`theme-menu__item ${settings.theme === m ? 'is-active' : ''}`}
                      onClick={() => {
                        library.setSettings({ theme: m });
                        setThemeMenu(false);
                      }}
                    >
                      {m === 'dark' ? '🌙 Тёмная' : m === 'light' ? '☀️ Светлая' : '🖥️ Системная'}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {/* откат 30.09: закладки/настройки видны и гостям — данные локальные,
                переживают перезагрузки (localStorage, базовый скоуп). */}
            <Link className="icon-btn header__icon" href="/profile/bookmarks" aria-label={`Закладки (${bookmarks.length})`} title="Закладки">
              <span className="sr-only">Закладки</span>
              <IconBookmark size={17} />
              {bookmarks.length > 0 ? <span className="header__count">{bookmarks.length}</span> : null}
            </Link>
            <Link className="icon-btn header__icon" href="/profile/settings" aria-label="Настройки" title="Настройки">
              <span className="sr-only">Настройки плеера и интерфейса</span>
              <IconSettings size={17} />
            </Link>
          </div>
        </div>
      </header>
      {/* Аудит 30.09: условный монтаж — состояние палитры свежее при каждом открытии
          (сброс через mount, а не эффектом) + чанк грузится при первом открытии. */}
      {paletteOpen ? <CommandPalette open onClose={() => setPaletteOpen(false)} /> : null}
    </>
  );
}
