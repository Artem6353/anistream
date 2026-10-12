/**
 * Переопределения «сколько серий вышло» из БД (аудит 2026-10, задача 1).
 *
 * Зачем отдельный модуль: lib/episodes.ts — единственная точка, где считается число
 * серий, и её вызывают из синхронных мест (generateStaticParams, JSON-LD, карточки,
 * /api/*). Сделать её асинхронной нельзя, поэтому свежие числа из БД подмешиваются
 * сюда один раз при старте процесса (instrumentation.ts → primeEpisodeData),
 * а episodeInfo() просто берёт максимум.
 *
 * Отдельный модуль (а не поле в lib/catalog.ts) — чтобы не было цикла импортов:
 * catalog → episodes → catalog.
 */

const overrides = new Map<number, number>();

/** Заменить переопределения целиком (прайм на старте и после ревалидации). */
export function setReleasedOverrides(next: Map<number, number>): void {
  overrides.clear();
  for (const [id, released] of next) {
    if (Number.isFinite(released) && released > 0) overrides.set(id, released);
  }
}

export function getReleasedOverride(anilistId: number | undefined): number | undefined {
  if (anilistId === undefined) return undefined;
  return overrides.get(anilistId);
}

export function releasedOverridesSize(): number {
  return overrides.size;
}
