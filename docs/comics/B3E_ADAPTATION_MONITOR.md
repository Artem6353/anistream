# B3-E: мониторинг официальных анонсов аниме-адаптаций

Монитор проверяет **allowlist официальных источников** и складывает
потенциальные анонсы в очередь проверки. Он **не подтверждает адаптацию**,
не создаёт `comic_adaptations`, не меняет каталог и не публикует ничего.

## Что считается анонсом

Только элемент фида, прошедший три фильтра:

1. **Источник** — домен из allowlist (`data/comics/announcement-sources.json`
   и таблица `comic_announcement_sources`); ссылка обязана быть `https` на
   этот домен или его поддомен, без учётных данных и нестандартного порта.
2. **Формулировка** — срабатывание ключевых слов об адаптации (EN/RU/JA).
   Сильный сигнал: `anime adaptation`, `TVアニメ化`, `аниме-адаптация` и т.п.
   Слабый: упоминание `anime` без слов об адаптации/решении.
3. **Слух** — слова `rumour/rumor/слух/未確認` помечают запись как `rumour`
   и снимают `actionable`; такая запись остаётся в очереди, но не выглядит
   подтверждением.

Заголовок и summary очищаются от HTML/CDATA и сущностей. Ключевой файл —
`lib/anilist`-независимый парсер `scripts/lib/comics-announcements.mjs`
(RSS `<item>` и Atom `<entry>`, без внешних зависимостей).

## Модель данных

`supabase/migrations/20261129_comics_b3e_announcement_monitor.sql`:

| Таблица | Назначение |
| --- | --- |
| `comic_announcement_sources` | allowlist: slug, домен, язык, `rss`/`atom`/`manual`, ETag/Last-Modified, статус последней проверки |
| `comic_adaptation_announcements` | найденные элементы: `item_key`, заголовок, URL, дата публикации, ключевые слова, `status`, `content_hash`, ссылки на произведение/аниме |
| `comic_announcement_events` | append-only журнал: `ingested`, `keyword_detected`, `status_changed`, `linked`, `note` |

Ключевые ограничения:

- `status` по умолчанию `pending_review`;
- `confirmed/delayed/cancelled/withdrawn` невозможны без `confirmation_url`
  **и** `confirmed_at`;
- `rejected` требует `reviewed_by` и `reviewed_at`;
- уникальность `(source_id, item_key)` — повторный фид не дублирует запись;
- события нельзя обновить или удалить даже под `service_role`;
- RLS включён, публичные роли не имеют ни `select`, ни `insert`.

## Запуск

### Dry-run (по умолчанию)

```powershell
npm run comics:b3e:monitor -- --out artifacts/comics-announcements
```

Пишет `latest.json`, `<timestamp>.json`, `summary.md` и `state.json` (только
dry-run). Сеть — только чтение фидов; Supabase не нужен. Код выхода `0` при
успехе, `3` — если **все** источники недоступны, `1` — ошибка конфигурации.

### Запись очереди (вручную)

```powershell
$env:COMICS_MONITOR_APPLY = '1'
$env:SUPABASE_URL = 'https://<test-project>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service_role>'
node scripts/comics-b3e-monitor.mjs --apply
```

`--apply` без `COMICS_MONITOR_APPLY=1` завершается ошибкой. Скрипт пишет только
`comic_announcement_sources` (upsert по slug), `comic_adaptation_announcements`
(только `pending_review`) и события `ingested`. Поля подтверждения и
`comic_adaptations` не трогаются.

Флаг `--candidates <file>` принимает массив (или `{items:[...]}`) для ручной
проверки/повторного импорта; ссылки всё равно проверяются по allowlist.

## GitHub Actions

`.github/workflows/comics-announcements.yml` запускается ежедневно и по
`workflow_dispatch`, **без секретов**, только dry-run, и выгружает отчёт
артефактом на 14 дней. Запись в БД в CI намеренно не подключена: подтверждение
анонса — ручное действие редактора.

## Проверка и ограничения

- 5 источников проверены вручную (HTTP 200, валидный RSS) на момент
  реализации: Seven Seas, Kodansha USA, MAPPA, BONES, Shueisha.
- Парсер рассчитан на RSS/Atom; HTML-страницы без фида не поддерживаются.
- Ключевые слова — эвристика, а не понимание текста: возможны ложные
  срабатывания и пропуски, поэтому всё попадает в `pending_review`.
- `published_at` — дата публикации источника, а не дата факта; это разные вещи.
- Агрегатор в allowlist не добавляется: только первичный официальный источник.
- `checkUrl` защищает от open redirect и подмены домена, но не заменяет
  проверку человеком.
- Реальный Supabase/PostgREST не проверялся: canary работает в PGlite,
  unit-тесты — с mocked fetch.
