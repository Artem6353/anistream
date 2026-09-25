import { ImageResponse } from 'next/og';
import { getTitle } from '@/lib/catalog';
import { artUri } from '@/lib/art';
import { TYPE_LABELS } from '@/lib/labels';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function TitleOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title) return new ImageResponse(<div style={{ fontSize: 40 }}>AniNova</div>, size);

  let banner: ArrayBuffer | null = null;
  try {
    const res = await fetch(title.banner ?? title.poster, { next: { revalidate: 86400 } });
    if (res.ok) banner = await res.arrayBuffer();
  } catch {
    banner = null;
  }
  const bg = banner
    ? `data:${(title.banner ?? title.poster).endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${Buffer.from(banner).toString('base64')}`
    : artUri(title.slug, title.romaji, true);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0d11' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg} alt="" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11,13,17,0.30)' }} />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(90deg, rgba(11,13,17,0.94) 32%, rgba(11,13,17,0.55) 70%, rgba(11,13,17,0.85))',
          }}
        />
        <div style={{ display: 'flex', gap: 36, alignItems: 'center', padding: 64, position: 'relative', width: '100%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={title.poster}
            alt=""
            style={{ width: 260, height: 390, objectFit: 'cover', borderRadius: 20, border: '2px solid rgba(255,255,255,0.25)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #8b5cf6, #f472b6)',
                  color: '#fff',
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {TYPE_LABELS[title.type]}
              </div>
              <div style={{ display: 'flex', color: '#fbbf24', fontSize: 22, fontWeight: 800 }}>{title.score.toFixed(1)} / 10</div>
              <div style={{ display: 'flex', color: '#9aa7bd', fontSize: 22 }}>{title.year}</div>
            </div>
            <div style={{ display: 'flex', fontSize: 46, fontWeight: 800, letterSpacing: '-0.03em', color: '#eef2f8', lineHeight: 1.1 }}>{title.ru}</div>
            <div style={{ display: 'flex', fontSize: 22, color: '#cdd6e4', lineHeight: 1.4 }}>{title.description.length > 140 ? title.description.slice(0, 140) + '…' : title.description}</div>
            <div style={{ display: 'flex', fontSize: 20, color: '#a78bfa', fontWeight: 700 }}>AniNova — смотреть онлайн</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
