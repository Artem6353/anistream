import { EditorialAuth } from '@/components/editorial/EditorialAuth';

export const metadata = { title: 'Регистрация' };

export default function Page() {
  return <EditorialAuth mode="register" />;
}
