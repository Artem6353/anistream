'use client';

/** Лёгкий мониторинг (A7.1/A7.4): опциональные Sentry (browser) и аналитика — без сборки плагинов. */
let inited = false;

export function initClientMonitoring() {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    void import('@sentry/browser')
      .then(({ init, captureException }) => {
        init({ dsn, tracesSampleRate: 0.1 });
        window.addEventListener('error', (ev) => captureException(ev.error ?? ev.message));
        window.addEventListener('unhandledrejection', (ev) => captureException(String(ev.reason)));
      })
      .catch(() => {});
  }
}

export function injectAnalyticsScript() {
  if (typeof document === 'undefined') return;
  const url = process.env.NEXT_PUBLIC_ANALYTICS_SRC; // например https://plausible.io/js/script.js или self-hosted umami
  if (!url || document.getElementById('anistream-analytics')) return;
  const s = document.createElement('script');
  s.id = 'anistream-analytics';
  s.defer = true;
  s.src = url;
  s.dataset.domain = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN ?? window.location.hostname;
  document.head.appendChild(s);
}
