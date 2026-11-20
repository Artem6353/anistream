'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/library';
import type { CardTitle } from '@/lib/types';
import { PosterArt } from '@/components/anime/PosterArt';
import { A3Card } from './A3Card';
import { useA3Ui } from './A3Ui';
import { formatTime } from '@/lib/format';
import { IconBookmark, IconClock, IconPlay, IconSettings, IconTv } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';

type Row = CardTitle;

const TABS = [
  { id: 'history', label: 'История', icon: IconClock },
  { id: 'bookmarks', label: 'Закладки', icon: IconBookmark },
  { id: 'settings', label: 'Настройки', icon: IconSettings },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function A3Profile() {
  const { history, bookmarks, lists, settings } = useLibrary();
  const { tv, setTv } = useA3Ui();
  const [tab, setTab] = useState<TabId>('history');
  const [rows, setRows] = useState<Row[]>([]);

  const slugs = useMemo(() => [...new Set([...history.map((h) => h.slug), ...bookmarks])].slice(0, 60), [history, bookmarks]);
  const key = slugs.join(',');

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/titles?slugs=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: Row[] }) => setRows(data.items ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [key]);

  const watched = history.length;
  const seconds = history.reduce((n, h) => n + Math.max(0, h.position), 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`a3-tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="a3-profile">
      <header className="a3-profile__head">
        <div className="a3-avatar" aria-hidden>
          А
        </div>
        <div>
          <p className="a3-kicker">Локальный профиль · без аккаунта</p>
          <h1 className="a3-h1">{settings.displayName?.trim() || 'Гость AniNova'}</h1>
          <p className="a3-muted">
            История и закладки хранятся в этом браузере. <Link href="/auth">Войти в аккаунт</Link> — на текущем сайте.
          </p>
        </div>
      </header>

      <dl className="a3-stats">
        <div>
          <dt>Серий в истории</dt>
          <dd>{watched}</dd>
        </div>
        <div>
          <dt>Время просмотра</dt>
          <dd>
            {hours > 0 ? `${hours} ч ` : ''}
            {minutes} мин
          </dd>
        </div>
        <div>
          <dt>Закладок</dt>
          <dd>{bookmarks.length}</dd>
        </div>
        <div>
          <dt>В списках</dt>
          <dd>{Object.keys(lists).length}</dd>
        </div>
      </dl>

      <div className="a3-tabs" role="tablist" aria-label="Профиль" onKeyDown={onTabKey}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`a3-tab-${id}`}
            className="a3-tab"
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={`a3-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            <Icon size={16} /> {label}
            {id === 'history' && watched ? <span className="a3-tab__count">{watched}</span> : null}
            {id === 'bookmarks' && bookmarks.length ? <span className="a3-tab__count">{bookmarks.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <div className="a3-tabpanel" role="tabpanel" id="a3-panel-history" aria-labelledby="a3-tab-history">
          {history.length ? (
            <ul className="a3-history">
              {history.map((h) => {
                const row = rows.find((r) => r.slug === h.slug);
                const pct = h.duration ? Math.min(100, Math.round((h.position / h.duration) * 100)) : 0;
                return (
                  <li key={`${h.slug}-${h.episode}-${h.updatedAt}`}>
                    <Link className="a3-history__row" href={`${ROOT}/anime/${h.slug}/${h.episode}`}>
                      <span className="a3-history__art">
                        {row ? <PosterArt src={row.poster} seed={h.slug} initials={row.romaji} alt="" width={56} /> : null}
                      </span>
                      <span className="a3-history__body">
                        <span className="a3-history__title">{row?.ru ?? h.slug}</span>
                        <span className="a3-muted">
                          Серия {h.episode} · {formatTime(h.position)}
                          {h.duration ? ` из ${formatTime(h.duration)}` : ''}
                        </span>
                        <span className="a3-progress" aria-hidden>
                          <span style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                      <span className="a3-history__play" aria-hidden>
                        <IconPlay size={16} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="a3-empty">
              <p className="a3-empty__title">История пуста</p>
              <p className="a3-muted">Откройте любой тайтл и запустите серию — прогресс появится здесь автоматически.</p>
              <Link className="a3-btn a3-btn--primary" href={`${ROOT}/catalog`}>
                В каталог
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'bookmarks' ? (
        <div className="a3-tabpanel" role="tabpanel" id="a3-panel-bookmarks" aria-labelledby="a3-tab-bookmarks">
          {bookmarks.length ? (
            <div className="a3-grid a3-grid--compact">
              {bookmarks
                .map((slug) => rows.find((r) => r.slug === slug))
                .filter((r): r is Row => !!r)
                .map((r) => <A3Card key={r.slug} title={r} />)}
            </div>
          ) : (
            <div className="a3-empty">
              <p className="a3-empty__title">Закладок пока нет</p>
              <p className="a3-muted">Кнопка «В закладки» есть на странице каждого тайтла.</p>
              <Link className="a3-btn a3-btn--primary" href={`${ROOT}/catalog`}>
                Найти тайтл
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="a3-tabpanel" role="tabpanel" id="a3-panel-settings" aria-labelledby="a3-tab-settings">
          <div className="a3-settings">
            <label className="a3-switch">
              <span>
                <strong>ТВ-режим</strong>
                <span className="a3-muted">Крупные цели, подсказка и управление стрелками</span>
              </span>
              <input type="checkbox" checked={tv} onChange={(e) => setTv(e.target.checked)} />
            </label>
            <label className="a3-switch">
              <span>
                <strong>Автопереход к следующей серии</strong>
                <span className="a3-muted">Используется действующим плеером</span>
              </span>
              <input
                type="checkbox"
                checked={settings.autoplayNext}
                onChange={async (e) => {
                  const { library } = await import('@/lib/library');
                  library.setSettings({ autoplayNext: e.target.checked });
                }}
              />
            </label>
            <label className="a3-switch">
              <span>
                <strong>Пропускать опенинг</strong>
                <span className="a3-muted">Если тайминги доступны</span>
              </span>
              <input
                type="checkbox"
                checked={!!settings.skipIntro}
                onChange={async (e) => {
                  const { library } = await import('@/lib/library');
                  library.setSettings({ skipIntro: e.target.checked });
                }}
              />
            </label>
            <p className="a3-muted">
              <IconTv size={15} /> Настройки хранятся локально, как и в текущем сайте. Серверные изменения не выполняются.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
