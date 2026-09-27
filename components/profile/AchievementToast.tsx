'use client';

import { useEffect, useState } from 'react';
import { ACH_BY_ID, ACH_EVENT, TIER_EMOJI, TIER_LABELS } from '@/lib/achievements';

interface ToastItem {
  id: string;
  key: number;
}

/** Тост получения ачивки (ТЗ блок 18.1): всплывает на 5 сек, закрывается крестиком, конфетти CSS. */
export function AchievementToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onAch = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id || !ACH_BY_ID.get(id)) return;
      const key = Date.now() + Math.random();
      setItems((p) => [...p, { id, key }]);
      setTimeout(() => setItems((p) => p.filter((x) => x.key !== key)), 5000);
    };
    window.addEventListener(ACH_EVENT, onAch);
    return () => window.removeEventListener(ACH_EVENT, onAch);
  }, []);

  if (!items.length) return null;
  return (
    <div className="ach-toasts" aria-live="polite">
      {items.map((it) => {
        const a = ACH_BY_ID.get(it.id)!;
        return (
          <div className="ach-toast" key={it.key} role="status">
            <span className="ach-toast__confetti" aria-hidden>
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ ['--i' as string]: String(i) }} />
              ))}
            </span>
            <span className="ach-toast__emoji">{TIER_EMOJI[a.tier]}</span>
            <span className="ach-toast__text">
              <strong>Ачивка: {a.title}</strong>
              <small>
                {TIER_LABELS[a.tier]} · {a.desc}
              </small>
            </span>
            <button type="button" className="ach-toast__close" aria-label="Закрыть" onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))}>
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
