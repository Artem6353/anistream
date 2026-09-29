import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 3600;
import { getTitle } from '@/lib/catalog';
import dynamic from 'next/dynamic';

// Плеер (hls.js + контролы) — только клиент и лениво: минус ~100 КБ из First Load JS (ТЗ блок 8)
const PlayerShell = dynamic(() => import('@/components/player/PlayerShell').then((m) => m.PlayerShell));
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { similarTitles } from '@/lib/catalog';

interface Props {
  params: Promise<{ slug: string; episode: string }>;
}

/* Аудит 30.09 (P2-18): валидация номера серии — /anime/x/999 и /anime/x/abc раньше
   рендерили клампнутый контент с canonical на СЫРОЙ url (бесконечные soft-дубли).
   Теперь вне диапазона 1..episodes — честный 404, canonical всегда совпадает с контентом. */
function validEpisode(t: { episodes: number }, raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > Math.max(1, t.episodes)) return null;
  return n;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, episode: episodeRaw } = await params;
  const t = getTitle(slug);
  if (!t) notFound();
  const episode = validEpisode(t, episodeRaw);
  if (episode === null) notFound();
  return {
    title: `${t.ru} — серия ${episode}`,
    description: `Смотреть ${t.ru} серия ${episode} онлайн: озвучки и субтитры, автопереход к следующей серии, сохранение прогресса.`,
    alternates: { canonical: `/anime/${slug}/${episode}` },
  };
}

export default async function PlayerPage({ params }: Props) {
  const { slug, episode: episodeRaw } = await params;
  const title = getTitle(slug);
  if (!title) notFound();
  const episode = validEpisode(title, episodeRaw);
  if (episode === null) notFound();
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
