import Link from 'next/link';
import { A3_ROOT } from '@/lib/aninova3/nav';

/** Футер B2-A: те же разделы, что в шапке, плюс вход и переход на текущий сайт. */
export function A3Footer() {
  return (
    <footer className="a3-footer">
      <div className="a3-wrap a3-footer__grid">
        <div>
          <p className="a3-footer__brand">AniNova 3.0</p>
          <p className="a3-muted">
            Каталог аниме, расписание эфиров и комиксы на русском. Тёмная тема, плотный каталог, кинематографичная сцена.
          </p>
        </div>
        <nav aria-label="Разделы">
          <p className="a3-footer__title">Разделы</p>
          <Link href={A3_ROOT}>Главная</Link>
          <Link href={`${A3_ROOT}/catalog`}>Каталог аниме</Link>
          <Link href={`${A3_ROOT}/schedule`}>Расписание</Link>
          <Link href={`${A3_ROOT}/comics`}>Comics</Link>
        </nav>
        <nav aria-label="Аккаунт">
          <p className="a3-footer__title">Аккаунт</p>
          <Link href={`${A3_ROOT}/profile`}>История и закладки</Link>
          <Link href={`${A3_ROOT}/auth`}>Вход в preview</Link>
          <Link href="/auth">Текущий вход</Link>
        </nav>
        <div>
          <p className="a3-footer__title">О прототипе</p>
          <p className="a3-muted">
            B2-A · Nova Minimal. Каталог и расписание — реальные данные, комиксы — ранняя реализация. Новый интерфейс включается
            только флагом <code>ANINOVA3_PREVIEW=1</code>.
          </p>
          <Link href="/">Текущий сайт →</Link>
        </div>
      </div>
    </footer>
  );
}
