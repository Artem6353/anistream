import { NextResponse } from 'next/server';
import { loadTitles } from '@/lib/catalog';
import type { Title } from '@/lib/types';

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
  if (a.time === 'one') pool = pool.filter((t) => t.episodes === 1);
  if (a.time === 'short') pool = pool.filter((t) => t.episodes >= 2 && t.episodes <= 12);
  if (a.time === 'long') pool = pool.filter((t) => t.episodes >= 24);
  if (a.time === 'movie') pool = pool.filter((t) => t.type === 'movie');
  const mood = a.mood ? MOOD_GENRES[a.mood] ?? [] : [];
  if (mood.length) pool = pool.filter((t) => t.genres.some((g) => mood.includes(g)));
  if (a.genres?.length) pool = pool.filter((t) => t.genres.some((g) => a.genres!.includes(g)));
  if (a.length === 'lt12') pool = pool.filter((t) => t.episodes <= 12);
  if (a.length === 'mid') pool = pool.filter((t) => t.episodes > 12 && t.episodes <= 50);
  if (a.length === 'gt50') pool = pool.filter((t) => t.episodes > 50);
  if (a.year === 'new') pool = pool.filter((t) => t.year >= 2023);
  if (a.year === 'old') pool = pool.filter((t) => t.year > 0 && t.year < 2010);
  if (!pool.length) pool = loadTitles().filter((t) => t.score >= 8).slice(0, 40);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return NextResponse.json({ items: shuffled.slice(0, 5) });
}
