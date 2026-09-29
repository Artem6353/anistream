import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE = 'data/dmca.json';

/**
 * DMCA-заявка. Аудит 30.09 (P1-12): валидация типов (b.url.match на не-строке
 * ронял роут в 500), лимиты размеров, атомарная запись, явный 507 при read-only ФС.
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
  let tickets: unknown[] = [];
  try {
    tickets = JSON.parse(await fs.readFile(FILE, 'utf8'));
    if (!Array.isArray(tickets)) tickets = [];
  } catch {}
  const slugMatch = url.match(/\/anime\/([a-z0-9-]+)/);
  tickets.push({ id: crypto.randomUUID(), ts: Date.now(), email, url, rights: true, text, slug: slugMatch?.[1] ?? null, status: 'new' });
  if (tickets.length > 1000) tickets = tickets.slice(-1000);
  try {
    await atomicWriteJson(FILE, tickets);
  } catch {
    return NextResponse.json({ error: 'хранилище недоступно (read-only fs?)' }, { status: 507 });
  }
  return NextResponse.json({ ok: true });
}
