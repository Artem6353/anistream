'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ACH_BY_ID } from '@/lib/achievements';
import { isSessionValid, supaWhoami } from '@/lib/sync';

export interface PublicProfile {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  pinned_achievements: string[] | null;
}

/** 6 пресетных градиентов баннера (бесплатно, без загрузки файла). */
export const BANNER_GRADIENTS = [
  'linear-gradient(120deg, #8b5cf6, #f472b6)',
  'linear-gradient(120deg, #0ea5e9, #22d3ee)',
  'linear-gradient(120deg, #10b981, #84cc16)',
  'linear-gradient(120deg, #f59e0b, #ef4444)',
  'linear-gradient(120deg, #6366f1, #0ea5e9)',
  'linear-gradient(120deg, #334155, #0f172a)',
];

/** Шапка профиля (ТЗ блок 16): баннер (фото или градиент), аватар 120px или инициал
    на акцентном градиенте, био, до 3 бейджей-ачивок, счётчики подписок (блок 20). */
export function ProfileHeader({
  profile,
  displayName,
  followers,
  following,
  children,
}: {
  profile: PublicProfile | null;
  displayName?: string;
  followers?: number;
  following?: number;
  children?: React.ReactNode;
}) {
  const name = profile?.username || displayName || 'Гость';
  const initial = name.slice(0, 1).toUpperCase();
  const banner = profile?.banner_url;
  const bannerStyle = banner?.startsWith('grad:')
    ? { background: BANNER_GRADIENTS[Number(banner.slice(5)) % BANNER_GRADIENTS.length] }
    : { background: BANNER_GRADIENTS[0] };
  const badges = (profile?.pinned_achievements ?? []).slice(0, 3).map((id) => ACH_BY_ID.get(id)).filter(Boolean);
  // ссылки на статистику/ачивки — только на собственном профиле (данные локальные)
  const [own, setOwn] = useState(false);
  useEffect(() => {
    if (!profile?.user_id || !isSessionValid()) return;
    supaWhoami()
      .then((uid) => setOwn(uid === profile.user_id))
      .catch(() => {});
  }, [profile?.user_id]);
  return (
    <header className="pheader">
      <div className="pheader__banner" style={bannerStyle}>
        {banner && !banner.startsWith('grad:') ? <img src={banner} alt="" /> : null}
      </div>
      <div className="pheader__body">
        <span className="pheader__avatar" aria-label={`Аватар: ${name}`}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initial}</span>}
        </span>
        <div className="pheader__info">
          <h1 className="pheader__name">
            {name}
            {badges.length ? (
              <span className="pheader__badges">
                {badges.map((b) => (
                  <span key={b!.id} className="badge-mini" title={b!.desc}>
                    {b!.title}
                  </span>
                ))}
              </span>
            ) : null}
          </h1>
          {own ? (
            <span className="pheader__links">
              <Link className="btn btn--outline btn--md" href="/profile/stats">
                📊 Статистика
              </Link>
            </span>
          ) : null}
          {profile?.bio ? <p className="pheader__bio">{profile.bio}</p> : null}
          {followers !== undefined || following !== undefined ? (
            <p className="pheader__counts">
              <span>Подписчики: {followers ?? 0}</span>
              <span>Подписки: {following ?? 0}</span>
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </header>
  );
}
