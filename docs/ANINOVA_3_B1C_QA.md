# B1-C: QA

Все проверки выполнялись локально в изолированном worktree `anistream-b1c`
(ветка `design/aninova-3-b1-c-source-comics-2026-11`, база — `8adbdd7` B1-B).
Production, Supabase, Redis, Vercel и секреты не затрагивались.

## 1. Команды

```bash
npm ci                        # в этом worktree node_modules был повреждён переездом
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
npm run report:b1c            # machine-отчёт docs/data/aninova3-b1c-links-report.json

# production-сборка с включённым preview
ANINOVA3_PREVIEW=1 CATALOG_SOURCE=file node scripts/build.mjs

# e2e (сервер поднимает Playwright через webServer)
PLAYWRIGHT_BROWSERS_PATH=.cache/pw-browsers E2E_BASE=http://localhost:3102 \
  ANINOVA3_PREVIEW=1 CATALOG_SOURCE=file npx playwright test

# скриншоты + замеры (opt-in)
B1C_CAPTURE=1 PLAYWRIGHT_BROWSERS_PATH=.cache/pw-browsers E2E_BASE=http://localhost:3104 \
  npx playwright test e2e/aninova3-b1c-capture.spec.ts
```

Браузеры Playwright в этом окружении установлены внутрь проекта
(`PLAYWRIGHT_BROWSERS_PATH=.cache/pw-browsers`), чтобы не писать в пользовательский кэш.

## 2. Итоги

| Проверка | Результат |
|---|---|
| `tsc --noEmit` | 0 ошибок |
| ESLint | 0 ошибок, 3 предупреждения — все pre-existing (B1-B: `opengraph-image.tsx`, `scripts/aninova3/screenshots.mjs`) |
| Unit (vitest) | **413 passed / 6 skipped** (60 файлов + 1 skipped) |
| + к B1-B | +45 тестов B1-C |
| `next build` (webpack) | успешно; TypeScript внутри сборки проходит |
| E2E Playwright | **35 passed** (18 новых B1-C + 17 существующих), 1 opt-in capture skipped |
| Переполнение | 0 px на 27 замерах (3 маршрута × 9 ширин) |
| Скриншоты | 19 файлов |
| Замеры | `docs/design/b1c/perf.json` |

## 3. Новые unit-тесты

| Файл | Что проверяет |
|---|---|
| `tests/aninova3-comics-model.test.ts` (19) | маппинг `relationType`→роль, `ADAPTATION≠SEQUEL`, неизвестный тип → `RELATED`, инверсия ролей, приоритеты, вид произведения по стране, статусы, стабильные id/slug, битые рёбра |
| `tests/aninova3-comics-publication.test.ts` (11) | полный гейт чтения, отсутствие прав, отсутствие страниц, иностранные главы, глава без страниц, непроверенное название, истёкшее разрешение, демо, публичные формулировки без внутренних документов |
| `tests/aninova3-comics-resolver.test.ts` (9) | аниме→первоисточник (в т.ч. несколько связей), продолжение не подменяет первоисточник, оригинальное аниме, совпадение названий без id, ребро на отсутствующий комикс, неизвестный relation, дубли MAL, манга→несколько адаптаций, скрытое аниме, отсутствие lookup |
| `tests/aninova3-links-report.test.ts` (6) | инварианты на реальных данных + запись машинного отчёта (`B1C_REPORT=1`) |

Fixture явно помечен: `tests/fixtures/aninova3-comics.ts` (заголовок «FIXTURE — только для unit-тестов»).
Ни один preview-маршрут его не импортирует.

## 4. Обязательные сценарии §12

| Сценарий | Как проверено | Результат |
|---|---|---|
| Naruto: метаданные, `source`, `relations` | `tests/aninova3-links-report.test.ts` → `narutoChain` | `source: MANGA`, в `relations` нет `ADAPTATION`, id 30011 отсутствует |
| Naruto: точный id первоисточника | снимок графа, `source-graph.ts` | `AniList 20 → 30011 (MANGA, MAL 11)` |
| Naruto: произведение в Comics | `store.ts` | есть, slug `naruto` |
| Naruto: русское название и метаданные | редакционная запись | проверены вручную |
| Naruto: русские главы | `publication.ts` | нет (`chapters: []`) |
| Naruto: права | `publication.ts` | нет (`rightsVerified: false`) |
| Naruto: блок на странице | e2e | отображается, помечен как основной первоисточник |
| Naruto: кнопка чтения | e2e | отсутствует; прямой заход в читалку → 404 |
| Оригинальное аниме без манги | e2e (`/anime/one-piece`) + unit | секции нет, заглушек нет |
| Аниме с несколькими произведениями | unit (fixture: SOURCE + SIDE_STORY) | 2 карточки, один `primary` |
| Манга без доступных глав | unit + реальные данные | `no_ru_chapters`, CTA нет |
| Манга без подтверждённых прав | unit + реальные данные | `rights_unverified`, CTA нет |
| Манга с неверным языком | unit (en/ja) | 0 публичных глав |
| Несколько адаптаций одной манги | unit (fixture: 2 аниме) | две отдельные карточки |
| Ошибочное совпадение названий | unit (title-тёзка без ребра) | связи нет |
| Неизвестный relation id | unit (`WEIRD_NEW_TYPE`) | `RELATED`, не `SOURCE` |
| Дубликаты внешних идентификаторов | unit (общий MAL) | две карточки, `duplicates.mal` зафиксирован, слияния нет |

