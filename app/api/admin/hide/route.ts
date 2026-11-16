import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';
import { setTitleHidden } from '@/lib/catalog';
import { log } from '@/lib/logger';

/**
 * Скрыть/показать тайтл (A9.3): БЕЗ деплоя.
 *
 * Аудит (P1-4): раньше флаг писался только в `lib/data/titles.json`, поэтому в
 * DB-режиме (`CATALOG_SOURCE=db` — дефолт при заданных Supabase-переменных)
 * модерация не работала: каталог читается из in-memory кэша public.titles, файл
 * не читается вовсе, а на serverless (Vercel/Netlify) запись в репозиторий вообще
 * падала с 500. Теперь запись идёт через `setTitleHidden()`: DB → PATCH titles
 * (+ правка кэша без рестарта), файловый режим → атомарная запись tmp+rename.
 */
export async function POST(request: Request) {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) {
    return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  }
  const { slug, hidden } = (await request.json().catch(() => ({}))) as { slug?: string; hidden?: boolean };
  if (typeof slug !== 'string' || !slug || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'slug и hidden обязательны' }, { status: 400 });
  }

  let result: { source: 'db' | 'file'; found: boolean };
  try {
    result = await setTitleHidden(slug, hidden);
  } catch (e) {
    /* read-only ФС на serverless или сбой Supabase: честный JSON вместо пустого 500. */
    log('error', 'admin hide failed', { slug, hidden, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: 'не удалось сохранить флаг hidden', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  if (!result.found) return NextResponse.json({ error: 'тайтл не найден' }, { status: 404 });

  /* Инвалидируем ISR-кэш: страница тайтла (404/200), карта сайта и все списки,
     где он мог быть. В DB-режиме in-memory кэш уже обновлён внутри
     setTitleHidden(), поэтому достаточно сбросить RSC/ISR-слой. */
  revalidatePath('/anime/' + slug);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, slug, hidden, source: result.source });
}
