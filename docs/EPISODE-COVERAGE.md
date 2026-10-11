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

## Compact production cache

Episode-cache values written to Upstash use a lossless, versioned compressed JSON format (`z1:` prefix). The reader remains compatible with older uncompressed JSON values. The migration dry-run calculates the actual encoded value size and estimated index size; it still only reports measurements and never writes to Redis. Values are merged by provider and URL before encoding, so previously stored voice tracks are retained. Episode availability reads use bounded MGET batches instead of one Redis request per episode. The guarded migration offers a retention-days setting (default 30, maximum 365) that extends only entries which are still fresh at migration time; this prevents the imported seed from expiring according to its old 24-hour file-cache TTL. A later live re-resolution may replace an entry with the runtime-configured TTL.


Before applying the migration, the workflow verifies that the public production `/api/health` endpoint reports `providerCache.episodeCacheFormatVersion=1`. This avoids writing compressed records while an older production deployment is still unable to decode them. If Vercel deployment is rate-limited or the health response does not advertise this version, the apply run stops before any Redis writes.
