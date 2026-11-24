import Link from 'next/link';
import {
  A3_ACCOUNT_NAV, A3_LEGAL_NAV, A3_ROOT, A3_SEARCH_PATH, A3_UTILITY_NAV,
} from '@/lib/aninova3/nav';

/** Футер B2-D: все внутренние ссылки ведут в preview; production-переходов нет. */
export function A3Footer() {
  return (
    <footer className="a3-footer">
      <div className="a3-wrap a3-footer__grid">
        <div>
          <p className="a3-footer__brand">AniNova 3.0</p>
          <p className="a3-muted">
            Каталог аниме, расписание эфиров и комиксы на русском. Тёмная тема, плотный каталог, кинематографичная сцена.
          </p>
          <p className="a3-footer__mini">
            <Link href={A3_ROOT}>Главная</Link> · <Link href={`${A3_ROOT}/schedule`}>Расписание</Link> · <Link href={`${A3_ROOT}/comics`}>Comics</Link>
          </p>
        </div>
        <nav aria-label="Каталог и подборки">
          <p className="a3-footer__title">Каталог</p>
          <Link href={A3_SEARCH_PATH}>Поиск</Link>
          <Link href={`${A3_ROOT}/catalog`}>Все аниме</Link>
          {A3_UTILITY_NAV.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <nav aria-label="Аккаунт">
          <p className="a3-footer__title">Аккаунт</p>
          {A3_ACCOUNT_NAV.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <div>
          <p className="a3-footer__title">Документы</p>
          {A3_LEGAL_NAV.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <p className="a3-footer__mini">B2-D · Nova Minimal. Preview включается флагом <code>ANINOVA3_PREVIEW=1</code>.</p>
        </div>
      </div>
    </footer>
  );
}
