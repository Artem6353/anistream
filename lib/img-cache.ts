/**
 * Заголовки кэширования картинок (инцидент 2026-11-17).
 *
 * Разбор: `/img` отдавал `Cache-Control: public, max-age=31536000, immutable` —
 * такой ответ кэширует только браузер. CDN его игнорировал (`X-Vercel-Cache: MISS`
 * и `Age: 0` на каждом постере), поэтому 26 картинок на странице тайтла = 26
 * вызовов функции: 0,34 с на тёплом инстансе и 6–15 с на холодном.
 *
 * Вывод: картинки должны жить в кэше края. Для Vercel мало `s-maxage` — он
 * управляет кэшем функций, а не CDN-слоя; CDN читает `CDN-Cache-Control`
 * (и `Vercel-CDN-Cache-Control` для внутреннего слоя). Держим оба, чтобы работало
 * и на self-hosted/Netlify (там достаточно `s-maxage`).
 */

export const IMAGE_IMMUTABLE_CACHE = 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable';
export const IMAGE_SHORT_CACHE = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=600';
const CDN_IMMUTABLE = 'public, max-age=31536000, stale-while-revalidate=86400';
const CDN_SHORT = 'public, max-age=3600, stale-while-revalidate=600';

export interface ImageHeaderOptions {
  /** `fmt=auto` — ответ зависит от Accept, край должен различать варианты. */
  vary?: boolean;
  /** true — картинка неизменяемая (иммутабельный кэш), false — короткий TTL. */
  immutable?: boolean;
}

export function imageHeaders({ vary = false, immutable = true }: ImageHeaderOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': immutable ? IMAGE_IMMUTABLE_CACHE : IMAGE_SHORT_CACHE,
    'CDN-Cache-Control': immutable ? CDN_IMMUTABLE : CDN_SHORT,
    'Vercel-CDN-Cache-Control': immutable ? CDN_IMMUTABLE : CDN_SHORT,
  };
  if (vary) headers.Vary = 'Accept';
  return headers;
}
