import Link from 'next/link';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

const RELATED = [
  { href: `${PREVIEW_ROOT}/privacy`, label: 'Конфиденциальность' },
  { href: `${PREVIEW_ROOT}/terms`, label: 'Соглашение' },
  { href: `${PREVIEW_ROOT}/disclaimer`, label: 'Отказ от ответственности' },
  { href: `${PREVIEW_ROOT}/dmca`, label: 'DMCA' },
];

/** B2-D: общая оболочка юридических страниц preview. Текст страниц
 *  сохраняется дословно; меняются только навигация и оформление. */
export function A3LegalPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="a3-wrap a3-legal">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <article className="a3-legal__doc">
        <header className="a3-pagehead">
          <p className="a3-kicker">Правовая информация</p>
          <h1 className="a3-h1">{title}</h1>
          <p className="a3-pagehead__lead">{lead}</p>
        </header>
        <div className="a3-legal__body">{children}</div>
        <footer className="a3-legal__related">
          <p className="a3-h2">Другие документы</p>
          <nav aria-label="Правовые документы">
            {RELATED.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
          <p className="a3-muted">
            Это preview-версия страницы. Текст и контакты совпадают с действующими документами сайта.
          </p>
        </footer>
      </article>
    </div>
  );
}
