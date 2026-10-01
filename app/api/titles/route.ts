import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/catalog';


/** Лёгкая выдача тайтлов для клиентских компонентов (профиль, «продолжить просмотр»). */
export async function GET(request: Request) {
  const slugs = (new URL(request.url).searchParams.get('slugs') ?? '').split(',').filter(Boolean).slice(0, 60);
  const items = slugs
    .map((slug) => getTitle(slug))
    .filter(Boolean)
    .map((t) => ({
      slug: t!.slug,
      ru: t!.ru,
      romaji: t!.romaji,
      type: t!.type,
      year: t!.year,
      status: t!.status, // S2.2: нужен ленивым рельсам для плашки «Онгоинг/Анонс/Новинка»
      episodes: t!.episodes,
      score: t!.score,
      poster: t!.poster,
      banner: t!.banner,
      genres: t!.genres.slice(0, 3),
      description: t!.description.slice(0, 200),
    }));
  /* Аудит 01.10, итерация 2: роут читает searchParams → это dynamic-FUNCTION,
     revalidate=600 на таких не работает (зонд: x-vercel-cache MISS на повторах),
     а край уважает s-maxage в ответе функции. Поэтому: без revalidate, с явным
     s-maxage+SWR — CDN кэширует по полному URL (ключ = набор слагов). */
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60' } });
}
