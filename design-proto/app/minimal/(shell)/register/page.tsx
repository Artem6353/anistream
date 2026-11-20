import { MinimalAuth } from '@/components/minimal/MinimalAuth';

export const metadata = { title: 'Регистрация' };

export default function Page() {
  return <MinimalAuth mode="register" />;
}
