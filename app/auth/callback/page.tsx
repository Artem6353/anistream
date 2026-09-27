'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyAuthTokens, notifyAuthChange } from '@/lib/sync';

/** Callback Google OAuth (ТЗ блок 15): Supabase возвращает токены в хэше URL
    (#access_token=…&refresh_token=…&expires_in=…). Сохраняем тройку ключей
    anistream:supa_* и редиректим в профиль. */
export default function AuthCallbackPage() {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    const expires = params.get('expires_in');
    if (!access) {
      setError(params.get('error_description') || 'Нет токенов в адресе — вернитесь и повторите вход');
      return;
    }
    applyAuthTokens({
      access_token: access,
      refresh_token: refresh ?? undefined,
      expires_in: expires ? Number(expires) : undefined,
    });
    notifyAuthChange();
    router.replace('/profile/settings');
  }, [router]);

  return (
    <div className="container empty-state">
      <h1>{error ? 'Не удалось войти' : 'Входим…'}</h1>
      {error ? <p>{error}</p> : <p>Сохраняем сессию и открываем профиль.</p>}
    </div>
  );
}
