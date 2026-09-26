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

  // AVIF → WebP → оригинал: вариант по Accept клиента, кэш на каждый вариант (ТЗ блок 8)
  const accept = request.headers.get('accept') ?? '';
  const variant = accept.includes('image/avif') ? 'avif' : accept.includes('image/webp') ? 'webp' : 'orig';
  const ext = variant === 'avif' ? '.avif' : variant === 'webp' ? '.webp' : parsed.pathname.endsWith('.png') ? '.png' : '.jpg';
  const ctype = variant === 'avif' ? 'image/avif' : variant === 'webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
  const file = path.join(DIR, createHash('sha1').update(`${url}:${variant}`).digest('hex') + ext);
  try {
    const cached = await fs.readFile(file);
    return new Response(cached, { headers: { ...cacheHeaders(parsed), 'content-type': ctype } });
  } catch {}

  const up = await fetch(parsed, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (AniNova image proxy)',
      Accept: variant === 'avif' ? 'image/avif,image/webp,image/*,*/*;q=0.8' : variant === 'webp' ? 'image/webp,image/*,*/*;q=0.8' : 'image/*,*/*;q=0.8',
    },
  });
  if (!up.ok) return NextResponse.json({ error: 'upstream ' + up.status }, { status: 502 });
  const buf = Buffer.from(await up.arrayBuffer());
  const upstreamType = up.headers.get('content-type') ?? ctype;
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file, buf);
  } catch {}
  return new Response(buf, { headers: { ...cacheHeaders(parsed), 'content-type': upstreamType } });
}

function cacheHeaders(parsed: URL): HeadersInit {
  return {
    'Content-Type': parsed.pathname.endsWith('.png') ? 'image/png' : 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}
