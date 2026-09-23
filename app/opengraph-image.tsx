import { ImageResponse } from 'next/og';
import { artUri } from '@/lib/art';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 18,
          padding: 72,
          color: '#eef2f8',
          backgroundImage: `url(${artUri('anistream-hero', 'AS', true)})`,
          backgroundSize: 'cover',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'linear-gradient(135deg, #8b5cf6, #f472b6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              fontWeight: 800,
              color: '#fff',
            }}
          >
            AS
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>AniStream</div>
        </div>
        <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: '-0.03em', maxWidth: 900 }}>
          Каталог аниме: онгоинги, расписание и плеер
        </div>
        <div style={{ fontSize: 26, color: '#9aa7bd', maxWidth: 820 }}>
          1600+ тайтлов с русскими описаниями, рабочие серии всех эпизодов и локальный профиль без регистрации.
        </div>
      </div>
    ),
    size,
  );
}
