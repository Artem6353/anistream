#!/usr/bin/env bash
set -euo pipefail

# Push the current catalog batch without overwriting remote history.
# A concurrent merge can advance main after checkout; in that case rebase
# the single local batch commit and retry. Conflicting JSON changes fail closed.
attempt=1
while [[ "$attempt" -le 3 ]]; do
  if git push origin HEAD:main; then
    exit 0
  fi

  echo "::warning::Catalog push rejected; fetching main and rebasing (attempt $attempt/3)." >&2
  git fetch origin main

  if ! git rebase origin/main; then
    git rebase --abort || true
    echo "::error::Catalog batch conflicts with latest main; no force-push attempted. Review the conflict and rerun." >&2
    exit 1
  fi

  attempt=$((attempt + 1))
done

echo "::error::Catalog push failed after three attempts." >&2
exit 1
