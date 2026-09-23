# Локальные Python-bridge v2 (боевая схема оригинала)

Next.js **не** обращается к Kodik/CVH/AniBoom напрямую: registry ходит в локальные bridge,
а те — в библиотеку [AnimeParsers](https://github.com/YaNesyTortiK/AnimeParsers) (`anime-parsers-ru`).

```
Next.js /api/providers/[slug]/[episode]
   │  cache-first (.cache/providers-resolve-cache.json)
   ├─→ 127.0.0.1:8765  kodik_bridge.py        → KodikParser (авто-пул токенов)
   │       search(shikimori_id, with_episodes=true) → seasons[*].episodes[*]
   │       → точный episode → /seria/<id>/<hash>/720p для каждой озвучки
   └─→ 127.0.0.1:8766  multi_player_bridge.py → AnimegoParser
           get_voices(anime_id, episode) → CVH cdn-iframe + AniBoom embed
           (фолбэк: search по названию, т.к. id animego ≠ id shikimori)
```

Проверено вживую: Frieren, серия 26 → `sourcesUsed: [kodik, cvh, aniboom]`, 20 источников
(Kodik 10 озвучек /seria/…, CVH 5 cdn-iframe, AniBoom 4 embed) за ~4 c; далее cache-first.

## Установка и запуск

```bash
pip install https://github.com/YaNesyTortiK/AnimeParsers/archive/refs/heads/main.zip
python bridges/kodik_bridge.py          # 127.0.0.1:8765 (KODIK_BRIDGE_PORT)
python bridges/multi_player_bridge.py   # 127.0.0.1:8766 (MULTIPLAYER_BRIDGE_PORT)
```

Совместимость: Python 3.11+ (встроен compat-загрузчик `parser_kodik`/`parser_animego` —
в релизе библиотеки есть f-strings из 3.12+). Гонки ленивой инициализации закрыты threading.Lock.
`KODIK_TOKEN` из `.env.local` приоритетнее авто-пула; без токена пул подберётся сам.

## Контракт

| Метод | Путь | Тело / ответ |
| --- | --- | --- |
| GET | `/health` | `{ ok, reason }` (у kodik первый вызов греет пул токенов ~10 c) |
| POST | `/resolve` | `{ provider, context: ProviderContext }` → `{ sources: [{translationId,label,kind,embedUrl,type}] }` |

Нормализатор Next (`lib/providers/bridge.ts`) терпим к формам `sources[]/results[]`,
`embed_url/link`, а registry сливает озвучки всех провайдеров в единый `EpisodeSources`
(`PROVIDER_MODE=merge|first`, таймаут каждого — `PROVIDER_TIMEOUT_MS`).

## Порядок разрешения в registry

1. cache (`ep:{slug}:{episode}`, self-growing);
2. live-bridge (kodik → cvh → aniboom параллельно);
3. синтез из кэш-шаблонов других серий / guess-пул озвучек CVH;
4. demo-тест-поток (офлайн-база) + честное уведомление в плеере.
