import { NextResponse } from 'next/server';
import { getWeekSchedule } from '@/lib/schedule';

export const revalidate = 600;

/** Недельное расписание: живые данные AniList с серверным кэшем 10 минут. */
export async function GET() {
  const { entries, live } = await getWeekSchedule();
  return NextResponse.json({ live, entries }, { headers: { 'Cache-Control': 'public, max-age=600' } });
}
