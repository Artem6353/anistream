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

## 2. Идентификаторы

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

## 3. Структуры данных

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

## 4. Направления навигации

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

## 5. Несколько первоисточников

- показываются все подтверждённые произведения;
- основной (`primary`) визуально выделен и подписан «Основной первоисточник», остальные — по роли («Также первоисточник», «Продолжение», «Ответвление»);
- разные серии не объединяются в одну карточку;
- тома/главы одного произведения не превращаются в отдельные первоисточники: доменная модель — одно произведение = один `ComicWork`.

## 6. Публикационные состояния (связь с моделью)

`PublicationStatus = DRAFT | PENDING_VERIFICATION | APPROVED | REJECTED | EXPIRED` живёт в `ComicPublication` вместе с четырьмя флагами проверок. Смысл — в `ANINOVA_3_B1C_PUBLICATION_RULES.md`.

## 7. Backend-контракт на будущее (не применён)

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
