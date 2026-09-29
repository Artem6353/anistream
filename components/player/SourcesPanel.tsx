'use client';

import type { EpisodeSource } from '@/lib/providers/types';

export interface SourceGroup {
  pid: string;
  name: string;
  voices: EpisodeSource[];
  subs: EpisodeSource[];
}

/**
 * Панель озвучек/источников боковой колонки плеера — вынесена из PlayerShell
 * (аудит 30.09, декомпозиция). Разметка и классы сохранены 1-в-1.
 */
export function SourcesPanel({
  status,
  grouped,
  selectedId,
  sourcesCount,
  onChoose,
}: {
  status: 'loading' | 'ready' | 'error';
  grouped: SourceGroup[];
  selectedId?: string;
  sourcesCount: number;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="sources-panel" id="pside-panel" role="tabpanel" aria-labelledby="pside-tab-sources">
      {status === 'loading' ? <p className="settings__note">Загружаем озвучки…</p> : null}
      {grouped.map((g) => (
        <section key={g.pid} className="sources-group">
          <h4 className="sources-group__head">{g.name}</h4>
          {g.voices.length ? (
            <>
              <p className="sources-group__kind">Многоголосый / дубляж</p>
              {g.voices.map((s) => (
                <button key={s.id} type="button" className={`source-row ${selectedId === s.id ? 'is-active' : ''}`} onClick={() => onChoose(s.id)}>
                  <span className="source-row__label">{s.label}</span>
                  {s.guessed ? <span className="source-row__guess">подбор</span> : null}
                </button>
              ))}
            </>
          ) : null}
          {g.subs.length ? (
            <>
              <p className="sources-group__kind">Субтитры</p>
              {g.subs.map((s) => (
                <button key={s.id} type="button" className={`source-row ${selectedId === s.id ? 'is-active' : ''}`} onClick={() => onChoose(s.id)}>
                  <span className="source-row__label">{s.label}</span>
                </button>
              ))}
            </>
          ) : null}
        </section>
      ))}
      {status === 'ready' && !sourcesCount ? (
        <p className="settings__note">Источники не найдены. Попробуйте другую серию или включите bridge.</p>
      ) : null}
    </div>
  );
}
