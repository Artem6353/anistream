# B1-A — скриншоты и артефакты

Снято с production-сборки прототипа (`design-proto`), Chromium, `?ui=0`. 97 файлов, ~6.6 MB.

## Индекс

| Файл | Что показывает |
|---|---|
| `index-1440.jpg` | Индекс прототипа: три концепции, матрица экранов, превью устройств |

## Экраны

В каждой папке `screens/{minimal,editorial,cinematic}/`:

| Файл | Ширины |
|---|---|
| `home` | 390 / 768 / 1440 / 1920 + `1440-light` (противоположная тема) |
| `catalog` | 390 / 768 / 1440 + `1440-light` |
| `anime` | 390 / 1440 |
| `watch` | 390 / 768 / 1440 / 1920 |
| `comics` | 390 / 1440 |
| `comic` | 390 / 1440 |
| `read` | 390 / 768 / 1440 |
| `profile` | 390 / 1440 |
| `login`, `register` | 390 / 1440 |

## Состояния

| Файл | Что показывает |
|---|---|
| `state-search-1440.jpg` | Открытый поиск с введённым запросом и результатами |
| `state-menu-390.jpg` | Мобильное меню (A — drawer, B — обложка); у C вместо меню `state-search-390.jpg` |
| `state-profile-tab-1440.jpg` | Вторая вкладка профиля (закладки/полка) |
| `state-saved-1440.jpg` | Карточка сохранена (`aria-pressed="true"`) |

## audit.json

```json
{
  "base": "http://localhost:3518",
  "overflow": [],                 // 120 проверок, 0 нарушений
  "contrast": [...],              // 60 страниц × тем, 0 нарушений, min 4.56:1
  "keyboard": [...],              // поиск, Esc, читалка ←/→ — 3/3
  "motion": { "mediaMatches": true, "pulseAnimation": "1e-06s", "scrollBehavior": "auto" },
  "images": [...]                 // srcset, lazy, alt по концепциям
}
```

Подробности — `docs/ANINOVA_3_RESPONSIVE_SPEC.md` §6.
