import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE = 'data/reports.json';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/**
 * Жалоба на источник (A5.8): серия, озвучка, проблема → модерация.
 *
 * Аудит 30.09 (P1-12), полная версия: основное хранилище — Supabase
 * (source_reports, работает и на serverless с read-only ФС); файловый
 * фолбэк оставлен для self-hosted без Supabase. Валидация типов
 * (не-строки раньше роняли роут в 500), лимиты размеров, атомарная запись.
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
  const source = typeof b.source === 'string' ? b.source.slice(0, 80) : '';
  const episode = Number.isInteger(b.episode) ? (b.episode as number) : Number.parseInt(String(b.episode ?? ''), 10);
  if (!slug || !problem || !Number.isFinite(episode)) {
    return NextResponse.json({ error: 'заполните поля' }, { status: 400 });
  }
  const row = { id: crypto.randomUUID(), ts: Date.now(), slug, episode, source, problem };

  // 1) Supabase (основной путь; RLS: insert только service_role)
  if (SUPA_URL && SUPA_SERVICE) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/source_reports`, {
        method: 'POST',
        headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
      if (r.ok) return NextResponse.json({ ok: true, storage: 'supabase' });
    } catch {
      /* сеть/Supabase недоступен — пробуем файловый фолбэк */
    }
  }

  // 2) Файловый фолбэк (self-hosted)
  let rows: unknown[] = [];
  try {
    rows = JSON.parse(await fs.readFile(FILE, 'utf8'));
    if (!Array.isArray(rows)) rows = [];
  } catch {}
  rows.push(row);
  if (rows.length > 1000) rows = rows.slice(-1000); // хвост не растёт бесконечно
  try {
    await atomicWriteJson(FILE, rows);
  } catch {
    return NextResponse.json({ error: 'хранилище недоступно (read-only fs?)' }, { status: 507 });
  }
  return NextResponse.json({ ok: true, storage: 'file' });
}
