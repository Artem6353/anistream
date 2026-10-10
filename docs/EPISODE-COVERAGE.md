# Episode source coverage

The catalog's episodes field is the expected episode count, not proof that a playable source exists.

Run a read-only local audit from the project root:

```powershell
npm run audit:episodes
```

The report is saved to .cache/episode-coverage-report.json. It lists missing episode ranges per title without copying raw player URLs. Upcoming titles and hidden titles are excluded by default; include them explicitly with:

```powershell
npm run audit:episodes -- --include-upcoming --include-hidden
```

The audit makes no provider requests, does not alter the catalog or cache, and does not verify that third-party player URLs still work. Guessed, synthesized and demo entries do not count as confirmed episodes.

## Local cache versus production

When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are configured, production uses Upstash instead of the local JSON cache. In that case, this report only describes the local file and is not a production coverage report. The local import must be migrated separately, using the existing migration's dry-run size and command checks first and a write-capable token. Never assume that finishing a local import made those links live on Vercel.
