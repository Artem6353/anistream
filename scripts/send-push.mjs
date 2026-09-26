/* Ежедневная рассылка пушей о сериях дня (GH Actions cron 18:00 MSK).
   Env: VAPID_PUBLIC/VAPID_PRIVATE, PUSH_CONTACT, SUPABASE_URL, SUPABASE_SERVICE_KEY */
import webpush from 'web-push';

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPA_URL || !SUPA_KEY) {
  console.error('Нет SUPABASE_URL или SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!process.env.VAPID_PUBLIC || !process.env.VAPID_PRIVATE) {
  console.error('Нет VAPID_PUBLIC или VAPID_PRIVATE');
  process.exit(1);
}

webpush.setVapidDetails(
  process.env.PUSH_CONTACT ?? 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC,
  process.env.VAPID_PRIVATE,
);

// 1) Читаем подписки из Supabase
const subsRes = await fetch(`${SUPA_URL}/rest/v1/push_subs?select=id,endpoint,keys`, {
  headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
});
if (!subsRes.ok) {
  console.error('Supabase read failed:', subsRes.status, await subsRes.text());
  process.exit(1);
}
const subs = await subsRes.json();
if (!subs.length) {
  console.log('подписок нет');
  process.exit(0);
}
console.log(`подписок: ${subs.length}`);

// 2) Payload: тестовый (--test) или эфиры за сегодня; день недели — МСК (аудит блок 3)
const mskDay = (ms) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(new Date(ms)),
  );
const TEST = process.argv.includes('--test');
let payload;
if (TEST) {
  payload = JSON.stringify({
    title: 'AniNova: тест push',
    body: 'Проверка доставки. Если вы это видите — push-пайплайн работает end-to-end.',
    url: '/schedule',
  });
  console.log('режим: тестовый payload');
} else {
const day = mskDay(Date.now());
const start = Math.floor(Date.now() / 1000);
const q = {
  query: `query($start:Int!,$end:Int!){ Page(page:1,perPage:30){ airingSchedules(airingAt_greater:$start,airingAt_lesser:$end){ airingAt episode media{ id title{romaji} } } } }`,
  variables: { start: start - 3600 * 6, end: start + 3600 * 6 },
};
const r = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(q),
});
const j = await r.json();
const rows = (j?.data?.Page?.airingSchedules ?? []).filter(
  (x) => mskDay(x.airingAt * 1000) === day,
);
if (!rows.length) {
  console.log('сегодня эфиров нет');
  process.exit(0);
}

payload = JSON.stringify({
  title: 'Сегодня выходят серии',
  body: rows
    .slice(0, 5)
    .map((x) => `${x.media.title.romaji} · серия ${x.episode}`)
    .join('\n'),
  url: '/schedule',
});
}

// 3) Отправляем + чистим мёртвые подписки
let ok = 0;
let dead = 0;
for (const sub of subs) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      payload,
    );
    ok++;
  } catch (e) {
    const status = e.statusCode ?? 0;
    console.log('send fail:', status, sub.endpoint.slice(0, 60));
    if (status === 404 || status === 410) {
      // Подписка мертва — удаляем из Supabase
      const del = await fetch(
        `${SUPA_URL}/rest/v1/push_subs?id=eq.${encodeURIComponent(sub.id)}`,
        {
          method: 'DELETE',
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        },
      );
      if (del.ok) dead++;
    }
  }
}
console.log(`отправлено ${ok}/${subs.length}, удалено мёртвых: ${dead}`);