'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getToken, isSessionValid, supaWhoami } from '@/lib/sync';
import { myFollowing } from '@/lib/social-graph';
import { timeAgo } from '@/lib/format';

interface FeedItem {
  type: 'watch' | 'review';
  ts: number;
  user: string;
  avatar: string | null;
  slug: string;
  episode?: number;
  text?: string;
}

/** Лента активности подписок (ТЗ блок 20.1). */
export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [state, setState] = useState<'loading' | 'anon' | 'empty' | 'ok'>('loading');

  useEffect(() => {
    (async () => {
      if (!isSessionValid()) {
        setState('anon');
        return;
      }
      const me = await supaWhoami().catch(() => null);
      if (!me) {
        setState('anon');
        return;
      }
      const uids = (await myFollowing().catch(() => [])).filter((id) => id !== me);
      if (!uids.length) {
        setState('empty');
        setItems([]);
        return;
      }
      /* Аудит 30.09 (P0-1): сервер проверяет подписки по JWT из Authorization —
         токен берём ПОСЛЕ myFollowing() (supaRest внутри уже обновил его при необходимости). */
      const token = getToken();
      const r = await fetch('/api/social/feed', {
        method: 'POST',
        body: JSON.stringify({ uids }),
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      setItems(j?.items ?? []);
      setState('ok');
    })();
  }, []);

  return (
    <div className="container feed">
      <h1>Лента</h1>
      {state === 'anon' ? (
        <div className="empty-state">
          <h2>Нужен вход</h2>
          <p>Лента показывает активность тех, на кого вы подписаны. Войдите, чтобы подписываться.</p>
        </div>
      ) : null}
      {state === 'empty' ? (
        <div className="empty-state">
          <h2>Пока пусто</h2>
          <p>Подпишитесь на пользователей — их просмотры и отзывы появятся здесь.</p>
        </div>
      ) : null}
      {items?.length ? (
        <ul className="feed__list">
          {items.map((it, i) => (
            <li className="feed__item" key={`${it.ts}-${i}`}>
              {it.avatar ? <img className="feed__avatar" src={it.avatar} alt="" /> : <span className="feed__avatar feed__avatar--guest">{it.user.slice(0, 1).toUpperCase()}</span>}
              <span className="feed__text">
                <strong>{it.user}</strong>{' '}
                {it.type === 'watch' ? (
                  <>
                    смотрит <Link href={`/anime/${it.slug}/${it.episode ?? 1}`}>{it.slug}</Link> · серия {it.episode}
                  </>
                ) : (
                  <>
                    отзыв на <Link href={`/anime/${it.slug}#reviews`}>{it.slug}</Link>: «{it.text}…»
                  </>
                )}
                <small> · {timeAgo(it.ts)}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : state === 'ok' ? (
        <p className="stats__empty">Активности пока нет — подписки ещё ничего не смотрели публично.</p>
      ) : null}
    </div>
  );
}
