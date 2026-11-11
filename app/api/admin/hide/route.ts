import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/** Скрыть/показать тайтл (A9.3). Аудит 2026-11-12: Supabase-first — на serverless
 *  ФС read-only, и файловая запись либо падала EROFS, либо терялась при деплое.
 *  Файл остаётся фолбэком для self-hosted без БД (CATALOG_SOURCE=file). */
export async function POST(request: Request) {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const { slug, hidden } = (await request.json().catch(() => ({}))) as { slug?: string; hidden?: boolean };
  if (typeof slug !== 'string' || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'slug и hidden обязательны' }, { status: 400 });
  }

  if (SUPA_URL && SUPA_SERVICE) {
    const r = await fetch(`${SUPA_URL}/rest/v1/titles?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPA_SERVICE,
        Authorization: `Bearer ${SUPA_SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ hidden }),
    });
    if (!r.ok) return NextResponse.json({ error: 'db update failed', status: r.status }, { status: 502 });
    const rows = (await r.json()) as unknown[];
    if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: 'тайтл не найден' }, { status: 404 });
  } else {
    const file = 'lib/data/titles.json';
    try {
      const titles = JSON.parse(await fs.readFile(file, 'utf8')) as (Record<string, unknown> & { slug: string })[];
      const t = titles.find((x) => x.slug === slug);
      if (!t) return NextResponse.json({ error: 'тайтл не найден' }, { status: 404 });
      t.hidden = hidden;
      /* Атомарная запись (tmp+rename) — конкурентные скрытия не затирают друг друга. */
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(titles));
      await fs.rename(tmp, file);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'EROFS' || code === 'EACCES' || code === 'EPERM') {
        return NextResponse.json({ error: 'read-only ФС: задай SUPABASE_SERVICE_KEY или используй self-hosted' }, { status: 503 });
      }
      return NextResponse.json({ error: 'не удалось обновить каталог' }, { status: 500 });
    }
  }
  // Инвалидируем ISR-кэш: страница тайтла (404/200) и все списки, где он мог быть.
  revalidatePath('/anime/' + slug);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, slug, hidden });
}
