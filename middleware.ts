import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { LIMITS, rateLimit } from '@/lib/rateLimit';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const rule = LIMITS.find((r) => path.startsWith(r.prefix));
  if (rule) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'local';
    if (!rateLimit(`${ip}:${rule.prefix}`, rule.limit)) {
      return NextResponse.json({ error: 'слишком много запросов, подождите' }, { status: 429 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*'] };
