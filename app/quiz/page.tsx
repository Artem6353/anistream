/* Аудит 2026-10 (ТЗ 1.5/1.7.4): страница была клиентским компонентом, а в App Router
 * клиентский компонент НЕ МОЖЕТ экспортировать metadata. В результате страница
 * наследовала title/og главной («AniNova — каталог аниме: онгоинги, расписание и плеер»),
 * не имела собственного canonical и og:url и не могла быть закрыта от индексации.
 * Проверка на проде 12.10.2026: /feed, /clubs, /forum, /quiz, /messages и
 * /profile/settings отдавали title главной и пустой canonical.
 * Теперь это серверная обёртка с metadata, а прежний компонент живёт в components/pages/. */
import type { Metadata } from 'next';
import QuizPageClient from '@/components/pages/QuizPageClient';

export const metadata: Metadata = {
  title: 'Квиз: что посмотреть',
  description: 'Пройдите квиз из нескольких вопросов и получите подборку аниме под настроение, жанр и свободное время.',
  alternates: { canonical: '/quiz' },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', url: '/quiz', locale: 'ru_RU', siteName: 'AniNova' },
};

export default function QuizPage() {
  return <QuizPageClient />;
}
