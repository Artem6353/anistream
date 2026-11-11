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

/* Аудит 2026-11-12: атомарная запись (tmp+rename, как в hide) + понятная ошибка
   на read-only ФС serverless вместо голого 500 (EROFS). */
async function writeAtomic(data: unknown): Promise<NextResponse | null> {
  const tmp = `${FILE}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 1));
    await fs.rename(tmp, FILE);
    return null;
  } catch (e) {
    try { await fs.unlink(tmp); } catch { /* tmp мог не создаться */ }
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'EROFS' || code === 'EACCES' || code === 'EPERM') {
      return NextResponse.json(
        { error: 'read-only ФС: ручные источники работают только на self-hosted (или перенеси их в Supabase)' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'не удалось сохранить файл' }, { status: 500 });
  }
}

/** Редактор ручных источников (ТЗ 4.3): POST добавить, DELETE убрать. Только admin-cookie. */
export async function POST(request: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { slug?: string; episode?: number; label?: string; embedUrl?: string };
  if (!body.slug || !Number.isInteger(body.episode) || (body.episode ?? 0) < 1 || !body.embedUrl) {
    return NextResponse.json({ error: 'slug, episode (целое ≥ 1), embedUrl обязательны' }, { status: 400 });
  }
  try {
    if (new URL(body.embedUrl).protocol !== 'https:') throw new Error();
  } catch {
    return NextResponse.json({ error: 'embedUrl должен быть https-ссылкой' }, { status: 400 });
  }
  const data = await read();
  const byEp = (data[body.slug] ??= {});
  const list = (byEp[String(body.episode)] ??= []) as unknown[];
  list.push({ label: body.label || 'Ручной источник', embedUrl: body.embedUrl });
  const err = await writeAtomic(data);
  if (err) return err;
  return NextResponse.json({ ok: true, total: list.length });
}

export async function DELETE(request: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const u = new URL(request.url);
  const slug = u.searchParams.get('slug') ?? '';
  const ep = u.searchParams.get('episode') ?? '';
  const idx = Number(u.searchParams.get('idx') ?? -1);
  const data = await read();
  /* Аудит 2026-11-12: регрессия — `delete data[slug][ep]` при отсутствующем slug
     бросал TypeError (data[slug] === undefined) → голый 500. Теперь 404 JSON. */
  const byEp = data[slug];
  if (!byEp || !byEp[ep]) return NextResponse.json({ error: 'не найдено' }, { status: 404 });
  const list = byEp[ep] as unknown[];
  if (idx >= 0 && idx < list.length) list.splice(idx, 1);
  if (!list.length) delete byEp[ep];
  if (!Object.keys(byEp).length) delete data[slug];
  const err = await writeAtomic(data);
  if (err) return err;
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  return NextResponse.json(await read());
}
