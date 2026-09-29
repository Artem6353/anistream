import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE = 'data/reports.json';

/**
 * Жалоба на источник (A5.8): серия, озвучка, проблема → модерация.
 * Аудит 30.09 (P1-12): валидация типов (не-строки раньше роняли роут в 500),
 * лимиты размеров, атомарная запись (tmp+rename — конкурентные POST не теряют
 * строки), явная обработка ошибок ФС (read-only на serverless → 507, не 500-краш).
 */

async function atomicWriteJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, file);
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { slug?: unknown; episode?: unknown; source?: unknown; problem?: unknown };
  const slug = typeof b.slug === 'string' ? b.slug.slice(0, 120) : '';
  const problem = typeof b.problem === 'string' ? b.problem.trim().slice(0, 500) : '';
  const episode = Number.isInteger(b.episode) ? (b.episode as number) : Number.parseInt(String(b.episode ?? ''), 10);
  if (!slug || !problem || !Number.isFinite(episode)) {
    return NextResponse.json({ error: 'заполните поля' }, { status: 400 });
  }
  let rows: unknown[] = [];
  try {
    rows = JSON.parse(await fs.readFile(FILE, 'utf8'));
    if (!Array.isArray(rows)) rows = [];
  } catch {}
  rows.push({
    id: crypto.randomUUID(),
    ts: Date.now(),
    slug,
    episode,
    source: typeof b.source === 'string' ? b.source.slice(0, 80) : undefined,
    problem,
  });
  /* Хвост не растёт бесконечно: модерация смотрит последние 1000. */
  if (rows.length > 1000) rows = rows.slice(-1000);
  try {
    await atomicWriteJson(FILE, rows);
  } catch {
    return NextResponse.json({ error: 'хранилище недоступно (read-only fs?)' }, { status: 507 });
  }
  return NextResponse.json({ ok: true });
}
