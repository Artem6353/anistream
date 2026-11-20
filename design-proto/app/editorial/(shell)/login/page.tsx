import { EditorialAuth } from '@/components/editorial/EditorialAuth';

export const metadata = { title: 'Вход' };

export default function Page() {
  return <EditorialAuth mode="login" />;
}
