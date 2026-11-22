# B1-C: модель связей «аниме ↔ комикс»

Файлы: `lib/aninova3/comics/model.ts`, `source-graph.ts`, `store.ts`, `source-links.ts`, `publication.ts`.
Это **контракт preview-слоя**, не схема БД: миграции в B1-C не выполнялись.

## 1. Роли связи

| Роль | Значение | Пример |
|---|---|---|
| `SOURCE` | первоисточник аниме | аниме → манга, по которой оно снято |
| `ADAPTATION` | экранизация/адаптация | манга → аниме |
| `SEQUEL` | продолжение | манга-сиквел той же серии |
| `PREQUEL` | предыстория | приквел-комикс |
| `SPIN_OFF` | ответвление | сайд-стори, спин-офф |
| `ALTERNATIVE` | альтернативная версия | другая трактовка |
| `RELATED` | прочая подтверждённая связь | `PARENT`, `SUMMARY`, неизвестный тип |

Правила:

1. **Первоисточник не смешивается с продолжениями.** Только `ADAPTATION` на стороне аниме даёт `SOURCE`; `SEQUEL`, `PREQUEL`, `SIDE_STORY` в блок первоисточника не попадают.
2. Неизвестный `relationType` не отбрасывается и не притворяется первоисточником: `UNKNOWN → RELATED`.
3. Направление инвертируется явно: `SOURCE↔ADAPTATION`, `SEQUEL↔PREQUEL`, `SPIN_OFF/ALTERNATIVE/RELATED` симметричны.
4. `RELATION_PRIORITY` задаёт, какая роль остаётся при дедупликации одного и того же произведения из нескольких рёбер: `SOURCE 7 > ADAPTATION 6 > PREQUEL 5 > SEQUEL 4 > SPIN_OFF 3 > ALTERNATIVE 2 > RELATED 1`.

Код: `invertRelation()`, `relationFromRaw()`, `RELATION_PRIORITY`.

### 1.1. Фактическое распределение (полный снимок 2026-11-22)

| Сырой `relationType` | Рёбер | Роль в модели |
|---|---|---|
| `ADAPTATION` | 3711 | `SOURCE` |
| `ALTERNATIVE` | 1271 | `ALTERNATIVE` |
| `CHARACTER` | 247 | `RELATED` |
| `SPIN_OFF` | 190 | `SPIN_OFF` |
| `SIDE_STORY` | 110 | `SPIN_OFF` |
| `OTHER` | 106 | `RELATED` |
| `PREQUEL` | 54 | `PREQUEL` |
| `SEQUEL` | 36 | `SEQUEL` |
| `PARENT` | 23 | `RELATED` |

Итог по ролям: `SOURCE 3711`, `ALTERNATIVE 1271`, `SPIN_OFF 300`, `RELATED 376`, `PREQUEL 54`,
`SEQUEL 36`. 1285 аниме имеют только непервоисточниковую связь — для них секция называется
«Связанные комиксы», а не «Первоисточник».

### 1.2. Несколько первоисточников у одного аниме

146 аниме имеют больше одного `SOURCE`-ребра (максимум — 10). Показываются **все** подтверждённые
произведения, но `is-primary` ровно у одного, и выбирается он не по порядку в ответе API:

1. сериализованное произведение важнее ваншота (`sourceWeight`);
2. при равенстве — больше известных глав;
3. при равенстве — меньше AniList id.

Так One Piece получает основной первоисточник — мангу, а не прототип-ваншот «Romance Dawn».

> Числа этого раздела — состояние B1-C. После B1-D.1: `SOURCE 3506`, `ADAPTATION 205`
> (комиксы по аниме), многоисточниковых аниме 115, и роль `SOURCE` заявляется только
> при известном направлении (§2.1).

## 2. Уровни проверки данных

`ComicVerification = 'UNVERIFIED' | 'CANDIDATE' | 'EDITORIALLY_VERIFIED'` — отдельная от прав ось:

