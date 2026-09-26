/* AniStream service worker: офлайн-оболочка и кэш постеров/расписания. */
const CACHE = 'anistream-v1';
const SHELL = ['/', '/catalog', '/genres', '/schedule', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* постеры и баннеры AniList — cache-first на год */
  if (url.hostname === 's4.anilist.co') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      }),
    );
    return;
  }

  /* расписание — network-first с фолбэком в кэш */
  if (url.pathname === '/api/schedule') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req)) || Response.error();
        }
      }),
    );
    return;
  }

  /* статика Next и шрифты — cache-first на год (ТЗ блок 8) */
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      }),
    );
    return;
  }

  /* навигация: сеть → кэш-оболочка (офлайн) */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        return cached || (await caches.match('/'));
      }),
    );
  }
});

/* Пуш-уведомления (аудит блок 3): без этих обработчиков браузер получает push,
   но ничего не показывает. Клик открывает раздел расписания (или url из payload). */
self.addEventListener('push', (event) => {
  let data = { title: 'AniNova', body: 'Новые серии уже на сайте' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* payload не JSON — оставляем дефолт */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'AniNova', {
      body: data.body || '',
      icon: '/logo-icon-192.png',
      badge: '/logo-icon-192.png',
      tag: 'anistream-push',
      data: { url: data.url || '/schedule' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/schedule';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client && client.url.startsWith(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
