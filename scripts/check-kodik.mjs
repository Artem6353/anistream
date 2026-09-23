/* Диагностика Kodik с вашей машины: node scripts/check-kodik.mjs
   Проходит цепочку: токен → search (shikimori_id) → VideoLinks → skip-тайминги. */
import { Client, VideoLinks, getPublicToken } from 'kodikwrapper';
import { readFileSync, existsSync } from 'node:fs';

const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const token = process.env.KODIK_TOKEN ?? envFile.match(/KODIK_TOKEN=(.+)/)?.[1]?.trim();
console.log('1) токен из окружения:', token ? token.slice(0, 8) + '…' : '(нет)');

const fetcher = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) });

async function tryToken(label, tk) {
  console.log(`\n2) search через ${label}…`);
  const client = Client.fromToken(tk, { fetcher });
  const res = await client.search({ limit: 3, shikimori_id: 52991, episode: 1, with_episodes_data: true });
  const m = res.results?.[0];
  if (!m) throw new Error('пустой ответ поиска');
  console.log('   найдено:', res.results.length, '|', m.title, '| озвучка:', m.translation?.title);
  console.log('3) VideoLinks.getLinks…');
  const links = await VideoLinks.getLinks({ link: m.link, fetcher });
  const quals = Object.keys(links ?? {});
  console.log('   качества:', quals.join(', ') || '(нет прямых ссылок → будет iframe)');
  if (quals.length) console.log('   пример src:', links[quals[0]][0].src.slice(0, 80) + '…');
  console.log('\n✅ Kodik работает: провайдер включится в плеере автоматически.');
}

try {
  if (token) await tryToken('KODIK_TOKEN', token);
  else throw new Error('no token');
} catch (e) {
  console.log('   ⚠️ ', e.message);
  console.log('\n2b) пробую публичный токен плеера (getPublicToken)…');
  try {
    const pub = String(await getPublicToken({ fetcher }));
    console.log('   публичный токен:', pub.slice(0, 8) + '…');
    await tryToken('публичный токен', pub);
  } catch (e2) {
    console.log('   ❌', e2.message);
    console.log('\nВывод: Kodik отклоняет токены с этого IP/окружения (ротация публичных токенов');
    console.log('или блокировка дата-центр IP). Сайт продолжит работать на демо-потоках,');
    console.log('а провайдер Kodik включится, как только апстрим примет токен.');
    process.exit(1);
  }
}
