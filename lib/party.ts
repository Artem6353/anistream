'use client';

/** Минимальный Supabase Realtime-клиент (phoenix-протокол) для Watch Party (ТЗ 20.4).
    Broadcast-топики эфемерны: БД не нужна, состояние комнаты живёт у хоста. */
export interface PartyState {
  slug: string;
  episode: number;
  url: string;
  kind: 'file';
  label: string;
  titleRu: string;
  t: number;
  playing: boolean;
  hostName: string;
}
export interface PartyCmd {
  cmd: 'play' | 'pause' | 'seek';
  t?: number;
}
export interface PartyPresence {
  peer: string;
}

export class PartySocket {
  private ws: WebSocket | null = null;
  private hb: ReturnType<typeof setInterval> | null = null;
  private ref = 0;
  closed = false;

  constructor(
    private topic: string,
    private handlers: {
      onState?: (s: PartyState) => void;
      onCmd?: (c: PartyCmd) => void;
      onJoin?: () => void;
      onPresence?: (p: PartyPresence) => void;
    },
  ) {}

  connect() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !key) return;
    /* Аудит: `url.replace('https://','wss://')` оставлял `http://…` при локальном
       Supabase (127.0.0.1:54321) — new WebSocket('http://…') бросает SyntaxError,
       и Watch Party в dev не работала. Теперь протокол выбирается через URL. */
    let wsUrl: string;
    try {
      const parsed = new URL('/realtime/v1/websocket', url);
      parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      parsed.searchParams.set('apikey', key);
      parsed.searchParams.set('vsn', '1.0.0');
      wsUrl = parsed.toString();
    } catch {
      return;
    }
    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      return; // неподдерживаемая среда/URL — комната просто не синхронизируется
    }
    this.ws.onerror = () => {
      /* Ошибка соединения не должна всплывать в консоль как uncaught; реконнект
         сделает onclose (сервер закрывает сокет при ошибке). */
    };
    this.ws.onopen = () => {
      this.send(this.topic, 'phx_join', {});
      this.handlers.onJoin?.();
      this.hb = setInterval(() => this.send('phoenix', 'heartbeat', {}), 30_000);
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { topic: string; event: string; payload: Record<string, unknown> };
        if (msg.topic !== this.topic || msg.event !== 'broadcast') return;
        const p = msg.payload as { type?: string; state?: PartyState; cmd?: PartyCmd };
        if (p.type === 'state' && p.state) this.handlers.onState?.(p.state);
        if (p.type === 'cmd' && p.cmd) this.handlers.onCmd?.(p.cmd);
        if (p.type === 'presence' && (p as unknown as { peer?: PartyPresence }).peer)
          this.handlers.onPresence?.((p as unknown as { peer: PartyPresence }).peer);
      } catch {}
    };
    this.ws.onclose = () => {
      if (this.closed) return;
      setTimeout(() => !this.closed && this.connect(), 3000); // реконнект
    };
  }

  private send(topic: string, event: string, payload: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ref += 1;
    this.ws.send(JSON.stringify({ topic, event, payload, ref: String(this.ref) }));
  }

  broadcastState(s: PartyState) {
    this.send(this.topic, 'broadcast', { type: 'state', state: s });
  }
  broadcastCmd(c: PartyCmd) {
    this.send(this.topic, 'broadcast', { type: 'cmd', cmd: c });
  }
  broadcastPresence(peer: PartyPresence) {
    this.send(this.topic, 'broadcast', { type: 'presence', peer });
  }
  close() {
    this.closed = true;
    if (this.hb) clearInterval(this.hb);
    this.ws?.close();
  }
}
