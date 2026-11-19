import type { EpisodeSource, EpisodeSources, ProviderContext } from './types';
import { cacheGet, cacheEntriesForSlug } from './cache';
import { rewriteAniboom, rewriteCvh } from './url';

/* Совместимость: исторически эти функции жили здесь и импортируются тестами. */
export { rewriteAniboom, rewriteCvh } from './url';

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


const synthFrom = (base: EpisodeSources, episode: number): EpisodeSource[] => {
  const out: EpisodeSource[] = [];
  for (const s of base.sources) {
    if (!s.embedUrl) continue;
    let url: string | null = null;
    if (s.providerId === 'cvh') url = rewriteCvh(s.embedUrl, episode);
    else if (s.providerId === 'aniboom') url = rewriteAniboom(s.embedUrl, episode);
    if (!url) continue;
    out.push({ ...s, id: `${s.id}:s${episode}`, embedUrl: url, synthesized: true });
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
