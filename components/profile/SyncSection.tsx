'use client';

import { useEffect, useState } from 'react';
import { library, useLibrary } from '@/lib/library';
import {
  signIn,
  signUp,
  clearToken,
  pushLocal,
  pullRemote,
  syncConfigured,
  isSessionValid,
  refreshAccessToken,
  SessionExpiredError,
} from '@/lib/sync';
import { useToast } from '@/components/ui/Toaster';

/** Аккаунт и синхронизация списков/истории между устройствами (ТЗ 2.2 + refresh_token). */
export function SyncSection() {
  const { lists, history } = useLibrary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState('');
  const toast = useToast();

  // Восстанавливаем состояние входа на клиенте (SSR-safe).
  // Если access_token истёк, но есть refresh_token — молча обновляем сессию.
  useEffect(() => {
    if (!syncConfigured()) return;
    if (isSessionValid()) {
      setLogged(true);
      return;
    }
    void refreshAccessToken().then((t) => setLogged(Boolean(t)));
  }, []);

  if (!syncConfigured()) {
    return (
      <section className="settings__card">
        <h2>Аккаунт и синхронизация</h2>
        <p className="settings__note">
          Общие аккаунты выключены: задайте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY и выполните
          supabase/schema.sql — появится вход и синхронизация списков между устройствами.
        </p>
      </section>
    );
  }

  const failText = (e: unknown): string => {
    if (e instanceof SessionExpiredError || (e instanceof Error && /session expired/i.test(e.message))) {
      setLogged(false);
      return 'Сессия истекла, войдите заново';
    }
    return e instanceof Error ? e.message : 'ошибка';
  };

  const act = async (fn: () => Promise<void>, label: string) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(failText(e));
    }
    setBusy('');
  };

  return (
    <section className="settings__card">
      <h2>Аккаунт и синхронизация</h2>
      <p className="settings__note">
        {logged
          ? 'Вы вошли. Списки и история могут синхронизироваться между устройствами.'
          : 'Войдите в аккаунт — после этого кнопки «Отправить» и «Скачать» станут активны.'}
      </p>
      <div className="settings__actions">
        <button
          className="btn btn--primary btn--md"
          disabled={!logged || !!busy}
          title={logged ? undefined : 'Войдите в аккаунт'}
          onClick={() =>
            act(async () => {
              const n = await pushLocal(lists, history);
              toast(`Сохранено ${n} записей`);
            }, 'push')
          }
        >
          {busy === 'push' ? '…' : 'Отправить локальные данные'}
        </button>
        <button
          className="btn btn--outline btn--md"
          disabled={!logged || !!busy}
          title={logged ? undefined : 'Войдите в аккаунт'}
          onClick={() =>
            act(async () => {
              const remote = await pullRemote();
              Object.entries(remote.lists).forEach(([slug, status]) => library.setListStatus(slug, status as never));
              library.mergeHistory(remote.history);
              toast(`Загружено ${remote.count} записей`);
            }, 'pull')
          }
        >
          {busy === 'pull' ? '…' : 'Скачать из облака'}
        </button>
        {logged && (
          <button
            className="btn btn--ghost btn--md"
            onClick={() => {
              clearToken();
              setLogged(false);
              toast('Вы вышли');
            }}
          >
            Выйти
          </button>
        )}
      </div>
      {!logged && (
        <form
          className="reviews__form"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await signIn(email, password);
              setLogged(true);
              toast('Вход выполнен');
            }, 'in');
          }}
        >
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="input"
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="settings__actions">
            <button className="btn btn--primary btn--md" type="submit" disabled={!!busy}>
              Войти
            </button>
            <button
              className="btn btn--outline btn--md"
              type="button"
              disabled={!!busy}
              onClick={() =>
                act(async () => {
                  const j = await signUp(email, password);
                  // Аудит блок 4: после регистрации пользователь залогинен сразу.
                  // Если Supabase-проект с отключённым Confirm email — signUp сам вернёт
                  // токены; иначе пробуем signIn сразу (без подтверждения он успешен).
                  if (!j.access_token) {
                    try {
                      await signIn(email, password);
                    } catch {
                      /* включено подтверждение email — вход после письма */
                    }
                  }
                  setLogged(isSessionValid());
                  toast(isSessionValid() ? 'Аккаунт создан — вы вошли' : 'Аккаунт создан: подтвердите email и войдите');
                }, 'up')
              }
            >
              Регистрация
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
