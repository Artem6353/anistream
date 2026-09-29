import type { EpisodeSource, ProviderContext } from './types';

/**
 * Клиент локальных Python-bridge (проверенная схема оригинала):
 *   Next.js → http://127.0.0.1:8765 (kodik_bridge.py, anime-parsers)
 *   Next.js → http://127.0.0.1:8766 (multi_player_bridge.py, anime-dl-core: CVH/AniBoom)
 *
 * Контракт bridge (POST /resolve):
 *   вход:  { provider?, context: ProviderContext }
 *   выход: { sources: [{ translationId, label, kind, embedUrl, type }] } | { error }
 *
 * Клиент دفاعный: понимает несколько форм ответов (sources/results/embedUrl),
 * потому что исторические bridge могли отдавать слегка разные формы.
 */

export interface BridgeOptions {
  baseUrl: string;
  timeoutMs: number;
}

/** Bearer-токен для bridge за реверс-прокси (deploy/Caddyfile: Authorization "Bearer $BRIDGE_TOKEN").
 *  Для локальных 127.0.0.1-bridge не нужен — заголовок просто не добавляется. */
function authHeaders(): Record<string, string> {
  const t = process.env.BRIDGE_TOKEN;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function bridgeHealth(opts: BridgeOptions): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${opts.baseUrl}/health`, { headers: authHeaders(), signal: AbortSignal.timeout(Math.min(opts.timeoutMs, 3000)) });
    if (!res.ok) return { ok: false, reason: `health ${res.status}` };
    const json = (await res.json()) as { ok?: boolean; reason?: string };
    return { ok: json.ok !== false, reason: json.reason };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'bridge unreachable' };
  }
}

/* Аудит P3-4: health-gate с кэшем (ok 60с / down 300с) и таймаутом 1.2с:
   упавший bridge не съедает 3× PROVIDER_TIMEOUT, а сразу уводит в fallback. */
const healthCache = new Map<string, { at: number; ok: boolean }>();
export async function bridgeUp(opts: BridgeOptions): Promise<boolean> {
  const hit = healthCache.get(opts.baseUrl);
  const ttl = hit?.ok ? 60_000 : 300_000;
  if (hit && Date.now() - hit.at < ttl) return hit.ok;
  try {
    const res = await fetch(`${opts.baseUrl}/health`, { headers: authHeaders(), signal: AbortSignal.timeout(1200) });
    const json = res.ok ? ((await res.json()) as { ok?: boolean }) : { ok: false };
    const ok = res.ok && json.ok !== false;
    healthCache.set(opts.baseUrl, { at: Date.now(), ok });
    return ok;
  } catch {
    healthCache.set(opts.baseUrl, { at: Date.now(), ok: false });
    return false;
  }
}

export async function bridgeResolve(
  opts: BridgeOptions,
  provider: string,
  ctx: ProviderContext,
): Promise<{ sources: EpisodeSource[]; error?: string }> {
  // health-gate: bridge недоступен → мгновенный fallback вместо таймаута
  if (!(await bridgeUp(opts))) return { sources: [], error: 'bridge offline (health-gate)' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${opts.baseUrl}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ provider, context: ctx }),
      signal: controller.signal,
    });
    const json = (await res.json()) as Record<string, unknown>;
    const errText = typeof json?.error === 'string' ? json.error : undefined;
    if (!res.ok) return { sources: [], error: errText ?? `bridge ${res.status}` };
    return { sources: normalizeSources(json, provider), error: errText };
  } catch (e) {
    return { sources: [], error: e instanceof Error ? (e.name === 'AbortError' ? 'bridge timeout' : e.message) : 'bridge error' };
  } finally {
    clearTimeout(timer);
  }
}

/** Нормализация ответов bridge к единому EpisodeSource. */
type RawSource = Record<string, unknown> & { link?: unknown; kind?: unknown; type?: unknown };

function normalizeSources(json: Record<string, unknown>, provider: string): EpisodeSource[] {
  /* Аудит 30.09 (стиль-5): any[] заменён на RawSource — исторические формы ответов
     bridge (sources[]/results[], embedUrl/embed_url/url/link) tetap же защищённо. */
  const raw: RawSource[] = (Array.isArray(json?.sources) ? json.sources : Array.isArray(json?.results) ? json.results : []) as RawSource[];
  const out: EpisodeSource[] = [];
  for (const r0 of raw) {
    const r = r0 as RawSource & { embedUrl?: unknown; embed_url?: unknown; url?: unknown; translationId?: unknown; translation_id?: unknown; voice?: unknown; label?: unknown; translation?: unknown };
    const embedUrl: string | undefined =
      [r?.embedUrl, r?.embed_url, r?.url].find((v): v is string => typeof v === 'string') ??
      (typeof r?.link === 'string' && r.link.includes('/seria/') ? r.link : undefined);
    if (!embedUrl) continue;
    const translationId = String(r?.translationId ?? r?.translation_id ?? r?.voice ?? out.length);
    const label = String(r?.label ?? r?.translation ?? r?.voice ?? `Источник ${out.length + 1}`);
    out.push({
      id: `${provider}:${translationId}:${embedUrl.length}`,
      label,
      providerId: provider,
      providerName: providerLabel(provider),
      kind: 'embed',
      embedUrl: embedUrl.startsWith('//') ? `https:${embedUrl}` : embedUrl,
      translationId,
      voice: r?.kind === 'subtitles' ? 'subtitles' : r?.kind === 'voice' ? 'voice' : 'unknown',
      contentType: typeof r?.type === 'string' ? r.type : undefined,
    });
  }
  return out;
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case 'kodik':
      return 'Kodik';
    case 'cvh':
      return 'CVH (AnimeGo)';
    case 'aniboom':
      return 'AniBoom';
    case 'demo':
      return 'AniNova Demo';
    default:
      return provider;
  }
}
