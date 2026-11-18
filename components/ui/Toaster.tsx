'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { IconCheck } from './icons';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  title?: string;
}

/** Вызов уведомления: `toast('Сохранено')`, `toast.error('Не удалось')`. */
export interface ToastFn {
  (text: string, title?: string): void;
  success: (text: string, title?: string) => void;
  error: (text: string, title?: string) => void;
  info: (text: string, title?: string) => void;
}

let toastSeq = 0;

const ToastCtx = createContext<ToastFn>(Object.assign(() => {}, {
  success: () => {},
  error: () => {},
  info: () => {},
}) as ToastFn);

export const useToast = () => useContext(ToastCtx);

/**
 * Уведомления.
 *
 * API намеренно совместим со старым вызовом `toast('текст')`, но теперь есть
 * варианты (`toast.error`, `toast.success`) — ошибки раньше выглядели как успех
 * с галочкой, что путало.
 */
export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, kind: ToastKind, title?: string) => {
    const id = ++toastSeq;
    const lifetime = kind === 'error' ? 4200 : 2600;
    setToasts((t) => [...t, { id, text, kind, title }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), lifetime);
  }, []);

  const api = useMemo<ToastFn>(
    () =>
      Object.assign((text: string, title?: string) => push(text, 'success', title), {
        success: (text: string, title?: string) => push(text, 'success', title),
        error: (text: string, title?: string) => push(text, 'error', title),
        info: (text: string, title?: string) => push(text, 'info', title),
      }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toaster" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div className={`toast toast--${t.kind}`} key={t.id} role={t.kind === 'error' ? 'alert' : undefined}>
            <span className="toast__icon" aria-hidden="true">
              {t.kind === 'error' ? '⚠' : t.kind === 'info' ? 'ℹ' : <IconCheck size={16} />}
            </span>
            <span className="toast__body">
              {t.title && <strong className="toast__title">{t.title}</strong>}
              {t.text}
            </span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
