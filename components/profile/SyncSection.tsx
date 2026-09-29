'use client';

import { useEffect, useState } from 'react';
import { library, useLibrary } from '@/lib/library';
import { resetAnonSession, unsubscribePush } from '@/lib/session-reset';
import {
  clearToken,
  pushLocal,
  pullRemote,
  syncConfigured,
  isSessionValid,
  refreshAccessToken,
  SessionExpiredError,
  notifyAuthChange,
} from '@/lib/sync';
import { useToast } from '@/components/ui/Toaster';

/** Аккаунт и синхронизация списков/истории между устройствами (ТЗ 2.2 + refresh_token).
    Вход/регистрация — через модалку в шапке (AuthModal). Здесь только действия
    для уже залогиненного пользователя: push/pull/logout. */
export function SyncSection() {
  const { lists, history } = useLibrary();
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState('');
  const toast = useToast();

  // Восстанавливаем состояние входа (SSR-safe) + молча обновляем сессию при наличии refresh_token.
  useEffect(() => {
    if (!syncConfigured()) return;
    if (isSessionValid()) {
      /* Hydration-safe восстановление входа из localStorage (после гидратации). */
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
          : 'Войдите через кнопку «Войти» в шапке — после этого кнопки «Отправить» и «Скачать» станут активны.'}
      </p>
      <div className="settings__actions">
        <button
          className="btn btn--primary btn--md"
          disabled={!logged || !!busy}
          title={logged ? undefined : 'Войдите через кнопку в шапке'}
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
          title={logged ? undefined : 'Войдите через кнопку в шапке'}
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
              /* баг 29.09: сброс анонимного скоупа (стрик/ачивки/статистика/бейджи)
                 и push-подписки — после выхода состояние «чистого» посетителя. */
              resetAnonSession();
              void unsubscribePush();
              setLogged(false);
              notifyAuthChange();
              toast('Вы вышли');
            }}
          >
            Выйти
          </button>
        )}
      </div>
    </section>
  );
}