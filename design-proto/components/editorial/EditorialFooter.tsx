import Link from 'next/link';
import { Pulse } from '@/components/proto/Pulse';

export function EditorialFooter() {
  return (
    <footer className="e-footer">
      <div className="e-wrap">
        <div className="e-footer-brand">
          AniNova
          <Pulse size={6} />
        </div>
        <div className="e-footer-grid">
          <div className="e-footer-col">
            <h3>Выпуск</h3>
            <Link href="/editorial">Главная</Link>
            <Link href="/editorial/catalog">Индекс каталога</Link>
            <Link href="/editorial/comics">Комиксы</Link>
          </div>
          <div className="e-footer-col">
            <h3>Читателю</h3>
            <Link href="/editorial/profile">Личное дело</Link>
            <Link href="/editorial/login">Вход</Link>
            <Link href="/editorial/register">Регистрация</Link>
          </div>
          <div className="e-footer-col">
            <h3>Редакция</h3>
            <span>О проекте · демо</span>
            <span>Правила · демо</span>
            <span>Права · демо</span>
          </div>
          <div className="e-footer-col">
            <h3>Колонтитул</h3>
            <span>B1-A · Nova Editorial</span>
            <span>Данные вымышлены</span>
            <span>Комиксы только RU</span>
          </div>
        </div>
        <div className="e-colophon-line">
          <span>© 2026 AniNova · прототип, не production</span>
          <span>Набрано системной антиквой Georgia</span>
        </div>
      </div>
    </footer>
  );
}
