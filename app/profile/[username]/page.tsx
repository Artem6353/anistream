import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfileHeader, type PublicProfile } from '@/components/profile/ProfileHeader';
import { FollowButton } from '@/components/social/FollowButton';
import { WriteDmButton } from '@/components/social/WriteDmButton';

export const metadata: Metadata = { title: 'Профиль пользователя' };
export const revalidate = 60;

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Публичный профиль (ТЗ блок 16): как у Shikimori — шапка, био, бейджи. */
export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!SUPA || !KEY) notFound();
  const r = await fetch(`${SUPA}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    next: { revalidate: 60 },
  });
  const rows = r.ok ? ((await r.json()) as PublicProfile[]) : [];
  const profile = rows?.[0];
  if (!profile) notFound();
  // счётчики подписок (ТЗ 20.1)
  let followers = 0;
  let following = 0;
  try {
    const [fa, fb] = await Promise.all([
      fetch(`${SUPA}/rest/v1/follows?select=follower_id&following_id=eq.${profile.user_id}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }),
      fetch(`${SUPA}/rest/v1/follows?select=following_id&follower_id=eq.${profile.user_id}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }),
    ]);
    followers = fa.ok ? ((await fa.json()) as unknown[]).length : 0;
    following = fb.ok ? ((await fb.json()) as unknown[]).length : 0;
  } catch {}
  return (
    <div className="container">
      <ProfileHeader profile={profile} followers={followers} following={following}>
        <div className="pheader__actions">
          <FollowButton targetId={profile.user_id} />
          <WriteDmButton targetId={profile.user_id} targetName={profile.username ?? 'пользователь'} />
        </div>
      </ProfileHeader>
      <p className="pheader__pubnote">Публичный профиль AniNova. Списки и история владельца приватны.</p>
    </div>
  );
}
