import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/catalog';
import { maxEpisodeNumberDb } from '@/lib/episode-route';
import { resolveEpisodeSources, contextFromTitle, providersWithAvailability } from '@/lib/providers';
import { providerResponseCacheControl } from '@/lib/providers/response-cache';

export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string; episode: string }>;
}

/** A8.1: in-flight dedupe — N одновременных GET одной серии = ОДИН resolve.
 *  Бурст из 60 параллельных запросов на 1 ГБ машине ронял сервер по OOM (каждый запрос
 *  сам шёл в bridge/кэш); c dedupe память и апстрим-трафик не масштабируются
 *  числом одновременных клиентов. Результат общий для всех участников. */
const inflight = new Map<string, ReturnType<typeof resolveEpisodeSources>>();

function resolveOnce(key: string, ctx: Parameters<typeof resolveEpisodeSources>[0], options: { liveOnly?: boolean } = {}) {
  const existing = inflight.get(key);
  if (existing) return existing;
  /* .catch перед .finally: промис в карте обязан иметь обработчик сразу, иначе
     reject до первого await участника стал бы unhandled rejection (Node по
     умолчанию роняет процесс). Все вызователи await'ят результат внутри своих
     try/catch и получают ошибку как JSON. */
  const p = resolveEpisodeSources(ctx, options)
    .catch((e) => {
      inflight.delete(key);
      throw e;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Единая точка входа плеер-источников (схема оригинала):
 *   GET /api/providers/[slug]/[episode]
 *   → EpisodeSources: озвучки/источники всех включённых провайдеров + demo,
 *     cache-first; missing providers are resolved in parallel and merged.
 * Токены и bridge-адреса не покидают сервер.
 *
 * ИНЦИДЕНТ 2026-10-13: getTitle() и maxEpisodeNumberDb() стояли ВНЕ try/catch,
 * поэтому любое их исключение (например statSync ENOENT по lib/data/titles.json
 * на холодном процессе без прайма каталога) превращалось в голый текст
 * «Internal Server Error» (500) вместо контрактного JSON — плеер показывал
 * «API источников вернул HTTP 500» без причины. Теперь КАЖДАЯ фаза обёрнута и
 * любой сбой отвечает JSON { error, message } с кодом 500 (404/400 сохранены).
 */
export async function GET(request: Request, { params }: Props) {
  let slug: string;
  let episodeRaw: string;
  try {
    ({ slug, episode: episodeRaw } = await params);
  } catch (e) {
    return NextResponse.json({ error: 'bad params', message: errMessage(e) }, { status: 400 });
  }

  let title: ReturnType<typeof getTitle>;
  try {
    title = getTitle(slug);
  } catch (e) {
    return NextResponse.json({ error: 'catalog', message: errMessage(e) }, { status: 500 });
  }
  if (!title) return NextResponse.json({ error: 'title not found' }, { status: 404 });

  /* Аудит 30.09 (P2-24): 'abc'/9999 молча отдавали серию 1 — невалидный ввод теперь 400.
     Аудит 2026-10 (ТЗ 1.2): граница — число ВЫШЕДШИХ серий из единого правила.
     Раньше здесь стояло поле `episodes` с заглушкой импортера: /api/providers/one-piece/25
     отвечал 400, хотя серий вышло 1134. */
  const epNum = Number(episodeRaw);
  let maxEpisode: number;
  try {
    maxEpisode = await maxEpisodeNumberDb(title);
  } catch (e) {
    return NextResponse.json({ error: 'episode-boundary', message: errMessage(e) }, { status: 500 });
  }
  if (!Number.isInteger(epNum) || epNum < 1 || epNum > maxEpisode) {
    return NextResponse.json({ error: 'bad episode', maxEpisode }, { status: 400 });
  }
  const episode = epNum;

  try {
    const searchParams = new URL(request.url).searchParams;
    const preferFiles = searchParams.get('files') === '1';
    // Bulk backfill can bypass existing cache and URL-template synthesis.
    const liveOnly = searchParams.get('live') === '1';
    const ctx = { ...contextFromTitle(title, episode), preferFiles };
    const resolveKey = `${slug}:${episode}${preferFiles ? ':files' : ''}${liveOnly ? ':live' : ''}`;
    const sources = await resolveOnce(resolveKey, ctx, { liveOnly });
    return NextResponse.json(
      { ...sources, providers: providersWithAvailability() },
      { headers: { 'Cache-Control': providerResponseCacheControl(sources) } },
    );
  } catch (e) {
    return NextResponse.json({ error: 'upstream', message: errMessage(e) }, { status: 502 });
  }
}
