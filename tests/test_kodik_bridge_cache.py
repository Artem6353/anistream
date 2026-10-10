"""Regression tests for bounded Kodik bridge cache eviction.

These tests import the bridge with a stub requests module and never contact Kodik.
"""
from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "bridges" / "kodik_bridge.py"

with patch.dict(sys.modules, {"requests": types.ModuleType("requests")}):
    spec = importlib.util.spec_from_file_location("kodik_bridge_cache_test_target", SCRIPT)
    assert spec and spec.loader
    bridge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bridge)


class KodikBridgeCacheTests(unittest.TestCase):
    def setUp(self):
        bridge._CACHE.clear()

    def test_prunes_expired_entries_before_evicting_fresh_entries(self):
        now = bridge.time.time()
        for index in range(5000):
            bridge._CACHE[f"expired-{index}"] = (now - 100, index, 1)

        bridge._store("fresh-key", {"sources": []})

        self.assertEqual(set(bridge._CACHE), {"fresh-key"})
        self.assertEqual(bridge._cached("fresh-key"), {"sources": []})

    def test_evicts_oldest_fresh_entries_instead_of_clearing_the_cache(self):
        now = bridge.time.time()
        for index in range(5000):
            # Every entry is younger than the cache TTL, but has a deterministic age.
            bridge._CACHE[f"fresh-{index}"] = (now - index / 10, index, bridge._CACHE_TTL)

        bridge._store("new-key", {"sources": ["new"]})

        self.assertEqual(len(bridge._CACHE), 4000)
        self.assertIn("fresh-0", bridge._CACHE)
        self.assertNotIn("fresh-4999", bridge._CACHE)
        self.assertIn("new-key", bridge._CACHE)

    def test_updating_an_existing_key_does_not_evict_other_entries(self):
        now = bridge.time.time()
        for index in range(5000):
            bridge._CACHE[f"entry-{index}"] = (now - index / 10, index, bridge._CACHE_TTL)

        bridge._store("entry-0", {"updated": True})

        self.assertEqual(len(bridge._CACHE), 5000)
        self.assertEqual(bridge._cached("entry-0"), {"updated": True})
        self.assertIn("entry-4999", bridge._CACHE)


if __name__ == "__main__":
    unittest.main()
