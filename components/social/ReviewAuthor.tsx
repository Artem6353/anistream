'use client';

import { ACH_BY_ID } from '@/lib/achievements';

export interface ReviewAuthorInfo {
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

/** Автор отзыва: аватар 32px, имя, 1–2 pinned-бейджа, уровень.
    Аноним (без профиля) — инициал + «Гость». */
export function ReviewAuthor({ author, name }: { author?: ReviewAuthorInfo | null; name: string }) {
  if (!author || !author.username) {
    return (
      <span className="review__author">
        <span className="review__avatar review__avatar--guest">{(name || 'Г').slice(0, 1).toUpperCase()}</span>
        <span className="review__author-name">{name || 'Гость'}</span>
      </span>
    );
  }
  const [emoji, label] = levelByEpisodes(author.episodes ?? 0);
  const badges = (author.pinned ?? []).slice(0, 2).map((id) => ACH_BY_ID.get(id)).filter(Boolean);
  return (
    <span className="review__author">
      {author.avatar_url ? (
        <img className="review__avatar" src={author.avatar_url} alt="" width={32} height={32} />
      ) : (
        <span className="review__avatar review__avatar--guest">{author.username.slice(0, 1).toUpperCase()}</span>
      )}
      <span className="review__author-name">{author.username}</span>
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
