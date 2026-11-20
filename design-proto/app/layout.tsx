import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ProtoDock } from '@/components/proto/ProtoDock';

export const metadata: Metadata = {
  title: {
    default: 'AniNova 3.0 — B1-A · дизайн-прототип',
    template: '%s · AniNova 3.0 прототип',
  },
  description:
    'Изолированный дизайн-прототип AniNova 3.0: три концепции (Nova Minimal, Nova Editorial, Nova Cinematic) на одинаковом наборе экранов. Демонстрационные mock-данные.',
  robots: { index: false, follow: false, nocache: true },
  other: { 'anistream:prototype': 'b1-a' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
    { media: '(prefers-color-scheme: light)', color: '#f7f5ef' },
  ],
  colorScheme: 'dark light',
};

/* До первой отрисовки: тема (localStorage → prefers-color-scheme), скрытие
   панели прототипа и режим «только интерфейс» для скриншотов. Скрипт крошечный
   и намеренно inline: без него будет вспышка темы. */
const boot = `(function(){try{var d=document.documentElement;var q=new URLSearchParams(location.search);var t=localStorage.getItem('aninova-proto-theme');if(t!=='light'&&t!=='dark'){var p=location.pathname;if(p.indexOf('/editorial')===0){t='light';}else if(p.indexOf('/minimal')===0||p.indexOf('/cinematic')===0){t='dark';}else{t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}}d.dataset.theme=t;if(q.get('ui')==='0'||sessionStorage.getItem('aninova-proto-ui')==='off'){d.dataset.ui='off';}if(q.get('ui')==='1'){d.dataset.ui='on';}}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>
        {children}
        <ProtoDock />
      </body>
    </html>
  );
}
