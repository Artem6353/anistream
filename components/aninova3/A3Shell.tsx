'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { A3Header } from './A3Header';
import { A3Footer } from './A3Footer';
import { A3MobileNav } from './A3MobileNav';
import { A3Search } from './A3Search';
import { useA3Ui } from './A3Ui';
import { RemoteNav } from './remote/RemoteNav';

/** Адаптивный shell: шапка, контент, футер, нижняя навигация, поиск, remote-слой. */
export function A3Shell({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState(false);
  const { tv, hint, dismissHint } = useA3Ui();
  const pathname = usePathname() ?? '';
  const immersive = pathname.endsWith('/read');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      e.preventDefault();
      setSearch(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`a3${immersive ? ' a3--immersive' : ''}`} data-tv={tv ? 'true' : 'false'} data-a3-root data-a3-nav-root>
      <a className="a3-skip" href="#a3-content" data-a3-skip-focus>
        К содержанию
      </a>
      {immersive ? null : <A3Header onSearch={() => setSearch(true)} searchOpen={search} />}
      <main id="a3-content" className="a3-main">
        {children}
      </main>
      {immersive ? null : <A3Footer />}
      {immersive ? null : <A3MobileNav />}
      <A3Search open={search} onClose={() => setSearch(false)} />
      <RemoteNav enabled={tv} />
      {hint ? <A3Hint onClose={dismissHint} /> : null}
    </div>
  );
}

function A3Hint({ onClose }: { onClose: () => void }) {
  return (
    <div className="a3-hint" role="status">
      <span className="a3-pulse" aria-hidden />
      <span>
        <strong>ТВ-режим.</strong> Стрелки — перемещение · OK — открыть · Назад — вернуться
      </span>
      <button className="a3-hint__close" type="button" onClick={onClose}>
        Понятно
      </button>
    </div>
  );
}
