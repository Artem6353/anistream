'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { clearLegacySession } from '@/lib/auth/session-bridge';
import { notifyAuthChange } from '@/lib/auth-gate';
import { useToast } from '@/components/ui/Toaster';

/** Выход из аккаунта: серверный route чистит httpOnly-cookies, клиент — legacy-токены. */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  return (
    <button
      type="button"
      className="ds-btn ds-btn--ghost ds-btn--sm"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          // SDK чистит cookie-сессию; route-хендлер добивает серверную часть
          // (на случай, если cookie остались после истечения access_token).
          await getBrowserSupabase()?.auth.signOut();
          await fetch('/api/auth/signout', { method: 'POST' });
          clearLegacySession();
          notifyAuthChange();
          toast('Вы вышли из аккаунта');
          router.replace('/');
          router.refresh();
        } catch {
          toast.error('Не удалось выйти — попробуйте ещё раз');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="ds-spinner" aria-hidden="true" /> : null}
      Выйти
    </button>
  );
}
