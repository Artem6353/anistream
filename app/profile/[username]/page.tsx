import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfileHeader, type PublicProfile } from '@/components/profile/ProfileHeader';

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
  return (
    <div className="container">
      <ProfileHeader profile={profile} />
      <p className="pheader__pubnote">Публичный профиль AniNova. Списки и история владельца приватны.</p>
    </div>
  );
}
