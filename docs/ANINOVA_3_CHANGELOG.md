# AniNova 3.0 — B1-B: журнал изменений

Ветка: `design/aninova-3-b1-b-hybrid-2026-11`  
База: `origin/main` (`5d983d5`)  
Все изменения находятся только в ветке. Production, база, Supabase, Redis и секреты не изменялись. Деплой не выполнялся.

## Добавлено

### Preview-каркас и изоляция

- `components/system/ChromeGate.tsx` — скрывает production-шапку/футер/мобильную навигацию/cookie/auth-gate в preview; `MainGate` гарантирует один `<main>` на документ.
- `lib/aninova3/flag.ts` — `isAninova3PreviewEnabled()` (`ANINOVA3_PREVIEW=1|true|on`).
- `app/preview/aninova-3/layout.tsx` — `force-dynamic`, `notFound()` без флага, `noindex`, подключение `a3.css`.
- `app/layout.tsx` — точечные обёртки `ChromeGate`/`MainGate`; вне preview разметка прежняя.

### Дизайн-система

- `app/preview/aninova-3/a3.css` — токены, тёмные поверхности, типографика, сетка, кнопки, карточки, формы, чипы, рельсы, сцена, читалка, TV-шкала 1280/1920/4K, reduced motion.
- `A3Logo`, `A3Ui` — логотип с Nova Pulse, TV-режим, первая подсказка управления.

### Навигация и поиск

- `A3Header`, `A3Menu`, `A3MobileNav`, `A3Footer`.
- `A3Search` — оверлей, фокус-трап, дебаунс, `/api/search`, Escape и возврат фокуса.
- `RemoteNav` + `lib/aninova3/spatial.ts` + `remote/focus.ts` — геометрическая D-pad-навигация, память фокуса, обработка Escape/Back, сцена плеера, оверлеи.

### Экраны

- `app/preview/aninova-3/page.tsx` — главная: афиша, продолжить, рельсы, тизер Comics.
- `catalog/page.tsx` — плотный каталог: поиск, жанры, фасеты, сортировка, список/сетка, пагинация, пустое состояние.
- `anime/[slug]/page.tsx` — страница тайтла: постер, факты, описание, серии, похожее.
- `anime/[slug]/[episode]/page.tsx` — кинозал, хлебные крошки, сцена, подсказки.
- `comics/page.tsx`, `comics/[slug]/page.tsx`, `comics/[slug]/read/page.tsx` — каталог RU-комиксов, главы, читалка.
- `profile/page.tsx` — история, закладки, настройки; демо-состояния.
- `auth/page.tsx` — вход/регистрация, валидация, без отправки.

### Компоненты

`A3Hero`, `A3Rail`, `A3Card`, `A3Continue`, `A3Resume`, `A3Bookmark`, `A3FiltersPanel`, `A3Theatre`, `A3Cover`, `A3ComicContinue`, `A3Reader`, `A3Profile`, `A3Auth`, `A3BannerImg`.

### Данные и утилиты

- `lib/aninova3/comics-demo.ts` — 8 вымышленных комиксов, 4 демо-страницы.
- `lib/aninova3/catalog-query.ts` — разбор/сборка query, активные фильтры.
- `public/demo/comics/page-1…4.jpg` — сгенерированные демо-страницы читалки.

### Тесты и инструменты

- `tests/aninova3-spatial.test.ts` — 7 unit-тестов геометрии.
- `e2e/aninova3-tv.spec.ts` — 7 TV-тестов (шапка, каталог, поиск, меню, фокус, плеер, чип).
- `scripts/aninova3/screenshots.mjs` — 54 экрана (9 × 6 ширин) + 7 состояний.
- `scripts/aninova3/audit.mjs` — overflow, контраст, семантика, клавиатура, reduced motion, вес ресурсов.
- `scripts/aninova3/measure.mjs` — LCP/transfer/DOM.

### Документы и артефакты

- `docs/ANINOVA_3_IMPLEMENTATION_PLAN.md`
- `docs/ANINOVA_3_DESIGN_DECISIONS.md`
- `docs/ANINOVA_3_CHANGELOG.md`
- `docs/ANINOVA_3_QA.md`
- `docs/ANINOVA_3_B1B_REPORT.md`
- `docs/ANINOVA_3_HANDOFF.md`
- `docs/design/b1b/` — 61 скриншот, `manifest.json`, `audit.json`, `perf.json`, `README.md`.

## Исправлено по ходу B1-B

1. **Фокус в шапке.** После переписывания `RemoteNav` id и индекс расходились; теперь `collect()` присваивает id один раз, навигация читает реальный элемент.
2. **Каталог и D-pad.** Нативные `<select>` перехватывали стрелки и не давали дойти до строк. Фасеты заменены ссылками-чипами; фильтры на десктопе раскрываются после гидратации, чтобы пульт мог войти внутрь.
3. **Возврат фокуса после Escape.** Индексы ломались при изменении DOM. Перешли на стабильные id (`href + класс + вхождение`); тест каталога исправлен: проверяется реально сфокусированная строка, а не первая.
4. **Контраст индиго.** Белый текст на `#7C6BFF` — 3.89:1. Заливки переведены на `#6C5AFF` (4.62:1), бренд-токен сохранён.
5. **Кинозал.** Белая сцена и светлая панель источников от production-стилей. Добавлены тёмные scoped-стили, постерный слой и `object-fit: cover`; плеер не переписывался.
6. **Читалка.** Была схемой из текстовых панелей и с глобальной шапкой. Добавлены демо-изображения страниц, `h1`, иммерсивный режим без шапки/футера.
7. **TV-типографика.** На 1920 основные тексты были 14–17 px; увеличены до 20–24 px, цели — до 54–58 px.
8. **Сортировка на мобильных.** После удаления `<select>` чипы сортировки были скрыты; теперь доступны на всех ширинах.
9. **Даты глав комиксов.** Генерировались не по порядку и с будущими датами; теперь убывают от 2026-11-01 с шагом 21 день.
10. **Один `<main>`.** Preview-страницы вкладывали `<main>` в корневой `<main>`; добавлен `MainGate`.
11. **Скриншот-скрипт.** Состояние поиска снималось до фокуса в поле; добавлено ожидание и проверка ввода.

## Удалено

- `components/aninova3/A3AutoSelect.tsx` — больше не нужен после перехода фасетов на ссылки-чипы.
- Сгенерированный Next.js `AGENTS.md`; добавлен в `.gitignore`.

## Не изменялось

- `components/player/PlayerShell.tsx` и логика HLS/провайдеров;
- API-маршруты, Supabase, Redis, платежи, переменные production;
- production-страницы, шапка, футер, мобильная навигация;
- существующие компоненты каталога и карточки (новые компоненты лежат отдельно, старые не удалялись).
