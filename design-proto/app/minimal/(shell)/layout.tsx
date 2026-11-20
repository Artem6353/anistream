import { MinimalFooter } from '@/components/minimal/MinimalFooter';
import { MinimalHeader } from '@/components/minimal/MinimalHeader';

export default function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MinimalHeader />
      <main id="content">{children}</main>
      <MinimalFooter />
    </>
  );
}
