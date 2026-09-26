'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Title } from '@/lib/types';
import type { EpisodeSource, ProviderMeta } from '@/lib/providers/types';
import { library, useLibrary } from '@/lib/library';
import { formatTime } from '@/lib/format';
import { Switch } from '@/components/ui/Switch';
import {
  IconArrowDown,
  IconBack10,
  IconChevronLeft,
  IconExpand,
  IconFwd10,
  IconGauge,
  IconPause,
  IconPip,
  IconPlay,
  IconVolume,
  IconVolumeX,
} from '@/components/ui/icons';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PROVIDER_ORDER = ['manual', 'kodik', 'cvh', 'aniboom', 'demo'];
const PROVIDER_NAMES: Record<string, string> = {
  kodik: 'Kodik',
  cvh: 'CVH (AnimeGo)',
  aniboom: 'AniBoom',
  demo: 'AniNova Demo',
  manual: 'Ручной источник',
};

interface DataState {
  status: 'loading' | 'ready' | 'error';
  sources?: EpisodeSource[];
  availability?: Record<number, string>;
  message?: string;
}

/**
 * Плеер v3 (ТЗ спринт 2):
 *  - горизонтальный скролл-бар серий под плеером + сетка серий в боковой панели;
 *  - выбор озвучки табами с группировкой по провайдерам и типу (многоголосый/субтитры);
 *  - выбор источника сохраняется в localStorage для каждого тайтла.
 */
