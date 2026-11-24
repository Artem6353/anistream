'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applyAuthTokens, exchangeAuthCode, notifyAuthChange } from '@/lib/sync';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { mirrorSessionToLegacy } from '@/lib/auth/session-bridge';

/**
 * Callback OAuth (Google) и подтверждения email.
 *
 * Основной путь — Supabase SDK: `exchangeCodeForSession` кладёт сессию в cookies
 * (@supabase/ssr), поэтому её видят серверные компоненты и proxy. Legacy-ветка
 * (`exchangeAuthCode` через REST + токены в localStorage) оставлена фолбэком для
 * сборок без SDK; implicit-флоу с токенами в хэше — deprecated, но пока поддержан.
 */
export default function AuthCallbackPage({ next = '/profile' }: { next?: string }) {
  const router = useRouter();
  /* B2-C: ошибку OAuth/подтверждения, возвращённую в preview, показываем в
     оболочке preview. Production-путь и адрес callback не меняются. */
  const preview = next.startsWith('/preview/aninova-3');
  const done = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      const search = new URLSearchParams(window.location.search);
      const target = safeTarget(search.get('next') ?? next);
      const code = search.get('code');

      if (code) {
        const supabase = getBrowserSupabase();
        if (supabase) {
          const { data, error: sdkError } = await supabase.auth.exchangeCodeForSession(code);
          if (!sdkError) {
            mirrorSessionToLegacy(data.session);
            notifyAuthChange();
            router.replace(target);
            return;
          }
          /* Код мог быть получен legacy-клиентом (без cookie-verifier) — пробуем REST. */
        }
        const res = await exchangeAuthCode(code);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        notifyAuthChange();
        router.replace(target);
        return;
      }

      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const access = params.get('access_token');
      if (access) {
        applyAuthTokens({
          access_token: access,
          refresh_token: params.get('refresh_token') ?? undefined,
          expires_in: params.get('expires_in') ? Number(params.get('expires_in')) : undefined,
        });
        notifyAuthChange();
        router.replace(target);
        return;
      }

      setError(
        search.get('error_description') ||
          params.get('error_description') ||
          'Нет кода авторизации в адресе — вернитесь и повторите вход',
      );
    })();
  }, [router, next]);

  return (
    <div className={preview ? 'a3-wrap a3-auth-callback' : 'container empty-state'}>
      {error ? (
        <>
          <h1 className={preview ? 'a3-h1' : undefined}>Не удалось завершить вход</h1>
          <p className={preview ? 'a3-muted' : undefined}>{error}</p>
          <Link
            className={preview ? 'a3-btn a3-btn--primary' : 'btn btn--outline'}
            href={preview ? `/preview/aninova-3/auth?next=${encodeURIComponent(next)}` : '/auth'}
          >
            Попробовать снова
          </Link>
        </>
      ) : (
        <>
          <h1 className={preview ? 'a3-h1' : undefined}>Завершаем вход…</h1>
          <p className={preview ? 'a3-muted' : undefined}>Секунду — проверяем ответ провайдера.</p>
        </>
      )}
    </div>
  );
}

/** Только внутренние пути: `next` приходит из URL и не должен уводить на другой домен. */
function safeTarget(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/profile';
  return value;
}
