import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { LIMITS, rateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/ip';
/* ИНЦИДЕНТ 2026-10-13: раньше genreRedirectTarget импортировался из
   '@/lib/genre-pages', который транзитивно тянет lib/catalog (node:fs,
   statSync в module-scope). Edge Runtime не имеет node:fs — middleware падал
   на module-scope и весь matcher (/api/*, /genre/*) отвечал голым 500.
   Правило редиректа вынесено в edge-safe '@/lib/genre-redirect' (только
   lib/labels); регрессия закрыта тестом tests/edge-import-guard.test.ts. */
import { genreRedirectTarget } from '@/lib/genre-redirect';
import { isProtectedPath, refreshSupabaseSession, safeNextPath } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  /* Каноникализация хоста при переезде (SEO-микс Vercel+Netlify): если задан
     CANONICAL_HOST и запрос пришёл на другой хост — 301 на тот же путь.
     Ставится на СТАРОМ хосте (Vercel): вес выдачи переезжает без дублей.
     Edge-safe: только URL-API, без импортов каталога. */
  const canonical = (process.env.CANONICAL_HOST ?? '').trim().toLowerCase();
  if (canonical && request.nextUrl.hostname.toLowerCase() !== canonical) {
    const url = request.nextUrl.clone();
    url.host = canonical;
    url.protocol = 'https:';
    return NextResponse.redirect(url, 301);
  }

  /* Аудит 2026-10 (задача 3): старые URL жанров с query → новые сегменты пути.
     Сортировка и пагинация переехали на /genre/<slug>/<sort>-<page>, а ссылки вида
     /genre/comedy?sort=score&page=2 остались в индексе Google и во внешних ссылках.
     Редирект живёт здесь, а не в next.config.ts: для «?page=1 → базовый URL» и
     «неизвестный sort → базовый URL» нужна проверка значений, а redirects() в конфиге
     умеет только сопоставление по паттерну. Страницы жанров при этом searchParams
     не читают и остаются статическими/ISR. */
  if (path.startsWith('/genre/')) {
    const target = genreRedirectTarget(path, request.nextUrl.searchParams);
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      /* search намеренно не копируем: utm и прочие параметры отбрасываем, чтобы
         одна и та же страница не плодила дубли с разными хвостами. */
      url.search = '';
      return NextResponse.redirect(url, 308);
    }
  }

  /* Supabase Auth (редизайн, блок «вход/профиль»): сессия живёт в cookies, поэтому
     обновляем её здесь — serverless-инстанс не держит таймеров, и без этого
     access_token истекал молча, а серверный рендер видел «гостя».
     Заодно закрываем личный кабинет: /profile/* (кроме публичных /profile/<username>). */
  if (path === '/auth' || isProtectedPath(path)) {
    const { response: authResponse, user } = await refreshSupabaseSession(request);
    if (isProtectedPath(path) && !user) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth';
      url.search = '';
      const next = path + (request.nextUrl.search || '');
      url.searchParams.set('next', safeNextPath(next));
      return NextResponse.redirect(url);
    }
    if (path === '/auth' && user) {
      const url = request.nextUrl.clone();
      url.pathname = safeNextPath(request.nextUrl.searchParams.get('next'));
      url.search = '';
      return NextResponse.redirect(url);
    }
    return authResponse;
  }

  const rule = LIMITS.find((r) => path.startsWith(r.prefix));
  if (rule) {
    /* Аудит 30.09 (P1-6): первый элемент XFF подделывался клиентом (обход лимита);
       берём последний (его дописывает доверенный прокси) через общий clientIp(). */
    const ip = clientIp(request);
    /* Гидрация (perf/fast-hydration): воркеру нужно 128k запросов за часы, а публичный
       лимит 60/мин даёт ~35 часов только на ожидание окна и постоянные 429.
       Поэтому сервисный запрос с верным x-backfill-token идёт в отдельный бакет с
       BACKFILL_RATE_LIMIT (по умолчанию 3600/мин = 60 rps). Анонимные запросы
       по-прежнему ограничены штатным правилом — потолок, который защищает апстримы,
       всё равно живёт в самом bridge (BRIDGE_UPSTREAM_CONC). */
    const backfill = backfillRateLimit();
    if (backfill && serviceTokenValid(request)) {
      if (!rateLimit(`${ip}:${rule.prefix}:backfill`, backfill)) {
        return NextResponse.json(
          { error: 'слишком много запросов, подождите' },
          { status: 429, headers: { 'Retry-After': '10' } },
        );
      }
      return NextResponse.next();
    }
    if (!rateLimit(`${ip}:${rule.prefix}`, rule.limit)) {
      return NextResponse.json({ error: 'слишком много запросов, подождите' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
  }
  return NextResponse.next();
}

/** Сервисный лимит гидрации: 0 — фича выключена (тогда все идут штатным правилом). */
function backfillRateLimit(): number {
  const value = Number(process.env.BACKFILL_RATE_LIMIT ?? 3600);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Сравнение токена без раннего выхода (edge-safe: без node:crypto). */
function constantTimeEqual(a: string, b: string): boolean {
  if (!a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Верный сервисный токен гидрации в заголовке (см. scripts/hydrate-embeds.mjs). */
function serviceTokenValid(request: NextRequest): boolean {
  const expected = (process.env.BACKFILL_TOKEN ?? '').trim();
  if (!expected) return false;
  const provided = request.headers.get('x-backfill-token') ?? '';
  return constantTimeEqual(provided, expected);
}

export const config = { matcher: ['/api/:path*', '/genre/:path*', '/profile/:path*', '/profile', '/auth'] };
