import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileDashboard } from '@/components/profile/dashboard/ProfileDashboard';
import { getServerUser } from '@/lib/supabase/server';
import { loadProfileBundle } from '@/lib/profile/data';
import { supabaseConfigured } from '@/lib/supabase/env';
import { PREVIEW_AUTH_PATH, PREVIEW_PROFILE_PATH, PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Личный кабинет',
  description: 'Списки, история просмотров, AniDNA и настройки аккаунта AniNova.',
  robots: { index: false, follow: false },
};

/**
 * B2-C: настоящий личный кабинет в preview.
 *
 * Серверный поток тот же, что на production `/profile`: `getServerUser()` +
 * `loadProfileBundle()` под cookie-сессией и RLS. Никаких демо-пользователей:
 * гость уходит на preview-вход, а данные остаются приватными.
 */
export default async function PreviewProfilePage() {
  const authHref = `${PREVIEW_AUTH_PATH}?reason=protected&next=${encodeURIComponent(PREVIEW_PROFILE_PATH)}`;

  if (!supabaseConfigured()) redirect(authHref);

  const user = await getServerUser();
  if (!user) redirect(authHref);

  const bundle = await loadProfileBundle(user.id);

  return (
    <div className="a3-wrap a3-account">
      <nav className="a3-account__crumbs" aria-label="Навигация по кабинету">
        <Link className="a3-account__back" href={PREVIEW_ROOT}>
          <span aria-hidden="true">←</span> На главную preview
        </Link>
        <span className="a3-account__crumb-current" aria-current="page">Личный кабинет</span>
      </nav>
      <ProfileDashboard
        email={user.email ?? null}
        createdAt={user.created_at ?? null}
        profile={bundle.profile}
        lists={bundle.lists}
        history={bundle.history}
        titleCards={[...bundle.titles.values()]}
        dna={bundle.dna}
        dataError={bundle.error}
        routeBase={PREVIEW_ROOT}
        preview
      />
    </div>
  );
}
