'use client';

import { usePathname } from 'next/navigation';

/** Прячет production-хром на изолированных preview-маршрутах AniNova 3.0.
    Вне /preview/aninova-3 рендерит детей без изменений: обычный сайт не затрагивается. */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/preview/aninova-3')) return null;
  return <>{children}</>;
}

/** Один <main> на документ: в preview его роль играет A3Shell, поэтому корневой
 *  контейнер становится div. Вне preview разметка не меняется. */
export function MainGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/preview/aninova-3')) return <div id="content">{children}</div>;
  return <main id="content">{children}</main>;
}
