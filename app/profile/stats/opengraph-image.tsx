import { ImageResponse } from 'next/og';
import { loadTitles } from '@/lib/catalog';

export const alt = 'AniNova — статистика просмотров';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

/** OG-карточка страницы статистики (ТЗ 18.2): брендовый баннер с витринными цифрами каталога. */
export default async function Image() {
  const titles = loadTitles();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, padding: 60, background: '#0b0d11', color: '#eef2f8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, color: '#98a3b8' }}>
          <span style={{ background: 'linear-gradient(120deg,#8b5cf6,#f472b6)', WebkitBackgroundClip: 'text', color: '#8b5cf6', fontSize: 44, fontWeight: 800 }}>AniNova</span>
          статистика просмотров
        </div>
        <div style={{ fontSize: 64, fontWeight: 800 }}>{titles.length} тайтлов в каталоге</div>
        <div style={{ fontSize: 32, color: '#98a3b8' }}>Часы, серии, жанры, heatmap и 32 ачивки — в профиле</div>
      </div>
    ),
    size,
  );
}
