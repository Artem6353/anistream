# ТЗ · Задача №1 — Автообновление каталога (+350–400 тайтлов через `sync-catalog.yml`)

Дата: 2026-09-25 · Репозиторий: `Artem6353/anistream` · База: коммит `c17898d` (AniNova 4.1)

---

## 0. Результаты обследования (почему «просто нажать Run workflow» недостаточно)

Исходное состояние каталога (`lib/data/titles.json`):

| Показатель | Значение |
| --- | --- |
| Тайтлов | **5002** (4843 finished / 42 ongoing / 117 upcoming) |
| Shikimori-обогащение | 100% (4998 с данными, все `shikimoriChecked`) |
| Даты серий (finished) | 99.7% (4829 из 4843) |
| 18+ тайтлов | 0 |

Замеры AniList API (живые зонды, 2026-09-25):

1. **Жёсткий потолок API**: любой запрос отдаёт максимум **5000 записей** —
   `Page depth exceeds maximum allowed for API requests (5000 entries)` (HTTP 400 на page 101×50 и 201×25).
2. **Окно популярности каталогом уже закрыто**: страницы 1 / 50 / 100 `POPULARITY_DESC` дают
   0 / 0 / **1** новый тайтл. Текущий воркфлоу (`expand-catalog.mjs 12`) из окна популярности не добавит почти ничего.
3. **Где лежат новые тайтлы** (доля новых на страницу, 50 шт/стр):
   | Окно | Страницы | Новых | Качество (favourites) |
   | --- | --- | --- | --- |
   | `FAVOURITES_DESC` | 60–70 | 0→9/50 | все ≥60 |
   | `FAVOURITES_DESC` | 80 / 90 / 95 | 15 / 22 / 25 из 50 | все ≥60, медиана ~87–119 |
   | `format:MOVIE, POPULARITY` | 12 / 15 / 17 | 0 / 50 / 50 | ≥30 у ~80% |
   | `format:ONA, POPULARITY` | 8 / 11 | 10 / 50 | ≥30 у ~70% |
   | `format:OVA, POPULARITY` | 10 / 13 | 16 / 50 | ≥30 у ~70% |
   | `status:RELEASING` (онгоинги) | 1–4 | ~134 новых всего | низкий (свежие эфиры) |
   | `status:NOT_YET_RELEASED` (анонсы) | 1–3 | ~150 новых всего | низкий (ещё не вышли) |
4. **Воркфлоу ни разу не запускался**: в истории 0 бот-коммитов `chore(catalog): auto-sync`.
   Первый dispatch заодно доберёт всё накопившееся по онгоингам/анонсам.

**Вывод**: чтобы разовый прогон дал ровно 350–400 тайтлов приемлемого качества, нужны
(a) глубокие проходы по альтернативным окнам, (b) жёсткая квота `MAX_NEW`,
(c) качество-гейты, (d) ручка в `workflow_dispatch`. Всё это — в патче ниже.
Cron-поведение (каждые 6 ч) не меняется: глубокие проходы включаются только при ручном запуске.

---

## 1. Роли

| Кто | Что делает |
| --- | --- |
| **Я (Qwen)** | Код: патчи `scripts/expand-catalog.mjs` + `.github/workflows/sync-catalog.yml`, этот ТЗ, локальные тесты A/B/self-heal (протокол в §8) |
| **Вы — терминал** | Перенести патчи в свой клон, `npm run backup`, commit + push (§2, §4) |
| **Вы — GitHub** | Проверить настройки Actions/branch protection, нажать Run workflow с `deep=true, max_new=400`, дождаться бот-коммита (§3) |

---

## 2. Код от меня — что изменено

### 2.1 `scripts/expand-catalog.mjs` (полный файл — в репозитории/воркспейсе)

