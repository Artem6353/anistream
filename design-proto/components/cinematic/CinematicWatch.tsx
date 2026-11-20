'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Icon } from '@/components/proto/Icon';
import { episodesOf, type Anime } from '@/lib/mock';

const TOTAL = 24 * 60 + 12;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* Кинозал Nova Cinematic: тёмная сцена во всю ширину, минимальная хром-панель
   поверх кадра. Видеопоток не подключается — проверяются только состояния. */
export function CinematicWatch({ item }: { item: Anime }) {
  const episodes = episodesOf(item.slug);
  const [episode, setEpisode] = useState(item.progress?.episode ?? 1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(item.progress?.percent ?? 12);
  const [muted, setMuted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const current = Math.round((TOTAL * progress) / 100);
  const ep = episodes.find((e) => e.n === episode) ?? episodes[0];

  return (
    <div className="c-theatre">
      <div className="c-wrap">
        <div className="c-stage" ref={stageRef}>
          <Image src={item.backdrop} alt="" fill sizes="100vw" priority />
          <div className="c-stage-scrim" />
          {!playing ? (
            <div className="c-stage-center">
              <button type="button" className="c-stage-play" aria-label="Воспроизвести демо" onClick={() => setPlaying(true)}>
                <Icon name="play" size={24} filled />
              </button>
            </div>
          ) : null}
          <div className="c-controls">
            <input
              className="c-timeline"
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              aria-label="Позиция воспроизведения"
              aria-valuetext={`${Math.round(progress)} процентов, ${fmt(current)}`}
              style={{ '--fill': `${progress}%` } as React.CSSProperties}
            />
            <div className="c-ctl-row">
              <button
                type="button"
                className="c-ctl-btn"
                onClick={() => setPlaying((v) => !v)}
                aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              >
                <Icon name={playing ? 'pause' : 'play'} size={17} filled={!playing} />
              </button>
              <button
                type="button"
                className="c-ctl-btn"
                onClick={() => setMuted((v) => !v)}
                aria-label={muted ? 'Включить звук' : 'Выключить звук'}
                aria-pressed={muted}
              >
                <Icon name="volume" size={17} />
              </button>
              <span className="c-time">
                {fmt(current)} / {fmt(TOTAL)}
              </span>
              <div className="c-ctl-right">
                <label className="sr-only" htmlFor="c-quality">
                  Качество
                </label>
                <select id="c-quality" className="c-ctl-select" defaultValue="1080p">
                  <option>1080p</option>
                  <option>720p</option>
                  <option>480p</option>
                </select>
                <label className="sr-only" htmlFor="c-voice">
                  Озвучка
                </label>
                <select id="c-voice" className="c-ctl-select c-ctl-select--voice" defaultValue="AniNova Voice">
                  <option>AniNova Voice</option>
                  <option>Субтитры</option>
                </select>
                <button
                  type="button"
                  className="c-ctl-btn"
                  aria-label="На весь экран"
                  onClick={() => {
                    stageRef.current?.requestFullscreen?.().catch(() => {});
                  }}
                >
                  <Icon name="fullscreen" size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="c-theatre-foot">
          <div>
            <h1>
              {item.title} · серия {episode}
            </h1>
            <p>
              {ep?.title} · {ep?.duration} · {ep?.date} · {item.studio}
            </p>
          </div>
          <Link className="c-btn c-btn--sm" href={`/cinematic/anime/${item.slug}`}>
            К тайтлу
          </Link>
        </div>
        <p className="c-label" style={{ marginTop: 10, color: '#7f7e89' }}>
          Демо-плеер: видеопоток не подключён. Проверяются контролы, фокус и адаптивная сцена.
        </p>

        <div className="c-ep-strip">
          {episodes.slice(0, 8).map((e) => (
            <button
              key={e.n}
              type="button"
              className="c-ep-tile"
              aria-current={e.n === episode ? 'true' : undefined}
              onClick={() => {
                setEpisode(e.n);
                setProgress(e.progress ?? 0);
                setPlaying(false);
              }}
            >
              <b>{String(e.n).padStart(2, '0')}</b>
              <span>{e.title}</span>
              <em>{e.quality}</em>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
