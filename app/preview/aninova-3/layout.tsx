import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isAninova3PreviewEnabled } from '@/lib/aninova3/flag';
import { A3UiProvider } from '@/components/aninova3/A3Ui';
import { A3Shell } from '@/components/aninova3/A3Shell';
import './a3.css';

/** Preview живёт только за флагом и всегда проверяет его на запросе,
 *  чтобы одна сборка работала и с выключенным, и с включённым режимом. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'AniNova 3.0 — preview', template: '%s · AniNova 3.0' },
  description: 'Изолированный preview гибридного интерфейса AniNova 3.0 (A+C). Не production.',
  robots: { index: false, follow: false },
};

export default function Aninova3PreviewLayout({ children }: { children: React.ReactNode }) {
  if (!isAninova3PreviewEnabled()) notFound();
  return (
    <A3UiProvider>
      <A3Shell>{children}</A3Shell>
    </A3UiProvider>
  );
}
