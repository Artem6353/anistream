import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPageClient } from '@/components/auth/AuthPageClient';
import { getServerUser } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { safeNextPath } from '@/lib/supabase/middleware';

export const metadata: Metadata = {
  title: 'Вход и регистрация',
  description: 'Войдите в AniNova: списки, история просмотров, достижения и AniDNA синхронизируются между устройствами.',
  alternates: { canonical: '/auth' },
  robots: { index: false, follow: true },
  openGraph: { type: 'website', url: '/auth', locale: 'ru_RU', siteName: 'AniNova' },
};

/** Страница входа: серверная обёртка (metadata + проверка сессии) и клиентская форма. */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string; error?: string; error_description?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  // Уже вошедшего не держим на форме: сразу в кабинет (или туда, куда шли).
  if (supabaseConfigured()) {
    const user = await getServerUser();
    if (user) redirect(next);
  }

  const reason = params.reason === 'protected' || params.reason === 'expired' ? params.reason : null;
  const oauthError = params.error_description ?? params.error ?? null;

  return (
    <div className="container ds-page auth-page">
      <div className="auth-page__glow" aria-hidden="true" />
      <div className="auth-page__grid">
        <section className="auth-page__pitch">
          <p className="ds-eyebrow">AniNova · аккаунт</p>
          <h2 className="auth-page__pitch-title">
            Твой аниме-профиль, <span className="ds-text-grad">который помнит всё</span>
          </h2>
          <ul className="auth-page__benefits">
            <li>
              <span aria-hidden="true">📚</span> Списки и прогресс синхронизируются между телефоном и ПК
            </li>
            <li>
              <span aria-hidden="true">🧬</span> <strong>AniDNA</strong> — личный архетип, любимые жанры и часы просмотра
            </li>
            <li>
              <span aria-hidden="true">🏆</span> Достижения за марафоны, онгоинги и редкие жанры
            </li>
            <li>
              <span aria-hidden="true">✍️</span> Отзывы с оценкой и реакциями — под своим ником
            </li>
          </ul>
          <p className="ds-muted auth-page__again">
            Уже с нами? Войдите — прогресс подтянется автоматически.
            <br />
            <Link className="auth-page__link" href="/catalog">
              Или просто посмотреть каталог →
            </Link>
          </p>
        </section>

        <AuthPageClient next={next} reason={reason} oauthError={oauthError} />
      </div>
    </div>
  );
}
