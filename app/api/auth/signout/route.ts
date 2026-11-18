import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/**
 * Выход из аккаунта на сервере.
 *
 * Клиентский SDK уже чистит cookies, но доверять только ему нельзя: если
 * access_token истёк, `signOut()` на клиенте может не дойти до Supabase, а
 * refresh-cookie останется — и proxy будет считать пользователя вошедшим.
 * Здесь сессия инвалидируется на сервере и cookies переписываются ответом.
 */
export async function POST(request: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: true, skipped: true });

  const supabase = await createServerSupabase();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* сеть недоступна — cookies всё равно нужно погасить */
    }
  }

  const response = NextResponse.json({ ok: true });

  /* Имена cookie у Supabase зависят от проекта (`sb-<ref>-auth-token`, а при
     разбиении на чанки — `…-auth-token.0`, `.1`), поэтому гасим по префиксу,
     а не по двум захардкоженным именам. Остальные cookie не трогаем. */
  const names = new Set<string>(['sb-access-token', 'sb-refresh-token']);
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith('sb-') && (name.includes('auth-token') || name.startsWith('sb-access') || name.startsWith('sb-refresh'))) {
      names.add(name);
    }
  }
  for (const name of names) {
    response.cookies.set(name, '', { path: '/', maxAge: 0, sameSite: 'lax', httpOnly: false });
  }
  return response;
}
