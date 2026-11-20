import { CinematicFooter } from '@/components/cinematic/CinematicFooter';
import { CinematicHeader } from '@/components/cinematic/CinematicHeader';

export default function CinematicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CinematicHeader />
      <main id="content">{children}</main>
      <CinematicFooter />
    </>
  );
}
