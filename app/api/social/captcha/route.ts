import { NextResponse } from 'next/server';
import { makeCaptcha } from '@/lib/social-server';

export async function GET() {
  const { question, token } = makeCaptcha();
  return NextResponse.json({ question, token }, { headers: { 'Cache-Control': 'no-store' } });
}
