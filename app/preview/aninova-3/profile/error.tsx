'use client';

import Link from 'next/link';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

/** Ошибка серверной загрузки кабинета: не притворяемся, что данных нет. */
export default function PreviewProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="a3-wrap a3-account">
      <div className="a3-account-error" role="alert">
        <p className="a3-kicker">Личный кабинет</p>
        <h1 className="a3-h1">Данные не загрузились</h1>
        <p className="a3-muted">
          Сессия могла истечь или Supabase временно недоступен. Попробуйте ещё раз — вход и данные не подменяются демо-профилем.
        </p>
        <div className="a3-account-error__actions">
          <button type="button" className="a3-btn a3-btn--primary" onClick={reset}>
            Повторить
          </button>
          <Link className="a3-btn" href={`${PREVIEW_ROOT}/auth`}>
            Ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
