import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { LIMITS, rateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/ip';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const rule = LIMITS.find((r) => path.startsWith(r.prefix));
  if (rule) {
    /* Аудит 30.09 (P1-6): первый элемент XFF подделывался клиентом (обход лимита);
       берём последний (его дописывает доверенный прокси) через общий clientIp(). */
    const ip = clientIp(request);
    if (!rateLimit(`${ip}:${rule.prefix}`, rule.limit)) {
      return NextResponse.json(
        { error: 'слишком много запросов, подождите' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*'] };
