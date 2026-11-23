import Link from 'next/link';
import { A3_ROOT } from '@/lib/aninova3/nav';

/** B2-A: 404 внутри preview — страница не найдена, но навигация остаётся. */
export default function A3NotFound() {
  return (
    <div className="a3-wrap a3-errorpage">
      <p className="a3-kicker">404</p>
      <h1 className="a3-h1">Такой страницы нет</h1>
      <p className="a3-muted">
        Произведение могло быть скрыто или адрес изменился. Каталог и расписание доступны по ссылкам ниже.
      </p>
      <div className="a3-anime__actions">
        <Link className="a3-btn a3-btn--primary" href={`${A3_ROOT}/catalog`} data-a3-focusable>
          В каталог
        </Link>
        <Link className="a3-btn a3-btn--ghost" href={`${A3_ROOT}/schedule`} data-a3-focusable>
          Расписание
        </Link>
        <Link className="a3-btn a3-btn--ghost" href={A3_ROOT} data-a3-focusable>
          На главную
        </Link>
      </div>
    </div>
  );
}
