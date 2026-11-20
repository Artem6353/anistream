import Link from 'next/link';

export function MinimalFooter() {
  return (
    <footer className="m-footer">
      <div className="m-wrap">
        <div className="m-footer-grid">
          <div className="m-footer-col">
            <h3>Каталог</h3>
            <Link href="/minimal">Главная</Link>
            <Link href="/minimal/catalog">Аниме</Link>
            <Link href="/minimal/comics">Комиксы</Link>
          </div>
          <div className="m-footer-col">
            <h3>Аккаунт</h3>
            <Link href="/minimal/profile">Профиль</Link>
            <Link href="/minimal/login">Вход</Link>
            <Link href="/minimal/register">Регистрация</Link>
          </div>
          <div className="m-footer-col">
            <h3>Документы</h3>
            <span>Правила · демо</span>
            <span>Конфиденциальность · демо</span>
            <span>Права на комиксы · демо</span>
          </div>
          <div className="m-footer-col">
            <h3>B1-A</h3>
            <span>Дизайн-прототип</span>
            <span>Nova Minimal</span>
            <span>Данные вымышлены</span>
          </div>
        </div>
        <div className="m-footer-bottom">
          <span>© 2026 AniNova · прототип, не production</span>
          <span>Комиксы — только на русском</span>
        </div>
      </div>
    </footer>
  );
}
