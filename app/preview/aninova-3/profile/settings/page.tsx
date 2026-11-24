import type { Metadata } from 'next';
import Link from 'next/link';
import { A3Settings } from '@/components/aninova3/A3Settings';
import { PREVIEW_PROFILE_PATH, PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Настройки',
  description: 'Настройки плеера, ТВ-режима и локальных данных AniNova.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${PREVIEW_ROOT}/profile/settings` },
};

export default function PreviewSettingsPage() {
  return (
    <div className="a3-wrap a3-utility a3-settings-wrap">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <Link href={PREVIEW_PROFILE_PATH}>Профиль</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Настройки</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Личные настройки</p>
        <h1 className="a3-h1">Настройки</h1>
        <p className="a3-pagehead__lead">
          Плеер, ТВ-режим и локальные данные. Ник, био, аватар и безопасность остаются в личном кабинете.
        </p>
        <p><Link className="a3-link" href={PREVIEW_PROFILE_PATH}>Открыть личный кабинет →</Link></p>
      </header>
      <A3Settings />
    </div>
  );
}
