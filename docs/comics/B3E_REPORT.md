# B3-E — интеграция и недостающие возможности: отчёт

Дата: 2026-11-28. Ветка: `data/aninova-3-b3-e-integration-capabilities-2026-11`.

## A. Git

| Параметр | Значение |
| --- | --- |
| База | `2521133d47aaa1d78f1ef3927a63e59846f1de79` (HEAD B3-D.1) |
| Ветка | `data/aninova-3-b3-e-integration-capabilities-2026-11` |
| Коммит реализации | `be2c8fdf8d0e5fce9ff4c8f9823e5519db32db3f` |
| Изменения | 37 файлов, +4250 / −135 |
| `main` | не изменялся |
| PR / merge / деплой | не выполнялись |
| Force push | не выполнялся |

База является предком HEAD (`git merge-base --is-ancestor` → успех).
Отчёт коммитится отдельным коммитом поверх реализации; SHA отчёта — в
`git log` ветки.

## B. Архитектура

Разрыв B1/B3 закрыт одним контрактом чтения, а не переписыванием страниц:

- `catalog-params.ts` — единый разбор поиска/фильтров/пагинации для API,
  preview-страниц и legacy-режима;
- `db.ts` — anon-only PostgREST-клиент: таймаут 8 с, один ретрай на 429/5xx/сеть,
  `Prefer: count=exact`, экранирование `ilike`, маппинг строк в `ComicWork`;
- `public-catalog.ts` — выбор режима (`db` / `legacy-preview` / `unavailable`),
  каталог, карточка, кламп страницы, преобразование ошибок в 503;
- `20261128_comics_b3e_read_integration.sql` — четыре представления поверх
  существующих публичных гейтов;
- `app/api/comics/*` и preview-страницы используют этот же контракт.

Молчаливого fallback нет: production без БД отдаёт 503, а не JSON-превью.
`service_role` и `sb_secret_*` отвергаются при конфигурации. Legacy-режим
возможен только явно (`COMICS_LEGACY_PREVIEW=1` вне production или
`COMICS_CATALOG_SOURCE=legacy`), с notice в ответе.

Расхождения зафиксированы: глобальные фасеты в DB-режиме против фасетов по
выборке в legacy; `rightsVerified=false` у DB-строк (допуск к показу ≠ права
на главы); роль в SQL повторяет правило направления, но проверена только
контрактными тестами.

## C. Comics Search API

`GET /api/comics` — `q`, `genre`, `kind`, `role`, `sort`, `page`, `pageSize`;
`GET /api/comics/{slug}` — карточка, главы, связи.

Что сделано:

- параметры валидируются, неизвестные значения игнорируются, ввод очищается
  от метасимволов PostgREST;
- поиск по `title_ru` + подтверждённым русским алиасам, `%`/`_` — литералы;
- `total` из `Content-Range`, страница за пределами выдачи показывает последнюю;
- 503 `not-configured`/`read-failed`, 404, 308 для переехавшего legacy-slug;
- минутный edge-кэш успеха и `no-store` для ошибок.

Что подтверждено: mocked PostgREST-тесты (URL, заголовки, ретрай, маппинг),
PGlite-контракты представлений и прав, сборка Next.js. Что не подтверждено:
реальное поведение PostgREST/RLS на Supabase.

## D. Adaptation Monitor

Добавлены:

- allowlist `comic_announcement_sources` (5 официальных источников: Seven Seas,
  Kodansha USA, MAPPA, BONES, Shueisha) и `data/comics/announcement-sources.json`;
- очередь `comic_adaptation_announcements` со статусом `pending_review` по
  умолчанию и жёсткими проверками подтверждения;
- append-only журнал `comic_announcement_events`;
- `scripts/lib/comics-announcements.mjs`: RSS/Atom-парсер, ключевые слова
  EN/RU/JA, детект слухов, allowlist URL, стабильные ключи и хэши;
- `scripts/comics-b3e-monitor.mjs`: dry-run по умолчанию, `--apply` только с
  `COMICS_MONITOR_APPLY=1` + service key, conditional GET, ретраи, отчёты;
- `.github/workflows/comics-announcements.yml`: ежедневный dry-run без секретов.

