# Публикация в сеть: бесплатные варианты и база данных

Архитектура сайта сознательно **не требует БД на старте**: каталог — JSON-снапшот в репозитории
(`lib/data/titles.json`), кэш источников — файл (`.cache/providers-resolve-cache.json`),
профиль пользователя — localStorage. Поэтому бесплатный хостинг подбирается только под Next.js.

## Репозиторий: private или public?

**Рекомендация: private.** Причины:
1. В репозитории лежит `.cache/providers-resolve-cache.json` — индекс из тысяч embed-ссылок
   на сторонние плееры с тайтлами, права на которые принадлежат правообладателям. Публикация
   такого индекса — это публикация базы ссылок: риск DMCA-takedown репозитория и аккаунта GitHub
   (GitHub удовлетворяет такие жалобы и публикует notices).
2. Код провайдеров (скрейпинг Kodik/AnimeGo/AniBoom) и токены — серая зона ToS самих плееров;
   публичный вид облегчает жизнь и ботам-абьюзерам, и жалобщикам.
3. Бесплатные хостинги (Vercel Hobby, Cloudflare Pages) **умеют импортировать приватные
   репозитории** — private ничего не ломает в деплое.
4. Приватный репозиторий не индексируется поиском и не сканируется ботами правообладателей.

Гигиена в любом случае:
- `.env*.local` никогда не коммитим (уже в `.gitignore`); секреты — только в env-переменных хостинга;
- если захотите публичную версию для портфолио: сделайте **отдельный** репозиторий без
  `.cache/`, без `lib/providers/kodik*`/bridge и без токенов (демо-провайдер + UI) — это чисто
  и красиво смотрится как open-source витрина дизайн-системы и плеера;
- лицензию для публичной витрины ставьте MIT, для основного репозитория лицензия не обязательна
  (private по умолчанию = все права у вас).

Команды старта:
```bash
git init && git add -A && git commit -m "AniStream 2.x"
git branch -M main && git remote add origin https://github.com/<you>/anistream.git
git push -u origin main   # репозиторий заранее создайте PRIVATE на github.com
```

## Вариант A — Vercel Hobby (рекомендую для старта), $0

Плюсы: создан для Next.js, SSR/ISR/API/OG работают из коробки, бесплатный HTTPS и домен `*.vercel.app`.

1. Залейте папку проекта в приватный репозиторий GitHub (`node_modules`, `.next`, `.env*.local` — в `.gitignore`;
   `lib/data` и `.cache` — **в репозиторий**, это ваши данные и кэш).
2. vercel.com → **Add New… → Project** → импорт репозитория → фреймворк определится сам (Next.js).
3. Environment variables:
   - `NEXT_PUBLIC_SITE_URL=https://<ваш-проект>.vercel.app`
   - `NEXT_PUBLIC_SITE_NAME=AniStream`
   - `KODIK_BRIDGE_URL=` и `MULTIPLAYER_BRIDGE_URL=` — **пустые значения**: на serverless локальные
     bridge недоступны, сайт полностью работает на кэше + синтезе + guess-пуле озвучек.
   - `PROVIDER_TIMEOUT_MS=4000` (лимит serverless-функций Hobby ~10 c, не гоняем долгие гонки).
4. Deploy. Готово: каталог, ТОП, плеер, расписание работают; записи кэша на serverless эфемерны
   (это нормально:.synth/guess не требуют состояния, а легаси-кэш читается из репозитория).

Ограничения Hobby: 100 GB трафика/мес (хватит с запасом), функции 10 c, нет фоновых процессов
(bridge поднять нельзя — см. вариант C).

## Вариант B — свой ПК/ноутбук + Cloudflare Tunnel, $0 (полная функциональность)

Единственный бесплатный способ держать **живые bridge** (Kodik/CVH/AniBoom) в продакшене:

1. `npm run build && npm run start` (или `pm2 start npm --name ani -- start`).
2. Поднять bridge: `python bridges/kodik_bridge.py`, `python bridges/multi_player_bridge.py`.
3. `cloudflared tunnel --url http://localhost:3000` → мгновенный бесплатный HTTPS
   (`https://xxx.trycloudflare.com`); для постоянного адреса — именованный туннель + свой домен.
4. В `.env.local` оставить `NEXT_PUBLIC_SITE_URL=https://xxx.trycloudflare.com`.
Минус: компьютер должен быть включён.

## Вариант C — Oracle Cloud Always Free, $0 навсегда (VPS 4 ядра ARM / 24 ГБ)

Полноценный бесплатный VPS: node + оба bridge + персистентный файловый кэш + своя БД при желании.
Ubuntu 22.04 → nvm + Node 20+ → clone репозитория → `npm ci && npm run build && npm run start`
(pm2/systemd), bridge через systemd-юниты, снаружи — Cloudflare Tunnel или белый IP Oracle.
Это лучший бесплатный «взрослый» вариант: ничего не засыпает, всё живое.

## Вариант D — Cloudflare Pages/Workers, $0 (безлимитный трафик)

Next через `@opennextjs/cloudflare`; сложнее по совместимости (node-API ограничен), файловый кэш
недоступен — кэш переводите на Cloudflare KV (бесплатно). Выбирайте, если важен безлимит трафика
и вы готовы потратить час на адаптацию.

## База данных: когда и какая

