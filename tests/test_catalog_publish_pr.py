"""Offline regression tests for the catalog PR publish helper.

The helper must never push to the protected `main` branch. It publishes the
current HEAD to a bot branch and reuses one rolling pull request.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "publish-catalog-changes.sh"
BASE_SHA = "1111111111111111111111111111111111111111"
HEAD_SHA = "2222222222222222222222222222222222222222"
REMOTE_SHA = "3333333333333333333333333333333333333333"


def _find_bash() -> str | None:
    """Working bash absolute path (None when the platform cannot run the helper)."""
    bash = shutil.which("bash")
    if not bash:
        return None
    try:
        probe = subprocess.run([bash, "-c", "exit 0"], capture_output=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return bash if probe.returncode == 0 else None


BASH = _find_bash()


@unittest.skipUnless(BASH, "нужен рабочий bash (Linux/macOS/WSL/Git Bash)")
class CatalogPublishPullRequestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="catalog-publish-pr-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.git_log = self.root / "git-commands.log"
        self.curl_log = self.root / "curl-commands.log"

        fake_git = self.bin_dir / "git"
        fake_git.write_text(
            """#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GIT_LOG"
case "$*" in
  "diff --quiet"|"diff --cached --quiet")
    [ "${FAKE_DIRTY:-0}" = "1" ] && exit 1 || exit 0
    ;;
  "rev-parse --verify --quiet refs/remotes/origin/main")
    exit 0
    ;;
  "rev-parse refs/remotes/origin/main")
    printf '%s\\n' "$FAKE_BASE_SHA"
    ;;
  "rev-parse HEAD")
    printf '%s\\n' "$FAKE_HEAD_SHA"
    ;;
  "rev-list --count refs/remotes/origin/main..HEAD")
    printf '%s\\n' "${FAKE_AHEAD:-0}"
    ;;
  "rev-parse refs/remotes/origin/automation/catalog-sync")
    printf '%s\\n' "$FAKE_REMOTE_SHA"
    ;;
  "fetch --quiet origin +refs/heads/automation/catalog-sync:refs/remotes/origin/automation/catalog-sync")
    exit 0
    ;;
  "show-ref --verify --quiet refs/remotes/origin/automation/catalog-sync")
    [ "${FAKE_BRANCH_EXISTS:-0}" = "1" ] && exit 0 || exit 1
    ;;
  "diff --stat refs/remotes/origin/main..HEAD")
    printf ' lib/data/titles.json | 2 +-\\n'
    ;;
  "diff --name-only refs/remotes/origin/main..HEAD")
    printf 'lib/data/titles.json\\n'
    ;;
esac
exit 0
""",
            encoding="utf-8",
            newline="\n",
        )
        fake_git.chmod(0o755)

        fake_curl = self.bin_dir / "curl"
        fake_curl.write_text(
            """#!/bin/sh
ALL="$*"
printf '%s\\n' "$ALL" >> "$FAKE_CURL_LOG"
out=""
fmt=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w) fmt="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$ALL" in
  *"-X POST"*)
    body='{"html_url":"https://github.com/TestOwner/TestRepo/pull/7"}'
    code=201
    ;;
  *)
    if [ "${FAKE_EXISTING_PR:-0}" = "1" ]; then
      body='[{"html_url":"https://github.com/TestOwner/TestRepo/pull/5"}]'
    else
      body='[]'
    fi
    code=200
    ;;
esac
[ -n "$out" ] && printf '%s' "$body" > "$out"
[ -n "$fmt" ] && printf '%s' "$code"
exit 0
""",
            encoding="utf-8",
            newline="\n",
        )
        fake_curl.chmod(0o755)

        # Windows/NTFS does not keep the exec bit MSYS/Git Bash expects; CI (Linux)
        # runs these tests fully, local Windows runs skip them (same as before).
        probe_log = self.root / "probe.log"
        try:
            probe = subprocess.run(
                [str(fake_git), "probe"],
                env={**os.environ, "FAKE_GIT_LOG": str(probe_log)},
                capture_output=True,
                text=True,
                timeout=30,
            )
            executable = probe.returncode == 0
        except OSError:
            executable = False
        finally:
            probe_log.unlink(missing_ok=True)
        if not executable:
            self.skipTest("платформа не исполняет POSIX-скрипт без exec-бита (Windows) — проверяется в CI")

    def run_helper(self, **overrides):
        env = {
            **os.environ,
            "PATH": str(self.bin_dir) + os.pathsep + os.environ.get("PATH", ""),
            "FAKE_GIT_LOG": str(self.git_log),
            "FAKE_CURL_LOG": str(self.curl_log),
            "FAKE_BASE_SHA": BASE_SHA,
            "FAKE_HEAD_SHA": HEAD_SHA,
            "FAKE_REMOTE_SHA": REMOTE_SHA,
            "FAKE_AHEAD": "2",
            "GITHUB_TOKEN": "test-token",
            "GITHUB_REPOSITORY": "TestOwner/TestRepo",
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

    def git_commands(self):
        if not self.git_log.exists():
            return []
        return self.git_log.read_text(encoding="utf-8").splitlines()

    def curl_commands(self):
        if not self.curl_log.exists():
            return []
        return self.curl_log.read_text(encoding="utf-8").splitlines()

    def test_publishes_bot_branch_and_creates_pr_without_touching_main(self):
        result = self.run_helper()

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = self.git_commands()
        pushes = [line for line in commands if line.startswith("push ")]
        self.assertTrue(pushes, commands)
        self.assertTrue(any("refs/heads/automation/catalog-sync" in line for line in pushes), pushes)
        self.assertFalse(any("HEAD:main" in line or ":main" in line for line in pushes), pushes)
        self.assertFalse(any("--force " in line or " -f " in line for line in pushes), pushes)
        self.assertIn("PR создан: https://github.com/TestOwner/TestRepo/pull/7", result.stdout)
        self.assertTrue(any("-X POST" in line for line in self.curl_commands()), self.curl_commands())

    def test_reuses_existing_open_pr(self):
        result = self.run_helper(FAKE_EXISTING_PR="1")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("PR уже открыт", result.stdout)
        self.assertFalse(any("-X POST" in line for line in self.curl_commands()), self.curl_commands())

    def test_nothing_to_publish_exits_without_push(self):
        result = self.run_helper(FAKE_AHEAD="0")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(any(line.startswith("push ") for line in self.git_commands()), self.git_commands())
        self.assertIn("PR не нужен", result.stdout)

    def test_dirty_worktree_fails_closed_before_push(self):
        result = self.run_helper(FAKE_DIRTY="1")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("незакоммиченные изменения", result.stderr)
        self.assertFalse(any(line.startswith("push ") for line in self.git_commands()), self.git_commands())


if __name__ == "__main__":
    unittest.main()
