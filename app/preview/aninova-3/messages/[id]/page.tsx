import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MessageThreadPageClient from '@/components/pages/MessageThreadPageClient';
import { getServerUser } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { PREVIEW_AUTH_PATH, PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Диалог',
  description: 'Личный диалог AniNova.',
  robots: { index: false, follow: false },
};

export default async function PreviewMessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const next = `${PREVIEW_ROOT}/messages/${encodeURIComponent(id)}`;
  if (!supabaseConfigured()) redirect(`${PREVIEW_AUTH_PATH}?reason=protected&next=${encodeURIComponent(next)}`);
  const user = await getServerUser();
  if (!user) redirect(`${PREVIEW_AUTH_PATH}?reason=protected&next=${encodeURIComponent(next)}`);
  return <MessageThreadPageClient params={params} preview />;
}
