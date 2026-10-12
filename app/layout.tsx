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
import { Metrika } from '@/components/system/Metrika';
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
  /* Аудит 30.09 (SEO-1): hreflang en удалён — переключатель языка убран
     (сайт только RU), параметр ?lang=en сервером не обрабатывался:
     англо-альтернатива с русским контентом — ложный сигнал для Google. */
  alternates: { canonical: '/' },
  /* S6: верификация Google Search Console (URL-prefix property, 28.09.2026).
     ТЗ 3.2.2: верификация Яндекс.Вебмастера — через env, чтобы не коммитить код
     подтверждения и не менять сборку при смене проекта. Пустое значение = тег не выводится. */
  verification: {
    google: 'FbxT2iDTb-eCOQJXhFdnEyZqMjqKHzIqiX2cebRVDfU',
    ...(process.env.NEXT_PUBLIC_YANDEX_VERIFICATION
      ? { yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION }
      : {}),
  },
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'ru_RU',
    siteName: 'AniNova',
    title: 'AniNova — каталог аниме',
    description: 'Подборки, жанры, расписание и плеер. Метаданные AniList, локальный профиль без регистрации.',
  },
  /* Аудит 30.09 (SEO): twitter-card не было — карточки в X/Twitter рендерились без large-image.
     Аудит 2026-10 (ТЗ 1.5): title/description отсюда УБРАНЫ намеренно. Next мержит
     metadata поверхностно, но twitter.title/twitter.description — литералы: они не
     проходили через title.template и поэтому 22 страницы (расписание, каталог, топ,
     жанры, сезоны, подборки, лента, клубы, форум, квиз…) отдавали в X/Twitter
     «AniNova — каталог аниме» вместо своего заголовка. Без явного значения Next
     подставляет в twitter:title/twitter:description резолвленные title/description
     страницы — то есть то же, что видит Google. card и images остаются общими. */
  twitter: {
    card: 'summary_large_image',
    images: '/opengraph-image',
  },
};

export const viewport: Viewport = {
  /* ТЗ5 3.8: width/initialScale заданы явно (SuperSEO «Мета-тег viewport — Внимание»):
     гарантируем ровно один корректный meta viewport независимо от дефолтов Next. */
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#080d16' },
    { media: '(prefers-color-scheme: light)', color: '#f4f7fc' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  /* suppressHydrationWarning на <html>: инлайн-скрипт ThemeInit ставит
     data-theme/--accent ДО гидратации — без флага React логает hydration
     mismatch на атрибутах html (штатная рекомендация Next для тем-скриптов).
     Upstream локальной правки владельца, 01.10. */
  return (
    <html lang="ru" suppressHydrationWarning>
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
          {/* S5: Яндекс.Метрика (lazyOnload; включается только при NEXT_PUBLIC_METRIKA_ID) */}
          <Metrika />
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
