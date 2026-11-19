'use client';

import { useEffect, useRef, useState } from 'react';

const PRESETS = ['Не воспроизводится', 'Нет звука', 'Рассинхрон', 'Не та серия'];

/**
 * Форма жалобы на источник (A5.8).
 *
 * Инцидент: у iframe-источников (Kodik/CVH/AniBoom) кнопка «Пожаловаться»
 * переключала state, но сама форма рендерилась только в native-ветке PlayerShell.
 * Теперь форма общая, а отправка проверяет HTTP-ответ: раньше любой сбой API
 * всё равно показывал «Отправлено ✓».
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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const submit = async () => {
    const problem = text.trim();
    if (!problem || sending || sent) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, episode, source: sourceLabel, problem }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setSent(true);
      setText('');
      closeTimer.current = setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить жалобу');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="player__menu player__report" role="dialog" aria-modal="true" aria-label="Жалоба на источник">
      <p className="player__menu-title">
        Жалоба: серия {episode}, {sourceLabel || 'источник'}
      </p>
      <div className="player__rates" aria-label="Быстрые причины">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`chip ${text === preset ? 'is-active' : ''}`}
            onClick={() => setText(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <textarea
        ref={textRef}
        className="input reviews__text"
        rows={3}
        maxLength={500}
        placeholder="Опишите проблему (нет звука, рассинхрон, битая серия…)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError('');
        }}
        disabled={sent}
      />
      <p className="player__report-status" role="status" aria-live="polite">
        {sent ? 'Отправлено ✓' : error ? `Ошибка: ${error}` : ''}
      </p>
      <div className="player__rates">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={submit}
          disabled={!text.trim() || sending || sent}
        >
          {sending ? 'Отправляем…' : sent ? 'Отправлено ✓' : 'Отправить'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={sending}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
