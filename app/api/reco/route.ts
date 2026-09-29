import { NextResponse } from 'next/server';
import { collaborativeScores, hybridReco, topByGenre, topByGenres } from '@/lib/reco';

/* Аудит 30.09 (P2-25): export const revalidate на роуте, читающем request.url,
   не действовал (роут динамический); кэширование — явными Cache-Control ниже. */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/** Персональные рекомендации (ТЗ блок 21): гибрид контентной жанровой аффинности
    и коллаборативной фильтрации по историям похожих пользователей.
    Параметры: slugs — мои тайтлы; genre — автоподборка по жанру; limit. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  /* slugs — история просмотров в query-строке: ограничиваем длину и НЕ кладём
     персональную ветку в публичный кэш (раньше public s-maxage=300 на shared-кэше
     хранил чужие подборки и история утекала в логи CDN). */
  const slugs = (params.get('slugs') ?? '').split(',').filter(Boolean).slice(0, 200);
  const genre = params.get('genre');
  const rawLimit = Number.parseInt(params.get('limit') ?? '12', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(24, Math.max(1, rawLimit)) : 12;

  if (genre) {
    return NextResponse.json({ items: topByGenre(genre, slugs, limit) }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  }

  let collab = new Map<string, number>();
  if (SERVICE && slugs.length) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/profile_history?select=user_id,slug&limit=2000`, {
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
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } });
}
