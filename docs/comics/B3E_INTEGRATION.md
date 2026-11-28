# B3-E: интеграция каталога Comics с базой данных

Этап B3-E соединяет уже построенные части: схему B3-A/B3-B/B3-C, JSON-preview B1
и страницы preview. Новых сущностей каталога не появляется — публичное чтение
переведено на представления `public.comic_public_*`.

## Что было разрывом

До B3-E страницы `/preview/aninova-3/comics` и карточка произведения читали
`lib/aninova3/comics/store.ts` — curated JSON B1. База B3-C уже содержала
произведения, главы, права и связи, но публичный слой к ней не обращался:
поиск, фильтры и пагинация работали по массиву в памяти. Пользователь видел
preview-данные, а не то, что прошло публикационный гейт БД.

B3-E добавляет **один контракт чтения** (`public-catalog.ts`) и **два источника**
за ним: БД (по умолчанию) и прежний JSON (только явный opt-in в разработке).

## Режимы чтения

| Режим | Когда включается | Что отдаёт |
| --- | --- | --- |
| `db` | `NEXT_PUBLIC_SUPABASE_URL` + anon key заданы; `COMICS_CATALOG_SOURCE` не равен `legacy` | представления `comic_public_catalog`, `comic_public_adaptations`, `comic_public_chapters` |
| `legacy-preview` | БД не настроена **и** `NODE_ENV !== production`, либо `COMICS_LEGACY_PREVIEW=1`, либо `COMICS_CATALOG_SOURCE=legacy` (если legacy разрешён) | curated JSON B1 + notice `legacy-preview` |
| `unavailable` | БД не настроена и legacy запрещён (production), либо legacy принудительно включён в production | ошибка `ComicsCatalogUnavailableError`; API отвечает 503 |

Молчаливого fallback нет: если БД должна быть источником, но недоступна,
каталог не подменяется JSON-превью. Это важно, потому что JSON не подтверждает
публикацию, права и главы.

### Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` (или `SUPABASE_URL`) | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (или `SUPABASE_ANON_KEY`) | **только anon**-ключ; `service_role` и `sb_secret_*` отклоняются |
| `COMICS_CATALOG_SOURCE` | `db` (по умолчанию) или `legacy`/`legacy-preview` для явного отката |
| `COMICS_LEGACY_PREVIEW` | `1/true/yes` разрешает JSON-preview; `0/false/no` запрещает; иначе разрешён вне production |

Секреты в клиент не попадают: `anon`-ключ и так публичный, `service_role`
отвергается на этапе конфигурации (`comicsDbConfig()`), а не просто не используется.

## Представления и гейты

`supabase/migrations/20261128_comics_b3e_read_integration.sql` создаёт:

| Представление | Содержимое |
| --- | --- |
| `comic_public_catalog` | карточки произведений + `country_code`, подтверждённые русские алиасы, `source_anime_count`, вычисленная `role` |
| `comic_public_adaptations` | публичные проверенные связи «аниме ↔ комикс» |
| `comic_public_kind_counts` | фасет `kind` по публичным произведениям |
| `comic_public_genre_counts` | фасет `genre` по публичным произведениям |

Все четыре представления читают **только** `comic_public_works` /
`comic_public_chapters` (плюс `comic_works` для `country_code` уже отобранной
строки), поэтому гейты B3-B/B3-C остаются единственным источником правды:

- `publication_status = 'approved'`, `published_at <= now()`;
- непустой `title_ru` со статусом `source_verified`/`editorially_verified`;
- `is_adult = false` и `content_rating_status = 'verified_non_adult'`;
- подтверждённые права `comic_rights`;
- для глав — `availability = 'public'`, `language = 'ru'`, `page_count > 0`,
  активный источник, подтверждённые условия и право на ссылку/embed.

Представления объявлены с `security_invoker = false` и `security_barrier = true`,
`revoke all` для `public`, `grant select` для `anon`, `authenticated`,
`service_role`. Базовые таблицы остаются недоступны anon.

Поиск по подстроке опирается на `pg_trgm`, если расширение доступно; блок
идемпотентен и при отсутствии расширения деградирует по скорости, не по
корректности.

## Код

| Файл | Роль |
| --- | --- |
| `lib/aninova3/comics/catalog-params.ts` | единый разбор `q/genre/kind/role/sort/page/pageSize` |
| `lib/aninova3/comics/db.ts` | anon-only PostgREST-клиент, маппинг строк в модель |
| `lib/aninova3/comics/public-catalog.ts` | выбор режима, каталог, карточка, 503-контракт |
| `app/api/comics/route.ts` | JSON API каталога |
| `app/api/comics/[slug]/route.ts` | JSON API произведения |
| `app/preview/aninova-3/comics/*` | те же данные в preview-страницах |

## Осознанные расхождения

1. **Фасеты.** В legacy-режиме фасеты считаются по отфильтрованной выборке;
   в DB-режиме — глобально по публичным произведениям (отдельные view). Это
   разные числа при активном поиске. Для DB-каталога глобальные фасеты —
   ожидаемое поведение, но в отчёте оно зафиксировано явно.
2. **Роль.** В БД роль вычисляется SQL-выражением по подтверждённым связям;
   в JSON — `catalogRoleFor()` по тем же правилам направления. Совпадение
   проверено контрактными тестами на уровне логики, но не на реальной БД.
3. **Права.** `publication.rightsVerified` у DB-строк всегда `false`:
   представление подтверждает допуск к показу, а не права на главы. Права
   остаются отдельной сущностью `comic_rights`.

## Проверка

```powershell
npm run typecheck
npm test
npm run comics:b3e:canary
npm run build
```

Что подтверждено локально: SQL-контракты представлений в PGlite, сборка
Next.js, mocked PostgREST-запросы, mocked контракт чтения. Что **не**
подтверждено: поведение PostgREST, RLS и прав на реальном Supabase — для этого
нужен отдельный прогон на тестовом проекте.

## Откат

`supabase/rollback/20261128_comics_b3e_read_integration_rollback.sql` удаляет
четыре представления и три индекса. Базовые таблицы и данные не затрагиваются.
После отката приложение в DB-режиме получит 503 — это ожидаемо и лучше,
чем тихая подмена JSON-превью.