export function PlayerShell({ title, episode }: { title: Title; episode: number }) {
  const router = useRouter();
  const { settings } = useLibrary();
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epBarRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<DataState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<'episodes' | 'sources'>('sources');
  const [quality, setQuality] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [uiVisible, setUiVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSent, setReportSent] = useState(false);
  /* Баннер «Продолжить с MM:SS» (итерация 3.6, задача 2): только file-источники,
   * без автоперемотки — пользователь сам решает, продолжить или начать сначала. */
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  /* ТЗ 4.1, блок 3: dropdown скорости у панели контролов + tooltip таймлайна. */
  const [rateOpen, setRateOpen] = useState(false);
  const [seekHover, setSeekHover] = useState<{ pct: number; t: number } | null>(null);
  const dragging = useRef(false);

  const sources = data.sources ?? [];
  const selected: EpisodeSource | undefined = useMemo(
    () =>
      sources.find((s) => s.id === selectedId) ??
      // провайдер по умолчанию из настроек (ТЗ блок 6): берём его источник, если он есть в серии
      (settings.defaultProvider && settings.defaultProvider !== 'demo'
        ? sources.find((s) => s.providerId === settings.defaultProvider)
        : undefined) ??
      sources.find((s) => s.providerId !== 'demo') ??
      sources[0],
    [sources, selectedId, settings.defaultProvider],
  );
  const isEmbed = selected?.kind === 'embed';
  const files = selected?.files ?? [];
  const file = useMemo(() => files.find((f) => f.quality === quality) ?? files[0], [files, quality]);
  const nextEpisode = episode < title.episodes ? episode + 1 : null;

  /* источники + доступность серий */
  useEffect(() => {
    let cancelled = false;
    setData((d) => ({ ...d, status: 'loading' }));
    Promise.all([
      fetch(`/api/providers/${title.slug}/${episode}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/availability/${title.slug}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([prov, avail]) => {
        if (cancelled) return;
        setData({ status: 'ready', sources: prov?.sources ?? [], availability: avail?.episodes });
        const saved = typeof window !== 'undefined' ? localStorage.getItem(`anistream:lastsrc:${title.slug}`) : null;
        if (saved && (prov?.sources ?? []).some((s: EpisodeSource) => s.id === saved)) setSelectedId(saved);
        else setSelectedId(null);
      })
      .catch((e) => !cancelled && setData({ status: 'error', message: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [episode, title.slug]);

  const keepTime = useRef(0);
  const switchingSrc = useRef(false);
  const chooseSource = (id: string) => {
    keepTime.current = videoRef.current?.currentTime ?? 0;
    switchingSrc.current = true; // на loadedmetadata не показывать баннер — позицию вернёт restore
    setSelectedId(id);
    setQuality('');
    try {
      localStorage.setItem(`anistream:lastsrc:${title.slug}`, id);
    } catch {}
  };

  /* видео-двивок */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !file || isEmbed) return;
    let cancelled = false;
    if (file.type === 'hls' && !video.canPlayType('application/x-mpegURL')) {
      void import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled || !Hls.isSupported()) {
            video.src = file.url;
            return;
          }
          const hls = new Hls({ capLevelToPlayerSize: true });
          hlsRef.current = hls;
          hls.loadSource(file.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) video.src = file.url;
          });
        })
        .catch(() => {
          if (!cancelled) video.src = file.url;
        });
    } else {
      video.src = file.url;
    }
    const restore = () => {
      if (keepTime.current > 5 && keepTime.current < (video.duration || 0) - 10) video.currentTime = keepTime.current;
      switchingSrc.current = false;
    };
    video.addEventListener('loadedmetadata', restore, { once: true });
    return () => {
      video.removeEventListener('loadedmetadata', restore);
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [file, isEmbed]);

  const poke = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    /* ТЗ 4.1 (3.4): контролы скрываются через 3 секунды бездействия при воспроизведении. */
    hideTimer.current = setTimeout(() => setUiVisible(false), 3000);
  }, []);
  useEffect(() => poke(), [poke, playing]);

  /* автоскролл бара серий к активной */
  useEffect(() => {
    const bar = epBarRef.current;
    const active = bar?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [episode]);

  /* прогресс в историю */
  useEffect(() => {
    if (!duration || isEmbed) return;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      library.saveProgress({ slug: title.slug, episode, position: v.currentTime, duration, updatedAt: Date.now() });
    }, 5000);
    return () => clearInterval(id);
  }, [duration, episode, title.slug, isEmbed]);

  /* Фолбэк истории для iframe-источников (Kodik / CVH / AniBoom).
   * Из кросс-доменного embed нельзя читать currentTime, поэтому при заходе
   * на серию с таким источником пишем запись один раз с position: 0 — серия
   * попадает в /profile/history и «Продолжить просмотр».
   * Защита от затирания реального прогресса: если для (slug, episode) уже
   * есть запись с position > 0 и updatedAt моложе 24 часов — НЕ трогаем
   * (пример: смотрели Demo 5 минут, затем переключились на CVH).
   * Нативному video не мешает: его интервал выше перезапишет запись
   * реальной позицией, если пользователь вернётся на file-источник. */
  const embedLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selected?.kind !== 'embed') return;
    const key = `${title.slug}:${episode}`;
    if (embedLoggedRef.current === key) return; // один раз за заход на серию
    embedLoggedRef.current = key;
    const FRESH_MS = 24 * 60 * 60 * 1000;
    const prev = library.state.history.find((h) => h.slug === title.slug && h.episode === episode);
    if (prev && prev.position > 0 && Date.now() - (prev.updatedAt ?? 0) < FRESH_MS) return;
    library.saveProgress({ slug: title.slug, episode, position: 0, duration: 0, updatedAt: Date.now() });
  }, [selected?.kind, selected?.id, title.slug, episode]);

  /* Жизненный цикл баннера «Продолжить» (итерация 3.6, задача 2):
   * сброс при смене серии/тайтла; автоскрытие, если пользователь сам
   * смотрит дальше 10-й секунды. */
  useEffect(() => {
    setResumeAt(null);
    switchingSrc.current = false;
  }, [episode, title.slug]);
  useEffect(() => {
    if (resumeAt !== null && time > 10) setResumeAt(null);
  }, [resumeAt, time]);
  /* ТЗ 4.1 (3.6): автоскрытие баннера «Продолжить» через 10 секунд. */
  useEffect(() => {
    if (resumeAt === null) return;
    const t = setTimeout(() => setResumeAt(null), 10000);
    return () => clearTimeout(t);
  }, [resumeAt]);

  /* ТЗ 4.1 (3.5): мобильные жесты — двойной тап слева/справа = ±10 с,
   * горизонтальный свайп = перемотка. Только нативный video. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isEmbed) return;
    let sx = 0;
    let sy = 0;
    let st = 0;
    let lastTapT = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dt = Date.now() - st;
      if (dt < 600 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Number.isFinite(v.duration)) {
        e.preventDefault();
        const secs = Math.max(-120, Math.min(120, Math.round(dx / 10)));
        v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + secs));
        return;
      }
      if (dt < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        const now = Date.now();
        if (now - lastTapT < 300) {
          const rect = v.getBoundingClientRect();
          v.currentTime = Math.max(0, v.currentTime + (t.clientX < rect.left + rect.width / 2 ? -10 : 10));
          lastTapT = 0;
        } else {
          lastTapT = now;
        }
      }
    };
    v.addEventListener('touchstart', onStart, { passive: true });
    v.addEventListener('touchend', onEnd, { passive: false });
    return () => {
      v.removeEventListener('touchstart', onStart);
      v.removeEventListener('touchend', onEnd);
    };
  }, [isEmbed]);

  /* оверлей следующей серии */
  useEffect(() => {
    if (!duration || !nextEpisode || isEmbed) return;
    const left = duration - time;
    if (playing && left <= 20 && left > 0) setNextIn(Math.ceil(left));
    else setNextIn(null);
  }, [time, duration, playing, nextEpisode, isEmbed]);

  const goNext = useCallback(() => {
    if (nextEpisode) router.push(`/anime/${title.slug}/${nextEpisode}`);
  }, [nextEpisode, router, title.slug]);

  const toggleFullscreen = () => {
    const el = shellRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (el?.requestFullscreen) void el.requestFullscreen();
    else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
  };

  /* горячие клавиши */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          if (v) {
            e.preventDefault();
            if (v.paused) void v.play().catch(() => {});
            else v.pause();
          }
          break;
        case 'arrowright':
          if (v) v.currentTime += 10;
          break;
        case 'arrowleft':
          if (v) v.currentTime -= 10;
          break;
        case 'm':
          if (v) v.muted = !v.muted;
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'n':
          goNext();
          break;
      }
      poke();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNext, poke]);

  const progressPct = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  /* ТЗ 4.1 (3.2): клик и drag по таймлайну + tooltip с временем под курсором. */
  const seekRatio = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };
  const seekTo = (clientX: number, el: HTMLElement) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = seekRatio(clientX, el) * duration;
  };

  const grouped = PROVIDER_ORDER.map((pid) => ({
    pid,
    name: PROVIDER_NAMES[pid] ?? pid,
    voices: sources.filter((s) => s.providerId === pid && s.voice !== 'subtitles'),
    subs: sources.filter((s) => s.providerId === pid && s.voice === 'subtitles'),
  })).filter((g) => g.voices.length || g.subs.length);

  const CHUNK = 60;
  const [chunk, setChunk] = useState(0);
  const chunks = Math.max(1, Math.ceil(title.episodes / CHUNK));
  const episodes = Array.from({ length: title.episodes }, (_, i) => i + 1).slice(chunk * CHUNK, (chunk + 1) * CHUNK);

  return (
    <div className="player-layout">
      <div className="player-main">
        <div className="player-bar container">
          <Link className="icon-btn" href={`/anime/${title.slug}`} aria-label="К описанию">
            <IconChevronLeft size={17} />
          </Link>
          <div className="player-bar__title">
            <strong>{title.ru}</strong>
            <span>
              серия {episode} из {title.episodes}
            </span>
          </div>
          <div className="player-bar__meta">
            {data.status === 'ready' && sources.length ? (
              <span className="player-flag player-flag--ok">{selected?.providerName ?? ''}</span>
            ) : null}
            {data.status === 'loading' ? <span className="player-flag">загрузка источников…</span> : null}
          </div>
        </div>

        <div className={`player ${uiVisible || !playing ? 'is-ui' : ''} ${isEmbed ? 'is-iframe' : ''}`} ref={shellRef} onMouseMove={poke} onTouchStart={poke}>
          {isEmbed && selected?.embedUrl ? (
            <iframe
              className="player__iframe"
              src={selected.embedUrl}
              title={`Плеер: ${title.ru}, серия ${episode} (${selected.label})`}
              allowFullScreen
              allow="fullscreen; encrypted-media; picture-in-picture"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                className="player__video"
                poster={title.banner ?? title.poster}
                playsInline
                onClick={() => (playing ? videoRef.current?.pause() : void videoRef.current?.play().catch(() => {}))}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setDuration(v.duration);
                  v.playbackRate = rate;
                  /* Баннер «Продолжить» (итерация 3.6, задача 2): только нативные источники
                   * (loadedmetadata у iframe не бывает), position ≥ 5 c и не «почти досмотрел»
                   * (position ≤ duration − 30). При смене озвучки баннер не показываем —
                   * там позицию возвращает restore по keepTime. */
                  if (switchingSrc.current) return;
                  const prev = library.state.history.find((hh) => hh.slug === title.slug && hh.episode === episode);
                  if (prev && prev.position >= 5 && Number.isFinite(v.duration) && prev.position <= v.duration - 30 && v.currentTime < 5) {
                    setResumeAt(prev.position);
                  }
                }}
                onProgress={(e) => {
                  const v = e.currentTarget;
                  if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
                }}
                onVolumeChange={(e) => {
                  setVolume(e.currentTarget.volume);
                  setMuted(e.currentTarget.muted);
                }}
                onEnded={() => {
                  if (settings.autoplayNext && nextEpisode) goNext();
                }}
              >
                {(selected as (EpisodeSource & { subtitles?: { lang: string; url: string }[] }) | undefined)?.subtitles?.map((st) => (
                  <track key={st.lang} kind="subtitles" srcLang={st.lang} src={st.url} label={st.lang} default={st.lang === 'ru'} />
                ))}
              </video>
              {resumeAt !== null ? (
                <div className="player__resume" role="status" aria-label="Продолжить просмотр">
                  <span className="player__resume-text">
                    <IconPlay size={14} /> Продолжить с {formatTime(resumeAt)}
                  </span>
                  <span className="player__resume-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) v.currentTime = resumeAt;
                        setResumeAt(null);
                      }}
                    >
                      Продолжить
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) v.currentTime = 0;
                        setResumeAt(null);
                      }}
                    >
                      Начать сначала
                    </button>
                  </span>
                </div>
              ) : null}
              {data.status === 'loading' ? <div className="player__status">Собираем источники…</div> : null}
              {data.status === 'error' ? <div className="player__status player__status--error">Источники недоступны: {data.message}</div> : null}
              {nextIn !== null && nextEpisode ? (
                <div className="player__next" role="dialog" aria-label="Следующая серия">
                  <p className="player__next-title">Следующая серия через {nextIn} с</p>
                  <div className="player__next-actions">
                    <button className="btn btn--primary btn--md" onClick={goNext}>
                      <IconPlay size={15} /> Серия {nextEpisode}
                    </button>
                    <button className="btn btn--ghost btn--md" onClick={() => setNextIn(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="player__ui">
                <div className="player__top">
                  <div>
                    <p className="player__title">{selected ? `${selected.label} · ${selected.providerName}` : ''}</p>
                    <p className="player__subtitle">
                      {file ? `${file.quality}p · ${file.type.toUpperCase()}` : ''}
                      {selected?.guessed ? ' · URL подобран' : ''}
                    </p>
                  </div>
                </div>
                <div className="player__bottom">
                  <div
                    className={`player__seek ${dragging.current ? 'is-drag' : ''}`}
                    role="slider"
                    aria-label="Позиция воспроизведения"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(time)}
                    onPointerDown={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      dragging.current = true;
                      el.setPointerCapture(e.pointerId);
                      seekTo(e.clientX, el);
                    }}
                    onPointerMove={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      const ratio = seekRatio(e.clientX, el);
                      setSeekHover({ pct: ratio * 100, t: ratio * duration });
                      if (dragging.current) seekTo(e.clientX, el);
                    }}
                    onPointerUp={() => {
                      dragging.current = false;
                    }}
                    onPointerLeave={() => {
                      dragging.current = false;
                      setSeekHover(null);
                    }}
                  >
                    <span className="player__buffered" style={{ width: `${bufferedPct}%` }} />
                    <span className="player__progress" style={{ width: `${progressPct}%` }} />
                    <span className="player__handle" style={{ left: `${progressPct}%` }} aria-hidden />
                    {seekHover ? (
                      <span className="player__seektip" style={{ left: `${seekHover.pct}%` }} aria-hidden>
                        {formatTime(seekHover.t)}
                      </span>
                    ) : null}
                  </div>
                  <div className="player__controls">
                    <div className="player__cluster">
                      <button className="icon-btn" onClick={() => (playing ? videoRef.current?.pause() : void videoRef.current?.play())} aria-label={playing ? 'Пауза' : 'Смотреть'}>
                        {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
                      </button>
                      <button className="icon-btn" onClick={() => (videoRef.current!.currentTime -= 10)} aria-label="Назад на 10 секунд">
                        <IconBack10 size={22} />
                      </button>
                      <button className="icon-btn" onClick={() => (videoRef.current!.currentTime += 10)} aria-label="Вперёд на 10 секунд">
                        <IconFwd10 size={22} />
                      </button>
                      <span className="player__volwrap">
                        <button className="icon-btn" onClick={() => (videoRef.current!.muted = !muted)} aria-label={muted ? 'Включить звук' : 'Выключить звук'}>
                          {muted || volume === 0 ? <IconVolumeX size={22} /> : <IconVolume size={22} />}
                        </button>
                        <input
                          className="player__volume"
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={muted ? 0 : volume}
                          onChange={(e) => {
                            const v = videoRef.current;
                            if (!v) return;
                            v.volume = Number(e.target.value);
                            v.muted = v.volume === 0;
                          }}
                          aria-label="Громкость"
                        />
                      </span>
                      <span className="player__time">
                        {formatTime(time)} / {formatTime(duration)}
                      </span>
                    </div>
                    <div className="player__cluster">
                      <button
                        className={`icon-btn player__ratebtn ${rateOpen ? 'is-active' : ''}`}
                        onClick={() => {
                          setRateOpen((v) => !v);
                          setMenuOpen(false);
                          setReportOpen(false);
                        }}
                        aria-label="Скорость воспроизведения"
                        aria-expanded={rateOpen}
                      >
                        {rate}×
                      </button>
                      <button className="icon-btn player__flagbtn" onClick={() => setReportOpen(true)} aria-label="Пожаловаться на источник">
                        ⚑
                      </button>
                      <button
                        className={`icon-btn ${menuOpen ? 'is-active' : ''}`}
                        onClick={() => {
                          setMenuOpen((v) => !v);
                          setRateOpen(false);
                        }}
                        aria-label="Настройки плеера"
                        aria-expanded={menuOpen}
                      >
                        <IconGauge size={22} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => {
                          const v = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
                          if (v?.requestPictureInPicture) void v.requestPictureInPicture();
                        }}
                        aria-label="Картинка в картинке"
                      >
                        <IconPip size={22} />
                      </button>
                      <button className="icon-btn" onClick={toggleFullscreen} aria-label="Полный экран">
                        <IconExpand size={22} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {reportOpen ? (
                <div className="player__menu" role="dialog" aria-label="Жалоба на источник">
                  <p className="player__menu-title">Жалоба: серия {episode}, {selected?.label ?? 'источник'}</p>
                  <textarea className="input reviews__text" rows={3} placeholder="Опишите проблему (нет звука, рассинхрон, битая серия…)" value={reportText} onChange={(e) => setReportText(e.target.value)} />
                  <div className="player__rates">
                    <button
                      className="btn btn--primary btn--sm"
                      onClick={async () => {
                        await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: title.slug, episode, source: selected?.label ?? '', problem: reportText }) });
                        setReportSent(true);
                        setReportText('');
                        setTimeout(() => {
                          setReportOpen(false);
                          setReportSent(false);
                        }, 1200);
                      }}
                    >
                      {reportSent ? 'Отправлено ✓' : 'Отправить'}
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setReportOpen(false)}>
                      Закрыть
                    </button>
                  </div>
                </div>
              ) : null}

              {menuOpen ? (
                <div className="player__menu" role="menu" aria-label="Настройки плеера">
                  {files.length > 1 ? (
                    <>
                      <p className="player__menu-title">Качество</p>
                      <div className="player__rates">
                        {files.map((f) => (
                          <button key={f.quality} className={`chip ${(!quality && f === files[0]) || quality === f.quality ? 'is-active' : ''}`} onClick={() => setQuality(f.quality)}>
                            {f.quality}p{f.type === 'hls' ? ' · HLS' : ''}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <Switch label="Автопереход к следующей серии" checked={settings.autoplayNext} onChange={(v) => library.setSettings({ autoplayNext: v })} />
                </div>
              ) : null}

              {/* ТЗ 4.1 (3.3): скорость — отдельный dropdown 0.5…2 */}
              {rateOpen ? (
                <div className="player__menu" role="menu" aria-label="Скорость воспроизведения">
                  <p className="player__menu-title">Скорость</p>
                  <div className="player__rates">
                    {RATES.map((r) => (
                      <button
                        key={r}
                        className={`chip ${rate === r ? 'is-active' : ''}`}
                        onClick={() => {
                          setRate(r);
                          if (videoRef.current) videoRef.current.playbackRate = r;
                          setRateOpen(false);
                        }}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* ТЗ 4.1 (3.1): для embed-источников наши контролы скрыты — подсказка */}
        {isEmbed && selected?.embedUrl ? <p className="player__embed-hint">Управление внутри плеера провайдера</p> : null}

        {/* горизонтальный скролл-бар серий под плеером (ТЗ 2.1) */}
        <div className="epbar-wrap">
          {episode > 1 ? (
            <Link className="icon-btn epbar__nav" href={`/anime/${title.slug}/${episode - 1}`} aria-label="Предыдущая серия">
              ←
            </Link>
          ) : null}
          <div className="epbar" ref={epBarRef} role="listbox" aria-label="Серии">
          {episodes.map((ep) => {
            const kind = data.availability?.[ep];
            return (
              <Link
                key={ep}
                role="option"
                aria-selected={ep === episode}
                data-active={ep === episode}
                className={`epbar__item ${ep === episode ? 'is-active' : ''}`}
                href={`/anime/${title.slug}/${ep}`}
                title={kind === 'demo' ? 'Только тест-поток' : kind === 'guess' ? 'Источник подобран' : 'Источник в кэше'}
              >
                {ep}
                <span className={`epbar__dot epbar__dot--${kind ?? 'demo'}`} />
              </Link>
            );
          })}
          </div>
          {nextEpisode ? (
            <Link className="icon-btn epbar__nav" href={`/anime/${title.slug}/${nextEpisode}`} aria-label="Следующая серия">
              →
            </Link>
          ) : null}
        </div>
      </div>

      {/* боковая панель: серии + озвучки (ТЗ 2.1/2.2) */}
      <aside className="player-side" aria-label="Серии и источники">
        <div className="profile-tabs" role="tablist">
          <button role="tab" aria-selected={sideTab === 'sources'} className={sideTab === 'sources' ? 'is-active' : ''} onClick={() => setSideTab('sources')}>
            Озвучки · {sources.length}
          </button>
          <button role="tab" aria-selected={sideTab === 'episodes'} className={sideTab === 'episodes' ? 'is-active' : ''} onClick={() => setSideTab('episodes')}>
            Серии · {title.episodes}
          </button>
        </div>

        {sideTab === 'sources' ? (
          <div className="sources-panel">
            {data.status === 'loading' ? <p className="settings__note">Загружаем озвучки…</p> : null}
            {grouped.map((g) => (
              <section key={g.pid} className="sources-group">
                <h4 className="sources-group__head">{g.name}</h4>
                {g.voices.length ? (
                  <>
                    <p className="sources-group__kind">Многоголосый / дубляж</p>
                    {g.voices.map((s) => (
                      <button key={s.id} type="button" className={`source-row ${selected?.id === s.id ? 'is-active' : ''}`} onClick={() => chooseSource(s.id)}>
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
                      <button key={s.id} type="button" className={`source-row ${selected?.id === s.id ? 'is-active' : ''}`} onClick={() => chooseSource(s.id)}>
                        <span className="source-row__label">{s.label}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </section>
            ))}
            {data.status === 'ready' && !sources.length ? <p className="settings__note">Источники не найдены. Попробуйте другую серию или включите bridge.</p> : null}
          </div>
        ) : (
          <div className="episodes-panel">
            {chunks > 1 ? (
              <div className="chips" style={{ padding: '2px 2px 6px' }}>
                {Array.from({ length: chunks }, (_, i) => (
                  <button key={i} type="button" className={`chip ${chunk === i ? 'is-active' : ''}`} onClick={() => setChunk(i)}>
                    {i * CHUNK + 1}–{Math.min(title.episodes, (i + 1) * CHUNK)}
                  </button>
                ))}
              </div>
            ) : null}
            {episodes.map((ep) => {
              const kind = data.availability?.[ep];
              return (
                <Link key={ep} className={`episode-row ${ep === episode ? 'is-active' : ''}`} href={`/anime/${title.slug}/${ep}`}>
                  <span className="episode-row__num">{ep}</span>
                  <span className="episode-row__label">Серия {ep}</span>
                  <span className={`epbar__dot epbar__dot--${kind ?? 'demo'}`} title={kind} />
                </Link>
              );
            })}
          </div>
        )}
        <div className="player-side__foot">
          <Link className="btn btn--outline btn--sm" href={`/anime/${title.slug}`}>
            <IconArrowDown size={14} /> К описанию
          </Link>
        </div>
      </aside>
    </div>
  );
}
