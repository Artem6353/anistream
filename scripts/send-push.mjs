/* Ежедневная рассылка пушей о сериях дня (GH Actions cron 18:00 MSK).
   Env: VAPID_PUBLIC/VAPID_PRIVATE (или data/vapid.json), PUSH_CONTACT=mailto:you@… */
import { readFileSync, existsSync } from 'node:fs';
import webpush from 'web-push';

const subsFile = 'data/push-subs.json';
if (!existsSync(subsFile)) {
  console.log('подписок нет');
  process.exit(0);
}
const subs = JSON.parse(readFileSync(subsFile, 'utf8'));
let keys;
if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) keys = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
else keys = JSON.parse(readFileSync('data/vapid.json', 'utf8'));
webpush.setVapidDetails(process.env.PUSH_CONTACT ?? 'mailto:admin@example.com' /* TODO(домен): замените на реальный контакт или задайте PUSH_CONTACT */, keys.publicKey, keys.privateKey);

const day = new Date().getDay();
const start = Math.floor(Date.now() / 1000);
const q = { query: `query($start:Int!,$end:Int!){ Page(page:1,perPage:30){ airingSchedules(airingAt_greater:$start,airingAt_lesser:$end){ airingAt episode media{ id title{romaji} } } } }`, variables: { start: start - 3600 * 6, end: start + 3600 * 6 } };
const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
const j = await r.json();
const rows = (j?.data?.Page?.airingSchedules ?? []).filter((x) => (new Date(x.airingAt * 1000).getDay() + 6) % 7 === (day + 6) % 7);
if (!rows.length) {
  console.log('сегодня эфиров нет');
  process.exit(0);
}
const payload = JSON.stringify({ title: 'Сегодня выходят серии', body: rows.slice(0, 5).map((x) => `${x.media.title.romaji} · серия ${x.episode}`).join('\n') });
let ok = 0;
for (const sub of subs) {
  try {
    await webpush.sendNotification(sub, payload);
    ok++;
  } catch (e) {
    console.log('send fail:', e.statusCode ?? e.message);
  }
}
console.log(`отправлено ${ok}/${subs.length}`);
