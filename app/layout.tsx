import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { MobileNav } from '@/components/layout/MobileNav';
import { Footer } from '@/components/layout/Footer';
import { Toaster } from '@/components/ui/Toaster';
import { ThemeInit } from '@/components/system/ThemeInit';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { SwRegister } from '@/components/system/SwRegister';
import dynamic from 'next/dynamic';

// TvMode — клиентский оверлей стрелочной навигации: не нужен в SSR-бандле (ТЗ блок 8)
const TvMode = dynamic(() => import('@/components/system/TvMode').then((m) => m.TvMode));
import { CookieConsent } from '@/components/system/CookieConsent';
import { ClientMonitoring } from '@/components/system/ClientMonitoring';
import { AutoSync } from '@/components/system/AutoSync';
import { AuthGate } from '@/components/auth/AuthGate';
import { AchievementToast } from '@/components/profile/AchievementToast';
import { ScopeSync } from '@/components/system/ScopeSync';
import { I18nProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  metadataBase: new URL(getProvidersConfig().site.url),
  title: {
    default: 'AniNova — каталог аниме: онгоинги, расписание и плеер',
    template: '%s · AniNova',
  },
  description:
    'Каталог аниме с русскими описаниями: подборки, жанры, живое расписание выхода серий, локальная история просмотров и плеер с автопереходом.',
  /* S3.2: keywords удалён (устарел, Google/Yandex игнорируют — аудит SuperSEO);
     добавлены og:url (дефолт главной) и og:locale. */
  alternates: { languages: { ru: '/', en: '/?lang=en' } },
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'ru_RU',
    siteName: 'AniNova',
    title: 'AniNova — каталог аниме',
    description: 'Подборки, жанры, расписание и плеер. Метаданные AniList, локальный профиль без регистрации.',
  },
};

export const viewport: Viewport = {
  /* ТЗ5 3.8: width/initialScale заданы явно (SuperSEO «Мета-тег viewport — Внимание»):
     гарантируем ровно один корректный meta viewport независимо от дефолтов Next. */
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0d11' },
    { media: '(prefers-color-scheme: light)', color: '#f6f7fb' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      {/* S3.2: preconnect/dns-prefetch к s4.anilist.co и cdn.myanimelist.net убраны —
          с волны S1 все изображения идут через собственный прокси /img (server-side),
          браузер на эти origin больше не ходит (PSI: «Unused preconnect»). */}
      <body>
        <I18nProvider>
        <ThemeInit />
        <SwRegister />
        <TvMode />
        <Toaster>
          <SiteHeader />
          <main id="content">{children}</main>
          <Footer />
          <MobileNav />
          <CookieConsent />
          <ClientMonitoring />
          <AutoSync />
        <AuthGate />
        <AchievementToast />
        <ScopeSync />
        </Toaster>
        </I18nProvider>
      </body>
    </html>
  );
}
