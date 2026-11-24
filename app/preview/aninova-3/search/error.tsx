'use client';

import Link from 'next/link';

export default function PreviewSearchError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="a3-wrap a3-errorpage" role="alert">
      <p className="a3-kicker">Поиск</p>
      <h1 className="a3-h1">Не удалось показать результаты</h1>
      <p className="a3-muted">Попробуйте ещё раз. Если ошибка повторяется, вернитесь в каталог и откройте поиск позже.</p>
      <div className="a3-searchpage__actions">
        <button className="a3-btn a3-btn--primary" type="button" onClick={reset}>Повторить</button>
        <Link className="a3-btn" href="/preview/aninova-3/search">К поиску</Link>
        <Link className="a3-btn" href="/preview/aninova-3/catalog">В каталог</Link>
      </div>
    </div>
  );
}
