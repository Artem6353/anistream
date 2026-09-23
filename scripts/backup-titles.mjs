/* A8.4: бэкап titles.json + кэша в локальную папку backups/ (или S3/R2 через rclone, см. LIMITS.md). */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
const stamp = new Date().toISOString().slice(0, 10);
mkdirSync('backups', { recursive: true });
const files = ['lib/data/titles.json', 'lib/data/manual-sources.json', '.cache/providers-resolve-cache.json', 'data/dmca.json', 'data/reports.json'];
for (const f of files) {
  if (!existsSync(f)) continue;
  const dest = `backups/${f.replace(/\//g, '_')}.${stamp}.bak`;
  copyFileSync(f, dest);
  console.log('✓', dest);
}
console.log('Готово. Для S3/R2: rclone copy backups/ remote:anistream-backups/ --config $RCLONE_CONFIG');
