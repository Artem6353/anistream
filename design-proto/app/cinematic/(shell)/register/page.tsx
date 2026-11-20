import { CinematicAuth } from '@/components/cinematic/CinematicAuth';

export const metadata = { title: 'Регистрация' };

export default function Page() {
  return <CinematicAuth mode="register" />;
}
