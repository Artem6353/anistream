# AniNova 3.0 — Backup, restore и rollback plan (B0)

**Дата:** 2026-11-20  
**Связанные документы:** `docs/ANINOVA_3_AUDIT.md`, `docs/ANINOVA_3_ARCHITECTURE.md`, `docs/ANINOVA_3_RISK_REGISTER.md`  
**Правило:** перед любой миграцией/массовым импортом есть backup, проверенный restore path и записанный rollback. Секреты в backup-документацию и артефакты не попадают.

---

## 1. Что уже сохранено в B0

| Объект | Где | Размер/хэш | Как восстановить |
|---|---|---|---|
| `lib/data/titles.json` | `backups/lib_data_titles.json.2026-11-19.bak` | 28 МБ | `cp backups/lib_data_titles.json.2026-11-19.bak lib/data/titles.json` |
| `lib/data/manual-sources.json` | `backups/lib_data_manual-sources.json.2026-11-19.bak` | 4 байта (`{}`) | `cp ... lib/data/manual-sources.json` |
| WIP `layout.tsx` + `theme-2026.css` | `refs/backup/b0-wip-full-20261119` → `cb2bd7b`; `.cache/b0-wip-20261119/` | SHA256 в `SHA256SUMS` | `git checkout refs/backup/b0-wip-full-20261119 -- app/layout.tsx app/theme-2026.css` |
| WIP (только tracked diff) | `refs/backup/b0-wip-20261119` → `b539528` | — | `git stash apply b539528` |
| Метаданные БД (26 таблиц, колонки, counts) | `.cache/b0-metadata-snapshot.json` | 5,1 КБ | справочно; не является дампом данных |
| Production health snapshot | `.cache/b0-health-production.json` | 1,8 КБ | справочно |
| DB size report | `.cache/db-size-report.json` | — | справочно |
| Git-история | `origin/main` + weekly `backups` branch | — | `git fetch origin backups` |

> `backups/` и `.cache/` — gitignored. Это локальные артефакты B0; для долгосрочного хранения их нужно скопировать в защищённое хранилище (S3/R2/зашифрованный диск) по решению владельца.

### 1.1. Проверка целостности

```bash
# SHA256SUMS содержит имена app/*, но копии лежат в .cache/b0-wip-20261119/;
# сверяем хэши самих копий (ожидаемые значения — в SHA256SUMS).
sha256sum .cache/b0-wip-20261119/layout.tsx .cache/b0-wip-20261119/theme-2026.css
node -e 'const fs=require("fs"); const a=JSON.parse(fs.readFileSync("./backups/lib_data_titles.json.2026-11-19.bak","utf8")); if(!Array.isArray(a)||a.length!==8033) process.exit(1); console.log("titles backup OK:",a.length)'
node -e 'const s=require("./.cache/b0-metadata-snapshot.json"); console.log("tables:",Object.keys(s.tables).length)'
```

### 1.2. Проверка B0.5 (2026-11-20)

| Проверка | Результат | Evidence |
|---|---|---|
| `titles.json` backup читается как JSON-массив | `OK`, 8033 | `JSON.parse(fs.readFileSync(...))`; прежняя команда с `require()` на `.bak` давала ложный `not-array`, т.к. Node не парсит `.bak` как JSON |
| WIP SHA256 | `OK` (оба файла) | `26026d48… layout.tsx`, `3fa79462… theme-2026.css` |
| Метаданные БД | `OK`, 26 таблиц | `.cache/b0-metadata-snapshot.json` |
| Полный `pg_dump` / PITR | `BLOCKED` | нет connection string/DB password, нет Management API token; `pg_dump`/`psql`/`supabase` CLI не установлены |
| Restore drill | `NOT DONE` | нельзя создать тестовую БД/восстановить дамп без доступа; partial table snapshot — не полный backup |
| Weekly backup workflow | `PARTIAL` | `.github/workflows/backup-weekly.yml` создаёт ветку `backups` только для tracked-файлов; БД/Storage не покрывает |

**Вывод B0.5:** локальные file/WIP-бэкапы проверены; полноценный DB+Storage backup и restore drill остаются `BLOCKED` до получения owner-доступа. Это не позволяет считать backup-часть B0 закрытой.

Ожидаемо: 8033 тайтла, 26 таблиц.

---

## 2. Что НЕ сохранено (и почему)

| Объект | Статус | Причина | Как закрыть |
|---|---|---|---|
| Полный дамп Postgres | `NOT DONE` | нет connection string/DB password; Management API token отсутствует | Supabase Dashboard → Database → Backups (PITR) или `pg_dump` (см. §3) |
| `auth.users` | `NOT DONE` | не входит в `public` REST; нужен SQL/Management API | Supabase Auth export/Backups |
| Storage objects (`avatars`, `banners`) | `NOT DONE` | нет Storage API/Management token | Supabase Storage export/S3 sync |
| Секреты/env | `НЕ ДОЛЖНЫ` сохраняться | безопасность | хранятся только в Vercel/Supabase/GitHub Secrets |
| `.cache/providers-resolve-cache.json` | отсутствует | кэш перенесён в Supabase/Upstash | источник правды — `episode_sources`/`episode_source_urls` |
| Guest localStorage | не централизован | живёт в браузере пользователя | merge/export в B4 (см. §6) |

