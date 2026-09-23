'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { IconCheck } from './icons';

interface Toast {
  id: number;
  text: string;
}

const ToastCtx = createContext<(text: string) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((text: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, text }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <IconCheck size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
