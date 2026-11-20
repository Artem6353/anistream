import { MinimalAuth } from '@/components/minimal/MinimalAuth';

export const metadata = { title: 'Вход' };

export default function Page() {
  return <MinimalAuth mode="login" />;
}
