# ADR-0002: staged, dry-run-first import Comics

- Статус: **Accepted** для B3-B (local/disposable; no DB apply).
- Дата: 2026-11-26.
- Ветка: `data/aninova-3-b3-b-adapters-dryrun-2026-11`.
- База: `b61403e65daeeecd3287db2ca525856372fef407`.
- Дополняет ADR-0001, не заменяет его.

## 1. Контекст

B3-A создал каноническую схему, но не импорт. Артефакты B1D/B1E содержат
4 100 работ, 5 748 anime↔comic edges, 2 265 verified records (при заявленных
2 444) и 2 170 кандидатов. В данных есть конфликты источников, ambiguous
MAL/Shikimori id, name-only авторы и отсутствие прав/глав.

Прямой apply опасен: можно случайно опубликовать черновик, назначить
неоднозначный external id, слить разные работы или выдать work-level URL за
URL главы. Поэтому импорт должен быть воспроизводимым, staged и dry-run-first.

## 2. Решение

1. **Source-independent adapter**: `read → validate → normalize`; входы — только
   сохранённые JSON-артефакты, без сети.
2. **Единый source envelope**: `source_name`, `external_id`, `source_url`,
   `fetched_at`, `source_snapshot_at`, `terms_review_status`,
   `attribution_requirements`, `confidence`, `verification_status`,
   `source_payload_hash`, `raw_relation_type`.
3. **Раздельные стадии**: validate, normalize, external-ID matching, dedup,
   review queue, import plan, verify. Стадии не смешиваются.
4. **Deterministic IDs**: UUID из стабильного ключа (`work:<anilist>`,
   `person:<normalized name>` и т. д.); повторный прогон даёт тот же план.
5. **Dry-run only**: CLI не имеет apply-режима, не открывает БД и отклоняет
   remote env/URL. Canary apply допускается только в disposable test harness.
6. **No auto-merge**: duplicate/conflict/ambiguous → review queue; provenance
   сохраняется; ничего не удаляется и не перезаписывается.
7. **No legal invention**: terms/attribution `unknown`; 0 approved rights;
   0 chapters/sources; public surface остаётся закрытым.
8. **Все anime↔comic edges — unconfirmed links**: raw type сохраняется,
   `direction/confidence=unknown`, `is_primary/is_public=false`. `RELATED` не
   создаётся.
9. **Public Russian title** только `SOURCE_VERIFIED` + Cyrillic; original/native
   никогда не fallback.

## 3. Альтернативы

| Вариант | Почему отклонён |
|---|---|
| Прямой `INSERT` из JSON в БД | нет review, легко опубликовать/слить, нет rerun-доказательства |
| Один adapter на каждый источник с общей таблицей | дубли и рассинхронизация; envelope+canonical слой лучше |
| Автоматический выбор значения при конфликте | скрывает расхождение источников; нет evidence |
| Автоматический merge по имени/MAL | approximate identity; риск слить разные работы |
| `RELATED` для всех неизвестных raw types | теряет семантику и создаёт ложные связи |
| Apply canary в основной БД | нарушает dry-run-only и staging gate |

## 4. Последствия

Положительные:

- воспроизводимый plan/canary hash и checksums;
- provenance и review для каждого конфликта;
- безопасный rerun (0 duplicate inserts на canary);
- нет accidental publication/rights/chapters;
- один контракт для будущих источников.

Ограничения:

- 709 работ/831 review rows требуют ручного разбора;
- name-only people без source staff id;
- 2 444 vs 2 265 metadata mismatch остаётся upstream-дефектом;
- Supabase/PostgREST/live JWT/production apply — **NOT TESTED**;
- реальный staging apply и owner approval ещё нужны.

## 5. Ссылки

- `docs/comics/B3B_ADAPTERS.md`;
- `docs/comics/B3B_IMPORT_REPORT.md`;
- `docs/comics/B3B_DATA_QUALITY.md`;
- `docs/comics/adr/0001-comics-data-foundation.md`;
- `supabase/migrations/20261124_comics_b3b_chapter_urls_evidence.sql`.
