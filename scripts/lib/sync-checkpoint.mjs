/**
 * Чекпоинт sync-sources: какие тайтлы уже проверялись и когда.
 *
 * Раньше `done` был массивом ID без времени и после первого полного прохода
 * навсегда исключал тайтл из выборки. Онгоинги переставали обновляться: новая
 * серия выходила, но sync-sources больше не делал для неё /search. Теперь
 * храним timestamp и перепроверяем тайтл после SYNC_TITLE_TTL_MINUTES.
 */

export function parseDone(raw) {
  const done = new Map();
  if (Array.isArray(raw)) {
    // Старый формат: время неизвестно → считаем проверку давно просроченной.
    for (const id of raw) if (id !== null && id !== undefined) done.set(String(id), 0);
    return done;
  }
  if (raw && typeof raw === 'object') {
    for (const [id, at] of Object.entries(raw)) {
      const ts = Number(at);
      if (Number.isFinite(ts)) done.set(String(id), ts);
    }
  }
  return done;
}

export function isDoneRecently(done, id, nowMs, ttlMs) {
  const at = done?.get?.(String(id));
  if (!Number.isFinite(at)) return false;
  return ttlMs > 0 && nowMs - at < ttlMs;
}

export function markDone(done, id, nowMs) {
  done.set(String(id), nowMs);
  return done;
}

/** Не даём чекпоинту расти бесконечно; старые записи и так будут перепроверены. */
export function serializeDone(done, nowMs, maxAgeMs = 90 * 24 * 3600 * 1000) {
  const out = {};
  for (const [id, at] of done ?? []) {
    if (!Number.isFinite(at)) continue;
    if (maxAgeMs > 0 && nowMs - at > maxAgeMs) continue;
    out[id] = at;
  }
  return out;
}
