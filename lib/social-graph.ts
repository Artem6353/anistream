'use client';

/** Подписки (ТЗ блок 20.1): follow/unfollow/счётчики через supaRest (токен с авто-refresh). */
import { supaRest } from './sync';

export async function myUid(): Promise<string | null> {
  const { supaWhoami } = await import('./sync');
  return supaWhoami().catch(() => null);
}

export async function myFollowing(): Promise<string[]> {
  const r = await supaRest('GET', 'follows?select=following_id');
  if (!r.ok) return [];
  return ((await r.json()) as Array<{ following_id: string }>).map((x) => x.following_id);
}

export async function followCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [a, b] = await Promise.all([
    supaRest('GET', `follows?select=follower_id&following_id=eq.${userId}`),
    supaRest('GET', `follows?select=following_id&follower_id=eq.${userId}`),
  ]);
  const ja = a.ok ? ((await a.json()) as unknown[]) : [];
  const jb = b.ok ? ((await b.json()) as unknown[]) : [];
  return { followers: ja.length, following: jb.length };
}

export async function isFollowing(userId: string): Promise<boolean> {
  return (await myFollowing()).includes(userId);
}

export async function setFollow(myId: string, targetId: string, follow: boolean): Promise<boolean> {
  try {
    if (follow) {
      const r = await supaRest('POST', 'follows', { follower_id: myId, following_id: targetId });
      return r.ok;
    }
    const r = await supaRest('DELETE', `follows?follower_id=eq.${myId}&following_id=eq.${targetId}`);
    return r.ok;
  } catch {
    return false;
  }
}