1. **Глубокие проходы** (только `--deep` / `DEEP=1|true`, т.е. только ручной dispatch):
   - `favourites·deep`: `sort:FAVOURITES_DESC`, стр. **60–100**, гейт `favourites ≥ 60` — основной качественный пул (~550–600 новых);
   - `фильмы·deep`: `format:MOVIE,sort:POPULARITY_DESC`, стр. **13–22**, гейт `fav ≥ 30` (резерв ~400);
   - `ONA·deep`: стр. **9–14**, гейт `fav ≥ 30` (резерв ~250);
   - `OVA·deep`: стр. **11–16**, гейт `fav ≥ 30` (резерв ~250).
   Порядок проходов = приоритет качества: популярные → онгоинги → анонсы → favourites → фильмы → ONA → OVA.
2. **Квота `MAX_NEW`** (env; по умолчанию 400 при `--deep`, 0 = без лимита):
   - fetch-сторона: страницы/проходы перестают добываться, как только набрано достаточно новых-кандидатов (экономия запросов);
   - add-сторона: жёсткое отсечение — добавляется **ровно** `MAX_NEW` тайтлов, остаток пула остаётся на следующий запуск.
3. **`isAdult:false` во всех запросах** — каталог сохраняет политику «0 тайтлов 18+».
4. **Защита слагов**: существующие тайтлы **никогда** не переименовываются (их URL и ключи кэша провайдеров остаются живы); суффикс `-<anilistId>` при коллизии получает только новый тайтл. (В старом скрипте пересорт по favourites мог теоретически переименовать существующий слаг между прогонами.)
5. **Self-heal**: последующие прогоны добирают отсутствующие `poster`/`banner`/`description` у существующих тайтлов (у части свежих онгоингов/анонсов AniList заполняет их позже).
6. Поддержка `from` (стартовая страница прохода) — не жжём запросы на заведомо покрытых страницах.

Логика записи, дедупликация, `--report`, формат тайтла — без изменений (идемпотентно).

### 2.2 `.github/workflows/sync-catalog.yml`

```yaml
name: Sync catalog (auto-add new anime)
on:
  schedule:
    - cron: "0 */6 * * *"   # каждые 6 часов (ТЗ 3.4): базовые проходы (популярные/онгоинги/анонсы), без deep
  workflow_dispatch:        # ручной запуск: разовое глубокое расширение каталога (+350–400 тайтлов)
    inputs:
      deep:
        description: "Глубокое расширение: хвосты favourites/фильмы/ONA/OVA (разовая порция новых тайтлов)"
        type: boolean
        default: true
      max_new:
        description: "Квота новых тайтлов MAX_NEW (0 = без лимита)"
        type: string
        default: "400"
permissions:
  contents: write
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci --omit=dev || true
      - name: expand catalog (new titles + franchise links + characters)
        env:
          # На scheduled-запусках inputs пустые: DEEP='' (глубокие проходы выключены),
          # MAX_NEW='' → 0 (без квоты) — поведение cron не меняется.
          DEEP: ${{ inputs.deep }}
          MAX_NEW: ${{ inputs.max_new }}
        run: node scripts/expand-catalog.mjs 12 --report
      # шаги enrich / episode-dates / commit — без изменений
```

Шаги `enrich-shikimori-resumable.mjs` (RU-названия/описания/кадры — обработает ровно 400 новых,
т.к. они без `shikimoriChecked`) и `fetch-episode-dates.mjs` (даты серий новых finished)
уже стоят в воркфлоу и трогать их не нужно. Коммит-шаг тот же: бот пушит
`lib/data/titles.json` + `.cache/episode-dates-report.json` в `main`.

---

## 3. ШАГ 1 — Терминал (ваша машина, ~2 мин)

```bash
cd anistream                      # ваш локальный клон репозитория
git pull                          # убедиться, что вы на c17898d (main)

# Перенести два пропатченных файла из воркспейса Qwen (скачать или скопировать содержимое):
#   scripts/expand-catalog.mjs
#   .github/workflows/sync-catalog.yml
# (опционально) docs/TASK-1-SYNC-CATALOG.md — этот документ

git status                        # изменены только они
npm run backup                    # страховка: backups/lib_data_titles.json.<дата>.bak и кэш

# Быстрая sanity-проверка скрипта (не обязательна, сеть не трогает при PAGES=0 и выключенном DEEP):
node -e "console.log(JSON.parse(require('fs').readFileSync('lib/data/titles.json','utf8')).length)"
# → 5002

git add scripts/expand-catalog.mjs .github/workflows/sync-catalog.yml docs/TASK-1-SYNC-CATALOG.md
git commit -m "feat(catalog): deep-проходы расширения — квота MAX_NEW, isAdult:false, защита слагов, self-heal"
git push
```

