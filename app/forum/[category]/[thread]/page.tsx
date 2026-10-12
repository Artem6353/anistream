/* Аудит 2026-10 (ТЗ 1.5/1.7.4): страница была клиентским компонентом, а в App Router
 * клиентский компонент НЕ МОЖЕТ экспортировать metadata: тред форума наследовал
 * title/og главной и не имел canonical. Теперь серверная обёртка с metadata.
 * Тред закрыт от индексации (noindex, follow): это пользовательский контент без
 * гарантии наполнения, а ссылки из него权重 передавать не должны. */
import type { Metadata } from 'next';
import ForumThreadPageClient from '@/components/pages/ForumThreadPageClient';

interface Props {
  params: Promise<{ category: string; thread: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, thread } = await params;
  const url = `/forum/${encodeURIComponent(category)}/${encodeURIComponent(thread)}`;
  return {
    title: 'Тред форума',
    description: 'Обсуждение на форуме AniNova.',
    alternates: { canonical: url },
    robots: { index: false, follow: true },
    openGraph: { type: 'website', url, locale: 'ru_RU', siteName: 'AniNova' },
  };
}

export default function ForumThreadPage({ params }: Props) {
  return <ForumThreadPageClient params={params} />;
}