## 5. E2E §13

`e2e/aninova3-comics-links.spec.ts` (18 проверок):

**Аниме → манга (4)**
1. блок «Первоисточник» виден, заголовок, роль, RU-название, тип, статус, «Русских глав нет»;
2. нет кнопки «Читать мангу», прямой заход в читалку → 404;
3. «О первоисточнике» → `/comics/naruto` → блок «Аниме-адаптации» → состояние публикации;
4. аниме без первоисточника: секции нет, «манга не найдена» отсутствует.

**Манга → аниме (2)**
5. карточка адаптации ведёт на `/anime/naruto`;
6. демо-каталог остаётся отдельным: 8 демо-строк, маркировка «демо», метка `RU`.

**TV (3)**
7. пульт доходит от последней видимой серии до карточки первоисточника и открывает её;
8. скрытые серии из закрытого `<details>` не перехватывают фокус;
9. `Escape` возвращает на страницу манги и восстанавливает фокус на той же карточке адаптации (`data-a3-key="anime:20"`).

**Адаптивность (9)**
10–18. нет горизонтального переполнения на 360/390/430/768/1024/1280/1440/1920/3840 для страницы аниме, страницы манги и каталога Comics.

### 5.1. Найденный и исправленный регресс (B1-B)

Тест №7 вскрыл реальный баг навигатора: `isNavigable()` считал фокусируемыми элементы внутри
**закрытого** `<details>` (серии 13+ у «Наруто» лежат в `max-height`-контейнере с ненулевым rect),
поэтому стрелка «вниз» выбирала невидимую серию, `focus()` не срабатывал, и пульт **залипал**
на серии 12. Исправление в `lib/aninova3/spatial.ts`:

```ts
if (el.closest('details:not([open])') && !el.closest('summary')) return false;
```

Проверено тестом №8 и повторным прогоном всего e2e (35 passed, без регрессий в B1-B-сценариях).

## 6. Замеры (§14, локально, холодный кэш, 1440)

| Маршрут | DOM | Запросов | JS | CSS | HTML+RSC | LCP | CLS | TTFB |
|---|---|---|---|---|---|---|---|---|
| Аниме без первоисточника | 526 | 54 | 248.3 КБ | 165.6 КБ | 114.3 КБ | 164 мс | 0 | 21 мс |
| Аниме с одним первоисточником | 555 | 56 | 248.3 КБ | 130.3 КБ | 120.7 КБ | 176 мс | 0 | 22 мс |
| Страница манги с адаптацией | 172 | 38 | 274.9 КБ | 65.8 КБ | 32.8 КБ | 136 мс | 0 | 9 мс |
| Каталог Comics | 255 | 46 | 244.4 КБ | 36.1 КБ | 42.6 КБ | 136 мс | 0 | 8 мс |

Маржинальный вклад блока первоисточника: **+29 DOM, +2 запроса (изображение обложки), +6.4 КБ RSC,
0 байт клиентского JS, CLS 0**. INP не измерялся: production-трафика и реального устройства нет.

Сравнение с B1-B:

- клиентский JS: **не вырос** — новые компоненты серверные (`A3SourceSection`, `A3AdaptationSection` без `use client`);
- новых зависимостей нет;
- CSS: внутри уже существующего `a3.css` (preview-скоуп), production-стили не тронуты;
- RSC: +6.4 КБ на страницу с блоком (текст карточки);
- запросов: +2 (обложка первоисточника через существующий прокси `/img`).

Числа B1-B для JS/DOM в отчёте B1-B не публиковались, поэтому прямое сравнение «до/после» по ним
не заявляется: выше приведено измеренное поведение B1-C и маржинальный вклад нового блока.

## 7. Скриншоты

`docs/design/b1c/screens/` (19 файлов):

- `anime-source-desktop-1440.png`, `…--block.png`, `…-full.png`;
- `anime-source-tablet-768--block.png`, `anime-source-mobile-390--block.png`;
- `anime-source-tv-1920--block.png`, `anime-source-4k-3840--block.png`;
- `anime-without-source-1440--block.png` (секции нет);
- `comics-adaptations-desktop-1440--block.png`, `comics-adaptation-mobile-390.png`, `comics-adaptation-tv-1920--block.png`;
- `comics-catalog-1440.png`.

## 8. Изоляция

| Требование | Состояние |
|---|---|
| Отдельный worktree | `D:/ПРОЕКТ AniNova/anistream-b1c` |
| Отдельная ветка | `design/aninova-3-b1-c-source-comics-2026-11` (от `8adbdd7`) |
| B1-B не изменён | ветка B1-B остаётся на `8adbdd7` |
| `main` не изменён | да |
| Production-деплой | не выполнялся |
| Supabase/Redis/секреты/Vercel | не изменялись |
| Миграции БД | нет |
| `PlayerShell`/провайдеры | не тронуты |

## 9. Ограничения проверок

1. AniList GraphQL в этой сессии запрещён политикой окружения → полный снимок графа не снят (1 ребро).
2. Chromium headless; физический ТВ и пульт не тестировались.
3. INP не измерен; LCP/CLS — локальные, без троттлинга.
4. Свайпы читалки не покрыты e2e (как и в B1-B).
5. Реальная авторизация и Supabase в preview не задействованы.
