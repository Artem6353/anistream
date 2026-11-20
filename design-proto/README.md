# AniNova 3.0 — design prototype (B1-A)

Изолированный прототип трёх визуальных концепций AniNova 3.0. Не подключён к production-приложению и не изменяет его.

- Ветка: `design/aninova-3-b1-exploration-2026-11`
- Worktree: `C:\Users\artem\anistream-design`
- Владелец решения: владелец продукта (B1-B не начат, ждём выбора концепции)

## Запуск

```bash
npm install
npm run dev        # http://localhost:3517
```

Индекс: `/` — три концепции, матрица экранов и превью 390/768/1440/1920.

| Концепция | Корень | Тема по умолчанию |
|---|---|---|
| A · Nova Minimal | `/minimal` | тёмная |
| B · Nova Editorial | `/editorial` | светлая (бумага) |
| C · Nova Cinematic | `/cinematic` | тёмная |

Экраны внутри концепции: ``, `/catalog`, `/anime/[slug]`, `/anime/[slug]/watch`, `/comics`, `/comics/[slug]`, `/comics/[slug]/read`, `/profile`, `/login`, `/register`.

## Что работает

- Переключение концепций в плавающей панели с сохранением текущего экрана; тема переключается в шапке и в панели (`localStorage`), без вспышки при загрузке.
- Поиск (открытие, ввод, результаты), мобильное меню (drawer / обложка / нижняя панель), вкладки профиля, сохранение карточки, фильтры и сортировка каталога, list/grid.
- Демо-плеер: play/pause, mute, таймлайн, качество, озвучка, fullscreen (поток не подключён).
- Читалка комиксов: клик по зонам, ←/→, PageUp/PageDown, свайп, прогресс, `?page=`.
- Формы входа/регистрации с клиентской валидацией и демо-статусом (Supabase не подключён).

## Данные

`lib/mock.ts` — 12 аниме (включая вымышленный AniNova Original), 6 комиксов только на русском, эпизоды, главы, страницы читалки, профиль. Все данные вымышлены и помечены в интерфейсе как демо; изображения сгенерированы `scripts/gen-assets.mjs`.

## Скриншоты и проверки

```bash
npm run build
npx next start -p 3518
PROTO_BASE=http://localhost:3518 node scripts/screenshots.mjs
```

Результат — `../docs/design/b1/` (97 скриншотов + `audit.json`). Флаги: `--audit` только проверки, `--states` только состояния.

## Изоляция

Прототип не импортирует production `app/layout.tsx`, `app/theme-2026.css`, `SiteHeader`, плеер или Supabase-клиенты. Отдельный `package.json`, отдельный `.next`, внешних UI-зависимостей нет (`next`, `react`, `react-dom`, `sharp`). Никаких деплоев.

## Документы

- `../docs/ANINOVA_3_DESIGN_SYSTEM.md`
- `../docs/ANINOVA_3_DESIGN_COMPARISON.md`
- `../docs/ANINOVA_3_RESPONSIVE_SPEC.md`
