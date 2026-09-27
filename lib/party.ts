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

export class PartySocket {
  private ws: WebSocket | null = null;
  private hb: ReturnType<typeof setInterval> | null = null;
  private ref = 0;
  closed = false;

  constructor(
    private topic: string,
    private handlers: { onState?: (s: PartyState) => void; onCmd?: (c: PartyCmd) => void; onJoin?: () => void },
  ) {}

  connect() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !key) return;
    const wsUrl = url.replace('https://', 'wss://') + `/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`;
    this.ws = new WebSocket(wsUrl);
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
  close() {
    this.closed = true;
    if (this.hb) clearInterval(this.hb);
    this.ws?.close();
  }
}
