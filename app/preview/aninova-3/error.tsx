'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * B2-A: ошибка на любом preview-маршруте.
 *
 * Показываем спокойный экран с двумя выходами (повторить / в каталог) вместо
 * стандартной страницы production-сайта. Данные не теряются: каталог читается
 * на сервере, повтор — это просто повторный рендер маршрута.
 */
export default function A3Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    /* digest есть только у серверной ошибки; текста стека в UI не показываем. */
    console.warn('[aninova-3] preview error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="a3-wrap a3-errorpage">
      <p className="a3-kicker">Сбой загрузки</p>
      <h1 className="a3-h1">Раздел не открылся</h1>
      <p className="a3-muted">
        Данные каталога не удалось получить за отведённое время. Повторите попытку — если ошибка повторится, откройте каталог
        заново: он строится на сервере и не зависит от состояния этой страницы.
      </p>
      <div className="a3-anime__actions">
        <button className="a3-btn a3-btn--primary" type="button" onClick={reset} data-a3-focusable>
          Повторить
        </button>
        <Link className="a3-btn a3-btn--ghost" href="/preview/aninova-3/catalog" data-a3-focusable>
          В каталог
        </Link>
      </div>
      {error.digest ? <p className="a3-muted a3-errorpage__digest">Код ошибки: {error.digest}</p> : null}
    </div>
  );
}
