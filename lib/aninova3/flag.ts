/**
 * B1-B: новый интерфейс A+C живёт только в /preview/aninova-3 и только при
 * явно включённом флаге. Без переменной маршрут отдаёт 404, production-код
 * и текущий layout не меняются. Значение читается на сервере при запросе,
 * поэтому одна сборка годится и для выключенного, и для включённого режима.
 */
export function isAninova3PreviewEnabled(): boolean {
  const raw = (process.env.ANINOVA3_PREVIEW ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

export const A3_PREVIEW_ROOT = '/preview/aninova-3';