---

## 3. Backup БД: рекомендуемая процедура

### 3.1. Supabase Dashboard (предпочтительно)

1. Supabase Dashboard → Project → Database → Backups.
2. Проверить наличие daily backup/PITR (зависит от тарифа).
3. Сделать manual backup перед миграцией; записать timestamp и ID.
4. Проверить restore на отдельном staging-проекте, не на production.

### 3.2. `pg_dump` (если есть прямой доступ)

```bash
# НЕ вставлять пароль в командную строку/историю. Использовать .pgpass или env.
export PGHOST=db.<project-ref>.supabase.co
export PGPORT=5432
export PGDATABASE=postgres
export PGUSER=postgres
# PGPASSWORD — только через защищённый ввод/.pgpass, не в git/лог

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="aninova-$(date -u +%Y%m%dT%H%MZ).dump" \
  "$PGDATABASE"

# Проверка читаемости дампа
pg_restore --list "aninova-<timestamp>.dump" | head -40
```

Для схемы отдельно:

```bash
pg_dump --schema-only --no-owner --file=aninova-schema-$(date -u +%Y%m%d).sql
```

### 3.3. Восстановление

```bash
# НИКОГДА не восстанавливать поверх production без явного разрешения владельца.
# 1) создать отдельную БД/проект
# 2) restore
pg_restore --no-owner --no-privileges --dbname="$TARGET_DB" aninova-<timestamp>.dump
# 3) проверить counts/RLS/ключевые сценарии
```

Обязательные post-restore проверки:

```sql
select count(*) from public.titles;                 -- ожидаемо 8033 (на 2026-11-20)
select count(*) from public.episode_source_urls;    -- ожидаемо 350074
select count(*) from public.episode_sources;        -- ожидаемо 30406
select count(*) from public.profiles;               -- ожидаемо 2
select tablename, policyname, cmd, roles
  from pg_policies order by 1,2;
select * from storage.buckets;
```

Затем smoke/RLS/player на staging.

---

## 4. Rollback миграций

### 4.1. Правила

1. **Additive first:** сначала добавить колонку/таблицу/индекс, потом код; удалять/переименовывать — отдельным PR после доказанной миграции.
2. **Никаких destructive drop** в том же PR, где добавлена замена.
3. Перед миграцией: backup + записанный rollback SQL + проверка на local/staging.
4. `ON DELETE CASCADE` — только осознанно; массовое каскадное удаление без backup запрещено.
5. Миграция идемпотентна (`if not exists`, `drop policy if exists`, `create or replace` где уместно).
6. Секреты/токены не пишутся в migration-файлы и логи.

### 4.2. Шаблон rollback-плана для PR

```text
Migration: <file>
Forward:   <что добавляется>
Backup:    <dashboard backup id / pg_dump file / timestamp>
Rollback:  <точный SQL или «restore from backup»>
Data risk: <какие строки могут быть затронуты>
Tested on: <local Supabase / staging>
Verification: <counts, RLS, smoke, player>
Owner approval: <кто и когда разрешил production>
```

### 4.3. Пример rollback для additive-миграции

```sql
-- Только если изменение действительно нужно откатить и нет зависимых данных.
drop index if exists public.<new_index>;
alter table public.<table> drop column if exists <new_column>;
-- Политики: вернуть предыдущее определение, а не просто удалить
```

Если есть данные в новой колонке/таблице — rollback только через restore/ручной перенос; `drop` без backup запрещён.

---

## 5. Rollback каталога (`titles.json`)

Каталог — generated snapshot (целевое) / текущий file-source (переходное). Откат:

```bash
# 1) локальный backup B0
cp backups/lib_data_titles.json.2026-11-19.bak lib/data/titles.json

# 2) или предыдущий коммит
git log --oneline -- lib/data/titles.json | head
git checkout <good-commit> -- lib/data/titles.json

# 3) или weekly backups branch (после fetch)
git fetch origin backups
git show origin/backups:titles-YYYY-MM-DD.json > lib/data/titles.json

# 4) проверки
node scripts/validate-catalog.mjs
node scripts/check-catalog-quality.mjs --gate
node scripts/check-readme.mjs
```

После отката: пересчитать `public.titles` (если БД — источник), проверить health, sitemap, hero, search.

---

## 6. Guest data: backup/restore/merge (B4)

### 6.1. Ключи, которые нужно сохранить

`lib/library.ts`:

```text
anistream:bookmarks
anistream:history
anistream:settings
anistream:lists
```

