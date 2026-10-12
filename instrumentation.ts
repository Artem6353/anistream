/**
 * Next.js instrumentation (ТОЛЬКО nodejs-рантайм).
 *
 * Файл обязан называться `instrumentation.node.ts`, а не `instrumentation.ts`:
 * обычный instrumentation.ts Next собирает для ОБОИХ рантаймов, и даже динамический
 * `await import('@/lib/catalog')` попадал в edge-бандл API-роутов — сборка падала с
 * «Module build failed: UnhandledSchemeError: Reading from "node:fs" is not handled
 * by plugins» при компиляции /api/providers/[slug]/[episode] (проверено в dev).
 * Суффикс `.node` гарантирует, что файл грузится только в Node.js.
 *
 * Что делает (аудит 2026-10, ТЗ 2.1 + задача 1): один раз при старте серверного
 * процесса подтягивает из Supabase каталог (public.titles) и свежие числа
 * «сколько серий вышло» (episode_progress / airing_progress / titles.episodes_released).
 * Пока прайм не завершился или если БД не настроена/недоступна, lib/catalog.ts и
 * lib/episodes.ts работают из lib/data/titles.json — деградации нет.
 */
export async function register() {
  const { primeCatalogFromDb } = await import('@/lib/catalog');
  const count = await primeCatalogFromDb().catch(() => 0);
  if (count) console.log(`[catalog] загружено из Supabase: ${count} тайтлов`);

  const { primeEpisodeData } = await import('@/lib/episode-data');
  const primed = await primeEpisodeData().catch(() => null);
  if (primed?.updated) {
    console.log(`[episodes] свежее число серий из БД (${primed.from.join('+')}): ${primed.updated} тайтлов`);
  }
}
