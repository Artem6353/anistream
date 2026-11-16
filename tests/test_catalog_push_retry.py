"""Offline regression tests for the catalog sync push-retry helper."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "push-catalog-commit.sh"


def _find_bash() -> str | None:
    """Абсолютный путь к РАБОЧЕМУ bash (None — bash-а нет).

    Кроссплатформенность (аудит, P0-3): на Windows без WSL/Git Bash в
    `C:\\Windows\\System32\\bash.exe` лежит заглушка WSL, которая падает с
    «Windows для Linux не имеет установленных дистрибутивов». CreateProcess ищет
    её раньше, чем bash из PATH, поэтому запускаем по абсолютному пути из
    shutil.which, предварительно проверив его реальным запуском.
    """
    bash = shutil.which("bash")
    if not bash:
        return None
    try:
        probe = subprocess.run([bash, "-c", "exit 0"], capture_output=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return bash if probe.returncode == 0 else None


BASH = _find_bash()


@unittest.skipUnless(BASH, "нужен рабочий bash (Linux/macOS/WSL/Git Bash): helper — shell-скрипт")
class CatalogPushRetryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="catalog-push-retry-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.log_file = self.root / "git-commands.log"
        fake_git = self.bin_dir / "git"
        # Портативность (P0-3): раньше фейк-git был Python-скриптом с
        # `#!/usr/bin/env python3` — в Git Bash на Windows python3 нет (есть
        # только Windows-Store-заглушка), шебанг падал, helper
        # считал push ошибкой и тесты падали. Теперь — POSIX sh:
        # работает везде, где есть bash/sh (а он уже проверен для helper'а).
        fake_git.write_text(
            """#!/bin/sh
# Fake git для теста helper'а: логирует аргументы и эмулирует отказы.
args="$*"
printf '%s\\n' "$args" >> "$FAKE_GIT_LOG"
case "$args" in
  "push origin HEAD:main")
    if [ "${FAKE_FIRST_PUSH_FAIL:-0}" = "1" ]; then
      pushes=$(grep -c '^push origin HEAD:main' "$FAKE_GIT_LOG" || true)
      if [ "$pushes" -eq 1 ]; then exit 1; fi
    fi
    ;;
  "rebase origin/main")
    if [ "${FAKE_REBASE_FAIL:-0}" = "1" ]; then exit 1; fi
    ;;
esac
exit 0
""",
            encoding="utf-8",
            newline="\n",
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
            [BASH, str(HELPER)],
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
