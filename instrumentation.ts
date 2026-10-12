/**
 * Next.js instrumentation: выполняется один раз при старте серверного процесса.
 *
 * Аудит 2026-10 (ТЗ 2.1 + задача 1): каталог и свежие числа «сколько серий вышло»
 * подтягиваются из Supabase до первого запроса, чтобы страницы не ждали выборку
 * на рендере. Пока прайм не завершился или если БД не настроена/недоступна,
 * lib/catalog.ts работает из lib/data/titles.json — деградации нет.
 *
 * ВАЖНО: импорты ОБЯЗАТЕЛЬНО динамические. Next собирает instrumentation для двух
 * рантаймов (nodejs и edge), и статический `import { … } from '@/lib/catalog'`
 * ломал edge-сборку: lib/catalog.ts тянет node:fs и node:path, которых в Edge нет
 * («A Node.js module is loaded which is not supported in the Edge Runtime» →
 * «Ecmascript file had an error», дев-сервер закрывал сокет на каждом запросе).
 * Проверка NEXT_RUNTIME до импорта оставляет edge-бандл пустым.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { primeCatalogFromDb } = await import('@/lib/catalog');
  const count = await primeCatalogFromDb().catch(() => 0);
  if (count) console.log(`[catalog] загружено из Supabase: ${count} тайтлов`);

  /* Задача 1 аудита: свежие числа «вышло N серий» из episode_progress /
     airing_progress / titles.episodes_released. Без этого границей у «Ван-Пис»
     оставалось 1134 из устаревшего поля airing, и серии 1135…1180 отдавали 404. */
  const { primeEpisodeData } = await import('@/lib/episode-data');
  const primed = await primeEpisodeData().catch(() => null);
  if (primed?.updated) {
    console.log(`[episodes] свежее число серий из БД (${primed.from.join('+')}): ${primed.updated} тайтлов`);
  }
}