## 4. ШАГ 2 — GitHub (~10 мин, из них вашего участия — 1 мин)

1. **Settings → Actions → General** → должно стоять *Allow all actions and reusable workflows*
   (если Actions выключены — cron тоже не ходит; включите).
2. **Settings → Branches**: если на `main` есть branch protection (required PR/reviews) —
   временно снимите или разрешите push от GITHUB_TOKEN, иначе бот не сможет запушить коммит
   (`permissions: contents: write` в файле уже есть, но protection важнее него).
3. Вкладка **Actions** → слева **«Sync catalog (auto-add new anime)»** → **Run workflow**:
   - Branch: `main`
   - `deep`: ✅ (default true)
   - `max_new`: `400`
   - зелёная кнопка **Run workflow**.
4. Наблюдение (открыть свежий run):
   - *expand* (~2–3 мин, ~35–45 запросов к AniList): в логе
     `глубокое расширение: ВКЛ · MAX_NEW=400 …`, счётчики `новых-кандидатов N/400`,
     финал `итог: ~5402 тайтлов (добавлено 400, квота 400)`;
   - *enrich* (~2–5 мин): `обогащению подлежат: ~400 из ~5402` → `готово … обогащено N`;
   - *episode dates* (~1–2 мин): `=== Отчёт B6 ===` с coverage;
   - *commit*: `chore(catalog): auto-sync 2026-09-25-HHMM` + push.
5. **Критерий успеха**: в `main` появился коммит от `anistream-bot` с изменённым `titles.json`.

Возможные сбои и реакции:

| Симптом | Причина | Действие |
| --- | --- | --- |
| expand: HTTP 429 в логе | rate-limit AniList | скрипт сам ретраит (6 попыток, backoff); если упал — Re-run jobs |
| enrich: timeout 25 мин | Shikimori тормозит | шаг `continue-on-error` — run зелёный/жёлтый, но коммит будет; RU-добогащение локально: `npm run enrich` |
| commit: `push rejected` | branch protection на main | см. п.2, повторить dispatch |
| `Process completed with exit code 1` на npm ci | не критично (`|| true`) | игнорировать |

## 5. ШАГ 3 — Терминал: верификация после бот-коммита (~3 мин)

```bash
git pull

# 1) Количество: ожидается ~5402 (5002 + ровно 400)
node -e "const t=require('./lib/data/titles.json');console.log('тайтлов:',t.length)"

# 2) Все новые прошли Shikimori (ожидается 0; если >0 — enrich упал по таймауту, добейте локально: npm run enrich)
node -e "const t=require('./lib/data/titles.json');console.log('без shikimoriChecked:',t.filter(x=>!x.shikimoriChecked).length)"

# 3) Отчёт покрытия датами серий (офлайн, без сети)
node scripts/fetch-episode-dates.mjs --report

# 4) Код не менялся, но страховка не лишняя
npm run typecheck && npm test

# 5) Визуально
npm run dev
#    /catalog — фильтры/сортировки, новые тайтлы в выдаче
#    /schedule — онгоинги/анонсы (их добавилось ~280)
#    /top — рейтинг; открыть 2–3 новые карточки: RU-название, описание, постер, жанры
```

## 6. ШАГ 4 (опционально) — Плееры для новых тайтлов (локальные bridge, в тот же день)

Как вы верно заметили: на GitHub bridge нет, поэтому бот добавляет **только метаданные**.
Страницы новых тайтлов при этом не сломаны: плеер играет через `guess` (синтез URL по пулу
глобальных озвучек, у всех новых будет `shikimori.id`) и demo-фолбэк. Реальные озвучки
Kodik/CVH/AniBoom появятся, когда кэш наполнят локальные bridge:

