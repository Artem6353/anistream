'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container">
      <div className="empty-state" style={{ marginTop: 48 }}>
        <h2>Что-то сломалось</h2>
        <p>Ошибка интерфейса: {error.message}. Попробуйте повторить действие — обычно помогает.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn--primary btn--md" onClick={reset}>
            Повторить
          </button>
          <Link className="btn btn--outline btn--md" href="/">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