| Уровень | Источник | Влияние на UI |
|---|---|---|
| `EDITORIALLY_VERIFIED` | `source-data.ts` (`russianTitleVerified: true`) | русское название + проверенные метаданные |
| `SOURCE_VERIFIED` (B1-E) | `metadata-verified.json`: сверка AniList → MAL → Shikimori по id | русское название, карточка в каталоге; прав и глав не даёт |
| `PENDING_REVIEW` | дубликат названия / спорный русский текст | нейтральный текст, записи нет в каталоге |
| `CANDIDATE` | `metadata-candidates.json` (Shikimori по MAL id) | нейтральный текст; кандидат не выводится |
| `NAME_MISMATCH` / `NO_RU_TITLE` / `NOT_FOUND` | источник не подтвердил название | нейтральный текст |
| `UNVERIFIED` | нет данных | нейтральный текст |

Слаг произведения строится из русского названия только при `SOURCE_VERIFIED`/`EDITORIALLY_VERIFIED`;
иначе — нейтральный `comic-<anilistId>`, чтобы адрес не раскрывал иностранное название.

Правило: связь с аниме может быть подтверждена (id из графа), а русское название — нет.
Это два разных факта, и UI говорит о них по-разному.

### 2.1. Уровни достоверности направления связи (B1-D.1)

AniList ставит `ADAPTATION` в обе стороны, поэтому «кто оригинал» — отдельное утверждение
со своим уровнем (`DirectionConfidence`):

| Уровень | Основание (`DirectionBasis`) | Подпись в UI |
|---|---|---|
| `confirmed` | `catalog-manga`, `catalog-original` — первоисточник аниме известен | «Основной первоисточник», «Комикс по аниме», «Оригинальный сериал» |
| `inferred` | `dates` — только годы начала (и `catalog-manga` без года комикса) | «Вероятный первоисточник», «Вероятно, комикс по аниме» |
| `unknown` | `none`, `catalog-conflict`, `catalog-other-medium` | «Связанное произведение» |

Год выпуска сам по себе не доказывает направление и не даёт «основного первоисточника».
Отсутствие года не считается доводом ни в одну сторону. `SEQUEL`, `PREQUEL`, `SPIN_OFF`,
`ALTERNATIVE`, `RELATED` этой логикой не пересчитываются.

## 3. Идентификаторы

Приоритет сопоставления — только точный id:

1. внутренний `comic:anilist:<anilistId>` (стабилен, не зависит от slug и маршрута);
2. AniList id произведения;
3. MAL id;
4. Shikimori id (поле зарезервировано, в B1-C не используется для связи).

Запрещено:

- создавать публичную связь по совпадению названия;
- путать `Title.source = MANGA` (тип первоисточника) с конкретной мангой;
- связывать мангу и аниме с одинаковым названием без id;
- сливать два произведения с одинаковым внешним id в одну карточку.

`slug` — производное представление для URL: транслит → `naruto`, `gorod-stekla`; коллизии разрешаются суффиксом `-<anilistId>`; порядок сборки детерминирован (сорт по AniList id), поэтому slug одинаков в любом процессе и тесте.

## 4. Структуры данных

`ComicWork` (публичная карточка):

```ts
{
  id: 'comic:anilist:30011',
  slug: 'naruto',
  titleRu: 'Наруто',              // кандидат; публично выводится только при russianTitleVerified
  titleOriginal: 'NARUTO -ナルト-',
  kind: 'manga',                  // manga | manhwa | manhua | webtoon | comic
  authors: ['Масаси Кисимото'],   // при authorsVerified
  authorsVerified: true,
  year: 1999,
  status: 'completed',
  cover: '…', descriptionRu: '…',
  chapters: [],                   // реальные доступные главы (язык + страницы)
  totalChaptersKnown: 700,
  externalIds: { anilist: 30011, mal: 11, internal: 'comic:anilist:30011' },
  publication: {
    status: 'PENDING_VERIFICATION',
    russianTitleVerified: true,
    russianMetadataVerified: true,
    rightsVerified: false
  },
  provenance: { source: 'editorial', verification: 'editorial' }
}
```

`ComicSourceEvidence` (ребро графа, направление всегда «аниме → комикс»):

