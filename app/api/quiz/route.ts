import { NextResponse } from 'next/server';
import { loadTitles } from '@/lib/catalog';
import type { Title } from '@/lib/types';
import { episodeCount } from '@/lib/episodes';

export const revalidate = 600;

interface Answers {
  time?: 'one' | 'short' | 'long' | 'movie';
  mood?: 'laugh' | 'cry' | 'think' | 'action' | 'relax';
  genres?: string[];
  length?: 'lt12' | 'mid' | 'gt50';
  year?: 'new' | 'old' | 'any';
}

const MOOD_GENRES: Record<string, string[]> = {
  laugh: ['comedy'],
  cry: ['drama', 'romance'],
  think: ['mystery', 'psychological', 'thriller'],
  action: ['action'],
  relax: ['slice-of-life'],
};

/** Квиз-подборка (ТЗ 18.3): фильтры каталога по ответам → 5 случайных тайтлов. */
export async function POST(request: Request) {
  const a = (await request.json().catch(() => ({}))) as Answers;
  let pool: Title[] = loadTitles().filter((t) => t.score >= 6.5 && t.status !== 'upcoming');
  /* ТЗ 1.2: episodes может быть null (итог не объявлен) — в фильтрах по длине
     такие тайтлы не участвуют, иначе `null <= 12` молча пропускал их в «короткие». */
  if (a.time === 'one') pool = pool.filter((t) => episodeCount(t) === 1);
  if (a.time === 'short') pool = pool.filter((t) => (episodeCount(t) ?? 0) >= 2 && (episodeCount(t) ?? 0) <= 12);
  if (a.time === 'long') pool = pool.filter((t) => (episodeCount(t) ?? 0) >= 24);
  if (a.time === 'movie') pool = pool.filter((t) => t.type === 'movie');
  const mood = a.mood ? (MOOD_GENRES[a.mood] ?? []) : [];
  if (mood.length) pool = pool.filter((t) => t.genres.some((g) => mood.includes(g)));
  if (a.genres?.length) pool = pool.filter((t) => t.genres.some((g) => a.genres!.includes(g)));
  if (a.length === 'lt12') pool = pool.filter((t) => (episodeCount(t) ?? 0) <= 12 && episodeCount(t) !== null);
  if (a.length === 'mid') pool = pool.filter((t) => (episodeCount(t) ?? 0) > 12 && (episodeCount(t) ?? 0) <= 50);
  if (a.length === 'gt50') pool = pool.filter((t) => (episodeCount(t) ?? 0) > 50);
  if (a.year === 'new') pool = pool.filter((t) => t.year >= 2023);
  if (a.year === 'old') pool = pool.filter((t) => t.year > 0 && t.year < 2010);
  if (!pool.length)
    pool = loadTitles()
      .filter((t) => t.score >= 8)
      .slice(0, 40);
  /* Аудит 30.09 (P2-22): sort(() => Math.random() - 0.5) — смещённая перестановка;
     Fisher–Yates даёт равномерную выборку. */
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return NextResponse.json({ items: shuffled.slice(0, 5) });
}
