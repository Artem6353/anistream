'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Title } from '@/lib/types';
import { useEffect, useState } from 'react';
import { useLibrary } from '@/lib/library';
import { IconCheck, IconPlay } from '@/components/ui/icons';

/** Список серий с отметками о просмотре и текущей позицией. */
export function EpisodeList({ title }: { title: Title }) {
  const { history } = useLibrary();
  const pathname = usePathname();
  const [avail, setAvail] = useState<Record<number, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability/${title.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && j && setAvail(j.episodes))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [title.slug]);
  const entry = history.find((h) => h.slug === title.slug);
  const CHUNK = 60;
  const [chunk, setChunk] = useState(0);
  const chunks = Math.max(1, Math.ceil(title.episodes / CHUNK));
  const episodes = Array.from({ length: title.episodes }, (_, i) => i + 1).slice(chunk * CHUNK, (chunk + 1) * CHUNK);

  return (
    <div className="episodes">
      <div className="episodes__head">
        <h2 className="section-title">Серии</h2>
        <span className="episodes__count">{title.episodes} шт.</span>
      </div>
      {chunks > 1 ? (
        <div className="chips" style={{ marginBottom: 10 }}>
          {Array.from({ length: chunks }, (_, i) => (
            <button key={i} type="button" className={`chip ${chunk === i ? 'is-active' : ''}`} onClick={() => setChunk(i)}>
              {i * CHUNK + 1}–{Math.min(title.episodes, (i + 1) * CHUNK)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="episodes__grid">
        {episodes.map((ep) => {
          const watched = history.find((h) => h.slug === title.slug && h.episode === ep);
          const done = watched && watched.duration > 0 && watched.position / watched.duration > 0.9;
          const current = pathname?.endsWith(`/${ep}`);
          return (
            <Link
              key={ep}
              href={`/anime/${title.slug}/${ep}`}
              className={`episode ${current ? 'is-current' : ''} ${done ? 'is-done' : ''}`}
              aria-current={current ? 'true' : undefined}
            >
              <span className="episode__num">{ep}</span>
              <span className="episode__label">Серия {ep}</span>
              {avail ? (
                <span
                  className={`episode__avail episode__avail--${avail[ep] ?? 'demo'}`}
                  title={
                    avail[ep] === 'cache'
                      ? 'Источник серии в кэше'
                      : avail[ep] === 'synth'
                        ? 'Источник синтезируется из кэша'
                        : avail[ep] === 'guess'
                          ? 'Источник подбирается пулом озвучек'
                          : 'Только тест-поток'
                  }
                />
              ) : null}
              {done ? (
                <span className="episode__done" title="Просмотрено">
                  <IconCheck size={13} />
                </span>
              ) : watched ? (
                <span className="episode__resume" title={`Продолжить с ${Math.round((watched.position / Math.max(1, watched.duration)) * 100)}%`}>
                  <IconPlay size={12} />
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      {entry ? (
        <Link className="btn btn--primary btn--md" href={`/anime/${title.slug}/${entry.episode}`}>
          <IconPlay size={15} />
          Продолжить с серии {entry.episode}
        </Link>
      ) : (
        <Link className="btn btn--primary btn--md" href={`/anime/${title.slug}/1`}>
          <IconPlay size={15} />
          Смотреть с первой серии
        </Link>
      )}
    </div>
  );
}
