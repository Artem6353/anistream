import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { FollowButton } from '@/components/social/FollowButton';
import { WriteDmButton } from '@/components/social/WriteDmButton';
import { loadPreviewPublicProfile } from '@/lib/aninova3/public-profile';
import { getServerUser } from '@/lib/supabase/server';
import { PREVIEW_PROFILE_PATH, PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Публичный профиль',
  description: 'Публичная страница участника AniNova.',
  robots: { index: false, follow: false },
};

/**
 * B2-C: публичный профиль в preview.
 *
 * Показываем только публичные поля и счётчики. Списки, история и прогресс
 * владельца сюда не запрашиваются и не могут утечь через этот маршрут.
 */
export default async function PreviewPublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const bundle = await loadPreviewPublicProfile(username);

  if (bundle.error) {
    return (
      <div className="a3-wrap a3-public-profile">
        <div className="a3-account-error" role="alert">
          <p className="a3-kicker">Публичный профиль</p>
          <h1 className="a3-h1">Профиль сейчас недоступен</h1>
          <p className="a3-muted">
            Не удалось получить публичные данные. Это не значит, что пользователя нет — попробуйте открыть страницу позже.
          </p>
          <div className="a3-account-error__actions">
            <Link className="a3-btn a3-btn--primary" href={PREVIEW_ROOT}>
              На главную
            </Link>
            <Link className="a3-btn" href={`${PREVIEW_ROOT}/catalog`}>
              Каталог
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!bundle.profile) notFound();

  const profile = bundle.profile;
  const displayName = profile.username ?? username;
  const viewer = await getServerUser();
  const isOwn = Boolean(viewer && viewer.id === profile.user_id);

  return (
    <div className="a3-wrap a3-public-profile">
      <nav className="a3-account__crumbs" aria-label="Навигация по публичному профилю">
        <Link className="a3-account__back" href={PREVIEW_PROFILE_PATH}>
          <span aria-hidden="true">←</span> Мой кабинет
        </Link>
        <Link className="a3-account__back" href={`${PREVIEW_ROOT}/catalog`}>
          Каталог
        </Link>
        <span className="a3-account__crumb-current" aria-current="page">
          {displayName}
        </span>
      </nav>

      <ProfileHeader
        profile={profile}
        followers={bundle.followers}
        following={bundle.following}
        achievementsHref={null}
        own={isOwn}
        preview
      >
        {!isOwn ? (
          <div className="pheader__actions a3-public-profile__actions">
            <FollowButton targetId={profile.user_id} />
            <WriteDmButton targetId={profile.user_id} targetName={displayName} preview />
          </div>
        ) : null}
      </ProfileHeader>

      <section className="a3-public-profile__privacy" aria-labelledby="public-privacy-title">
        <p className="a3-kicker">Приватность</p>
        <h2 id="public-privacy-title">Списки и история остаются личными</h2>
        <p>
          На этой странице видны только имя, аватар, био, закреплённые достижения и счётчики подписок.
          Списки, история просмотров и прогресс доступны только владельцу кабинета.
        </p>
      </section>
    </div>
  );
}
