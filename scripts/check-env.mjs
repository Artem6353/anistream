/* Проверка env перед стартом (A3.4): npm run check:env
   Группирует переменные по сервисам и честно подсказывает, что отсутствует:
     1) Обязательные        — без них сайт/админка работают неправильно (exit 1);
     2) Supabase + капча    — общие отзывы/аккаунты/синхронизация (A3.1, C2);
     3) Мониторинг и алерты — Sentry/Telegram/аналитика (A7.1–A7.4);
     4) Web-push            — пуш-уведомления о сериях (C4);
     5) KV-кэш провайдеров  — Upstash Redis для serverless (B11/C1);
     6) Live-источники      — Kodik-токен и bridge-адреса (A0.1).
   Читает process.env И .env.local/.env (plain node-скрипт не получает их автоматически). */
import { readFileSync, existsSync } from 'node:fs';

// --- загрузка .env.local / .env (без dotenv) ---------------------------------
for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const has = (k) => Boolean(process.env[k]);
const hasAny = (keys) => keys.some(has);
const missing = (keys) => keys.filter((k) => !has(k));

const groups = [
  {
    name: 'Обязательные',
    required: true,
    vars: {
      ADMIN_TOKEN: 'вход в /admin (сгенерируйте: openssl rand -hex 24)',
    },
    soft: {
      NEXT_PUBLIC_SITE_URL: 'без него canonical/OG/sitemap указывают на localhost',
      NEXT_PUBLIC_SITE_NAME: 'бренд в шапке/metadata (по умолчанию AniNova)',
    },
  },
  {
    name: 'Supabase + капча (общие отзывы, аккаунты, синхронизация — A3.1/C2)',
    vars: {
      NEXT_PUBLIC_SUPABASE_URL: 'URL проекта supabase.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-ключ (Settings → API)',
      SUPABASE_SERVICE_KEY: 'service_role для edge-функции submit-review (RLS-обход)',
      TURNSTILE_SECRET: 'Cloudflare Turnstile secret (защита POST отзывов от ботов)',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'Turnstile site key (виджет в форме)',
    },
    note: 'без этой группы отзывы работают в локальном режиме (localStorage) и не защищены RLS',
  },
  {
    name: 'Мониторинг и алерты (A7.1–A7.4)',
    vars: {
      NEXT_PUBLIC_SENTRY_DSN: 'Sentry: ошибки фронтенда (до подключения сбора ошибок нет)',
      TG_BOT_TOKEN: 'Telegram-бот для алертов (BotFather)',
      TG_CHAT_ID: 'чат для алертов (узнать: @userinfobot)',
      NEXT_PUBLIC_ANALYTICS_SRC: 'Plausible/Umami: src скрипта аналитики',
      NEXT_PUBLIC_ANALYTICS_DOMAIN: 'домен для аналитики',
    },
    note: 'без этой группы мониторинга нет: /api/health отвечает, но никто не смотрит',
  },
  {
    name: 'Web-push (уведомления о новых сериях — C4)',
    vars: {
      VAPID_PUBLIC: 'npx web-push generate-vapid-keys',
      VAPID_PRIVATE: 'из той же команды',
      PUSH_CONTACT: 'mailto: для VAPID (контакт администратора)',
    },
    note: 'без ключей кнопка подписки на пуши скрыта, cron push-daily ничего не шлёт',
  },
  {
    name: 'KV-кэш провайдеров (serverless — B11/C1)',
    vars: {
      UPSTASH_REDIS_REST_URL: 'Upstash Redis REST URL',
      UPSTASH_REDIS_REST_TOKEN: 'Upstash Redis REST токен',
    },
    note: 'без них кэш источников — файловый (.cache/): на VPS это нормально, на Vercel записи эфемерны',
  },
  {
    name: 'Live-источники видео (A0.1)',
    soft: {
      KODIK_TOKEN: 'без него Kodik работает через авто-пул публичных токенов (может получать 401)',
      KODIK_BRIDGE_URL: 'адрес kodik_bridge.py (пусто = live-слой Kodik выключен)',
      MULTIPLAYER_BRIDGE_URL: 'адрес multi_player_bridge.py (пусто = CVH/AniBoom live выключен)',
      BRIDGE_TOKEN: 'bearer-токен для bridge за Caddy (deploy/Caddyfile)',
    },
    note: 'без live-слоя сайт работает на кэше/синтезе/demo — см. docs/DEPLOY.md §A0.1',
  },
];

let fatal = 0;
for (const g of groups) {
  const all = { ...(g.vars ?? {}), ...(g.soft ?? {}) };
  const miss = missing(Object.keys(all));
  const hardMiss = missing(Object.keys(g.vars ?? {}));
  const label = g.required ? 'обязательные' : g.name;
  if (!miss.length) {
    console.log(`✓ ${label}: настроено`);
    continue;
  }
  const okCount = Object.keys(all).length - miss.length;
  console.log(`\n${g.required ? '✗' : '○'} ${label} — отсутствуют (${okCount}/${Object.keys(all).length} задано):`);
  for (const k of miss) {
    const hard = (g.vars ?? {})[k] !== undefined;
    console.log(`  ${hard && g.required ? '✗' : '·'} ${k} — ${all[k]}`);
    if (hard && g.required) fatal++;
  }
  if (g.note) console.log(`  ℹ ${g.note}`);
  if (!g.required && hardMiss.length && hardMiss.length < Object.keys(g.vars).length) {
    console.log(`  ⚠ группа настроена частично (${hardMiss.join(', ')} отсутствуют) — сервис может работать наполовину`);
  }
}

if (fatal) {
  console.error(`\n✗ Критично отсутствуют: ${fatal} переменных. Заполните .env.local (образец: .env.example).`);
  process.exit(1);
}
console.log('\n✓ обязательные переменные на месте; опциональные группы — по подсказкам выше');
