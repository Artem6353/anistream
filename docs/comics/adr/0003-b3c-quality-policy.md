# ADR-0003: source-quality, name-bucket и adult-gate политика B3-C

- Статус: **Accepted** для B3-C (local/disposable; production не применялся).
- Дата: 2026-11-25.
- Ветка: `data/aninova-3-b3-c-quality-relations-2026-11`.
- База: `d89674fe28dacbdfd090c96189e63b2d36bbc32b`.
- Дополняет ADR-0001/0002, не заменяет их.

## 1. Контекст

B3-B сохранил 4 100 работ, 5 748 anime↔comic edges, 2 265 verified records и
2 170 кандидатов. Проверка выявила четыре класса проблем, которые нельзя
исправлять угадыванием:

1. AniList отдаёт `MANGA`/`ONE_SHOT`, но не различает manga/manhwa/manhua.
   `country_code` и язык не являются доказательством формата.
2. Один и тот же MAL/Shikimori id встречается у разных AniList работ;
   graph и verified metadata иногда дают разные значения.
3. Автор в графе — это имя, а не идентификатор человека. Одинаковое имя у
   двух работ не доказывает, что это один человек.
4. Возрастная классификация отсутствует. Отсутствие adult-флага не является
   доказательством non-adult.

Дополнительно B1D содержит 120 relation hints, которые нужно сохранить как
review evidence, не превращая их в подтверждённые связи.

## 2. Решения

### 2.1. Kind

- Приоритет имеет **verified specific source kind** (`manhwa`, `manhua`,
  `comic`, `webtoon`, `one_shot`).
- AniList `ONE_SHOT` остаётся конкретным `one_shot`.
- AniList `MANGA` без verified specific kind даёт канонический `unknown`.
- `country_code`/язык/название **никогда** не определяют kind.
- Сырой формат сохраняется отдельно в `comic_works.source_kind_raw`.
- Если specific kind конфликтует с raw `ONE_SHOT`, kind выбирается по
  verified source, конфликт сохраняется и попадает в review.

### 2.2. Source observations и конфликты

- `comic_source_observations` хранит значение каждого источника отдельно:
  `source_name`, `external_id`, `join_key`, URL, timestamp, confidence,
  `source_payload_hash`, `value_json`.
- Поля: kind, year, chapters, volumes, MAL/Shikimori id, title_ru/original,
  content_rating, adult_status.
- Конфликт не перезаписывается. Оба значения остаются, помечаются
  `is_conflict` и общим `conflict_group`, создаётся review item с
  `canonical_action: no_winner_no_overwrite`.
- Для year/chapters/volumes/MAL каноническое значение при конфликте — `NULL`.
- `title_ru` сохраняет verified metadata title для отображения, но альтернативы
  остаются в observations/aliases; это не разрешение публиковать.
- Kind следует правилу 2.1; другие source values не удаляются.

### 2.3. MAL identity

- Graph MAL и metadata MAL равны → можно назначить с provenance.
- Присутствует только один источник → можно назначить с provenance.
- Разные значения → **ни один** MAL id не назначается; review содержит оба
  id, оба source name и AniList work id.
- Один MAL id у разных AniList работ → работы не сливаются; external id
  пропускается (SKIP), группа сохраняется в review.
- Shikimori external id хранится отдельно от AniList `join_key`; AniList id
  никогда не подписывается как Shikimori id.

### 2.4. Авторы

- Имя — это source observation, а не личность.
- Для name-only автора: `source_person_id=NULL`,
  `name_status='unverified'`, `identity_status='unidentified_name_bucket'`,
  `is_public=false`.
- Bucket key включает work id + нормализованное имя; одинаковые имена в разных
  работах — разные buckets.
- Слияние возможно только по надёжному source person id или ручному
  подтверждению; в B3-C таких данных 0.

### 2.5. Adult-статус

- Канонический статус: `unknown | verified_non_adult | adult`.
- `unknown` — дефолт; отсутствие флага не доказывает non-adult.
- `verified_non_adult`/`adult` требуют source + checked_at (SQL CHECK).
- `is_adult` сохраняется; добавлен CHECK согласованности:
  `verified_non_adult → is_adult=false`, `adult → is_adult=true`.
- Публичные views требуют `verified_non_adult`; `unknown` и `adult` не
  публикуются.
- Никаких эвристик по названию, стране или жанру.

### 2.6. Отношения и B1D

- `raw_relation_type` сохраняется; `normalized_relation_type` — только
  точное совпадение с 9 поддерживаемыми типами, иначе `unknown`.
- `ADAPTATION` не объявляется источником автоматически: direction unknown.
- `CHARACTER`, `PARENT`, `SIDE_STORY`, `SPIN_OFF` и т. п. не превращаются в
  `RELATED`.
- Anime↔Comics связи остаются в `comic_adaptations`; `comic_relations` —
  только для Comics↔Comics.
- B1D hints переносятся как review evidence: original payload, category,
  IDs, per-edge match, adaptation id, raw type, evidence URL. Ни одна связь не
  становится confirmed/primary/public.

## 3. Последствия

- 3 980 работ имеют `kind='unknown'`; это честное состояние, а не ошибка
  импорта.
- 617 работ имеют source conflicts; 690 conflict review items.
- 9 007 name buckets при 5 115 уникальных именах; identified authors — 0.
- Все 4 100 работ имеют `content_rating_status='unknown'`; публичных views — 0.
- 5 748 adaptations сохранены как recorded, direction unknown, 0 primary/public.
- 120 B1D hints сохранены, 120 matched к graph edges, 0 превращены в новые
  связи.

## 4. Альтернативы

| Вариант | Почему отклонён |
|---|---|
| Выводить manhwa/manhua из country KR/CN | страна не доказывает формат; ложная точность |
| Выбирать победителя по фиксированному priority без ADR | скрывает альтернативы и нарушает provenance |
| Сливать авторов по имени | разные люди с одинаковым именем; ложная identity |
| Считать отсутствие adult-флага non-adult | недопустимый вывод из отсутствия данных |
| Превращать все `ADAPTATION` в source material | направление связи не доказано |
| Автоматически подтверждать B1D hints | B1D — очередь на проверку, не решение |

## 5. Проверка

- `tests/aninova3-comics-b3c.test.ts` — 10 unit tests.
- `supabase/tests/b3c_comics_quality.sql` — SQL-контракт, включая три adult
  статуса и public view.
- `scripts/comics-b3c-canary.mjs` — PGlite migrations/rollback/reapply, canary,
  idempotency, adult gate.
- Supabase/PostgREST/live JWT/RLS — **NOT TESTED**.