| Нужна ли сейчас | Хранилище |
| --- | --- |
| Каталог/метаданные | JSON в репозитории (обновляется скриптами enrich/import) — БД не нужна |
| Кэш источников | файл локально; на serverless — Upstash Redis free (10k cmd/день) или Cloudflare KV, ключ `ep:{slug}:{ep}`, TTL 7 дн |
| Профиль (закладки/история/списки) | localStorage сейчас; при желании синхронизации — см. ниже |
| Аккаунты, синхронизация, комментарии | **Supabase free** (Postgres 500 МБ + Auth + Storage) — первый выбор; альтернативы: Neon (serverless Postgres, scale-to-zero), Turso (SQLite у края, 9 ГБ), MongoDB Atlas (512 МБ) |

Стартовая схема в Supabase (когда понадобятся аккаунты), зеркалит localStorage для бесшовной миграции:

```sql
create table profile_bookmarks (user_id uuid references auth.users, slug text, primary key (user_id, slug));
create table profile_history (
  user_id uuid references auth.users, slug text, episode int,
  position real, duration real, updated_at timestamptz default now(),
  primary key (user_id, slug, episode));
create table profile_lists (user_id uuid references auth.users, slug text, status text, primary key (user_id, slug));
```

Рекомендация: публикуйтесь по варианту A **без БД** (ничего не платить, ничего не мигрировать),
профиль синхронизируйте позже через Supabase, когда появятся аккаунты/комментарии; если хотите
живые bridge в продакшене бесплатно — вариант C (Oracle) или B (туннель с домашнего ПК).


## Решения A0 (зафиксированы; A0.1 обновлён фактическими результатами 23.09.2026)

### A0.1 Где живут Python-bridge в проде — РЕКОМЕНДАЦИЯ: вариант (a) Oracle Free VPS

**Фактическая проверка live-слоя (песочница, датацентр-IP, 23.09.2026):**

| Проверка | Результат |
|---|---|
| `npm run check:kodik` (kodikwrapper, статический `KODIK_TOKEN=447d…`) | ❌ 401 «Отсутствует или неверный токен» — токен ротирован/заблокирован для датацентр-IP |
| `getPublicToken` (публичный токен плеера) + search | ❌ тот же 401 |
| `python bridges/kodik_bridge.py` (AnimeParsers, **авто-пул токенов**) → `POST /resolve` | ✅ **живые источники**: Frieren ep1 → «КОМНАТА ДИДИ», «OnWave» и др., episode-specific `kodikplayer.com/seria/…` embed-ы, 0.6–0.8 с |
| `python bridges/multi_player_bridge.py` (CVH/AnimeGo) → `POST /resolve` | ✅ **живые источники**: «Dream Cast», «AniLibria», `animego.me/cdn-iframe/…`, ~3.3 с |
| Нагрузка 100 одновременных `/resolve` (A8.1) | ✅ warm p95≈0.2 с, cold-бурст p95≈1.2 с (Kodik) / ≈4.7 с (CVH — латентность animego), 0 ошибок после оптимизаций (single-flight, backlog 128, лимит хендлеров) |

**Вывод:** live-слой РАБОТАЕТ через bridge даже с датацентр-IP — 401 касается только прямого пути
`kodikwrapper` со статическим токеном (публичные токены Kodik ротатирует; авто-пул AnimeParsers
подбирает живой). Вариант (a) подтверждён практически; вариант (c) остаётся запасным.

- **Прод-схема**: Vercel (фронт) + Oracle Free VPS (bridge ×2 + Caddy с bearer-токеном) + Supabase (данные).
  VPS: systemd-юниты `kodik-bridge.service` и `multi-bridge.service` (файлы в `deploy/`), Caddy реверс-прокси
  `bridge.вашдомен` → 127.0.0.1:8765/8766, доступ только с заголовком `Authorization: Bearer $BRIDGE_TOKEN`
  (клиент Next отправляет его автоматически при заданном `BRIDGE_TOKEN` в env).
- **👤 Осталось подтвердить на своей стороне** (5 минут): на домашней машине/VPS поднять оба bridge
  (`pip install requests <AnimeParsers zip>` — см. bridges/README.md), выполнить
  `BRIDGE_URL=http://127.0.0.1:8765 PROVIDER=kodik npm run loadtest <slug> 1` и `npm run check:kodik`.
  Если с вашего IP и авто-пул получит 401 (маловероятно по данным песочницы) — переходите на вариант (c).
- **Запасной (c)**: без live-слоя — `npm run warm` + `npm run hydrate` для топ-1000, кэш в Upstash/KV
  (или FS на VPS), в плеере уже есть честная индикация «источник из кэша» и уведомление при отсутствии
  источников. Сайт полностью работоспособен без bridge (проверено: smoke 30/30 без live-слоя).
- Проверка в проде: `GET /api/providers/<slug>/<ep>` → `sourcesUsed` содержит `live:…`.

### A0.2 Хостинг — Vercel Hobby (фронт) + Oracle Always Free (bridge), см. LIMITS.md по порогам.

### A0.3 Домен: канонический non-www. На Vercel: основной домен `anistream.ru` (пример),
`www` → 301 на apex (в настройках домена Vercel делается автоматически). metadataBase + canonical
указывают на `NEXT_PUBLIC_SITE_URL` без www и без trailing slash.

### Мониторинг (A7)
- `/api/health` → UptimeRobot/BetterStack, интервал 5 мин.
- Sentry (опц.): `NEXT_PUBLIC_SENTRY_DSN` — инициализация ленивая, без build-плагинов.
- Аналитика (опц.): `NEXT_PUBLIC_ANALYTICS_SRC` (Plausible/Umami) + `NEXT_PUBLIC_ANALYTICS_DOMAIN`.
- TG-алерты: `TG_BOT_TOKEN`/`TG_CHAT_ID` — уже wired в lib/metrics.ts.
