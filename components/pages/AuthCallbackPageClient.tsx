'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyAuthTokens, exchangeAuthCode, notifyAuthChange } from '@/lib/sync';

/**
 * Callback Google OAuth (ТЗ блок 15).
 * Аудит 30.09 (P1-8): основной флоу — PKCE (?code=…): код обменивается на
 * сессию через exchangeAuthCode() вместе с code_verifier из localStorage;
 * токены больше НЕ путешествуют в URL. Legacy-ветка (implicit: токены в хэше
 * #access_token=…) сохранена как фолбэк для проектов Supabase, где PKCE-флоу
 * выключен, — помечена deprecated и будет удалена после миграции настроек.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    /* Одноразовый mount-флоу (done-ref): весь код ниже — асинхронный, setState
       не вызывается синхронно в теле эффекта. */
    void (async () => {
      const search = new URLSearchParams(window.location.search);
      const code = search.get('code');

      // 1) PKCE: обмен authorization code на сессию
      if (code) {
        const res = await exchangeAuthCode(code);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        notifyAuthChange();
        router.replace('/profile/settings');
        return;
      }

      // 2) deprecated legacy implicit-флоу: токены в хэше URL
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const access = params.get('access_token');
      if (access) {
        applyAuthTokens({
          access_token: access,
          refresh_token: params.get('refresh_token') ?? undefined,
          expires_in: params.get('expires_in') ? Number(params.get('expires_in')) : undefined,
        });
        notifyAuthChange();
        router.replace('/profile/settings');
        return;
      }

      setError(search.get('error_description') || params.get('error_description') || 'Нет кода авторизации в адресе — вернитесь и повторите вход');
    })();
  }, [router]);

  return (
    <div className="container empty-state">
      <h1>{error ? 'Не удалось войти' : 'Входим…'}</h1>
      {error ? <p>{error}</p> : <p>Обмениваем код авторизации и открываем профиль.</p>}
    </div>
  );
}
