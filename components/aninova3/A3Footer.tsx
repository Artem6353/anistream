import Link from 'next/link';

export function A3Footer() {
  return (
    <footer className="a3-footer">
      <div className="a3-wrap a3-footer__grid">
        <div>
          <p className="a3-footer__brand">AniNova 3.0</p>
          <p className="a3-muted">Каталог аниме и комиксы на русском. Тёмная тема, плотный каталог, кинематографичная сцена.</p>
        </div>
        <nav aria-label="Каталог">
          <p className="a3-footer__title">Каталог</p>
          <Link href="/preview/aninova-3">Главная</Link>
          <Link href="/preview/aninova-3/catalog">Все аниме</Link>
          <Link href="/preview/aninova-3/comics">Comics</Link>
        </nav>
        <nav aria-label="Профиль">
          <p className="a3-footer__title">Профиль</p>
          <Link href="/preview/aninova-3/profile">История и закладки</Link>
          <Link href="/preview/aninova-3/auth">Вход</Link>
          <Link href="/auth">Текущий вход</Link>
        </nav>
        <div>
          <p className="a3-footer__title">О прототипе</p>
          <p className="a3-muted">
            B1-B · гибрид A+C. Каталог — реальные данные AniList, комиксы — демонстрационные. Новый интерфейс включается только флагом
            <code> ANINOVA3_PREVIEW=1</code>.
          </p>
          <Link href="/">Текущий сайт →</Link>
        </div>
      </div>
    </footer>
  );
}
