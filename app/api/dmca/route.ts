import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE = 'data/dmca.json';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/**
 * DMCA-заявка. Аудит 30.09 (P1-12), полная версия: основное хранилище —
 * Supabase (dmca_requests, работает на serverless с read-only ФС), файловый
 * фолбэк для self-hosted без Supabase. Валидация типов/email (b.url.match на
 * не-строке ронял роут в 500), лимиты размеров, атомарная запись.
 */

async function atomicWriteJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, file);
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { email?: unknown; url?: unknown; rights?: unknown; text?: unknown };
  const email = typeof b.email === 'string' ? b.email.trim().slice(0, 200) : '';
  const url = typeof b.url === 'string' ? b.url.trim().slice(0, 500) : '';
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 4000) : '';
  if (!email || !url || !b.rights || text.length < 20) {
    return NextResponse.json({ error: 'заполните все поля (текст от 20 символов)' }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'некорректный email' }, { status: 400 });
  }
  const slugMatch = url.match(/\/anime\/([a-z0-9-]+)/);
  const row = { id: crypto.randomUUID(), ts: Date.now(), email, url, rights: true, text, slug: slugMatch?.[1] ?? null, status: 'new' };

  // 1) Supabase (основной путь; RLS: insert только service_role)
  if (SUPA_URL && SUPA_SERVICE) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/dmca_requests`, {
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
  let tickets: unknown[] = [];
  try {
    tickets = JSON.parse(await fs.readFile(FILE, 'utf8'));
    if (!Array.isArray(tickets)) tickets = [];
  } catch {}
  tickets.push(row);
  if (tickets.length > 1000) tickets = tickets.slice(-1000);
  try {
    await atomicWriteJson(FILE, tickets);
  } catch {
    return NextResponse.json({ error: 'хранилище недоступно (read-only fs?)' }, { status: 507 });
  }
  return NextResponse.json({ ok: true, storage: 'file' });
}
