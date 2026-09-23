import { Client, VideoLinks, getPublicToken, ClientError } from 'kodikwrapper';
import type { ProviderContext, ResolveOutcome, SkipWindow, StreamFile } from './types';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { aniskipSkipTimes } from '@/lib/aniskip';
import { directToSource } from './providers/kodik';

export class ProviderLockedError extends Error {
  hint: string;
  constructor(provider: string, hint: string) {
    super(`provider ${provider} is locked`);
    this.hint = hint;
  }
}

export class ProviderResolveError extends Error {}

const toSeconds = (s: string): number =>
  String(s)
    .split(':')
    .reduce((acc, part) => acc * 60 + Number(part || 0), 0);

const abs = (u: string) => (u.startsWith('//') ? `https:${u}` : u);

let publicTokenCache: { at: number; token: string } | null = null;
async function getPublicTokenCached(fetcher: typeof fetch): Promise<string> {
  if (publicTokenCache && Date.now() - publicTokenCache.at < 3_600_000) return publicTokenCache.token;
  const token = String(await getPublicToken({ fetcher }));
  publicTokenCache = { at: Date.now(), token };
  return token;
}

/**
 * Kodik через kodikwrapper: поиск по shikimori_id (из обогащённого датасета),
 * прямые HLS-ссылки через VideoLinks.getLinks, тайминги OP/ED из skipButtons.
 * Если прямые ссылки недоступны — фолбэк в embed-плеер Kodik (iframe).
 */
/**
 * Запасной прямой путь kodikwrapper (когда bridge выключен, а токен жив):
 * episode-specific link из seasons→episodes, VideoLinks.getLinks (HLS),
 * фолбэк — embed плеера Kodik. Озвучка и skip-тайминги сохраняются.
 */
export async function resolveKodikDirect(ctx: ProviderContext): Promise<ResolveOutcome> {
  const cfg = getProvidersConfig();
  const token = cfg.kodik.token;
  if (!token || !cfg.kodik.enabled) return { sources: [], error: 'Kodik: нет токена или bridge' };

  const fetcher: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(cfg.kodik.timeoutMs) });
  VideoLinks.config({ fetcher });

  const params: Record<string, unknown> = { limit: cfg.kodik.episodeSearchLimit, episode: ctx.episode, with_episodes_data: true };
  if (ctx.shikimoriId) params.shikimori_id = ctx.shikimoriId;
  else params.title_orig = ctx.originalTitle;

  const isAuthError = (e: unknown) => e instanceof ClientError && /token|токен/i.test(e.message);
  const searchWith = async (tk: string) => {
    const client = Client.fromToken(tk, { kodikApiUrl: cfg.kodik.apiUrl, fetcher });
    return client.search(params as never);
  };
  let response;
  try {
    response = await searchWith(token);
  } catch (e) {
    if (!isAuthError(e)) return { sources: [], error: e instanceof Error ? e.message : 'kodik error' };
    try {
      const publicToken = String(await getPublicToken({ fetcher }));
      if (publicToken === token) return { sources: [], error: 'Kodik: токен отклонён (ротация/geo-block)' };
      response = await searchWith(publicToken);
    } catch (e2) {
      return { sources: [], error: e2 instanceof Error ? e2.message : 'kodik auth error' };
    }
  }

  const materials = (response?.results ?? []) as Record<string, any>[];
  if (!materials.length) return { sources: [], error: 'Kodik: материал не найден' };

  let link = '';
  for (const m of materials) {
    const seasons = m.seasons as Record<string, { episodes?: Record<string, { link?: string }> }> | undefined;
    if (!seasons) continue;
    for (const season of Object.values(seasons)) {
      const ep = season?.episodes?.[String(ctx.episode)];
      if (ep?.link) {
        link = ep.link;
        break;
      }
    }
    if (link) break;
  }
  if (!link) link = materials[0].link;
  if (!link) return { sources: [], error: 'Kodik: нет ссылки плеера' };

  const parsed = await VideoLinks.parseLink({ link, extended: true }).catch(() => null);
  const translation: string | null = parsed?.ex?.translation?.title ?? materials[0]?.translation?.title ?? null;
  const translationId = String(parsed?.ex?.translation?.id ?? materials[0]?.translation?.id ?? '');

  let skip: SkipWindow | undefined;
  if (parsed?.ex?.skipButtons) {
    try {
      const buttons = VideoLinks.parseSkipButtons(parsed.ex.skipButtons);
      if (buttons?.length) {
        skip = { intro: [toSeconds(buttons[0].from), toSeconds(buttons[0].to)] };
        if (buttons[1]) skip.outro = [toSeconds(buttons[1].from), toSeconds(buttons[1].to)];
      }
    } catch {
      skip = undefined;
    }
  }
  if (!skip && cfg.aniskip.enabled && ctx.malId) {
    skip = await aniskipSkipTimes(ctx.malId, ctx.episode);
  }

  const rawLinks = await VideoLinks.getLinks({ link }).catch(() => null);
  let files: StreamFile[] | undefined;
  if (rawLinks && Object.keys(rawLinks).length) {
    files = Object.entries(rawLinks)
      .map(([quality, arr]) => {
        const first = (arr as { src: string; type: string }[])[0];
        return { quality, url: abs(first.src), type: first.type.includes('mpegURL') ? ('hls' as const) : ('mp4' as const) };
      })
      .sort((a, b) => Number(b.quality) - Number(a.quality));
  }

  const source = directToSource({ translation, translationId, files, embedUrl: files ? undefined : abs(link) });
  if (!source) return { sources: [], error: 'Kodik: нет источников' };
  return { sources: [source], skip };
}
