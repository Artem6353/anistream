'use client';

import Link from 'next/link';

export const EPISODES_CHUNK = 60;

/**
 * Панель серий боковой колонки плеера (чанки по 60) — вынесена из PlayerShell
 * (аудит 30.09, декомпозиция). Разметка и классы сохранены 1-в-1; состояние
 * чанка живёт в PlayerShell — оно общее с нижним epbar.
 */
export function EpisodesPanel({
  slug,
  totalEpisodes,
  episodes,
  currentEpisode,
  availability,
  chunk,
  chunks,
  onChunkChange,
}: {
  slug: string;
  totalEpisodes: number;
  episodes: number[];
  currentEpisode: number;
  availability?: Record<number, string>;
  chunk: number;
  chunks: number;
  onChunkChange: (i: number) => void;
}) {
  return (
    <div className="episodes-panel" id="pside-panel" role="tabpanel" aria-labelledby="pside-tab-episodes">
      {chunks > 1 ? (
        <div className="chips" style={{ padding: '2px 2px 6px' }}>
          {Array.from({ length: chunks }, (_, i) => (
            <button key={i} type="button" className={`chip ${chunk === i ? 'is-active' : ''}`} onClick={() => onChunkChange(i)}>
              {i * EPISODES_CHUNK + 1}–{Math.min(totalEpisodes, (i + 1) * EPISODES_CHUNK)}
            </button>
          ))}
        </div>
      ) : null}
      {episodes.map((ep) => {
        const kind = availability?.[ep];
        return (
          <Link key={ep} className={`episode-row ${ep === currentEpisode ? 'is-active' : ''}`} href={`/anime/${slug}/${ep}`}>
            <span className="episode-row__num">{ep}</span>
            <span className="episode-row__label">Серия {ep}</span>
            <span className={`epbar__dot epbar__dot--${kind ?? 'demo'}`} title={kind} />
          </Link>
        );
      })}
    </div>
  );
}
