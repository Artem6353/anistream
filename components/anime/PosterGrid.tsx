import type { Title } from '@/lib/types';
import { PosterCard } from './PosterCard';

export function PosterGrid({ titles }: { titles: Title[] }) {
  return (
    <div className="poster-grid">
      {titles.map((t) => (
        <PosterCard key={t.slug} title={t} />
      ))}
    </div>
  );
}
