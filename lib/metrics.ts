/** In-memory метрики registry + счётчик ошибок для TG-алерта (W6/1.4). */
type Counters = {
  cacheHit: number;
  cacheMiss: number;
  liveOk: number;
  liveFail: number;
  synth: number;
  guess: number;
  demo: number;
  latencyMs: number[];
  errorsHour: { count: number; reset: number };
};

export const metrics: Counters = {
  cacheHit: 0,
  cacheMiss: 0,
  liveOk: 0,
  liveFail: 0,
  synth: 0,
  guess: 0,
  demo: 0,
  latencyMs: [],
  errorsHour: { count: 0, reset: Date.now() + 3_600_000 },
};

export function metricLatency(ms: number) {
  metrics.latencyMs.push(ms);
  if (metrics.latencyMs.length > 200) metrics.latencyMs.shift();
}

export function metricErrorBump(): boolean {
  const now = Date.now();
  if (metrics.errorsHour.reset < now) metrics.errorsHour = { count: 0, reset: now + 3_600_000 };
  metrics.errorsHour.count += 1;
  return metrics.errorsHour.count === 20; // порог алерта: 20 ошибок за час
}

export async function sendTgAlert(text: string) {
  const token = process.env.TG_BOT_TOKEN;
  const chat = process.env.TG_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch {}
}

export function metricsSnapshot() {
  const lat = metrics.latencyMs.slice().sort((a, b) => a - b);
  return {
    cacheHit: metrics.cacheHit,
    cacheMiss: metrics.cacheMiss,
    liveOk: metrics.liveOk,
    liveFail: metrics.liveFail,
    synth: metrics.synth,
    guess: metrics.guess,
    demo: metrics.demo,
    latencyP50: lat[Math.floor(lat.length / 2)] ?? 0,
    latencyP95: lat[Math.floor(lat.length * 0.95)] ?? 0,
    errorsThisHour: metrics.errorsHour.count,
  };
}
