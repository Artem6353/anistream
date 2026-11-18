'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { STATUS_LABEL, type AniDna } from '@/lib/profile/ani-dna';
import type { HistoryRow, ListRow, ProfileRow, TitleCard } from '@/lib/profile/data';
import { formatDay, formatShortDay } from '@/lib/profile/format';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { AniDnaCard } from './AniDnaCard';
import { AccountSettings } from './AccountSettings';
import { SignOutButton } from './SignOutButton';

type TabId = 'overview' | 'lists' | 'history' | 'settings';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'overview', label: 'Обзор', icon: '🧬' },
  { id: 'lists', label: 'Мои списки', icon: '📚' },
  { id: 'history', label: 'История', icon: '🕘' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
];

export interface ProfileDashboardProps {
  email: string | null;
  createdAt: string | null;
  profile: ProfileRow | null;
  lists: ListRow[];
  history: HistoryRow[];
  titleCards: TitleCard[];
  dna: AniDna;
  dataError: string | null;
}

const LIST_ORDER = ['watching', 'completed', 'planned', 'on_hold', 'rewatching', 'dropped'] as const;

/** Кабинет: шапка профиля + табы. Каждая панель в своём error boundary. */
export function ProfileDashboard(props: ProfileDashboardProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const cards = useMemo(() => new Map(props.titleCards.map((c) => [c.slug, c])), [props.titleCards]);

  const displayName = props.profile?.username || props.email?.split('@')[0] || 'анимешник';
  const joinedDay = formatDay(props.createdAt);

  return (
    <div className="dash">
      <header className="ds-card ds-card--pad ds-card--glow dash__head">
        <div className="dash__identity">
          <span className="ds-avatar dash__avatar" aria-hidden="true">
            {props.profile?.avatar_url ? (
              // Аватар из Supabase Storage: произвольный host, вне remotePatterns next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.profile.avatar_url} alt="" width={88} height={88} />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="dash__who">
            <p className="ds-eyebrow">Личный кабинет</p>
            <h1 className="dash__name">{displayName}</h1>
            <p className="ds-muted">
              {props.email}
              {joinedDay ? ` · с ${joinedDay}` : ''}
            </p>
          </div>
        </div>

        <div className="dash__head-actions">
          {props.profile?.username ? (
            <Link className="ds-btn ds-btn--ghost ds-btn--sm" href={`/profile/${props.profile.username}`}>
              Публичный профиль
            </Link>
          ) : (
            <span className="ds-muted">Ник не задан — публичной страницы пока нет</span>
          )}
          <SignOutButton />
        </div>

        <dl className="dash__stats">
          <div>
            <dt>Часов</dt>
            <dd>{props.dna.hours.toLocaleString('ru-RU')}</dd>
          </div>
          <div>
            <dt>Серий</dt>
            <dd>{props.dna.episodes.toLocaleString('ru-RU')}</dd>
          </div>
          <div>
            <dt>Тайтлов</dt>
            <dd>{props.dna.titles}</dd>
          </div>
          <div>
            <dt>Стрик</dt>
            <dd>{props.dna.streakDays} дн.</dd>
          </div>
        </dl>
      </header>

      {props.dataError && (
        <p className="dash__alert" role="alert">
          Часть данных не загрузилась: {props.dataError}
        </p>
      )}

      <div className="dash__tabs" role="tablist" aria-label="Разделы кабинета">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`dash__tab${tab === t.id ? ' is-active' : ''}`}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="dash__panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {tab === 'overview' && (
          <ErrorBoundary label="AniDNA">
            <AniDnaCard dna={props.dna} displayName={displayName} lists={props.lists} history={props.history} cards={cards} />
          </ErrorBoundary>
        )}

        {tab === 'lists' && (
          <ErrorBoundary label="Мои списки">
            <ListsPanel lists={props.lists} cards={cards} />
          </ErrorBoundary>
        )}

        {tab === 'history' && (
          <ErrorBoundary label="История">
            <HistoryPanel history={props.history} cards={cards} />
          </ErrorBoundary>
        )}

        {tab === 'settings' && (
          <ErrorBoundary label="Настройки">
            <AccountSettings profile={props.profile} email={props.email} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

/** Списки по статусам: смотрю / просмотрено / в планах и остальные. */
function ListsPanel({ lists, cards }: { lists: ListRow[]; cards: Map<string, TitleCard> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, ListRow[]>();
    for (const row of lists) {
      const bucket = map.get(row.status) ?? [];
      bucket.push(row);
      map.set(row.status, bucket);
    }
    // Стабильный порядок: сначала «смотрю/просмотрено/в планах», затем прочее.
    const rank = (status: string) => {
      const index = LIST_ORDER.indexOf(status as (typeof LIST_ORDER)[number]);
      return index === -1 ? LIST_ORDER.length : index;
    };
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [lists]);

  if (!lists.length) {
    return (
      <div className="ds-card ds-card--pad dash__empty">
        <p className="dash__empty-emoji" aria-hidden="true">📚</p>
        <h2>Списки пока пустые</h2>
        <p className="ds-muted">Добавьте тайтл в «Смотрю» на странице аниме — он появится здесь и синхронизируется.</p>
        <Link className="ds-btn ds-btn--primary" href="/catalog">Открыть каталог</Link>
      </div>
    );
  }

  return (
    <div className="dash__groups">
      {grouped.map(([status, rows]) => (
        <section key={status} className="ds-card ds-card--pad dash__group">
          <h2 className="dash__group-title">
            {STATUS_LABEL[status] ?? status} <span className="dash__pill">{rows.length}</span>
          </h2>
          <ul className="dash__cards">
            {rows.map((row) => {
              const card = cards.get(row.slug);
              return (
                <li key={row.slug} className="dash__card">
                  <Link href={`/anime/${row.slug}`} className="dash__card-link">
                    <span className="dash__poster">
                      {card?.poster ? (
                        <Image src={card.poster} alt="" width={64} height={92} sizes="64px" />
                      ) : (
                        <span className="ds-skeleton dash__poster-skeleton" aria-hidden="true" />
                      )}
                    </span>
                    <span className="dash__card-meta">
                      <span className="dash__card-name">{card?.name ?? row.slug}</span>
                      {card?.episodes ? <span className="ds-muted">{card.episodes} серий</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** История: последние серии с прогресс-баром «сколько просмотрено». */
function HistoryPanel({ history, cards }: { history: HistoryRow[]; cards: Map<string, TitleCard> }) {
  if (!history.length) {
    return (
      <div className="ds-card ds-card--pad dash__empty">
        <p className="dash__empty-emoji" aria-hidden="true">🕘</p>
        <h2>История пуста</h2>
        <p className="ds-muted">Как только вы включите серию, она появится здесь с прогрессом.</p>
        <Link className="ds-btn ds-btn--primary" href="/catalog">Выбрать что посмотреть</Link>
      </div>
    );
  }

  return (
    <ul className="ds-card ds-card--pad dash__history">
      {history.slice(0, 24).map((row) => {
        const card = cards.get(row.slug);
        const position = Number(row.position ?? 0);
        const duration = Number(row.duration ?? 0);
        const percent = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
        const left = duration > 0 ? Math.max(0, Math.round((duration - position) / 60)) : 0;
        return (
          <li key={`${row.slug}:${row.episode}`} className="dash__history-row">
            <Link href={`/anime/${row.slug}/${row.episode}`} className="dash__history-main">
              <span className="dash__card-name">
                {card?.name ?? row.slug} · серия {row.episode}
              </span>
              <span className="ds-muted">
                {percent > 0 ? `просмотрено ${percent}%${left ? ` · осталось ~${left} мин` : ''}` : 'начато'}
                {row.updated_at ? ` · ${formatShortDay(row.updated_at) ?? ''}` : ''}
              </span>
            </Link>
            <span
              className="ds-progress dash__history-bar"
              style={{ ['--value' as string]: `${percent}%` }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Прогресс серии ${row.episode}`}
            />
          </li>
        );
      })}
      <li className="dash__history-foot ds-muted">
        Показаны последние {Math.min(24, history.length)} из {history.length}.
      </li>
    </ul>
  );
}
