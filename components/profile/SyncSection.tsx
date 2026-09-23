'use client';

import { useState } from 'react';
import { library, useLibrary } from '@/lib/library';
import { signIn, signUp, saveToken, clearToken, pushLocal, pullRemote, syncConfigured, getToken } from '@/lib/sync';
import { useToast } from '@/components/ui/Toaster';

/** Аккаунт и синхронизация списков/истории между устройствами (ТЗ 2.2). */
export function SyncSection() {
  const { lists, history } = useLibrary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [logged, setLogged] = useState(Boolean(getToken()));
  const [busy, setBusy] = useState('');
  const toast = useToast();

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

  const act = async (fn: () => Promise<void>, label: string) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ошибка');
    }
    setBusy('');
  };

  return (
    <section className="settings__card">
      <h2>Аккаунт и синхронизация</h2>
      {logged ? (
        <>
          <p className="settings__note">Вы вошли. Списки и история могут синхронизироваться между устройствами.</p>
          <div className="settings__actions">
            <button
              className="btn btn--primary btn--md"
              disabled={!!busy}
              onClick={() =>
                act(async () => {
                  await pushLocal(lists, history);
                  toast('Загружено в облако');
                }, 'push')
              }
            >
              {busy === 'push' ? '…' : 'Отправить локальные данные'}
            </button>
            <button
              className="btn btn--outline btn--md"
              disabled={!!busy}
              onClick={() =>
                act(async () => {
                  const remote = await pullRemote();
                  Object.entries(remote.lists).forEach(([slug, status]) => library.setListStatus(slug, status as never));
                  toast('Скачано из облака');
                }, 'pull')
              }
            >
              {busy === 'pull' ? '…' : 'Скачать из облака'}
            </button>
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
          </div>
        </>
      ) : (
        <form
          className="reviews__form"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const j = await signIn(email, password);
              saveToken(j.access_token);
              setLogged(true);
              toast('Вход выполнен');
            }, 'in');
          }}
        >
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
                  await signUp(email, password);
                  toast('Аккаунт создан (подтвердите email, если включено)');
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