Плюс per-account варианты с суффиксом `:<uid первые 13 символов>`.

Геймификация/сессия (не персональные списки, но связаны):

```text
anistream:streak
anistream:achievements
anistream:ach_counters
anistream:ach_genres
anistream:ach_extra
anistream:ach_watched
```

Legacy auth (должны быть удалены, не backup-иться как секрет):

```text
anistream:supa_token
anistream:supa_refresh
anistream:supa_expires
anistream:supa_verifier
```

### 6.2. Экспорт перед merge

- UI показывает пользователю, что будет импортировано (bookmarks/history/lists/settings).
- Экспорт в JSON без токенов: `{version, exportedAt, bookmarks, history, lists, settings}`.
- Сохранить копию в localStorage под `anistream:merge-backup:<timestamp>` на разумный период (например, 30 дней) или дать скачать файл.
- Merge идемпотентен: повторный запуск не создаёт дубликаты.
- Конфликты: сравнение `updatedAt`; правило документировано; «более свежее» побеждает, но пользователь видит итог.
- После успешного merge — запись `anistream:merge-completed:<uid>`; повторно не предлагать.
- Смена аккаунта: in-memory cache очищается; данные предыдущего uid не показываются; гостевые ключи не удаляются без согласия.

### 6.3. Rollback merge

- Восстановить `anistream:*` из `merge-backup`.
- Удалить серверные строки, созданные merge, по `user_id` + `updated_at >= mergeStartedAt` (только с подтверждением пользователя).
- Проверить, что данные другого аккаунта не затронуты.

---

## 7. Comics/RU-only: что бэкапить и проверять

Когда B3 создаст Comics-таблицы, backup должен включать:

- `comic_works` (`title_ru`, `description_ru`, `original_language`, `ru_ready`, `translation_status`);
- `comic_chapters` (`language`, `translation_status`, `rights_status`);
- `comic_reading_sources` (`language`, `access_mode`, `status`);
- `comic_rights` (`language`, `territories`, `valid_until`, `approved_*`);
- `comic_chapter_pages` (только при `rights_id`).

Post-restore проверки:

```sql
-- Не-RU главы не должны быть доступны reader-выборке
select count(*) from public.comic_chapters
 where language <> 'ru' and rights_status = 'approved';  -- ожидаемо 0 в reader-выборке

-- Произведения без русского названия
select count(*) from public.comic_works where title_ru is null or btrim(title_ru) = '';

-- Rights, у которых истёк срок
select count(*) from public.comic_rights where valid_until < now();
```

Reader/API-тест: не-RU глава возвращает «недоступно», не 200 с страницами. Ошибка языка не должна раскрывать приватные URL.

---

## 8. Disaster recovery: порядок действий

1. **Остановить автоматизацию**, которая пишет в пострадавшую БД (disable workflows вручную владельцем).
2. **Зафиксировать инцидент:** timestamp, что сломано, последние успешные sync runs, backup ID.
3. **Не перезаписывать production** до выбора restore point.
4. Восстановить БД/файлы в отдельный target; проверить counts/RLS/ключевые сценарии.
5. Переключить traffic/переменные только с разрешения владельца.
6. Проверить: health (`source`, counts), каталог, поиск, плеер, профиль, RLS, sitemap.
7. Записать postmortem: причина, impact, что изменено, какой тест предотвратит повтор.

---

## 9. Регулярные проверки

| Проверка | Частота | Владелец |
|---|---|---|
| `db-size` 80/95 % | daily (workflow) | агент |
| Weekly `backups` branch | weekly | workflow |
| Restore drill на staging | перед B3/B4/B7 и после крупных миграций | агент + владелец |
| RLS-оракул | weekly (после фикса R-10) | агент |
| Проверка backup checksum | при каждом restore drill | агент |
| Аудит секретов в логах/артефактах | перед релизом | агент |

---

## 10. Ограничения B0

- Полный DB dump не сделан: нет прямого SQL-доступа/Management API. Это `BLOCKED`, а не «бэкап есть».
- `backups/` и `.cache/` локальны и gitignored; долгосрочное хранение не настроено.
- Storage objects и `auth.users` не выгружены.
- Restore drill не выполнялся (нет staging-копии и доступа).
- До закрытия этих пунктов B3 (Comics schema) и B4 (user data) не должны менять production schema/data.

---

## 11. Что нужно от владельца

1. Подтвердить наличие/отсутствие PITR и daily backups в Supabase; дать backup ID или сделать manual backup.
2. Предоставить безопасный способ запуска `pg_dump` (connection string через секрет, не в чат) или выгрузить дамп самостоятельно.
3. Разрешить создание staging-проекта Supabase для restore drill.
4. Подтвердить, что `backups/` можно хранить в защищённом S3/R2 (с шифрованием и ограниченным доступом).
5. Подтвердить прочтение RU-only требования для comics (ADR-012) до B3.
