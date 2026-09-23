import Link from 'next/link';
import { GENRE_LABELS } from '@/lib/labels';
import { hashStr } from '@/lib/format';

/** Облако жанров с цветными точками (цвет детерминирован). */
export function GenreChips({ counts }: { counts: { slug: string; count: number }[] }) {
  return (
    <div className="chips">
      {counts.map((g) => (
        <Link
          key={g.slug}
          className="chip"
          href={`/genre/${g.slug}`}
          style={{ ['--dot' as string]: `hsl(${hashStr(g.slug) % 360} 80% 65%)` }}
        >
          <span className="chip__dot" aria-hidden />
          {GENRE_LABELS[g.slug] ?? g.slug}
          <em>{g.count}</em>
        </Link>
      ))}
    </div>
  );
}
