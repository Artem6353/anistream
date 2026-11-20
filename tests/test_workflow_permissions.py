"""Guard: every GitHub Actions workflow declares least-privilege permissions.

The repository previously relied on the account default token permissions for six
workflows. CodeQL flags missing workflow permissions because a default of
`write-all` gives every step more access than it needs. This test fails closed
when a workflow has no top-level `permissions:` block or omits `contents:`.

Deliberately dependency-free: CI's Python job does not install PyYAML.
"""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


def top_level_permissions(text: str) -> dict[str, str] | None:
    """Parse the top-level `permissions:` mapping without a YAML dependency."""
    lines = text.splitlines()
    start = None
    for index, line in enumerate(lines):
        if line == "permissions:":
            start = index
            break
    if start is None:
        return None

    result: dict[str, str] = {}
    for line in lines[start + 1 :]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" "):
            break
        key, _, value = line.strip().partition(":")
        if key:
            result[key.strip()] = value.strip()
    return result


class WorkflowPermissionsTests(unittest.TestCase):
    def test_every_workflow_declares_contents_permission(self):
        workflows = sorted(WORKFLOWS.glob("*.yml"))
        self.assertGreater(len(workflows), 10)

        missing: list[str] = []
        for path in workflows:
            permissions = top_level_permissions(path.read_text(encoding="utf-8"))
            if permissions is None:
                missing.append(f"{path.name}: no top-level permissions")
                continue
            if "contents" not in permissions:
                missing.append(f"{path.name}: permissions.contents missing")
            if permissions.get("contents") == "write-all":
                missing.append(f"{path.name}: contents: write-all is forbidden")

        self.assertEqual(missing, [], "\n".join(missing))

    def test_pr_publishers_request_pull_requests_write(self):
        # Этот контракт действует только после merge PR-flow-ветки, где появился
        # scripts/publish-catalog-changes.sh. На main helper'а ещё нет.
        if not (ROOT / "scripts" / "publish-catalog-changes.sh").exists():
            self.skipTest("PR-publisher ещё не добавлен (проверяется после merge PR-flow)")
        for name in ("sync-catalog.yml", "repair-catalog-descriptions.yml", "hydrate.yml"):
            permissions = top_level_permissions((WORKFLOWS / name).read_text(encoding="utf-8"))
            self.assertIsNotNone(permissions, name)
            self.assertEqual(permissions.get("pull-requests"), "write", name)

    def test_no_workflow_pushes_directly_to_main(self):
        offenders: list[str] = []
        for path in sorted(WORKFLOWS.glob("*.yml")):
            text = path.read_text(encoding="utf-8")
            for number, line in enumerate(text.splitlines(), start=1):
                if line.lstrip().startswith("#"):
                    continue
                if "HEAD:main" in line or "push --force" in line:
                    offenders.append(f"{path.name}:{number}: {line.strip()}")
        self.assertEqual(offenders, [], "\n".join(offenders))


if __name__ == "__main__":
    unittest.main()
