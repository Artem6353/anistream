import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from './env';

/** Сегменты /profile, которые требуют входа.
 *
 *  Защищён только сам кабинет (/profile). Вкладки /profile/list, /history,
 *  /bookmarks, /settings остаются публичными: они работают на локальных данных
 *  (гость может вести списки и настройки без аккаунта — это осознанное поведение
 *  продукта). Публичные профили /profile/<username> тоже открыты: их читают гости
 *  и поисковые роботы. */
const PRIVATE_PROFILE_SEGMENTS = new Set(['']);

/**
 * Нужен ли вход для этого пути.
 *
 * Отдельная чистая функция (а не инлайн-проверка в proxy) — чтобы правило можно было
 * покрыть тестом: ошибка здесь либо закрывает публичные профили от гостей, либо
 * оставляет личный кабинет открытым.
 */
export function isProtectedPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (!clean.startsWith('/profile')) return false;
  const rest = clean.slice('/profile'.length).replace(/^\/+/, '');
  if (!rest) return true; // ровно /profile — личный кабинет
  const [first] = rest.split('/');
  return PRIVATE_PROFILE_SEGMENTS.has(first);
}

/** Куда вернуть пользователя после входа. Только внутренние пути: открытый редирект
 *  на внешний домен — классическая фишинг-уязвимость. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/profile';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/profile';
  return next;
}

export interface SessionResult {
  response: NextResponse;
  user: User | null;
}

/**
 * Обновление сессии Supabase на каждом запросе к защищённым путям.
 *
 * Зачем в proxy, а не в странице: serverless-инстанс не хранит таймеров, поэтому
 * access_token истекает молча, и первый же серверный рендер видит «гостя».
 * Supabase-ssr обновляет пару токенов по refresh-cookie и переписывает cookies в
 * ответе — это единственное место, где запись cookies разрешена всегда.
 */
export async function refreshSupabaseSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });

  if (!supabaseConfigured()) return { response, user: null };

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });

  try {
    const { data } = await supabase.auth.getUser();
    return { response, user: data.user ?? null };
  } catch {
    /* Supabase недоступен (сеть/таймаут) — не блокируем навигацию: страницы сами
       покажут состояние «сессия недоступна», а не бесконечный редирект. */
    return { response, user: null };
  }
}
