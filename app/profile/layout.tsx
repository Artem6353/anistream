'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSessionValid } from '@/lib/sync';

/** Баг 29.09: раздел /profile/* — только для зарегистрированных.
    Разлогиненного посетителя уводим на главную (вкладка профиля скрыта
    в MobileNav и иконках шапки тем же условием). */
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isSessionValid()) setOk(true);
    else router.replace('/');
  }, [router]);

  return ok ? <>{children}</> : null;
}
