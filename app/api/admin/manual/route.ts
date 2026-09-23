import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { cookies } from 'next/headers';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';

const FILE = 'lib/data/manual-sources.json';

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminCookie(store.get(adminCookieName())?.value);
}

async function read(): Promise<Record<string, Record<string, unknown[]>>> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Редактор ручных источников (ТЗ 4.3): POST добавить, DELETE убрать. Только admin-cookie. */
export async function POST(request: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const body = (await request.json()) as { slug?: string; episode?: number; label?: string; embedUrl?: string };
  if (!body.slug || !body.episode || !body.embedUrl) return NextResponse.json({ error: 'slug, episode, embedUrl обязательны' }, { status: 400 });
  const data = await read();
  const byEp = (data[body.slug] ??= {});
  const list = (byEp[String(body.episode)] ??= []) as unknown[];
  list.push({ label: body.label || 'Ручной источник', embedUrl: body.embedUrl });
  await fs.writeFile(FILE, JSON.stringify(data, null, 1));
  return NextResponse.json({ ok: true, total: list.length });
}

export async function DELETE(request: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const u = new URL(request.url);
  const slug = u.searchParams.get('slug') ?? '';
  const ep = u.searchParams.get('episode') ?? '';
  const idx = Number(u.searchParams.get('idx') ?? -1);
  const data = await read();
  const list = (data?.[slug]?.[ep] ?? []) as unknown[];
  if (idx >= 0 && idx < list.length) list.splice(idx, 1);
  if (!list.length) delete data[slug][ep];
  if (!Object.keys(data[slug] ?? {}).length) delete data[slug];
  await fs.writeFile(FILE, JSON.stringify(data, null, 1));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  return NextResponse.json(await read());
}
