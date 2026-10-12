'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { PartySocket, type PartyCmd, type PartyState } from '@/lib/party';
import { useToast } from '@/components/ui/Toaster';

/** Watch Party (ТЗ 20.4): комната /party/<id>. Хост выбирает тайтл/серию/источник
    и управляет play/pause/seek; гости синхронизируются. Только нативные источники
    (Demo/HLS): iframe-плееры провайдеров не синхронизируются (физический лимит). */
export default function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [isHost, setIsHost] = useState(false);
  const [state, setState] = useState<PartyState | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ slug: string; ru: string; episodes: number }>>([]);
  const [sources, setSources] = useState<Array<{ id: string; label: string; url: string; demo?: boolean }>>([]);
  const [embeds, setEmbeds] = useState<Array<{ id: string; label: string }>>([]);
  const [peers, setPeers] = useState(1);
  const peersRef = useRef<Map<string, number>>(new Map());
  /* Аудит 30.09 (react-hooks/purity): Math.random() в useMemo — нечистая функция
     в рендере; useState-инициализатор вычисляется один раз и правилом принимается. */
  const [myPeer] = useState(() => `peer-${Math.random().toString(36).slice(2, 8)}`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sockRef = useRef<PartySocket | null>(null);
  const hostRef = useRef(false);
  const seenState = useRef(false);
  const [myName] = useState(() => `guest-${Math.random().toString(36).slice(2, 6)}`);

  useEffect(() => {
    if (id === 'new') {
      router.replace(`/party/${Math.random().toString(36).slice(2, 10)}`);
      return;
    }
    const sock = new PartySocket(`party:${id}`, {
      onJoin: () => {
        // если за 1.5 сек не пришло состояние — я хост
        setTimeout(() => {
          if (!seenState.current) {
            hostRef.current = true;
            setIsHost(true);
          }
        }, 1500);
      },
      onState: (s) => {
        seenState.current = true;
        setState((prev) => {
          const v = videoRef.current;
          if (v && !hostRef.current && prev?.url === s.url) {
            if (Math.abs(v.currentTime - s.t) > 1.5) v.currentTime = s.t;
            if (s.playing && v.paused) v.play().catch(() => {});
            if (!s.playing && !v.paused) v.pause();
          }
          return s;
        });
      },
      onPresence: (p) => {
        // аудит P3-1: счётчик участников по presence-пингам (окно 12 сек)
        peersRef.current.set(p.peer, Date.now());
      },
      onCmd: (c: PartyCmd) => {
        const v = videoRef.current;
        if (!v || hostRef.current) return;
        if (c.cmd === 'play') v.play().catch(() => {});
        if (c.cmd === 'pause') v.pause();
        if (c.cmd === 'seek' && c.t !== undefined) v.currentTime = c.t;
      },
    });
    sockRef.current = sock;
    sock.connect();
    const presence = setInterval(() => {
      sock.broadcastPresence({ peer: myPeer });
      const now = Date.now();
      for (const [k, v] of peersRef.current) if (now - v > 12_000) peersRef.current.delete(k);
      setPeers(1 + peersRef.current.size);
    }, 4000);
    return () => {
      clearInterval(presence);
      sock.close();
    };
  }, [id, router, myPeer, myName]);

  const search = async () => {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`).catch(() => null);
    const j = r?.ok ? await r.json() : null;
    setResults((j?.items ?? []).map((t: { slug: string; ru: string; episodes: number }) => ({ slug: t.slug, ru: t.ru, episodes: t.episodes })));
  };

  const pickTitle = async (slug: string, episode: number) => {
    const r = await fetch(`/api/providers/${slug}/${episode}?files=1`).catch(() => null);
    const j = r?.ok ? await r.json() : null;
    const all = (j?.sources ?? []) as Array<{ id: string; label: string; kind: string; providerId?: string; files?: Array<{ url: string; quality?: string }> }>;
    // Баг 1: годны все file-источники (MP4 и HLS, включая Kodik-direct), demo — в конец списка
    const files = all
      .filter((s) => s.kind === 'file' && s.files?.length)
      .flatMap((s) => s.files!.map((f) => ({ id: `${s.id}:${f.url}`, label: `${s.label} · ${f.quality ?? 'file'}`, url: f.url, demo: s.providerId === 'demo' })))
      .sort((a, b) => Number(a.demo) - Number(b.demo));
    // embed (iframe) показываем серыми с подсказкой: синхронизация невозможна
    const embeds = all.filter((s) => s.kind === 'embed').map((s) => ({ id: s.id, label: s.label }));
    setSources(files);
    setEmbeds(embeds);
    if (!files.length) toast('У этой серии нет нативных источников (MP4/HLS) — доступны только embed, а они в совместном просмотре не синхронизируются');
  };

  const setSource = (url: string, label: string) => {
    if (!state) return;
    const next = { ...state, url, label, t: 0, playing: false };
    setState(next);
    sockRef.current?.broadcastState(next);
  };

  const hostControl = (cmd: PartyCmd) => {
    const v = videoRef.current;
    if (v) {
      if (cmd.cmd === 'play') v.play().catch(() => {});
      if (cmd.cmd === 'pause') v.pause();
      if (cmd.cmd === 'seek' && cmd.t !== undefined) v.currentTime = cmd.t;
    }
    sockRef.current?.broadcastCmd(cmd);
    if (state) {
      const next = { ...state, t: cmd.t ?? state.t, playing: cmd.cmd === 'play' ? true : cmd.cmd === 'pause' ? false : state.playing };
      setState(next);
      sockRef.current?.broadcastState(next);
    }
  };

  // хост шлёт состояние каждые 5 сек + при событиях видео
  useEffect(() => {
    if (!isHost || !state) return;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (v) sockRef.current?.broadcastState({ ...state, t: v.currentTime, playing: !v.paused });
    }, 5000);
    return () => clearInterval(t);
  }, [isHost, state]);

  const onVideoEvent = () => {
    if (!hostRef.current || !state) return;
    const v = videoRef.current;
    if (!v) return;
    const next = { ...state, t: v.currentTime, playing: !v.paused };
    setState(next);
    sockRef.current?.broadcastState(next);
  };

  const roomUrl = typeof location !== 'undefined' ? location.href : '';

  return (
    <div className="container party">
      <h1>Watch Party {isHost ? '· вы хост' : '· гость'}</h1>
      <p className="stats__empty">
        Комната <code>{id}</code> · <button type="button" className="btn btn--outline btn--md" onClick={() => { navigator.clipboard?.writeText(roomUrl); toast('Ссылка скопирована'); }}>Скопировать ссылку</button>
      </p>

      {isHost ? (
        <div className="party__host">
          <div className="party__search">
            <input className="input" placeholder="Найти тайтл…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="btn btn--outline btn--md" onClick={search}>Искать</button>
          </div>
          {results.length ? (
            <ul className="feed__list">
              {results.map((r) => (
                <li className="feed__item" key={r.slug}>
                  <span className="feed__text"><strong>{r.ru}</strong></span>
                  <button type="button" className="btn btn--outline btn--md" onClick={() => {
                    const ep = 1;
                    const next: PartyState = { slug: r.slug, episode: ep, url: '', kind: 'file', label: '', titleRu: r.ru, t: 0, playing: false, hostName: myName };
                    setState(next);
                    sockRef.current?.broadcastState(next);
                    pickTitle(r.slug, ep);
                  }}>
                    Выбрать (серия 1)
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {state && sources.length ? (
            <div className="party__sources">
              {sources.map((s) => (
                <button key={s.id} type="button" className={`btn btn--md ${state.url === s.url ? 'btn--primary' : 'btn--outline'}`} onClick={() => setSource(s.url, s.label)}>
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          {state && embeds.length ? (
            <div className="party__sources party__sources--off">
              {embeds.map((e) => (
                <span key={e.id} className="btn btn--md btn--outline is-disabled" title="Недоступно в совместном просмотре">
                  {e.label} · недоступно в совместном просмотре
                </span>
              ))}
            </div>
          ) : null}
          {state ? (
            <div className="party__controls">
              <button type="button" className="btn btn--primary btn--md" onClick={() => hostControl({ cmd: 'play' })}>▶</button>
              <button type="button" className="btn btn--outline btn--md" onClick={() => hostControl({ cmd: 'pause' })}>⏸</button>
              <button type="button" className="btn btn--outline btn--md" onClick={() => hostControl({ cmd: 'seek', t: 0 })}>⏮ 0</button>
              <span className="stats__empty">{state.titleRu} · серия {state.episode} · {state.label || 'источник не выбран'}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="stats__empty">{state ? `Хост показывает: ${state.titleRu} · серия ${state.episode}` : 'Ждём, что включит хост…'}</p>
      )}

      {state?.url ? (
        <PartyVideo key={state.url} url={state.url} videoRef={videoRef} onEvent={onVideoEvent} isHost={isHost} />
      ) : (
        <div className="party__empty">Видео появится, когда хост выберет источник.</div>
      )}
      <p className="stats__empty">Участников: {peers} · синхронизация Supabase Realtime · только нативные источники (Demo/HLS)</p>
    </div>
  );
}

function PartyVideo({ url, videoRef, onEvent, isHost }: { url: string; videoRef: React.RefObject<HTMLVideoElement | null>; onEvent: () => void; isHost: boolean }) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let destroyed = false;
    if (url.includes('.m3u8')) {
      (async () => {
        const Hls = (await import('hls.js')).default;
        if (destroyed || !Hls.isSupported()) return;
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(v);
      })();
      return () => {
        destroyed = true;
      };
    }
    v.src = url;
    return () => {
      destroyed = true;
    };
  }, [url, videoRef]);
  return (
    <video
      ref={videoRef}
      className="party__video"
      controls={isHost}
      onPlay={onEvent}
      onPause={onEvent}
      onSeeked={onEvent}
      playsInline
    />
  );
}
