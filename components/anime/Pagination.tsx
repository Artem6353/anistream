import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons';

/** Компактная пагинация: окно страниц вокруг текущей. */
export function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  const window_: number[] = [];
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  for (let p = from; p <= to; p++) window_.push(p);

  return (
    <nav className="pagination" aria-label="Страницы каталога">
      {page > 1 ? (
        <Link className="icon-btn" href={href(page - 1)} aria-label="Предыдущая страница">
          <IconChevronLeft size={16} />
        </Link>
      ) : null}
      {window_.map((p) => (
        <Link key={p} className={`pagination__page ${p === page ? 'is-active' : ''}`} href={href(p)} aria-current={p === page ? 'page' : undefined}>
          {p}
        </Link>
      ))}
      {page < pages ? (
        <Link className="icon-btn" href={href(page + 1)} aria-label="Следующая страница">
          <IconChevronRight size={16} />
        </Link>
      ) : null}
    </nav>
  );
}
