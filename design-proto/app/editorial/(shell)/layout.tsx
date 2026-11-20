import { EditorialFooter } from '@/components/editorial/EditorialFooter';
import { EditorialHeader } from '@/components/editorial/EditorialHeader';

export default function EditorialShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EditorialHeader />
      <main id="content">{children}</main>
      <EditorialFooter />
    </>
  );
}
