import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';

const FILE = 'data/reports.json';

/** Жалоба на источник (A5.8): серия, озвучка, проблема → модерация. */
export async function POST(request: Request) {
  const b = (await request.json()) as { slug?: string; episode?: number; source?: string; problem?: string };
  if (!b.slug || !b.episode || !b.problem) return NextResponse.json({ error: 'заполните поля' }, { status: 400 });
  let rows: unknown[] = [];
  try {
    rows = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {}
  rows.push({ id: crypto.randomUUID(), ts: Date.now(), ...b });
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 1));
  return NextResponse.json({ ok: true });
}
