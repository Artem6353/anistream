/* Аудит 2026-10 (ТЗ 1.5/1.7.4): страница была клиентским компонентом, а в App Router
 * клиентский компонент НЕ МОЖЕТ экспортировать metadata. В результате страница
 * наследовала title/og главной («AniNova — каталог аниме: онгоинги, расписание и плеер»),
 * не имела собственного canonical и og:url и не могла быть закрыта от индексации.
 * Проверка на проде 12.10.2026: /feed, /clubs, /forum, /quiz, /messages и
 * /profile/settings отдавали title главной и пустой canonical.
 * Теперь это серверная обёртка с metadata, а прежний компонент живёт в components/pages/. */
import type { Metadata } from 'next';
import { sectionRobots } from '@/lib/section-index';
import ClubPageClient from '@/components/pages/ClubPageClient';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Клуб`,
    description: 'Страница клуба AniNova: участники, посты и обсуждения клуба по интересам.',
    alternates: { canonical: `/clubs/${encodeURIComponent(slug)}` },
  /* ТЗ 1.7.4: раздел индексируется, когда в нём появился контент (порог — записей).
     Пока пусто — noindex: тонкие страницы тянут качество хоста вниз.
     Индексация вернётся автоматически, правка кода не потребуется. */
  robots: await sectionRobots('clubs'),
    openGraph: { type: 'website', url: `/clubs/${encodeURIComponent(slug)}`, locale: 'ru_RU', siteName: 'AniNova' },
  };
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  return <ClubPageClient params={params} />;
}