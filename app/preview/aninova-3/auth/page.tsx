import type { Metadata } from 'next';
import { A3Auth } from '@/components/aninova3/A3Auth';

export const metadata: Metadata = { title: 'Вход и регистрация' };

export default async function A3AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mode = sp.mode === 'register' ? 'register' : 'login';
  return (
    <div className="a3-wrap">
      <A3Auth initialMode={mode} />
    </div>
  );
}
