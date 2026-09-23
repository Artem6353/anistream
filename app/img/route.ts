import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ALLOWED = ['s4.anilist.co', 'img2.shikimori.io', 'shikimori.io', 'kodikstorage.com'];
const DIR = path.join(process.cwd(), '.cache', 'img');

/**
 * Image-proxy (W7): постеры/кадры идут через /img?url=… — клиент не зависит от чужих CDN,
   долгий кэш в браузере/CDN + FS-кэш на self-hosted (VPS/дома); на serverless кэш эфемерный,
   но proxy всё равно стабилизирует домен и политику кэширования.
   Отключается клиентом: NEXT_PUBLIC_IMG_PROXY=0.
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }
  if (!ALLOWED.includes(parsed.hostname)) return NextResponse.json({ error: 'host not allowed' }, { status: 403 });

  const file = path.join(DIR, createHash('sha1').update(url).digest('hex') + (parsed.pathname.endsWith('.png') ? '.png' : '.jpg'));
  try {
    const cached = await fs.readFile(file);
    return new Response(cached, { headers: cacheHeaders(parsed) });
  } catch {}

  const up = await fetch(parsed, { headers: { 'User-Agent': 'Mozilla/5.0 (AniStream image proxy)' } });
  if (!up.ok) return NextResponse.json({ error: 'upstream ' + up.status }, { status: 502 });
  const buf = Buffer.from(await up.arrayBuffer());
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file, buf);
  } catch {}
  return new Response(buf, { headers: cacheHeaders(parsed) });
}

function cacheHeaders(parsed: URL): HeadersInit {
  return {
    'Content-Type': parsed.pathname.endsWith('.png') ? 'image/png' : 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}
