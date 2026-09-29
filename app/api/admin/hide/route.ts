import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';

/** Скрыть/показать тайтл (A9.3): флаг hidden в titles.json, без деплоя. */
export async function POST(request: Request) {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const { slug, hidden } = (await request.json().catch(() => ({}))) as { slug?: string; hidden?: boolean };
  if (typeof slug !== 'string' || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'slug и hidden обязательны' }, { status: 400 });
  }
  const file = 'lib/data/titles.json';
  const titles = JSON.parse(await fs.readFile(file, 'utf8')) as (Record<string, unknown> & { slug: string })[];
  const t = titles.find((x) => x.slug === slug);
  if (!t) return NextResponse.json({ error: 'тайтл не найден' }, { status: 404 });
  t.hidden = hidden;
  /* Аудит 30.09 (P1-12): атомарная запись (tmp+rename) — конкурентные скрытия
     не затирают друг друга и читатели не видят половину файла. */
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(titles));
  await fs.rename(tmp, file);
  // Инвалидируем ISR-кэш: страница тайтла (404/200) и все списки, где он мог быть.
  revalidatePath('/anime/' + slug);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, slug, hidden });
}
