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
  push*)
    [ "${FAKE_PUSH_FAIL:-0}" = "1" ] && exit 1 || exit 0
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
    if [ "${FAKE_POST_CODE:-201}" = "422" ]; then
      body='{"message":"Validation Failed"}'
      code=422
    else
      body='{"html_url":"https://github.com/TestOwner/TestRepo/pull/7"}'
      code=201
    fi
    ;;
  *)
    if [ "${FAKE_GET_CODE:-200}" != "200" ]; then
      body='{"message":"server error"}'
      code="${FAKE_GET_CODE}"
    elif [ "${FAKE_EXISTING_PR:-0}" = "1" ]; then
      body='[{"html_url":"https://github.com/TestOwner/TestRepo/pull/5"}]'
      code=200
    else
      body='[]'
      code=200
    fi
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
            # Invoke through bash: Windows/NTFS does not preserve the POSIX exec
            # bit, but the helper resolves `git` from PATH *inside* bash, where a
            # shebang script is executable. This keeps the test meaningful on
            # both Windows and Linux instead of skipping the whole suite.
            probe = subprocess.run(
                [BASH, str(fake_git), "probe"],
                env={**os.environ, "FAKE_GIT_LOG": str(probe_log)},
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
            )
            executable = probe.returncode == 0
        except OSError:
            executable = False
        finally:
            probe_log.unlink(missing_ok=True)
        if not executable:
            self.skipTest("bash не может исполнить fake git — проверяется в Linux CI")

    def run_helper(self, **overrides):
        env = {
            **os.environ,
            "GIT_BIN": str(self.bin_dir / "git"),
            "CURL_BIN": str(self.bin_dir / "curl"),
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
            cwd=self.root,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
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

    def test_helper_has_executable_bit_in_git_index(self):
        if os.name == "nt":
            self.skipTest("Windows/NTFS не хранит POSIX exec-бит; проверяется в Linux CI")
        self.assertTrue(os.access(HELPER, os.X_OK), f"{HELPER} must be executable")

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

    def test_existing_bot_branch_is_updated_with_force_with_lease(self):
        result = self.run_helper(FAKE_BRANCH_EXISTS="1")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        pushes = [line for line in self.git_commands() if line.startswith("push ")]
        self.assertTrue(pushes, self.git_commands())
        self.assertTrue(
            any("--force-with-lease=refs/heads/automation/catalog-sync:" in line for line in pushes),
            pushes,
        )
        self.assertFalse(any("HEAD:main" in line for line in pushes), pushes)

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

    def test_push_failure_fails_closed_without_pr_call(self):
        result = self.run_helper(FAKE_PUSH_FAIL="1")

        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.curl_commands(), [])

    def test_github_read_error_fails_closed_without_post(self):
        result = self.run_helper(FAKE_GET_CODE="500")

        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("HTTP 500", result.stderr)
        self.assertFalse(any("-X POST" in line for line in self.curl_commands()), self.curl_commands())

    def test_pr_validation_error_fails_closed_when_no_existing_pr(self):
        result = self.run_helper(FAKE_POST_CODE="422")

        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("HTTP 422", result.stderr)

    def test_workflows_never_push_to_main_and_request_pr_permission(self):
        for name in ("sync-catalog.yml", "repair-catalog-descriptions.yml", "hydrate.yml"):
            text = (ROOT / ".github" / "workflows" / name).read_text(encoding="utf-8")
            self.assertIn("pull-requests: write", text, name)
            self.assertNotIn("HEAD:main", text, name)
            self.assertNotIn("push-catalog-commit.sh", text, name)
            if name == "sync-catalog.yml":
                self.assertIn("Preserve catalog batch on failure", text)

    def test_helper_never_contains_direct_main_push(self):
        code_lines = [
            line
            for line in HELPER.read_text(encoding="utf-8").splitlines()
            if not line.lstrip().startswith("#")
        ]
        code = "\n".join(code_lines)
        self.assertNotIn("HEAD:main", code)
        self.assertNotIn("push --force origin HEAD:main", code)


if __name__ == "__main__":
    unittest.main()
