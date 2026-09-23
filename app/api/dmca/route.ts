import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';

const FILE = 'data/dmca.json';

export async function POST(request: Request) {
  const b = (await request.json()) as { email?: string; url?: string; rights?: boolean; text?: string };
  if (!b.email || !b.url || !b.rights || !b.text || b.text.length < 20) {
    return NextResponse.json({ error: 'заполните все поля (текст от 20 символов)' }, { status: 400 });
  }
  let tickets: unknown[] = [];
  try {
    tickets = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {}
  const slugMatch = b.url.match(/\/anime\/([a-z0-9-]+)/);
  tickets.push({ id: crypto.randomUUID(), ts: Date.now(), ...b, slug: slugMatch?.[1] ?? null, status: 'new' });
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(tickets, null, 1));
  return NextResponse.json({ ok: true });
}
