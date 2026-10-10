#!/usr/bin/env python3
"""Import confirmed Kodik episode embeds in bulk via the paginated /list API.

Safe by default:
  python scripts/import-kodik-bulk.py --probe
  python scripts/import-kodik-bulk.py --apply --max-pages 2
  python scripts/import-kodik-bulk.py --apply

The script reuses the token/parser initialization in bridges/kodik_bridge.py,
requests one page at a time, checkpoints progress, and only imports exact
episode links attached to a matching Shikimori ID. It never synthesizes URLs.

API behavior is based on the community-maintained AnimeParsers documentation;
validate --probe against the currently returned API shape before a full run.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

CACHE_PATH = ROOT / ".cache" / "providers-resolve-cache.json"
PROGRESS_PATH = ROOT / ".cache" / "kodik-bulk-import-progress.json"
TITLES_PATH = ROOT / "lib" / "data" / "titles.json"
API_BASE = "https://kodik-api.com"
QUERY_TYPES = "anime,anime-serial"
QUERY_VERSION = "kodik-list-anime-episodes-v1"
DEFAULT_TTL_MS = 86_400_000
DEFAULT_DELAY_MS = 750
DEFAULT_SAVE_EVERY = 10
PAGE_LIMIT = 100
REQUEST_TIMEOUT = 35
MAX_ATTEMPTS = 6


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if not match:
            continue
        value = match.group(2)
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        else:
            value = re.sub(r"\s+#.*$", "", value).strip()
        values[match.group(1)] = value
    return values


ENV_FILES = {**read_env_file(ROOT / ".env"), **read_env_file(ROOT / ".env.local")}
API_BASE = (
    os.environ.get("KODIK_API_BASE_URL")
    or ENV_FILES.get("KODIK_API_BASE_URL")
    or "https://kodik-api.com"
).rstrip("/")
try:
    CACHE_TTL_MS = int(
        os.environ.get("KODIK_CACHE_TTL_MS")
        or ENV_FILES.get("KODIK_CACHE_TTL_MS")
        or DEFAULT_TTL_MS
    )
except (TypeError, ValueError):
    CACHE_TTL_MS = DEFAULT_TTL_MS
CACHE_TTL_MS = CACHE_TTL_MS if CACHE_TTL_MS > 0 else DEFAULT_TTL_MS


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    os.replace(temp, path)


def title_shikimori_id(title: dict) -> str | None:
    shikimori = title.get("shikimori")
    if isinstance(shikimori, dict):
        value = shikimori.get("id")
    else:
        value = shikimori
    value = value or title.get("shikimoriId") or title.get("shikimori_id")
    return str(value) if value not in (None, "", 0, "0") else None


def eligible_title_map() -> tuple[dict[str, list[dict]], int, int]:
    titles = load_json(TITLES_PATH)
    if not isinstance(titles, list):
        raise RuntimeError("lib/data/titles.json must contain an array")

    by_id_lists: dict[str, list[dict]] = {}
    eligible_count = 0
    skipped_count = 0
    for title in titles:
        if not isinstance(title, dict) or not title.get("slug") or title.get("hidden"):
            continue
        if title.get("status") == "upcoming":
            skipped_count += 1
            continue
        eligible_count += 1
        sid = title_shikimori_id(title)
        if sid:
            by_id_lists.setdefault(sid, []).append(title)

    # Keep all candidates. Each Kodik material is matched independently below.
    ambiguous = sum(1 for rows in by_id_lists.values() if len(rows) > 1)
    return by_id_lists, eligible_count, ambiguous


def material_episode_numbers(material: dict) -> set[int]:
    numbers: set[int] = set()

    def collect(raw) -> None:
        if isinstance(raw, dict):
            items = raw.items()
            for raw_number, episode in items:
                try:
                    number = int(raw_number)
                except (TypeError, ValueError):
                    continue
                link = normalize_link(episode)
                if number > 0 and link:
                    numbers.add(number)
        elif isinstance(raw, list):
            for episode in raw:
                if not isinstance(episode, dict):
                    continue
                try:
                    number = int(episode.get("episode"))
                except (TypeError, ValueError):
                    continue
                link = normalize_link(episode)
                if number > 0 and link:
                    numbers.add(number)

    seasons = material.get("seasons")
    season_values = (
        seasons.values() if isinstance(seasons, dict)
        else seasons if isinstance(seasons, list)
        else []
    )
    for season in season_values:
        if isinstance(season, dict):
            collect(season.get("episodes"))

    if not numbers:
        collect(material.get("episodes"))

    return numbers


def match_title(material: dict, candidates: list[dict]) -> dict | None:
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    material_type = str(material.get("type") or "")
    if material_type in {"anime-serial", "foreign-serial"}:
        preferred = [
            title for title in candidates
            if str(title.get("type") or "") in {"tv", "ona"}
        ]
        if not preferred:
            return None
        candidates = preferred
    elif material_type == "anime":
        preferred = [
            title for title in candidates
            if str(title.get("type") or "") in {"movie", "ova", "special"}
        ]
        if not preferred:
            return None
        candidates = preferred

    numbers = material_episode_numbers(material)
    extent = max(numbers) if numbers else None

    ranked = []
    for title in candidates:
        try:
            expected = max(1, int(title.get("episodes") or 1))
        except (TypeError, ValueError):
            expected = 1

        distance = abs(expected - extent) if extent is not None else 0
        ranked.append(((distance,), title))

    ranked.sort(key=lambda item: item[0])
    best_score = ranked[0][0]
    best = [title for score, title in ranked if score == best_score]

    # If two catalog records fit equally well, do not guess.
    return best[0] if len(best) == 1 else None


def normalize_link(value) -> str | None:
    if isinstance(value, dict):
        value = value.get("link")
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    if value.startswith("//"):
        value = "https:" + value
    elif value.startswith("/"):
        return None
    if not value.startswith(("https://", "http://")):
        return None
    return value


def extract_episode_links(material: dict, expected_episodes: int) -> dict[int, str]:
    def collect(raw_episodes) -> dict[int, str]:
        found: dict[int, str] = {}

        if isinstance(raw_episodes, dict):
            items = raw_episodes.items()
        elif isinstance(raw_episodes, list):
            items = (
                (episode.get("episode"), episode)
                for episode in raw_episodes
                if isinstance(episode, dict)
            )
        else:
            return found

        for raw_number, raw_episode in items:
            try:
                number = int(raw_number)
            except (TypeError, ValueError):
                continue

            if number < 1 or number > expected_episodes:
                continue

            link = normalize_link(raw_episode)
            if link:
                found[number] = link

        return found

    seasons = material.get("seasons")
    season_values = (
        seasons.values() if isinstance(seasons, dict)
        else seasons if isinstance(seasons, list)
        else []
    )

    groups: list[dict[int, str]] = []

    for season in season_values:
        if not isinstance(season, dict):
            continue

        found = collect(season.get("episodes"))
        if found:
            groups.append(found)

    if len(groups) == 1:
        return groups[0]

    if len(groups) > 1:
        exact = [
            group
            for group in groups
            if all(
                number in group
                for number in range(1, expected_episodes + 1)
            )
        ]
        if len(exact) == 1:
            return exact[0]

        # Do not combine seasons that reuse episode numbers.
        occupied = set()
        for group in groups:
            if occupied.intersection(group):
                return {}
            occupied.update(group)

        merged = {}
        for group in groups:
            merged.update(group)
        return merged

    # Some materials expose episode data at the top level.
    top_level = collect(material.get("episodes"))
    if top_level:
        return top_level

    # Single-video anime may have only one top-level link.
    if expected_episodes == 1 and material.get("type") == "anime":
        link = normalize_link(material.get("link"))
        return {1: link} if link else {}

    return {}


def direct_source(source: dict) -> bool:
    return bool(
        isinstance(source, dict)
        and source.get("providerId") != "demo"
        and not source.get("guessed")
        and not source.get("synthesized")
        and not re.search(r":s\d+$", str(source.get("id", "")))
    )


def make_source(material: dict, slug: str, episode: int, link: str) -> dict:
    translation = material.get("translation")
    translation = translation if isinstance(translation, dict) else {}
    translation_id = str(translation.get("id") or material.get("id") or "unknown")
    label = str(translation.get("title") or "Kodik")
    translation_type = str(translation.get("type") or "voice")
    return {
        "id": f"kodik:{translation_id}:{material.get('id', slug)}:{episode}",
        "label": label,
        "providerId": "kodik",
        "providerName": "Kodik",
        "kind": "embed",
        "embedUrl": link,
        "translationId": translation_id,
        "voice": "subtitles" if translation_type == "subtitles" else "voice",
        "contentType": str(material.get("type") or "anime-serial"),
    }


def source_identity(source: dict) -> str:
    """Deduplicate URLs within one provider, not across unrelated providers."""
    provider = str(source.get("providerId") or "unknown")
    identity = ""
    if source.get("embedUrl"):
        identity = str(source["embedUrl"])
    else:
        files = source.get("files")
        if isinstance(files, list):
            for item in files:
                if isinstance(item, dict) and item.get("url"):
                    identity = str(item["url"])
                    break
        if not identity:
            identity = str(source.get("id") or "")
    return f"{provider}:{identity}" if identity else ""


def merge_episode(store: dict, slug: str, episode: int, incoming: list[dict]) -> tuple[bool, int]:
    key = f"ep:{slug}:{episode}"
    now = int(time.time() * 1000)
    entry = store.get(key)
    entry = entry if isinstance(entry, dict) else {}
    result = entry.get("sources")
    result = result if isinstance(result, dict) else {}
    existing = result.get("sources")
    existing = existing if isinstance(existing, list) else []

    # Keep real sources from every provider; drop only demo/guessed/synthesized
    # entries because this cache is intended to represent confirmed links.
    merged = [source for source in existing if direct_source(source)]
    seen = {source_identity(source) for source in merged if isinstance(source, dict)}
    added = 0
    confirmed = 0
    for source in incoming:
        if not direct_source(source):
            continue
        identity = source_identity(source)
        if not identity:
            continue
        confirmed += 1
        if identity in seen:
            continue
        seen.add(identity)
        merged.append(source)
        added += 1

    # A fresh paginated Kodik response confirms existing URLs too. Refresh their
    # timestamp/TTL even when it adds no new URL; otherwise a full import can
    # leave already-known links expired forever.
    if confirmed == 0:
        return False, 0

    sources_used = sorted(
        {
            str(source.get("providerId") or "unknown")
            for source in merged
            if isinstance(source, dict)
        }
    )
    result = {**result, "sources": merged, "sourcesUsed": sources_used, "fromCache": False}
    store[key] = {"at": now, "ttlMs": max(CACHE_TTL_MS, int(entry.get("ttlMs") or 0)), "sources": result}
    return True, added


def cursor_from_next_page(value) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    values = parse_qs(urlparse(value).query).get("next")
    return values[0] if values else None


def retry_after_seconds(response, attempt: int) -> float:
    value = response.headers.get("Retry-After")
    if value:
        try:
            return max(0.0, min(300.0, float(value)))
        except ValueError:
            try:
                when = parsedate_to_datetime(value)
                return max(0.0, min(300.0, (when - datetime.now(timezone.utc)).total_seconds()))
            except Exception:
                pass
    base = 5 if response.status_code == 429 else 2
    return min(90.0, base * (2**attempt))


def request_page(token: str, parser, cursor: str | None) -> dict:
    payload = {
        "token": token,
        "limit": PAGE_LIMIT,
        "types": QUERY_TYPES,
        "with_episodes_data": "true",
    }
    if cursor:
        payload["next"] = cursor

    for attempt in range(MAX_ATTEMPTS):
        try:
            response = requests.post(
                f"{API_BASE}/list",
                data=payload,
                proxies=getattr(parser, "proxies", None),
                timeout=REQUEST_TIMEOUT,
            )
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == MAX_ATTEMPTS - 1:
                    raise RuntimeError(f"Kodik API returned HTTP {response.status_code} after retries")
                delay = retry_after_seconds(response, attempt)
                print(f"API returned HTTP {response.status_code}; waiting {delay:.1f}s before retry.")
                time.sleep(delay)
                continue
            if not response.ok:
                raise RuntimeError(f"Kodik API returned HTTP {response.status_code}")
            try:
                body = response.json()
            except ValueError as exc:
                raise RuntimeError("Kodik API returned invalid JSON") from exc
            if not isinstance(body, dict):
                raise RuntimeError("Kodik API response is not an object")
            if body.get("error"):
                raise RuntimeError("Kodik API returned an error: " + str(body["error"]))
            if not isinstance(body.get("results"), list):
                raise RuntimeError("Kodik API response has no results array")
            return body
        except (requests.RequestException, TimeoutError) as exc:
            if attempt == MAX_ATTEMPTS - 1:
                raise RuntimeError(f"Kodik API request failed after retries: {exc}") from exc
            delay = min(60.0, 2.0 * (2**attempt))
            print(f"Request failed; waiting {delay:.1f}s before retry.")
            time.sleep(delay)
    raise RuntimeError("Unreachable retry state")


def get_parser_and_token():
    # Reuse the same automatic token discovery/parser compatibility path as the
    # existing Kodik bridge, instead of requiring KODIK_TOKEN in .env.local.
    from bridges.kodik_bridge import kodik

    client = kodik()
    if not client or not client.get("parser") or not client.get("token"):
        reason = (client or {}).get("error") or "token unavailable"
        raise RuntimeError("Could not initialize KodikParser: " + str(reason))
    return client["parser"], client["token"]


def inspect_page(body: dict, by_id: dict[str, dict]) -> dict:
    items = body.get("results", [])
    matched_materials = 0
    usable_episode_links = 0
    matching_slugs = set()
    examples = []
    for material in items:
        if not isinstance(material, dict):
            continue
        sid = str(material.get("shikimori_id") or "")
        title = match_title(material, by_id.get(sid, []))
        if not title:
            continue
        matched_materials += 1
        slug = str(title["slug"])
        matching_slugs.add(slug)
        expected = max(1, int(title.get("episodes") or 1))
        links = extract_episode_links(material, expected)
        usable_episode_links += len(links)
        if links and len(examples) < 8:
            examples.append({"slug": slug, "episodeLinks": len(links), "type": material.get("type")})
    return {
        "items": len(items),
        "matchedMaterials": matched_materials,
        "matchedTitles": len(matching_slugs),
        "usableEpisodeLinks": usable_episode_links,
        "examples": examples,
    }


def save_progress(progress: dict) -> None:
    write_json_atomic(PROGRESS_PATH, progress)


def main() -> int:
    parser_args = argparse.ArgumentParser(description="Bulk import real episode embeds from Kodik /list.")
    mode = parser_args.add_mutually_exclusive_group()
    mode.add_argument("--probe", action="store_true", help="Fetch one page and report response shape (default).")
    mode.add_argument("--apply", action="store_true", help="Scan pages and merge exact episode links into the cache.")
    parser_args.add_argument("--max-pages", type=int, default=0, help="Stop after this many pages for a controlled test.")
    parser_args.add_argument("--restart", action="store_true", help="Restart pagination from the first page (does not erase cache).")
    args = parser_args.parse_args()

    if args.max_pages < 0:
        parser_args.error("--max-pages cannot be negative")
    apply = bool(args.apply)
    if args.restart and not apply:
        parser_args.error("--restart requires --apply")

    if not TITLES_PATH.exists():
        raise RuntimeError(f"Catalog not found: {TITLES_PATH}")
    if not CACHE_PATH.exists():
        raise RuntimeError(f"Provider cache not found: {CACHE_PATH}. Run from a synchronized repository first.")

    by_id, eligible_count, ambiguous_ids = eligible_title_map()
    print(f"Eligible catalog titles: {eligible_count}; Shikimori IDs indexed: {len(by_id)}; ambiguous IDs skipped: {ambiguous_ids}")
    print(f"Kodik API: {API_BASE}; types={QUERY_TYPES}; page limit={PAGE_LIMIT}; episode data enabled.")
    print("Mode: APPLY (incremental cache writes)" if apply else "Mode: PROBE (read-only; one page only).")

    if not apply:
        parser, token = get_parser_and_token()
        body = request_page(token, parser, None)
        report = inspect_page(body, by_id)
        print("API total:", body.get("total"))
        print("Results in probe page:", report["items"])
        print("Materials matching local Shikimori IDs:", report["matchedMaterials"])
        print("Local titles matched:", report["matchedTitles"])
        print("Exact episode links in this page:", report["usableEpisodeLinks"])
        print("Sample matches:", json.dumps(report["examples"], ensure_ascii=False))
        print("Probe made no cache or progress-file changes.")
        return 0

    PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
    progress = {}
    if args.restart and PROGRESS_PATH.exists():
        PROGRESS_PATH.unlink()
    if PROGRESS_PATH.exists():
        progress = load_json(PROGRESS_PATH)
        if progress.get("queryVersion") != QUERY_VERSION:
            raise RuntimeError("Bulk-import progress uses another query version. Use --restart to start again.")
        if progress.get("completed"):
            raise RuntimeError("Bulk import is already complete. Use --restart to rescan the catalog.")
    else:
        progress = {
            "queryVersion": QUERY_VERSION,
            "cursor": None,
            "pagesCompleted": 0,
            "materialsProcessed": 0,
            "matchedMaterials": 0,
            "matchedTitles": 0,
            "matchedSlugs": [],
            "episodeLinksSeen": 0,
            "episodeEntriesUpdated": 0,
            "newSources": 0,
            "completed": False,
            "startedAt": datetime.now(timezone.utc).isoformat(),
        }

    parser, token = get_parser_and_token()
    store = load_json(CACHE_PATH)
    if not isinstance(store, dict):
        raise RuntimeError("Provider cache must be a JSON object; no changes made.")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = CACHE_PATH.with_name(CACHE_PATH.name + ".backup-" + stamp)
    shutil.copy2(CACHE_PATH, backup)
    print(f"Backup created: {backup.name}")
    print(f"Resume position: page {int(progress.get('pagesCompleted') or 0) + 1}")

    cursor = progress.get("cursor")
    pages_this_run = 0
    pending_pages = 0
    pending_cache_changes = False
    delay_ms = max(0, int(os.environ.get("KODIK_BULK_DELAY_MS", str(DEFAULT_DELAY_MS))))
    save_every = max(1, int(os.environ.get("KODIK_BULK_SAVE_EVERY_PAGES", str(DEFAULT_SAVE_EVERY))))
    started = time.monotonic()

    while True:
        body = request_page(token, parser, cursor)
        report = inspect_page(body, by_id)
        items = body["results"]
        matching_slugs = set()
        page_updated_episodes = set()
        page_new_sources = 0
        page_cache_changed = False
        for material in items:
            if not isinstance(material, dict):
                continue
            sid = str(material.get("shikimori_id") or "")
            title = match_title(material, by_id.get(sid, []))
            if not title:
                continue
            matching_slugs.add(str(title["slug"]))
            expected = max(1, int(title.get("episodes") or 1))
            links = extract_episode_links(material, expected)
            if not links:
                continue
            incoming_by_episode: dict[int, list[dict]] = {}
            for episode, link in links.items():
                incoming_by_episode.setdefault(episode, []).append(
                    make_source(material, str(title["slug"]), episode, link)
                )
            for episode, incoming in incoming_by_episode.items():
                changed, added = merge_episode(store, str(title["slug"]), episode, incoming)
                if changed:
                    page_updated_episodes.add(f"{title['slug']}:{episode}")
                    page_cache_changed = True
                    page_new_sources += added

        pages_this_run += 1
        pending_pages += 1
        progress["pagesCompleted"] = int(progress.get("pagesCompleted") or 0) + 1
        progress["materialsProcessed"] = int(progress.get("materialsProcessed") or 0) + len(items)
        progress["matchedMaterials"] = int(progress.get("matchedMaterials") or 0) + report["matchedMaterials"]
        all_matched_slugs = set(progress.get("matchedSlugs") or []) | matching_slugs
        progress["matchedSlugs"] = sorted(all_matched_slugs)
        progress["matchedTitles"] = len(all_matched_slugs)
        progress["episodeLinksSeen"] = int(progress.get("episodeLinksSeen") or 0) + report["usableEpisodeLinks"]
        progress["episodeEntriesUpdated"] = int(progress.get("episodeEntriesUpdated") or 0) + len(page_updated_episodes)
        progress["newSources"] = int(progress.get("newSources") or 0) + page_new_sources
        cursor = cursor_from_next_page(body.get("next_page"))
        progress["cursor"] = cursor
        progress["updatedAt"] = datetime.now(timezone.utc).isoformat()
        # Persist freshness-only updates as well as genuinely new URLs.
        pending_cache_changes = pending_cache_changes or page_cache_changed

        if pages_this_run == 1 or pages_this_run % 10 == 0:
            elapsed = max(0.001, time.monotonic() - started)
            print(
                f"Page {progress['pagesCompleted']} · page-items={len(items)}"
                f" · matched-materials={report['matchedMaterials']}"
                f" · episode-links={report['usableEpisodeLinks']}"
                f" · episode-entries-updated={len(page_updated_episodes)}"
                f" · new-sources-in-page={page_new_sources}"
                f" · elapsed={elapsed:.1f}s"
            )

        should_stop = args.max_pages > 0 and pages_this_run >= args.max_pages
        finished = cursor is None

        if pending_pages >= save_every or should_stop or finished:
            if pending_cache_changes:
                write_json_atomic(CACHE_PATH, store)
                pending_cache_changes = False
            progress["completed"] = finished
            save_progress(progress)
            pending_pages = 0
            print(
                f"Checkpoint saved · pages={progress['pagesCompleted']}"
                f" · episode-entries-updated={progress['episodeEntriesUpdated']}"
                f" · new-sources={progress['newSources']}"
                f" · cache={CACHE_PATH.name}"
            )

        if finished:
            elapsed = max(0.001, time.monotonic() - started)
            print("\nKodik bulk import completed.")
            print("Catalog materials processed:", progress["materialsProcessed"])
            print("Pages processed:", progress["pagesCompleted"])
            print("Matched materials:", progress["matchedMaterials"])
            print("Unique matched titles observed across pages:", progress["matchedTitles"])
            print("Episode links seen in eligible matches:", progress["episodeLinksSeen"])
            print("Episode entries updated with new source links:", progress["episodeEntriesUpdated"])
            print("New distinct source links added:", progress["newSources"])
            print(f"Elapsed this run: {elapsed / 60:.1f} minutes")
            print("Cache backup:", backup.name)
            print("Progress file:", PROGRESS_PATH.name)
            return 0

        if should_stop:
            print(f"Stopped after {pages_this_run} page(s) as requested; run --apply again to resume.")
            return 0

        if delay_ms:
            time.sleep(delay_ms / 1000)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted. The last checkpoint is safe; rerun --apply to resume.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print("Kodik bulk import failed:", str(exc), file=sys.stderr)
        raise SystemExit(1)
