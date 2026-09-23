import type { EpisodeSource, EpisodeSources, ProviderContext } from './types';
import { cacheGet, cacheEntriesForSlug } from './cache';

/**
 * Синтез серий 2+ без bridge/токенов — три ступени:
 *  1) шаблон из кэша episode-1 (или любой кэшированной серии): номер серии — часть URL
 *     у CVH (cdn-iframe/<id>/<voice>/<season>/<ep> или ?dubbing=…) и AniBoom (?episode=N);
 *  2) gap-fill: если у тайтла нет кэша CVH/AniBoom, но есть shikimoriId — подбираем
 *     URL пулом глобальных озвучек (имена озвучек глобальны, не привязаны к тайтлу);
 *  3) Kodik (/seria/<id>/<hash>) не синтезируется: hash уникален для каждой серии.
 */

const CVH_STANDARD_DUBBINGS = [
  'AnilibriaTV',
  'AniDUB',
  'SHIZA Project',
  'Amazing Dubbing',
  'Animedia',
  'Студийная Банда',
  'Persona99',
  'Crunchyroll',
  'AniLibria',
  'MiraiDUB',
];

export function rewriteCvh(url: string, episode: number): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'cdn-iframe' || parts.length < 3) return null;
    if (!/^\d+$/.test(parts[parts.length - 1])) return null;
    parts[parts.length - 1] = String(episode);
    u.pathname = '/' + parts.join('/');
    return u.toString();
  } catch {
    return null;
  }
}

export function rewriteAniboom(url: string, episode: number): string | null {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('episode')) return null;
    u.searchParams.set('episode', String(episode));
    return u.toString();
  } catch {
    return null;
  }
}

const synthFrom = (base: EpisodeSources, episode: number): EpisodeSource[] => {
  const out: EpisodeSource[] = [];
  for (const s of base.sources) {
    if (!s.embedUrl) continue;
    let url: string | null = null;
    if (s.providerId === 'cvh') url = rewriteCvh(s.embedUrl, episode);
    else if (s.providerId === 'aniboom') url = rewriteAniboom(s.embedUrl, episode);
    if (!url) continue;
    out.push({ ...s, id: `${s.id}:s${episode}`, embedUrl: url });
  }
  return out;
};

export async function synthesizeEpisode(ctx: ProviderContext): Promise<EpisodeSources | null> {
  /* 1) шаблон из episode-1 или любой ДРУГОЙ кэшированной серии с синтезируемыми URL */
  const candidates = [
    ...(await cacheEntriesForSlug(ctx.slug)).filter((e) => e.episode !== ctx.episode).map((e) => e.sources),
    ...(ctx.episode > 1 ? [await cacheGet(`ep:${ctx.slug}:1`)] : []),
  ];
  for (const base of candidates) {
    if (!base?.sources?.length) continue;
    const sources = synthFrom(base, ctx.episode);
    if (sources.length) {
      return { sources, sourcesUsed: [...new Set(sources.map((s) => s.providerId))].sort(), fromCache: false };
    }
  }

  /* 2) gap-fill пулом глобальных озвучек CVH (помечены guessed) */
  if (ctx.shikimoriId) {
    const sources: EpisodeSource[] = CVH_STANDARD_DUBBINGS.map((d, i) => ({
      id: `cvh:guess:${ctx.slug}:${ctx.episode}:${i}`,
      label: `CVH · ${d}`,
      providerId: 'cvh',
      providerName: 'CVH (AnimeGo)',
      kind: 'embed' as const,
      embedUrl: `https://animego.me/cdn-iframe/${ctx.shikimoriId}/1/${ctx.episode}?dubbing=${encodeURIComponent(d)}`,
      translationId: String(i),
      voice: 'voice' as const,
      guessed: true,
    }));
    return { sources, sourcesUsed: ['cvh'], fromCache: false };
  }

  return null;
}
