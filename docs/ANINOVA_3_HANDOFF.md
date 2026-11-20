# AniNova 3.0 — B1-B: передача (handoff)

## 1. Где лежит работа

| Параметр | Значение |
|---|---|
| Ветка | `design/aninova-3-b1-b-hybrid-2026-11` |
| База | `origin/main` = `5d983d5` |
| Worktree | `C:/Users/artem/anistream-b1b` |
| Preview-корень | `app/preview/aninova-3` |
| Компоненты | `components/aninova3` |
| Данные/утилиты | `lib/aninova3` |
| Стили | `app/preview/aninova-3/a3.css` |
| Тесты | `tests/aninova3-spatial.test.ts`, `e2e/aninova3-tv.spec.ts` |
| Артефакты | `docs/design/b1b` |
| Документы | `docs/ANINOVA_3_*.md` |

Main checkout и worktree `anistream-perf` не использовались. Production-файлы вне перечисленных точек не менялись.

## 2. Запуск

### Требования

- Node.js и npm из корня репозитория (версия — как в проекте);
- свободные порты 3521/3522 для проверки production-сборки;
- переменная `ANINOVA3_PREVIEW=1` для включения preview.

### Установка и dev

```bash
cd C:/Users/artem/anistream-b1b
npm ci
ANINOVA3_PREVIEW=1 npm run dev
# http://localhost:3000/preview/aninova-3
```

PowerShell:

```powershell
$env:ANINOVA3_PREVIEW="1"; npm run dev
```

### Production-сборка локально

```bash
npx next build
ANINOVA3_PREVIEW=1 npx next start -p 3521

# без флага — preview должен отдать 404
npx next start -p 3522
```

### Полезные URL

| URL | Что показывает |
|---|---|
| `/preview/aninova-3` | главная |
| `/preview/aninova-3?tv=1` | TV-режим, крупные цели и подсказка |
| `/preview/aninova-3/catalog` | каталог |
| `/preview/aninova-3/catalog?genre=action&sort=score` | пример фильтров |
| `/preview/aninova-3/anime/one-piece` | страница тайтла |
| `/preview/aninova-3/anime/one-piece/1` | кинозал |
| `/preview/aninova-3/comics` | каталог Comics (демо) |
| `/preview/aninova-3/comics/gorod-stekla` | страница комикса |
| `/preview/aninova-3/comics/gorod-stekla/read` | читалка |
| `/preview/aninova-3/profile` | профиль |
| `/preview/aninova-3/auth` | вход/регистрация |

## 3. Команды проверки

```bash
npx tsc --noEmit
npx eslint app/preview components/aninova3 components/system/ChromeGate.tsx
npm test
npx next build

E2E_BASE=http://localhost:3521 ANINOVA3_PREVIEW=1 \
  npx playwright test e2e/aninova3-tv.spec.ts

A3_BASE=http://localhost:3521 node scripts/aninova3/audit.mjs
A3_BASE=http://localhost:3521 node scripts/aninova3/screenshots.mjs
A3_BASE=http://localhost:3521 \
  A3_ROUTES=/preview/aninova-3,/preview/aninova-3/catalog \
  node scripts/aninova3/measure.mjs
```

`audit.mjs` пишет `docs/design/b1b/audit.json`, `measure.mjs` — `perf.json`, `screenshots.mjs` — `screens/` и `manifest.json`.

## 4. Как устроен preview

```
app/preview/aninova-3/
  layout.tsx          флаг, noindex, A3UiProvider/A3Shell
  page.tsx            главная
  catalog/page.tsx    каталог
  anime/[slug]/       страница тайтла
  anime/[slug]/[episode]/  кинозал
  comics/             каталог, страница, читалка
  profile/page.tsx
  auth/page.tsx
  a3.css              вся дизайн-система в скоупе .a3

components/aninova3/  UI и TV-слой
lib/aninova3/         флаг, spatial, query, демо-комиксы
```

`components/system/ChromeGate.tsx`:

- `ChromeGate` скрывает production-шапку/футер/мобильную навигацию/cookie/auth-gate на preview;
- `MainGate` делает корневой контейнер `<div>` вместо `<main>` в preview, чтобы `<main>` был один (его даёт `A3Shell`).

`app/layout.tsx` изменён только этими обёртками. Вне `/preview/aninova-3` разметка и поведение прежние.

## 5. Флаг и откат

Флаг читается на сервере:

```ts
isAninova3PreviewEnabled()
// ANINOVA3_PREVIEW=1|true|on
```

Без флага layout вызывает `notFound()` → 404. `dynamic = 'force-dynamic'` — не нужно пересобирать при переключении.

Откат:

1. Убрать `ANINOVA3_PREVIEW` из окружения — preview перестанет открываться.
2. Если нужен полный откат кода — удалить `app/preview/aninova-3`, `components/aninova3`, `lib/aninova3`, `public/demo/comics`, `scripts/aninova3`, тесты и вернуть `app/layout.tsx` к `origin/main`.
3. Миграций БД нет, откатывать нечего.

## 6. Что можно переносить в production (когда будет решение)

Порядок безопаснее делать отдельными PR:

1. **Дизайн-система и компоненты** — `a3.css`, `A3Card`, `A3Rail`, `A3Hero`, `A3Header`, `A3Footer`, `A3MobileNav`.
2. **Каталог** — маршрут и `catalog-query`, с реальными данными и текущими API.
3. **Страница тайтла и кинозал** — только после проверки `PlayerShell` на целевом устройстве.
4. **Профиль и авторизация** — заменить демо-форму на текущую Supabase-авторизацию.
5. **Comics** — только после решения по лицензиям и реальным главам.
6. **TV-слой** — включить определение TV-устройства и проверить пульт/overscan.

Не переносить одновременно: сначала один вертикальный срез, затем следующий.

## 7. Ограничения и предупреждения

- Физический ТВ/пульт не тестировался; e2e — клавиатурная эмуляция.
- Кинозал не проверен с реальным HLS-источником.
- Авторизация демонстрационная, данные не отправляются.
- Comics — вымышленный демо-каталог и сгенерированные страницы.
- Только тёмная тема, только системный шрифт, без 4K-ассетов.
- Контраст автоматически проверен на 1440; остальные ширины — скриншотами.
- Свайп читалки не покрыт e2e.
- `?tv=1` — ручное включение TV-режима, не автоопределение.

## 8. Секреты и окружение

В B1-B не добавлялись секреты, ключи, Supabase/Redis-подключения и платёжные переменные. Для preview нужен только `ANINOVA3_PREVIEW`. Не коммитить `.env*.local`, ключи и токены.

## 9. Следующий шаг

Передать владельцу на просмотр:

- сравнение с B1-A и утверждёнными решениями;
- скриншоты `docs/design/b1b/screens/`;
- отчёты `audit.json` и `perf.json`;
- вопросы из `ANINOVA_3_B1B_REPORT.md`.

**Не начинать production-перенос и не деплоить** до явного решения владельца.
