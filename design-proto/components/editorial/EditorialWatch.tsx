'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/proto/Icon';
import { episodesOf, type Anime } from '@/lib/mock';

const TOTAL = 24 * 60 + 12;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* «Кинозал» Nova Editorial: кадр 21:9 и пульт отдельной линейкой под ним —
   как проектор в маленьком зале, без поверхностного «стекла» и неона. */
export function EditorialWatch({ item }: { item: Anime }) {
  const episodes = episodesOf(item.slug);
  const [playing, setPlaying] = useState(false);
  const [episode, setEpisode] = useState(item.progress?.episode ?? 1);
  const [progress, setProgress] = useState(item.progress?.percent ?? 6);
  const current = Math.round((TOTAL * progress) / 100);
  const ep = episodes.find((e) => e.n === episode) ?? episodes[0];

  return (
    <div className="e-wrap">
      <div className="e-watch">
        <div className="e-watch-head">
          <div>
            <span className="e-label">Кинозал · сезон 1</span>
            <h1>
              {item.title} · серия {episode}
            </h1>
          </div>
          <Link className="e-textlink" href={`/editorial/anime/${item.slug}`}>
            К досье тайтла
          </Link>
        </div>

        <div className="e-screen">
          <Image src={item.backdrop} alt="" fill sizes="100vw" priority />
          <div className="e-screen-scrim" />
          {!playing ? (
            <div className="e-screen-center">
              <button type="button" className="e-screen-play" aria-label="Воспроизвести демо" onClick={() => setPlaying(true)}>
                <Icon name="play" size={22} filled />
              </button>
            </div>
          ) : null}
        </div>

        <div className="e-booth">
          <button type="button" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
            <Icon name={playing ? 'pause' : 'play'} size={15} filled={!playing} />
            {playing ? 'Пауза' : 'Смотреть'}
          </button>
          <button type="button" onClick={() => setProgress(0)} aria-label="В начало">
            <Icon name="left" size={14} /> В начало
          </button>
          <span className="e-booth-time">
            {fmt(current)} / {fmt(TOTAL)}
          </span>
          <input
            className="e-timeline"
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            aria-label="Позиция воспроизведения"
            aria-valuetext={`${Math.round(progress)} процентов`}
            style={{ '--fill': `${progress}%` } as React.CSSProperties}
          />
          <label className="sr-only" htmlFor="e-quality">
            Качество
          </label>
          <select id="e-quality" defaultValue="1080p">
            <option>1080p</option>
            <option>720p</option>
            <option>480p</option>
          </select>
          <label className="sr-only" htmlFor="e-sound">
            Озвучка
          </label>
          <select id="e-sound" defaultValue="AniNova Voice">
            <option>AniNova Voice</option>
            <option>Субтитры</option>
          </select>
        </div>
        <p className="e-label" style={{ marginTop: 8 }}>
          Демо-плеер: видеопоток не подключён · проверяются пульт, фокус и адаптив
        </p>

        <div className="e-watch-grid">
          <div className="e-watch-copy">
            <h2>{ep?.title}</h2>
            <p>{item.synopsis}</p>
            <p className="e-label" style={{ marginTop: 10 }}>
              {ep?.date} · {ep?.duration} · {ep?.quality} · {item.studio}
            </p>
          </div>

          <section aria-labelledby="e-watch-toc">
            <div className="e-block-head">
              <h2 id="e-watch-toc" style={{ fontSize: 18 }}>
                Эпизоды
              </h2>
              <span className="e-label">сезон 1</span>
            </div>
            <div className="e-toc">
              {episodes.map((e) => (
                <button
                  key={e.n}
                  type="button"
                  className="e-toc-row"
                  style={{ width: '100%', textAlign: 'left' }}
                  aria-current={e.n === episode ? 'true' : undefined}
                  onClick={() => {
                    setEpisode(e.n);
                    setProgress(e.progress ?? 0);
                    setPlaying(false);
                  }}
                >
                  <span className="e-toc-n">{String(e.n).padStart(2, '0')}</span>
                  <h3>{e.title}</h3>
                  <span className="e-toc-right">{e.duration}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
