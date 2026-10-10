"""Offline regression tests for the catalog sync push-retry helper."""
from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "push-catalog-commit.sh"


class CatalogPushRetryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="catalog-push-retry-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.log_file = self.root / "git-commands.log"
        fake_git = self.bin_dir / "git"
        fake_git.write_text(
            """#!/usr/bin/env python3
import os
import sys
from pathlib import Path

args = sys.argv[1:]
log = Path(os.environ["FAKE_GIT_LOG"])
with log.open("a", encoding="utf-8") as stream:
    stream.write(" ".join(args) + "\\n")
lines = log.read_text(encoding="utf-8").splitlines()
if args and args[0] == "push" and os.environ.get("FAKE_FIRST_PUSH_FAIL") == "1":
    if sum(line.startswith("push ") for line in lines) == 1:
        raise SystemExit(1)
if args[:2] == ["rebase", "origin/main"] and os.environ.get("FAKE_REBASE_FAIL") == "1":
    raise SystemExit(1)
raise SystemExit(0)
""",
            encoding="utf-8",
        )
        fake_git.chmod(0o755)

    def run_helper(self, **overrides):
        env = {
            **os.environ,
            "PATH": str(self.bin_dir) + os.pathsep + os.environ.get("PATH", ""),
            "FAKE_GIT_LOG": str(self.log_file),
            **overrides,
        }
        return subprocess.run(
            ["bash", str(HELPER)],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_retries_push_after_fetch_and_rebase(self):
        result = self.run_helper(FAKE_FIRST_PUSH_FAIL="1")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = self.log_file.read_text(encoding="utf-8").splitlines()
        self.assertEqual(commands.count("push origin HEAD:main"), 2)
        self.assertIn("fetch origin main", commands)
        self.assertIn("rebase origin/main", commands)
        self.assertNotIn("push --force origin HEAD:main", commands)
        self.assertNotIn("push -f origin HEAD:main", commands)

    def test_conflicting_catalog_rebase_fails_closed_without_force_push(self):
        result = self.run_helper(
            FAKE_FIRST_PUSH_FAIL="1",
            FAKE_REBASE_FAIL="1",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("conflicts with latest main", result.stderr)
        commands = self.log_file.read_text(encoding="utf-8").splitlines()
        self.assertEqual(commands, [
            "push origin HEAD:main",
            "fetch origin main",
            "rebase origin/main",
            "rebase --abort",
        ])
        self.assertFalse(any("--force" in command or command.endswith(" -f") for command in commands))


if __name__ == "__main__":
    unittest.main()
