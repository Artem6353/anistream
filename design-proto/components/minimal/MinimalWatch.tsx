'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { SaveButton } from '@/components/proto/SaveButton';
import { episodesOf, type Anime } from '@/lib/mock';

const TOTAL = 24 * 60 + 12;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* Демо-плеер Nova Minimal: проверяются контролы, раскладка и доступность,
   видеопоток намеренно не подключён (production-плеер не переписывается). */
export function MinimalWatch({ item }: { item: Anime }) {
  const episodes = episodesOf(item.slug);
  const [episode, setEpisode] = useState(item.progress?.episode ?? 1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(item.progress?.percent ?? 8);
  const [muted, setMuted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const current = Math.round((TOTAL * progress) / 100);
  const ep = episodes.find((e) => e.n === episode) ?? episodes[0];

  return (
    <div className="m-wrap">
      <div className="m-watch">
        <div className="m-watch-head">
          <Link href={`/minimal/anime/${item.slug}`}>← {item.title}</Link>
          <span aria-hidden="true">·</span>
          <span>
            Сезон 1 · серия {episode}
          </span>
          <span className="m-pill">{ep?.quality ?? '1080p'}</span>
          {item.status === 'Онгоинг' ? (
            <span className="m-pill m-pill--ok">
              <Pulse live size={5} /> Онгоинг
            </span>
          ) : null}
        </div>

        <div className="m-stage" ref={stageRef}>
          <Image className="m-stage-art" src={item.backdrop} alt="" fill sizes="100vw" priority />
          <div className="m-stage-scrim" />
          {!playing ? (
            <div className="m-stage-center">
              <button type="button" className="m-play-big" aria-label="Воспроизвести демо-ролик" onClick={() => setPlaying(true)}>
                <Icon name="play" size={24} filled />
              </button>
            </div>
          ) : null}
          <div className="m-controls">
            <input
              className="m-timeline"
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              aria-label="Позиция воспроизведения"
              aria-valuetext={`${Math.round(progress)} процентов, ${fmt(current)}`}
              style={{ '--fill': `${progress}%` } as React.CSSProperties}
            />
            <div className="m-ctl-row">
              <button
                type="button"
                className="m-ctl-btn"
                onClick={() => setPlaying((v) => !v)}
                aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              >
                <Icon name={playing ? 'pause' : 'play'} size={17} filled={!playing} />
              </button>
              <button
                type="button"
                className="m-ctl-btn"
                onClick={() => setMuted((v) => !v)}
                aria-label={muted ? 'Включить звук' : 'Выключить звук'}
                aria-pressed={muted}
              >
                <Icon name="volume" size={17} />
              </button>
              <span className="m-time">
                {fmt(current)} / {fmt(TOTAL)}
              </span>
              <div className="m-ctl-right">
                <label className="sr-only" htmlFor="m-quality">
                  Качество
                </label>
                <select id="m-quality" className="m-ctl-select" defaultValue="1080p">
                  <option>1080p</option>
                  <option>720p</option>
                  <option>480p</option>
                </select>
                <label className="sr-only" htmlFor="m-voice">
                  Озвучка
                </label>
                <select id="m-voice" className="m-ctl-select" defaultValue="AniNova Voice">
                  <option>AniNova Voice</option>
                  <option>Субтитры</option>
                </select>
                <button
                  type="button"
                  className="m-ctl-btn"
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
        <p className="m-demo-note">
          Демо-плеер B1-A: видеопоток не подключён. Проверяются раскладка, таймлайн, фокус и мобильные контролы.
        </p>

        <div className="m-watch-grid">
          <div>
            <h1 className="m-watch-title">
              {item.title} · серия {episode}
            </h1>
            <p className="m-watch-sub">
              <span>{ep?.title}</span>
              <span>{ep?.date}</span>
              <span>{item.studio}</span>
              <span>{item.age}</span>
            </p>
            <p className="m-synopsis" style={{ marginTop: 14 }}>
              {item.synopsis}
            </p>
            <div className="m-anime-actions">
              <Link className="m-btn" href={`/minimal/anime/${item.slug}`}>
                Страница тайтла
              </Link>
              <SaveButton className="m-btn" />
            </div>
          </div>
          <aside className="m-side-card" aria-labelledby="m-watch-episodes">
            <h2 className="m-block-title" id="m-watch-episodes" style={{ marginBottom: 6 }}>
              Серии · сезон 1
            </h2>
            <div className="m-episodes" style={{ borderTop: 0 }}>
              {episodes.map((e) => (
                <button
                  key={e.n}
                  type="button"
                  className={`m-ep${e.n === episode ? ' is-current' : ''}`}
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => {
                    setEpisode(e.n);
                    setProgress(e.progress ?? 0);
                    setPlaying(false);
                  }}
                  aria-current={e.n === episode ? 'true' : undefined}
                >
                  <span className="m-ep-num">{String(e.n).padStart(2, '0')}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="m-ep-title">{e.title}</span>
                    <span className="m-ep-sub">
                      <span>{e.duration}</span>
                      <span>{e.quality}</span>
                    </span>
                  </span>
                  <span className="m-ep-status">{e.watched ? <Icon name="check" size={13} /> : null}</span>
                </button>
              ))}
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