```bash
# если библиотека парсеров ещё не стоит:
pip install https://github.com/YaNesyTortiK/AnimeParsers/archive/refs/heads/main.zip

# терминал 1                          # терминал 2
python bridges/kodik_bridge.py        python bridges/multi_player_bridge.py   # :8765 / :8766

# терминал 3
npm run dev

# терминал 4
npm run warm       # .cache/warm-summary.json — у каких тайтлов (включая новые) есть источники
npm run hydrate    # gaps-режим: добирает ТОЛЬКО серии без источников — как раз новые тайтлы
                   # прерываем и повторяем: уже наполненное пропускается (сервер пишет кэш с debounce 5s)

# зафиксировать результат (кэш НЕ в gitignore):
git add .cache/providers-resolve-cache.json
git commit -m "chore(cache): hydrate — источники для новых тайтлов"
git push
```

Оценка времени hydrate для ~400 тайтлов: от ~30 мин (только ep1 на тайтл, быстрый отклик bridge)
до нескольких часов (`EPISODES=all`); можно растянуть на несколько подходов.

## 7. Повторные запуски и откат

- **Хочется ещё**: после первого dispatch останутся непустые пулы — favourites стр. ~87–100
  (~150–200), фильмы (~400), ONA (~250), OVA (~250). Повторный Run workflow с `max_new=200…500`
  добавит следующую порцию (проходы идемпотентны, квота режет точно).
- **Cron каждые 6 ч** продолжает работать в старом щадящем режиме (deep выключен):
  подхватывает только реально новые онгоинги/анонсы и дрейф популярности (единицы тайтлов за прогон).
- **Откат данных**: `git revert <sha бот-коммита> && git push` (меняется только titles.json/отчёты)
  или восстановление из `backups/` (шаг `npm run backup` перед пушем).
- **Откат кода патча**: `git revert` коммита `feat(catalog): deep-проходы…` — cron-сценарий от этого не зависит.

## 8. Протокол локальных тестов патча (выполнено в песочнице, 2026-09-25)

| Тест | Конфиг | Результат |
| --- | --- | --- |
| A: квота | `DEEP=1 MAX_NEW=5 PAGES=1` | ровно **+5** (5007), онгоинги-проход остановлен по квоте, анонсы и все deep-проходы пропущены, 18 кандидатов перенесены |
| B: deep-механика | `DEEP=1 MAX_NEW=460 PAGES=0` | ровно **+460** (5462): 134 ongoing + 150 upcoming + 176 finished; favourites стартовал со стр. 60, гейт fav≥60, квота набрана на стр. 87; фильмы/ONA/OVA пропущены; 1 коллизия слага → суффикс у НОВОГО; **0** переименований существующих слагов; слаги уникальны; JSON валиден; медиана fav новых finished = 119 (min 94) |
| C: self-heal | обнулены poster/description у One Piece, прогон `PAGES=1` | восстановлены, «Обновлено: 1», добавлено 0 (идемпотентность cron-режима) |
| D: cron-режим | без `DEEP` | глубокие проходы не подключаются, поведение = старому скрипту |
| E: YAML | парсер | валиден; inputs `deep:boolean=true`, `max_new:string='400'`; env проброшен в expand-шаг |

Известный нюанс (не блокер): ~9% новых из онгоингов/анонсов приходят без описания и/или постера
(китайские дунхуа, свежие анонсы без материалов). UI закрывает это генеративным фолбэком
`PosterArt`, описания добирает Shikimori-enrich, постеры — self-heal следующих прогонов.

## 9. Ожидаемые итоговые цифры после dispatch

| Показатель | До | После |
| --- | --- | --- |
| Тайтлов | 5002 | **~5402** (+ровно 400) |
| ongoing / upcoming | 42 / 117 | ~176 / ~267 |
| Shikimori-покрытие | 100% | 100% (enrich добьёт 400 новых) |
| epdates у finished | 99.7% | ≥99% (даты новых finished — в том же прогоне) |
| 18+ | 0 | 0 (`isAdult:false`) |
| Время прогона воркфлоу | — | ~6–12 мин |
