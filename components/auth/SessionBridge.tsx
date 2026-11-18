'use client';

import { useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { clearLegacySession, mirrorSessionToLegacy } from '@/lib/auth/session-bridge';
import { notifyAuthChange } from '@/lib/auth-gate';

/**
 * Держит legacy-слой (lib/sync.ts) в согласии с cookie-сессией Supabase.
 *
 * Зачем отдельный компонент: сессия в cookies обновляется SDK по таймеру, а виджеты
 * (шапка, достижения, DM, списки) читают её из legacy-слоя. Подписка на
 * onAuthStateChange покрывает все случаи сразу: вход, refresh, выход в другой вкладке.
 * Рендерить нечего — компонент только синхронизирует состояние.
 */
export function SessionBridge() {
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let alive = true;

    // Первичная гидратация: после перезагрузки страницы cookie-сессия уже есть.
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        mirrorSessionToLegacy(data.session);
        notifyAuthChange();
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'SIGNED_OUT' || !session) {
        clearLegacySession();
        notifyAuthChange();
        return;
      }
      mirrorSessionToLegacy(session);
      notifyAuthChange();
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
