import { NextResponse } from 'next/server';
import { collaborativeScores, hybridReco, topByGenre, topByGenres } from '@/lib/reco';

export const revalidate = 300;

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/** Персональные рекомендации (ТЗ блок 21): гибрид контентной жанровой аффинности
    и коллаборативной фильтрации по историям похожих пользователей.
    Параметры: slugs — мои тайтлы; genre — автоподборка по жанру; limit. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slugs = (params.get('slugs') ?? '').split(',').filter(Boolean);
  const genre = params.get('genre');
  const limit = Math.min(24, Number(params.get('limit') ?? 12) || 12);

  if (genre) {
    return NextResponse.json({ items: topByGenre(genre, slugs, limit) }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  }

  let collab = new Map<string, number>();
  if (SERVICE && slugs.length) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/profile_history?select=user_id,slug&limit=10000`, {
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
        next: { revalidate: 3600 },
      });
      if (r.ok) {
        const rows = (await r.json()) as Array<{ user_id: string; slug: string }>;
        collab = collaborativeScores(slugs, rows);
      }
    } catch {
      /* коллаборативная часть опциональна */
    }
  }
  const items = slugs.length ? hybridReco(slugs, collab, limit) : topByGenres(slugs, limit);
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}
