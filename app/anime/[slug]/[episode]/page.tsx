import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 3600;
import { getTitle } from '@/lib/catalog';
import dynamic from 'next/dynamic';

// Плеер (hls.js + контролы) — только клиент и лениво: минус ~100 КБ из First Load JS (ТЗ блок 8)
const PlayerShell = dynamic(() => import('@/components/player/PlayerShell').then((m) => m.PlayerShell), { ssr: false });
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { similarTitles } from '@/lib/catalog';

interface Props {
  params: Promise<{ slug: string; episode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, episode } = await params;
  const t = getTitle(slug);
  if (!t) notFound();
  return { title: `${t.ru} — серия ${episode}` };
}

export default async function PlayerPage({ params }: Props) {
  const { slug, episode: episodeRaw } = await params;
  const title = getTitle(slug);
  if (!title) notFound();
  const episode = Math.max(1, Math.min(title.episodes, Number(episodeRaw) || 1));
  const similar = similarTitles(title, 10);

  return (
    <>
      <PlayerShell title={title} episode={episode} />
      <div className="container" style={{ paddingTop: 18 }}>
        <nav className="player-nav" aria-label="Навигация по сериям">
          {episode > 1 ? (
            <Link className="btn btn--outline btn--md" href={`/anime/${slug}/${episode - 1}`}>
              ← Серия {episode - 1}
            </Link>
          ) : (
            <span />
          )}
          <Link className="btn btn--ghost btn--md" href={`/anime/${slug}`}>
            К описанию
          </Link>
          {episode < title.episodes ? (
            <Link className="btn btn--outline btn--md" href={`/anime/${slug}/${episode + 1}`}>
              Серия {episode + 1} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
      {similar.length ? (
        <Rail title="Похожее">
          {similar.map((t) => (
            <PosterCard key={t.slug} title={t} showBadge={false} />
          ))}
        </Rail>
      ) : null}
    </>
  );
}
