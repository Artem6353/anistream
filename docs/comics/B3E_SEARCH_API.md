# B3-E: поиск и фильтрация Comics API

API читает **только** публичный слой БД. Никаких прямых запросов к
`comic_works`, `comic_chapters` или `comic_rights` из приложения нет.

## Эндпоинты

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/comics` | каталог: поиск, фильтры, сортировка, пагинация, фасеты |
| `GET` | `/api/comics/{slug}` | карточка произведения, главы, связи с аниме |

Оба маршрута `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`: публикационный
гейт проверяется на каждый запрос, а не кэшируется процессом.

## Параметры каталога

| Параметр | Допустимые значения | По умолчанию |
| --- | --- | --- |
| `q` | строка до 120 символов | пусто |
| `genre` | значение из фасета `genres` | пусто |
| `kind` | `manga`, `manhwa`, `manhua`, `webtoon`, `comic`, `one_shot`, `unknown` | все |
| `role` | `source`, `comic-by-anime`, `related` | все |
| `sort` | `title`, `year`, `chapters`, `anime` | `title` |
| `page` | целое ≥ 1, максимум 10 000 | `1` |
| `pageSize` | целое 1…96 | `24` |

Неизвестные `kind`/`role`/`sort` игнорируются (не 500). `page`/`pageSize`
клампятся. Значения `q`/`genre` очищаются от управляющих символов и
метасимволов PostgREST (`,()*"{}\\`), поэтому пользовательский ввод не может
сломать `or=(...)` или `cs.{}`.

Поиск идёт по `title_ru` и подтверждённым русским алиасам; `%` и `_`
экранируются как литералы. Жанр — точное совпадение элемента массива `genres`.

### Ответ 200

```json
{
  "source": "db",
  "notice": null,
  "items": [
    {
      "comic": { "id": "comic:db:<uuid>", "slug": "...", "titleRu": "...", "kind": "manga", "dataSource": "db-public", "...": "..." },
      "title": "...",
      "role": "source",
      "roleLabel": "Первоисточник аниме",
      "genres": ["action"],
      "sourceAnimeCount": 2,
      "search": "..."
    }
  ],
  "total": 57,
  "page": 1,
  "pages": 3,
  "pageSize": 24,
  "facets": {
    "genres": [{ "value": "action", "count": 12 }],
    "kinds": [{ "value": "manga", "count": 30 }],
    "roles": [{ "value": "source", "label": "Первоисточник аниме", "count": 20 }]
  },
  "applied": { "q": "", "genre": "", "kind": "", "role": "", "sort": "title" }
}
```

`total` берётся из `Content-Range` (`Prefer: count=exact`), а не из длины
страницы. Если заголовок отсутствует, используется длина страницы — это
безопасный, но менее точный вариант.

Страница за пределами выдачи показывает последнюю страницу (как в legacy),
а не пустой экран.

### Ответ 200 для произведения

```json
{
  "source": "db",
  "notice": null,
  "work": { "id": "comic:db:<uuid>", "slug": "...", "titleRu": "...", "chapters": [] },
  "role": "source",
  "roleLabel": "Первоисточник аниме",
  "sourceAnimeCount": 1,
  "chapters": [
    { "id": "...", "number": 1, "titleRu": "Глава 1", "language": "ru", "pages": 18,
      "readingUrl": "https://...", "sourceName": "Официальный сайт" }
  ],
  "adaptations": [
    { "animeId": 21, "slug": "...", "title": "...", "role": "SOURCE", "primary": true,
      "direction": "comic-is-source", "confidence": "confirmed", "basis": "catalog-manga" }
  ]
}
```

Главы отдаются только публичные (`availability='public'`, ru, `page_count>0`,
подтверждённые права). Связь без строки в `titles` не показывается вовсе.

## Ошибки

| Статус | Тело | Причина |
| --- | --- | --- |
| `503` | `{ "error": "not-configured" }` | БД не настроена, legacy запрещён |
| `503` | `{ "error": "read-failed" }` | PostgREST недоступен/ошибка после ретрая |
| `404` | `{ "error": "not-found" }` | slug не прошёл валидацию или не найден |
| `308` | `{ "error": "moved", "slug": "..." }` | legacy-slug переехал на канонический |
| `500` | `{ "error": "internal" }` | непредвиденная ошибка; детали только в лог сервера |

503 — это осознанный отказ, а не пустой каталог. Клиент обязан показать
«каталог временно недоступен», а не «ничего не найдено».

## Кэширование

- успех: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`;
- ошибки: `Cache-Control: no-store`.

Минутный edge-кэш ограничивает нагрузку на PostgREST, но не даёт показывать
снятое с публикации произведение дольше минуты.

## Ограничения

- Поиск — подстрочный (`ilike`), не полнотекстовый и не морфологический:
  «ван пис» найдёт «Ван-Пис», но опечатки не исправляются.
- Сортировка `anime` использует `source_anime_count`, а не дату выхода аниме.
- `pageSize` ограничен 96; больше не выдаётся даже по запросу.
- `unknown` в `kind` — честное «тип не определён», а не «манга по умолчанию».
- Глобальные фасеты в DB-режиме не меняются от активного поиска (см. B3E_INTEGRATION.md).
