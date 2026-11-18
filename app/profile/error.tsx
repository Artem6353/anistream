'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** Route-level error boundary кабинета: падение виджета не убивает весь сайт. */
export default function ProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Диагностика в консоль, без утечки деталей пользователю.
    console.error('[profile] render error:', error.message);
  }, [error]);

  return (
    <div className="container ds-page">
      <div className="ds-card ds-card--pad dash__empty">
        <p className="dash__empty-emoji" aria-hidden="true">🧯</p>
        <h2>Кабинет не открылся</h2>
        <p className="ds-muted">
          Что-то сломалось при загрузке данных профиля. Можно повторить — сессия не потеряна.
        </p>
        <div className="dash__head-actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={reset}>
            Попробовать снова
          </button>
          <Link className="ds-btn ds-btn--ghost" href="/catalog">
            В каталог
          </Link>
        </div>
      </div>
    </div>
  );
}
