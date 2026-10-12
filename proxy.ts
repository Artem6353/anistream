import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { LIMITS, rateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/ip';
import { genreRedirectTarget } from '@/lib/genre-pages';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

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

  const rule = LIMITS.find((r) => path.startsWith(r.prefix));
  if (rule) {
    /* Аудит 30.09 (P1-6): первый элемент XFF подделывался клиентом (обход лимита);
       берём последний (его дописывает доверенный прокси) через общий clientIp(). */
    const ip = clientIp(request);
    if (!rateLimit(`${ip}:${rule.prefix}`, rule.limit)) {
      return NextResponse.json({ error: 'слишком много запросов, подождите' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*', '/genre/:path*'] };
