import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const ALLOWED = ['s4.anilist.co', 'img2.shikimori.io', 'shikimori.io', 'kodikstorage.com', 'cdn.myanimelist.net'];
/* S1.1 (аудит 28.09): на serverless кэш вариантов живёт в /tmp (единственная writable-директория
   Vercel), на self-hosted — как раньше в .cache/img. Кэш — best-effort: край Vercel всё равно держит
   immutable-ответ, транскод выполняется ~1 раз на вариант на регион. */
const DIR = process.env.VERCEL ? '/tmp/aninova-img' : path.join(process.cwd(), '.cache', 'img');
const MIN_W = 16;
const MAX_W = 3840;

export const runtime = 'nodejs';

type Fmt = 'avif' | 'webp' | 'jpeg' | 'orig';

/**
 * Image-proxy v2 (W7 + S1.1): постеры/баннеры/кадры идут через /img?url=…
 * Контракт ?url= сохранён (старые вызовы работают), добавлены:
 *   w  — целевая ширина в физ. px (ресайз, без увеличения маленьких);
 *   q  — качество 30–90 (дефолты: avif 62, webp/jpeg 70 — S3.2 по инсайту PSI «image delivery»);
 *   fmt=auto|avif|webp|jpeg|orig — формат (auto = négociation по Accept).
 * Байты РЕАЛЬНО транскодятся sharp'ом; Content-Type всегда соответствует содержимому
 * (фикс бага «jpeg-байты в .webp-файле с чужим MIME»).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const url = sp.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !ALLOWED.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  }

  const w = clampInt(sp.get('w'), MIN_W, MAX_W, 0);
  const q = clampInt(sp.get('q'), 30, 90, 0);
  const fmtParam = (sp.get('fmt') ?? 'auto').toLowerCase();
  const accept = request.headers.get('accept') ?? '';
  // auto → WebP (не AVIF): замеры 28.09 показали, что avif-энкод баннера ~3.4 с против ~90 мс
  // у webp при тех же ~66% экономии — на serverless это таймауты/холодные старты.
  // AVIF остаётся по явному fmt=avif.
  // S3.2: fallback для wildcard/пустого Accept (краулеры, curl) — тоже webp
  // (WebP в браузерах Baseline с 2020); раньше отдавался orig без ресайза (баннер 349 КБ).
  // Явный jpeg-only Accept (без wildcard и webp) → jpeg; прочий экзотический Accept → orig.
  const fmt: Fmt =
    fmtParam === 'avif' || fmtParam === 'webp' || fmtParam === 'jpeg' || fmtParam === 'orig'
      ? fmtParam
      : accept.includes('image/webp') ||
          accept.includes('*/*') ||
          accept === '' ||
          !accept.includes('image/')
        ? 'webp'
        : accept.includes('image/jpeg')
          ? 'jpeg'
          : 'orig';

  const key = createHash('sha1').update(`${url}|${fmt}|${w}|${q}`).digest('hex');
  const ext = fmt === 'avif' ? '.avif' : fmt === 'webp' ? '.webp' : fmt === 'jpeg' ? '.jpg' : parsed.pathname.endsWith('.png') ? '.png' : '.jpg';
  const file = path.join(DIR, key + ext);
  try {
    const cached = await fs.readFile(file);
    return respond(cached, mimeFor(fmt, ext), fmtParam === 'auto' || !sp.has('fmt'));
  } catch {}

  let up: Response;
  try {
    up = await fetch(parsed, {
      headers: { 'User-Agent': 'Mozilla/5.0 (AniNova image proxy)', Accept: 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(9000),
    });
  } catch {
    return NextResponse.json({ error: 'upstream timeout' }, { status: 504 });
  }
  if (!up.ok) return NextResponse.json({ error: 'upstream ' + up.status }, { status: 502 });
  const buf = Buffer.from(await up.arrayBuffer());
  const upstreamType = (up.headers.get('content-type') ?? '').split(';')[0].trim() || guessMime(parsed.pathname);

  let outBuf = buf;
  let outType = upstreamType;
  if (fmt !== 'orig' && buf.length > 0) {
    try {
      const img = sharp(buf, { failOn: 'none' });
      const meta = await img.metadata();
      const animated = (meta.pages ?? 1) > 1; // gif/анимированный webp — passthrough
      if (!animated) {
        let p = img.rotate(); // EXIF-ориентация
        if (w) p = p.resize({ width: w, withoutEnlargement: true });
        if (fmt === 'avif') {
          outBuf = await p.avif({ quality: Math.min(q || 62, 68), effort: 4 }).toBuffer();
          outType = 'image/avif';
        } else if (fmt === 'webp') {
          outBuf = await p.webp({ quality: q || 70 }).toBuffer();
          outType = 'image/webp';
        } else {
          if (meta.hasAlpha) p = p.flatten({ background: '#0b0d11' });
          outBuf = await p.jpeg({ quality: q || 70, mozjpeg: true }).toBuffer();
          outType = 'image/jpeg';
        }
        // Транскод оказался не в пользу (мелкий/уже сжатый оригинал) — отдаём оригинал.
        if (outBuf.length >= buf.length) {
          outBuf = buf;
          outType = upstreamType;
        }
      }
    } catch {
      outBuf = buf;
      outType = upstreamType; // битый/неподдерживаемый файл — passthrough
    }
  }

  const storeExt = outType === 'image/avif' ? '.avif' : outType === 'image/webp' ? '.webp' : outType === 'image/png' ? '.png' : '.jpg';
  void persist(path.join(DIR, key + storeExt), outBuf);
  return respond(outBuf, outType, fmtParam === 'auto' || !sp.has('fmt'));
}

function respond(body: Buffer, contentType: string, vary: boolean): Response {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (vary) headers['Vary'] = 'Accept'; // fmt=auto: край должен различать Accept-варианты
  // Uint8Array-обёртка: Buffer<ArrayBufferLike> из @types/node 22 не матчится с BodyInit напрямую
  return new Response(new Uint8Array(body), { headers });
}

function mimeFor(fmt: Fmt, ext: string): string {
  if (fmt === 'avif') return 'image/avif';
  if (fmt === 'webp') return 'image/webp';
  if (fmt === 'jpeg') return 'image/jpeg';
  return ext === '.png' ? 'image/png' : 'image/jpeg';
}

function guessMime(pathname: string): string {
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.avif')) return 'image/avif';
  if (pathname.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function clampInt(raw: string | null, min: number, max: number, dflt: number): number {
  if (!raw) return dflt;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(Math.max(n, min), max);
}

/* Кэш-запись + периодическая чистка /tmp (только serverless: файлы старше 12 ч;
   на self-hosted FS-кэш долговременный, как прежде). */
let reqCount = 0;
async function persist(file: string, buf: Buffer): Promise<void> {
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file, buf);
  } catch {}
  if (!process.env.VERCEL || ++reqCount % 64 !== 0) return;
  try {
    const now = Date.now();
    const files = await fs.readdir(DIR);
    await Promise.all(
      files.slice(0, 400).map(async (f) => {
        const fp = path.join(DIR, f);
        try {
          const st = await fs.stat(fp);
          if (now - st.mtimeMs > 12 * 3600 * 1000) await fs.unlink(fp);
        } catch {}
      }),
    );
  } catch {}
}
