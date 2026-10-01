'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Форма жалобы на источник (A5.8) — вынесена из PlayerShell (аудит 30.09,
 * декомпозиция): состояние текста/«отправлено» живёт здесь, рендерится только
 * когда открыта (состояние сбрасывается монтированием).
 */
export function ReportForm({
  slug,
  episode,
  sourceLabel,
  onClose,
}: {
  slug: string;
  episode: number;
  sourceLabel: string;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  /* Аудит 30.09 (P3): таймер «Отправлено → закрыть» гасится при размонтировании
     (раньше setState-колбэк мог выстрелить в уже размонтированный родительский slot). */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <div className="player__menu" role="dialog" aria-label="Жалоба на источник">
      <p className="player__menu-title">
        Жалоба: серия {episode}, {sourceLabel || 'источник'}
      </p>
      <textarea
        className="input reviews__text"
        rows={3}
        placeholder="Опишите проблему (нет звука, рассинхрон, битая серия…)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="player__rates">
        <button
          className="btn btn--primary btn--sm"
          onClick={async () => {
            await fetch('/api/report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug, episode, source: sourceLabel, problem: text }),
            });
            setSent(true);
            setText('');
            closeTimer.current = setTimeout(onClose, 1200);
          }}
        >
          {sent ? 'Отправлено ✓' : 'Отправить'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
