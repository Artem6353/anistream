import type { Metadata } from 'next';
import AuthCallbackPageClient from '@/components/pages/AuthCallbackPageClient';
import { safeNextPath } from '@/lib/supabase/middleware';

export const metadata: Metadata = {
  title: 'Завершение входа',
  description: 'Служебная страница завершения входа в аккаунт AniNova.',
  alternates: { canonical: '/auth/callback' },
  robots: { index: false, follow: true },
  openGraph: { type: 'website', url: '/auth/callback', locale: 'ru_RU', siteName: 'AniNova' },
};

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Сервер валидирует цель возврата, клиент её не пересчитывает.
  return <AuthCallbackPageClient next={safeNextPath(next)} />;
}
