/* Аудит 2026-10 (ТЗ 1.5/1.7.4): страница была клиентским компонентом, а в App Router
 * клиентский компонент НЕ МОЖЕТ экспортировать metadata. В результате страница
 * наследовала title/og главной («AniNova — каталог аниме: онгоинги, расписание и плеер»),
 * не имела собственного canonical и og:url и не могла быть закрыта от индексации.
 * Проверка на проде 12.10.2026: /feed, /clubs, /forum, /quiz, /messages и
 * /profile/settings отдавали title главной и пустой canonical.
 * Теперь это серверная обёртка с metadata, а прежний компонент живёт в components/pages/. */
import type { Metadata } from 'next';
import PartyPageClient from '@/components/pages/PartyPageClient';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Совместный просмотр`,
    description: 'Комната совместного просмотра AniNova: синхронный плеер и чат для зрителей.',
    alternates: { canonical: `/party/${encodeURIComponent(id)}` },
  robots: { index: false, follow: true },
    openGraph: { type: 'website', url: `/party/${encodeURIComponent(id)}`, locale: 'ru_RU', siteName: 'AniNova' },
  };
}

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  return <PartyPageClient params={params} />;
}