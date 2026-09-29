'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn, signInWithGoogle, isSessionValid, notifyAuthChange, takeAuthAction } from '@/lib/sync';
import { useToast } from '@/components/ui/Toaster';
import { IconGoogle } from '@/components/ui/icons';

/** Модальное окно авторизации (ТЗ блок 14): Google OAuth + email/пароль.
    Закрытие: ×, Esc, клик вне. На мобиле — bottom-sheet (CSS).
    После входа отложенное действие (лайк/отзыв/список) выполняется автоматически. */
export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const boxRef = useRef<HTMLDivElement>(null);

  // a11y (аудит P2-1): focus-trap + фокус на первый input + возврат фокуса триггеру
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => boxRef.current?.querySelector<HTMLElement>('input, button')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = boxRef.current?.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])');
        if (!nodes?.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const finish = () => {
    notifyAuthChange();
    const action = takeAuthAction();
    onClose();
    toast('Вход выполнен');
    if (action) setTimeout(action, 50);
  };

  return (
    <div
      className="auth-overlay"
      onClick={(e) => {
        if (!boxRef.current?.contains(e.target as Node)) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Вход в аккаунт"
    >
      <div className="auth-sheet" ref={boxRef}>
        <button type="button" className="auth-close icon-btn" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
        <h2>Вход в AniNova</h2>
        <p className="auth-note">Синхронизация списков, истории и отзывов между устройствами.</p>
        <button
          type="button"
          className="btn btn--google btn--lg"
          disabled={!!busy}
          onClick={() => {
            setBusy('google');
            try {
              // signInWithGoogle — PKCE: готовит code_challenge и уходит redirect'ом (async).
              // Никакого fetch/await — браузер сразу уходит на Google.
              void signInWithGoogle();
            } catch (e) {
              setBusy('');
              toast(`Google: ${e instanceof Error ? e.message : 'ошибка'}`);
            }
          }}
        >
          <IconGoogle size={17} />
          Продолжить с Google
        </button>
        <div className="auth-divider">
          <span>или email</span>
        </div>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy('in');
            signIn(email, password)
              .then(() => {
                if (isSessionValid()) finish();
                else toast('Вход не выполнен');
                setBusy('');
              })
              .catch((err) => {
                setBusy('');
                toast(`Ошибка входа: ${err.message}`);
              });
          }}
        >
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button className="btn btn--primary btn--lg" type="submit" disabled={!!busy}>
            {busy === 'in' ? '…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}