Фактический dry-run 2026-11-28: 5/5 источников доступны, 41 кандидат, 3 сильных
сигнала (BONES: «運命の巻戻士», «黄泉のツガイ», «マリッジトキシン»). Это
**сигналы**, а не подтверждённые адаптации.

Монитор не подтверждает анонсы, не пишет `comic_adaptations` и не связывает
произведения автоматически. Подтверждение — ручное действие редактора с
`confirmation_url` и `confirmed_at`.

## E. Безопасность

- публичное чтение — только anon-ключ; service-ключ отклоняется кодом;
- представления `security_invoker=false` + `security_barrier=true`, `revoke all`
  для `public`, `grant select` только публичным ролям;
- очередь анонсов и журнал недоступны `anon`/`authenticated`;
- события нельзя изменить/удалить даже `service_role`;
- URL анонса: только `https`, только домен источника/поддомен, без credentials,
  порта и open-redirect;
- отчёты монитора не содержат секретов и не коммитятся (`artifacts/` в
  `.gitignore`);
- production Supabase/Redis/Vercel не использовались, миграции не применялись
  к чужим БД.

Остаточный риск: RLS/PostgREST не проверены на реальном проекте; политика
`service_role` в SQL-тестах проверяется в PGlite, а не в Supabase.

## F. Тестирование

| Проверка | Команда | Результат |
| --- | --- | --- |
| Типы | `npm run typecheck` | PASS |
| Линт | `npm run lint` | PASS, 0 ошибок; 3 старых warning вне B3-E |
| Юнит/контракты | `npm test` | PASS: 80 файлов, 637 тестов, 6 skip |
| Сборка | `npm run build` | PASS; `/api/comics`, `/api/comics/[slug]` |
| SQL canary | `npm run comics:b3e:canary` | PASS: `B3E_CANARY_OK` |
| Монитор dry-run | `npm run comics:b3e:monitor` | PASS: 5/5, 41 кандидат |
| `--apply` без env | `node scripts/comics-b3e-monitor.mjs --apply` | PASS: exit 1, запись запрещена |
| Allowlist кандидатов | `--candidates` с чужим доменом | PASS: 1 принят, 1 отклонён |
| Supabase/PostgREST/RLS | — | NOT RUN |
| GitHub Actions | — | NOT RUN (workflow добавлен) |

Canary дополнительно поймал и позволил исправить три реальные ошибки в новых
SQL-файлах: лишние запятые после `comment on` (синтаксис), отсутствующий
`country_code` в `comic_public_catalog` (теперь читается join к уже
отобранной строке `comic_works`), неоднозначные имена переменных в SQL-тесте.

## G. Нерешённые вопросы

| Пункт | Статус | Комментарий |
| --- | --- | --- |
| DB-backed поиск и карточка | PASS | код, mocked-тесты, SQL-контракты |
| Проверка на реальном Supabase | BLOCKED | нет тестового проекта; production запрещён условиями |
| Мониторинг официальных фидов | PASS | 5/5 живых фидов, dry-run |
| Запись очереди в реальную БД | PARTIAL | скрипт и SQL проверены в PGlite, `--apply` на Supabase не запускался |
| Редакторское подтверждение | NOT IMPLEMENTED | только SQL/ручное действие, UI вне объёма |
| Автоподтверждение адаптаций | NOT IMPLEMENTED | намеренно запрещено |
| Полнотекстовый/морфологический поиск | NOT IMPLEMENTED | подстрочный `ilike` |
| Паритет фасетов DB/legacy | PARTIAL | разные определения, задокументировано |
| Ежедневный CI-монитор | PARTIAL | workflow есть, прогон в GitHub не выполнялся |

## H. Итоговый статус

**`PASS WITH LIMITATIONS`**

Этап нельзя назвать полным `PASS`: DB-backed поиск реализован и доказан на
уровне SQL-контрактов и mocked PostgREST, но не проверен на реальном Supabase
(PostgREST, RLS, права ролей). Монитор выполняет заявленные функции —
получение официальных фидов, детект формулировок, очередь `pending_review` —
но не подтверждает анонсы и не связан с production-БД. Обе оговорки
принципиальны и не замаскированы зелёными локальными тестами.
