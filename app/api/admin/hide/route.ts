import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';

/** Скрыть/показать тайтл (A9.3): флаг hidden в titles.json, без деплоя. */
export async function POST(request: Request) {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const { slug, hidden } = (await request.json()) as { slug: string; hidden: boolean };
  const file = 'lib/data/titles.json';
  const titles = JSON.parse(await fs.readFile(file, 'utf8')) as (Record<string, unknown> & { slug: string })[];
  const t = titles.find((x) => x.slug === slug);
  if (!t) return NextResponse.json({ error: 'тайтл не найден' }, { status: 404 });
  t.hidden = hidden;
  await fs.writeFile(file, JSON.stringify(titles));
  // Инвалидируем ISR-кэш: страница тайтла (404/200) и все списки, где он мог быть.
  revalidatePath('/anime/' + slug);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, slug, hidden });
}