```ts
{ animeAniListId: 20, comicAniListId: 30011, comicInternalId: 'comic:anilist:30011',
  role: 'SOURCE', evidence: 'anilist-relation', rawRelation: 'ADAPTATION',
  observedAt: '2026-11-20', note: '…' }
```

`LinkedComic` / `LinkedAnime` добавляют `primary` (основной первоисточник/адаптация) и `evidence`.

## 5. Направления навигации

**Аниме → Первоисточник → Адаптации.**
`resolveAnimeSources(animeAniListId)` берёт рёбра из `graph.byAnime`, разрешает комикс по id, дедуплицирует по `comic.id`, сортирует (SOURCE первым), помечает ровно один `primary`.

**Манга → Адаптации → Связанные.**
`resolveComicAdaptations(comic, { titles })` берёт рёбра из графа по `comicInternalId`/`comicAniListId`/`comicMalId`, находит аниме через `TitleLookup`, инвертирует роль, помечает ровно один `primary`.

Инварианты (покрыты тестами):

- одна карточка = один `comic.id`, дублей нет;
- `primary` не больше одного на страницу;
- скрытое (`hidden`) аниме в адаптации не попадает;
- нет lookup каталога — нет выдуманных карточек (пустой список);
- неоднозначный внешний id → связь не создаётся, ребро уходит в `skipped`.

## 6. Несколько первоисточников

- показываются все подтверждённые произведения;
- основной (`primary`) визуально выделен и подписан «Основной первоисточник», остальные — по роли («Также первоисточник», «Продолжение», «Ответвление»);
- разные серии не объединяются в одну карточку;
- тома/главы одного произведения не превращаются в отдельные первоисточники: доменная модель — одно произведение = один `ComicWork`.

## 7. Публикационные состояния (связь с моделью)

`PublicationStatus = DRAFT | PENDING_VERIFICATION | APPROVED | REJECTED | EXPIRED` живёт в `ComicPublication` вместе с четырьмя флагами проверок. Смысл — в `ANINOVA_3_B1C_PUBLICATION_RULES.md`.

## 8. Backend-контракт на будущее (не применён)

Если модель пойдёт в production, минимальный набор таблиц (только описание, миграций нет):

```
comic_works
  id                uuid pk
  internal_id       text unique        -- comic:anilist:<id>
  slug              text unique
  anilist_id        int  unique
  mal_id            int  null
  shikimori_id      int  null
  kind              text               -- manga|manhwa|manhua|webtoon|comic
  title_ru          text null
  title_original    text not null
  authors           jsonb
  year              int null
  status            text
  cover_url         text null
  total_chapters    int null
  created_at/updated_at

comic_sources                -- рёбра relation, направление «аниме → комикс»
  anime_anilist_id  int
  comic_id          uuid fk comic_works
  role              text               -- SOURCE|SEQUEL|PREQUEL|SPIN_OFF|ALTERNATIVE|RELATED
  raw_relation      text               -- ADAPTATION|SIDE_STORY|…
  evidence          text               -- anilist-relation|manual
  observed_at       date
  primary key (anime_anilist_id, comic_id, role)

comic_chapters
  id            uuid pk
  comic_id      uuid fk
  number        numeric
  title_ru      text
  language      text                 -- только 'ru' допускается в публичную читалку
  pages         int
  page_images   jsonb                -- реальные страницы, не генерируются
  published_at  date

comic_publication               -- отдельно от прав: аудит и срок действия
  comic_id         uuid pk fk
  status           text
  title_ru_verified bool
  metadata_verified bool
  rights_verified   bool
  rights_valid_to   date null
  verified_by       text
  verified_at       date
```

Требования будущей реализации:

- связь пишется только при наличии `anime_anilist_id` + `comic_id` (никаких name-based вставок);
- уникальность `(comic_id)` в `comic_works` по внешним id — источник защиты от дублей;
- `comic_publication` не хранит внутренних документов в публично читаемых полях;
- публичная выборка — только `status='APPROVED'` + все флаги + есть RU-глава с `page_images`;
- кэш (Redis/БД) вводится отдельным этапом, с инвалидацией по `comic_publication.updated_at`.
