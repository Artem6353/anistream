"""Regression tests for the resumable Kodik bulk importer.

These tests exercise only local data transformations; they never contact Kodik.
"""
from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "import-kodik-bulk.py"

# requests is used by the CLI paths, but none of these unit tests make HTTP calls.
with patch.dict(sys.modules, {"requests": types.ModuleType("requests")}):
    spec = importlib.util.spec_from_file_location("kodik_bulk_import", SCRIPT)
    assert spec and spec.loader
    importer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(importer)


def source(provider: str, url: str, **overrides) -> dict:
    value = {
        "id": f"{provider}:episode:1",
        "label": provider,
        "providerId": provider,
        "providerName": provider,
        "kind": "embed",
        "embedUrl": url,
    }
    value.update(overrides)
    return value


class NormalizeAndMatchTests(unittest.TestCase):
    def test_normalizes_protocol_relative_episode_links(self):
        self.assertEqual(
            importer.normalize_link({"link": "//kodik.example/serial/123"}),
            "https://kodik.example/serial/123",
        )

    def test_rejects_relative_or_non_http_links(self):
        self.assertIsNone(importer.normalize_link("/episode/1"))
        self.assertIsNone(importer.normalize_link("javascript:alert(1)"))
        self.assertIsNone(importer.normalize_link(" "))

    def test_episode_extraction_respects_catalog_episode_bounds(self):
        found = importer.extract_episode_links(
            {
                "type": "anime-serial",
                "episodes": [
                    {"episode": 1, "link": "https://kodik.example/e1"},
                    {"episode": 2, "link": "https://kodik.example/e2"},
                    {"episode": 13, "link": "https://kodik.example/e13"},
                    {"episode": 0, "link": "https://kodik.example/e0"},
                    {"episode": 3, "link": "javascript:alert(1)"},
                ],
            },
            expected_episodes=2,
        )
        self.assertEqual(
            found,
            {
                1: "https://kodik.example/e1",
                2: "https://kodik.example/e2",
            },
        )

    def test_does_not_merge_seasons_that_reuse_episode_numbers(self):
        found = importer.extract_episode_links(
            {
                "type": "anime-serial",
                "seasons": [
                    {"episodes": {
                        "1": {"link": "https://kodik.example/season1-ep1"},
                        "2": {"link": "https://kodik.example/season1-ep2"},
                    }},
                    {"episodes": {
                        "1": {"link": "https://kodik.example/season2-ep1"},
                        "2": {"link": "https://kodik.example/season2-ep2"},
                    }},
                ],
            },
            expected_episodes=2,
        )
        self.assertEqual(found, {})

    def test_duplicate_catalog_candidates_are_resolved_by_episode_count(self):
        selected = importer.match_title(
            {
                "type": "anime-serial",
                "episodes": [{"episode": 12, "link": "https://kodik.example/e12"}],
            },
            [
                {"slug": "series-12", "type": "tv", "episodes": 12},
                {"slug": "series-24", "type": "tv", "episodes": 24},
            ],
        )
        self.assertEqual(selected["slug"], "series-12")

    def test_ambiguous_catalog_candidates_are_not_guessed(self):
        selected = importer.match_title(
            {
                "type": "anime-serial",
                "episodes": [{"episode": 12, "link": "https://kodik.example/e12"}],
            },
            [
                {"slug": "series-a", "type": "tv", "episodes": 12},
                {"slug": "series-b", "type": "tv", "episodes": 12},
            ],
        )
        self.assertIsNone(selected)


class MergeEpisodeTests(unittest.TestCase):
    def test_refreshes_expired_existing_link_even_when_no_url_is_added(self):
        url = "https://kodik.example/serial/1"
        original = source("kodik", url)
        store = {
            "ep:series:1": {
                "at": 1,
                "ttlMs": 1000,
                "sources": {
                    "sources": [original],
                    "sourcesUsed": ["kodik"],
                    "fromCache": False,
                },
            }
        }

        changed, added = importer.merge_episode(
            store, "series", 1, [source("kodik", url, label="Fresh Kodik label")]
        )

        entry = store["ep:series:1"]
        self.assertTrue(changed)
        self.assertEqual(added, 0)
        self.assertGreater(entry["at"], 1)
        self.assertEqual(entry["ttlMs"], max(importer.CACHE_TTL_MS, 1000))
        self.assertEqual(len(entry["sources"]["sources"]), 1)

    def test_same_url_from_different_providers_is_not_silently_dropped(self):
        url = "https://player.example/episode/1"
        store = {
            "ep:series:1": {
                "at": 1,
                "ttlMs": 1000,
                "sources": {
                    "sources": [source("cvh", url)],
                    "sourcesUsed": ["cvh"],
                },
            }
        }

        changed, added = importer.merge_episode(
            store, "series", 1, [source("kodik", url)]
        )

        self.assertTrue(changed)
        self.assertEqual(added, 1)
        providers = {
            item["providerId"]
            for item in store["ep:series:1"]["sources"]["sources"]
        }
        self.assertEqual(providers, {"cvh", "kodik"})

    def test_existing_longer_ttl_is_preserved(self):
        url = "https://kodik.example/serial/1"
        long_ttl = 365 * 24 * 60 * 60 * 1000
        store = {
            "ep:series:1": {
                "at": 1,
                "ttlMs": long_ttl,
                "sources": {"sources": [source("kodik", url)]},
            }
        }

        changed, added = importer.merge_episode(
            store, "series", 1, [source("kodik", url)]
        )

        self.assertTrue(changed)
        self.assertEqual(added, 0)
        self.assertEqual(store["ep:series:1"]["ttlMs"], long_ttl)

    def test_empty_or_synthetic_only_input_does_not_refresh_cache(self):
        entry = {
            "at": 1,
            "ttlMs": 1000,
            "sources": {
                "sources": [source("kodik", "https://kodik.example/serial/1")],
                "sourcesUsed": ["kodik"],
            },
        }
        store = {"ep:series:1": entry.copy()}
        before = repr(store)

        changed, added = importer.merge_episode(store, "series", 1, [])
        self.assertFalse(changed)
        self.assertEqual(added, 0)
        self.assertEqual(repr(store), before)

        changed, added = importer.merge_episode(
            store,
            "series",
            1,
            [source("demo", "https://demo.example/video", guessed=True)],
        )
        self.assertFalse(changed)
        self.assertEqual(added, 0)
        self.assertEqual(repr(store), before)


if __name__ == "__main__":
    unittest.main()
