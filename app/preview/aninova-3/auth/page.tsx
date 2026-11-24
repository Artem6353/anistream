import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPageClient } from '@/components/auth/AuthPageClient';
import { getServerUser } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { PREVIEW_ROOT, previewAuthNext } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Вход и регистрация',
  description: 'Вход в аккаунт AniNova: списки, история и прогресс синхронизируются между устройствами.',
  robots: { index: false, follow: false },
};

/**
 * B2-C: настоящий вход AniNova в оболочке preview.
 *
 * Форма — тот же `AuthPageClient`, что и на production `/auth`: Supabase Auth,
 * валидация, Google OAuth, подтверждение email и безопасный `next`. Меняется
 * только оформление и адрес возврата — никакой второй/auth-демо системы.
 */
export default async function PreviewAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string; error?: string; error_description?: string }>;
}) {
  const params = await searchParams;
  const next = previewAuthNext(params.next);

  if (supabaseConfigured()) {
    const user = await getServerUser();
    if (user) redirect(next);
  }

  const reason = params.reason === 'protected' || params.reason === 'expired' ? params.reason : null;
  const oauthError = params.error_description ?? params.error ?? null;

  return (
    <div className="a3-wrap a3-auth-page">
      <div className="a3-auth-page__grid">
        <section className="a3-auth-page__pitch" aria-labelledby="a3-auth-title">
          <p className="a3-kicker">
            <span className="a3-pulse" aria-hidden="true" />
            Аккаунт AniNova
          </p>
          <h1 className="a3-h1" id="a3-auth-title">
            История не должна начинаться заново
          </h1>
          <p className="a3-auth-page__lead">
            Один вход — и списки, прогресс, AniDNA и достижения остаются с вами на любом устройстве.
          </p>
          <ul className="a3-auth-page__benefits">
            <li>
              <span className="a3-auth-page__dot" aria-hidden="true" />
              <span><strong>Продолжайте с той же серии.</strong> Прогресс синхронизируется между телефоном и ПК.</span>
            </li>
            <li>
              <span className="a3-auth-page__dot" aria-hidden="true" />
              <span><strong>AniDNA собирается из вашего просмотра.</strong> Архетип, жанры и часы — без ручных анкет.</span>
            </li>
            <li>
              <span className="a3-auth-page__dot" aria-hidden="true" />
              <span><strong>Списки и достижения на месте.</strong> Всё, что вы отметили, ждёт после входа.</span>
            </li>
          </ul>
          <p className="a3-auth-page__catalog">
            Ещё не готовы? <Link className="a3-link" href={`${PREVIEW_ROOT}/catalog`}>Открыть каталог</Link>
          </p>
        </section>

        <section className="a3-auth-page__panel" aria-label="Форма входа в аккаунт">
          <AuthPageClient next={next} reason={reason} oauthError={oauthError} preview />
          <p className="a3-auth-page__fineprint">
            Продолжая, вы входите в существующий аккаунт AniNova. Пароль и сессию обрабатывает Supabase Auth.
          </p>
        </section>
      </div>
    </div>
  );
}
