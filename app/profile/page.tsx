import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ProfileDashboard } from '@/components/profile/dashboard/ProfileDashboard';
import { getServerUser } from '@/lib/supabase/server';
import { loadProfileBundle } from '@/lib/profile/data';
import { supabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Личный кабинет',
  description: 'Списки, история просмотров, AniDNA и настройки аккаунта AniNova.',
  alternates: { canonical: '/profile' },
  robots: { index: false, follow: false },
  openGraph: { type: 'profile', url: '/profile', locale: 'ru_RU', siteName: 'AniNova' },
};

/** Личный кабинет: серверный рендер данных аккаунта, клиентский слой — только табы и формы. */
export default async function ProfilePage() {
  if (!supabaseConfigured()) {
    // Без ключей вход невозможен — ведём на страницу с понятным объяснением.
    redirect('/auth?reason=protected');
  }

  const user = await getServerUser();
  if (!user) redirect('/auth?reason=protected&next=%2Fprofile');

  const bundle = await loadProfileBundle(user.id);

  return (
    <div className="container ds-page">
      <ProfileDashboard
        email={user.email ?? null}
        createdAt={user.created_at ?? null}
        profile={bundle.profile}
        lists={bundle.lists}
        history={bundle.history}
        titleCards={[...bundle.titles.values()]}
        dna={bundle.dna}
        dataError={bundle.error}
      />
    </div>
  );
}
