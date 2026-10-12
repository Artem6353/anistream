import type { EpisodeSource, EpisodeSources } from '@/lib/providers/types';

/**
 * Реестр источников видео (аудит 2026-10, ТЗ 1.6/1.7).
 *
 * Проблема: на Vercel нет локальных Python-bridge (127.0.0.1:8765/8766), поэтому
 * прод жил на кэше, синтезе URL по шаблону и «подборе пулом озвучек». Всё это
 * показывалось зелёной точкой как «Источник в кэше», хотя ни один URL не был
 * получен от провайдера. Теперь источник правды — таблица Supabase `episode_sources`
 * (+ `episode_source_urls` для провайдеров с отдельной ссылкой на каждую серию),
 * которую наполняет воркер scripts/sync-sources.mjs. Кэш резолвов остаётся
 * fallback'ом до заполнения таблицы.
 *
 * «Подтверждённый» источник = запись со status 'ok' в БД либо прямой ответ провайдера
 * в кэше. Синтез (`synthesized`) и подбор (`guessed`) такими не считаются.
 */

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const dbReady = () => Boolean(SUPA_URL && SUPA_KEY);

/** Настроен ли Supabase — для веток, где файловый fallback недопустимо дорог. */
export const episodeSourcesDbConfigured = dbReady;

type SourceRow = {
  anime_id: number;
  provider: string;
  translation_id: string;
  translation_title: string | null;
  translation_type: string | null;
  kind: string | null;
  embed_url: string | null;
  episodes_count: number | null;
  checked_at: string | null;
  status: string | null;
};

type UrlRow = {
  provider: string;
  translation_id: string;
  episode: number;
  kind: string | null;
  embed_url: string | null;
  status: string | null;
};

async function rest<T>(path: string): Promise<T[] | null> {
  if (!dbReady()) return null;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      signal: AbortSignal.timeout(5000),
      /* ISR-кэш: страницы серий ревалидируются сами, не дёргаем БД на каждый запрос. */
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/** Есть ли у тайтла хотя бы один рабочий источник (для robots/index и зелёной точки). */
export async function titleHasSources(title: { slug: string; anilistId: number }): Promise<boolean> {
  /* Аудит 2026-10: файловый fallback (cacheEntriesForSlug) здесь намеренно ОТКЛЮЧЕН.
   * Он поднимал в память .cache/providers-resolve-cache.json (98 МБ): на машине
   * с 1 ГБ RAM серверный процесс падал в «FATAL ERROR: Reached heap limit» прямо
   * внутри JsonParser, когда страница серии вызывала эту функцию из generateMetadata.
   * Функция Vercel ограничена 1024 МБ — риск тот же. Теперь: нет таблицы → нет
   * подтверждённых источников (страницы серий остаются noindex, что соответствует
   * ТЗ 1.7.1), есть таблица → один лёгкий REST-запрос. */
  if (!SUPA_URL || !SUPA_KEY) return false;
  const rows = await rest<{ anime_id: number }>(
    `episode_sources?anime_id=eq.${title.anilistId}&status=eq.ok&select=anime_id&limit=1`,
  );
  return (rows?.length ?? 0) > 0;
}

const PROVIDER_NAMES: Record<string, string> = {
  kodik: 'Kodik',
  cvh: 'CVH (AnimeGo)',
  aniboom: 'AniBoom',
};

function rowToSource(row: SourceRow, episode: number, embedUrl?: string | null): EpisodeSource | null {
  const url = embedUrl ?? row.embed_url;
  if (!url) return null;
  const providerId = row.provider;
  const translationId = row.translation_id;
  return {
    id: `${providerId}:${translationId}:${episode}`,
    label: row.translation_title?.trim() || PROVIDER_NAMES[providerId] || providerId,
    providerId,
    providerName: PROVIDER_NAMES[providerId] ?? providerId,
    kind: row.kind === 'file' ? 'file' : 'embed',
    embedUrl: url,
    translationId,
    voice: row.translation_type === 'sub' ? 'subtitles' : 'voice',
    /* Это НЕ guess и НЕ synthesized: строку записал воркер из реального ответа провайдера. */
  };
}

/**
 * Источники конкретной серии из БД.
 * Два варианта хранения (ТЗ 1.6.1):
 *  - один embed на тайтл + номер серии параметром (CVH/AniBoom) → берём episode_sources;
 *  - отдельная ссылка на каждую серию (Kodik /seria/<id>/<hash>) → episode_source_urls.
 * Возвращает null, если БД не настроена или в ней ничего нет (вызывающий решает,
 * падать ли в кэш).
 */
export async function dbEpisodeSources(animeId: number, episode: number): Promise<EpisodeSources | null> {
  if (!dbReady()) return null;
  const [titles, urls] = await Promise.all([
    rest<SourceRow>(
      `episode_sources?anime_id=eq.${animeId}&status=eq.ok&select=anime_id,provider,translation_id,translation_title,translation_type,kind,embed_url,episodes_count,checked_at,status&limit=200`,
    ),
    rest<UrlRow>(
      `episode_source_urls?anime_id=eq.${animeId}&episode=eq.${episode}&status=eq.ok&select=provider,translation_id,episode,kind,embed_url,status&limit=200`,
    ),
  ]);
  if (titles === null && urls === null) return null;

  const urlByTranslation = new Map<string, UrlRow>();
  for (const u of urls ?? []) urlByTranslation.set(`${u.provider}:${u.translation_id}`, u);

  const sources: EpisodeSource[] = [];
  for (const row of titles ?? []) {
    // Явная per-episode ссылка важнее общего embed: у Kodik hash уникален для серии.
    const perEpisode = urlByTranslation.get(`${row.provider}:${row.translation_id}`);
    const src = rowToSource(row, episode, perEpisode?.embed_url);
    if (src) sources.push(src);
  }
  // Строки per-episode без общей записи (например, озвучка исчезла из episode_sources).
  for (const u of urls ?? []) {
    const key = `${u.provider}:${u.translation_id}`;
    if ((titles ?? []).some((r) => `${r.provider}:${r.translation_id}` === key)) continue;
    if (!u.embed_url) continue;
    sources.push({
      id: `${u.provider}:${u.translation_id}:${episode}`,
      label: PROVIDER_NAMES[u.provider] ?? u.provider,
      providerId: u.provider,
      providerName: PROVIDER_NAMES[u.provider] ?? u.provider,
      kind: u.kind === 'file' ? 'file' : 'embed',
      embedUrl: u.embed_url,
      translationId: u.translation_id,
      voice: 'voice',
    });
  }

  if (!sources.length) return null;
  return {
    sources,
    sourcesUsed: [...new Set(sources.map((s) => s.providerId))].sort(),
    fromCache: false,
  };
}
