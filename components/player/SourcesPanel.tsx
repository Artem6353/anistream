'use client';

import type { EpisodeSource } from '@/lib/providers/types';
import { NO_SOURCES_LABEL } from '@/lib/source-hints';

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
      {/* ТЗ 3.3.4: скелетон вместо голого текста — не jumping-контент при догрузке */}
      {status === 'loading' ? (
        <div className="sources-skeleton" aria-busy="true" aria-label="Загружаем озвучки">
          {[0, 1, 2].map((i) => (
            <span key={i} className="sources-skeleton__row" />
          ))}
        </div>
      ) : null}
      {grouped.map((g) => (
        <section key={g.pid} className="sources-group">
          <h4 className="sources-group__head">{g.name}</h4>
          {g.voices.length ? (
            <>
              <p className="sources-group__kind">Многоголосый / дубляж</p>
              {g.voices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`source-row ${selectedId === s.id ? 'is-active' : ''}`}
                  onClick={() => onChoose(s.id)}
                >
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
                <button
                  key={s.id}
                  type="button"
                  className={`source-row ${selectedId === s.id ? 'is-active' : ''}`}
                  onClick={() => onChoose(s.id)}
                >
                  <span className="source-row__label">{s.label}</span>
                </button>
              ))}
            </>
          ) : null}
        </section>
      ))}
      {status === 'ready' && !sourcesCount ? (
        <p className="settings__note">
          {NO_SOURCES_LABEL} для этой серии. Попробуйте соседнюю серию — список озвучек пополняется автоматически, как только источник
          появляется у провайдера.
        </p>
      ) : null}
    </div>
  );
}
