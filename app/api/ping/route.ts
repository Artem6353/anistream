import { NextResponse } from 'next/server';

/**
 * Диагностический пинг (инцидент 2026-11-17): самый дешёвый маршрут приложения.
 *
 * Зачем отдельно от `/api/health`: health читает каталог (~110 мс на тёплом
 * инстансе, до нескольких секунд на холодном) и опрашивает кэш. Когда прод
 * перестаёт отвечать, нужно мгновенно понять, где проблема:
 *   • `/api/ping` отвечает → функция жива, тормозит конкретная работа (каталог/БД/кэш);
 *   • `/api/ping` тоже молчит → виноват хостинг/деплой, а не код.
 *
 * Ничего не читает с диска, не ходит в БД и не зависит от каталога.
 */
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json(
    { ok: true, ts: new Date().toISOString(), pid: process.pid },
    { headers: { 'cache-control': 'no-store' } },
  );
}
