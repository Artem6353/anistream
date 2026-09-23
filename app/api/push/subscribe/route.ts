import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';

const FILE = 'data/push-subs.json';

export async function POST(request: Request) {
  const sub = (await request.json()) as { endpoint?: string; keys?: unknown };
  if (!sub.endpoint) return NextResponse.json({ error: 'bad subscription' }, { status: 400 });
  let subs: unknown[] = [];
  try {
    subs = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {}
  subs = [...subs.filter((s) => (s as { endpoint?: string }).endpoint !== sub.endpoint), sub];
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(subs));
  return NextResponse.json({ ok: true, total: subs.length });
}
