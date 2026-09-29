'use client';

import Link from 'next/link';
import { ACH_BY_ID } from '@/lib/achievements';
import { WriteDmButton } from './WriteDmButton';

export interface ReviewAuthorInfo {
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  pinned?: string[] | null;
  episodes?: number;
}

/** Статус уровня по числу просмотренных серий (ТЗ блок 17). */
export function levelByEpisodes(ep: number): [string, string] {
  if (ep >= 1000) return ['👑', 'Легенда'];
  if (ep >= 501) return ['💎', 'Ветеран'];
  if (ep >= 101) return ['🥇', 'Опытный'];
  if (ep >= 11) return ['🥈', 'Любитель'];
  return ['🥉', 'Новичок'];
}

/** Автор отзыва: аватар 32px, имя-ссылка, 1–2 pinned-бейджа, уровень.
    Аноним (без профиля) — инициал + «Гость».
    Фича 29.09: uid — device/auth id владельца отзыва; если аккаунта с username
    нет, имя ведёт на публичный профиль активности /reviewer/[uid]. */
export function ReviewAuthor({ author, name, uid }: { author?: ReviewAuthorInfo | null; name: string; uid?: string | null }) {
  if (!author) {
    return (
      <span className="review__author">
        <span className="review__avatar review__avatar--guest">{(name || 'Г').slice(0, 1).toUpperCase()}</span>
        {uid ? (
          <Link className="review__author-name" href={`/reviewer/${encodeURIComponent(uid)}`}>
            {name || 'Гость'}
          </Link>
        ) : (
          <span className="review__author-name">{name || 'Гость'}</span>
        )}
      </span>
    );
  }

  const displayName = author.username || name || 'Гость';
  const initial = displayName.slice(0, 1).toUpperCase();
  const [emoji, label] = levelByEpisodes(author.episodes ?? 0);
  const badges = (author.pinned ?? []).slice(0, 2).map((id) => ACH_BY_ID.get(id)).filter(Boolean);

  return (
    <span className="review__author">
      {author.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- аватар из Storage, 32px
        <img className="review__avatar" src={author.avatar_url} alt="" width={32} height={32} />
      ) : (
        <span className="review__avatar review__avatar--guest">{initial}</span>
      )}
      {author.username ? (
        <a className="review__author-name" href={`/profile/${encodeURIComponent(author.username)}`}>
          {displayName}
        </a>
      ) : author.user_id || uid ? (
        <Link className="review__author-name" href={`/reviewer/${encodeURIComponent(author.user_id ?? uid ?? '')}`}>
          {displayName}
        </Link>
      ) : (
        <span className="review__author-name">{displayName}</span>
      )}
      {author.user_id ? <WriteDmButton compact targetId={author.user_id} targetName={author.username ?? name} /> : null}
      {badges.length ? (
        <span className="review__badges">
          {badges.map((b) => (
            <span key={b!.id} className="badge-mini" title={b!.desc}>
              {b!.title}
            </span>
          ))}
        </span>
      ) : null}
      <span className="review__level" title={`Уровень: ${label} (${author.episodes ?? 0} серий)`}>
        {emoji} {label}
      </span>
    </span>
  );
}