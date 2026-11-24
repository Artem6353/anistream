import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MessagesPageClient from '@/components/pages/MessagesPageClient';
import { getServerUser } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { PREVIEW_AUTH_PATH, PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

const PATH = `${PREVIEW_ROOT}/messages`;

export const metadata: Metadata = {
  title: 'Сообщения',
  description: 'Личные диалоги AniNova.',
  robots: { index: false, follow: false },
  alternates: { canonical: PATH },
};

/** B2-D: настоящий список ЛС. Гость уходит на preview-вход; RLS остаётся
 *  единственным источником правды о том, какие треды существуют. */
export default async function PreviewMessagesPage() {
  if (!supabaseConfigured()) redirect(`${PREVIEW_AUTH_PATH}?reason=protected&next=${encodeURIComponent(PATH)}`);
  const user = await getServerUser();
  if (!user) redirect(`${PREVIEW_AUTH_PATH}?reason=protected&next=${encodeURIComponent(PATH)}`);
  return <MessagesPageClient preview />;
}
