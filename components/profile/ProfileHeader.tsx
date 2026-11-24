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
  achievementsHref = '/profile/achievements',
  own: ownProp,
  preview = false,
  children,
}: {
  profile: PublicProfile | null;
  displayName?: string;
  followers?: number;
  following?: number;
  /** B2-C: null скрывает ссылку на достижения в preview, где такого маршрута ещё нет. */
  achievementsHref?: string | null;
  /** B2-C: сервер уже знает владельца — не ждём клиентскую сессию. */
  own?: boolean;
  /** B2-C: сдержанные градиенты Nova Minimal вместо ярких пресетов. */
  preview?: boolean;
  children?: React.ReactNode;
}) {
  const name = profile?.username || displayName || 'Гость';
  const initial = name.slice(0, 1).toUpperCase();
  const banner = profile?.banner_url;
  const previewGradients = [
    'linear-gradient(120deg, #1b1b23, #2a2340)',
    'linear-gradient(120deg, #161b26, #202a3a)',
    'linear-gradient(120deg, #1d1b21, #302536)',
    'linear-gradient(120deg, #171d1e, #233130)',
    'linear-gradient(120deg, #1a1a26, #24203c)',
    'linear-gradient(120deg, #191a1d, #262931)',
  ];
  const gradients = preview ? previewGradients : BANNER_GRADIENTS;
  const bannerStyle = banner?.startsWith('grad:')
    ? { background: gradients[Number(banner.slice(5)) % gradients.length] }
    : { background: gradients[0] };
  const badges = (profile?.pinned_achievements ?? []).slice(0, 3).map((id) => ACH_BY_ID.get(id)).filter(Boolean);
  // ссылки на статистику/ачивки — только на собственном профиле (данные локальные)
  const [ownState, setOwnState] = useState(false);
  const own = ownProp ?? ownState;
  useEffect(() => {
    if (ownProp !== undefined || !profile?.user_id || !isSessionValid()) return;
    supaWhoami()
      .then((uid) => setOwnState(uid === profile.user_id))
      .catch(() => {});
  }, [ownProp, profile?.user_id]);
  return (
    <header className="pheader">
      <div className="pheader__banner" style={bannerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element -- пользовательский баннер из Storage (произвольный host) */}
        {banner && !banner.startsWith('grad:') ? <img src={banner} alt="" /> : null}
      </div>
      <div className="pheader__body">
        <span className="pheader__avatar" aria-label={`Аватар: ${name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- аватар из Storage */}
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
          {own && achievementsHref ? (
            <span className="pheader__links">
              <Link className="btn btn--outline btn--md" href={achievementsHref}>
                🏆 Достижения
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
