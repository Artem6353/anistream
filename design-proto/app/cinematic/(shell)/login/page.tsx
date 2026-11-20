import { CinematicAuth } from '@/components/cinematic/CinematicAuth';

export const metadata = { title: 'Вход' };

export default function Page() {
  return <CinematicAuth mode="login" />;
}
