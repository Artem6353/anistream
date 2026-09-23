/* Импорт легаси-кэша прошлого проекта (multi-provider-embeds-*.json и kodik-bridge-cache.json)
   в кэш нового сайта (.cache/providers-resolve-cache.json).
   Использование:
     node scripts/import-legacy-cache.mjs <multi-provider-embeds.json> [kodik-bridge-cache.json]
   Форматы понимаются оба: новый (entries{"id:ep":{providers:{pid:{voiceovers}}}})
   и старый_bridge ({"{anilistId,episode}":{payload:{voiceovers}}}). */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const [multiPath, bridgePath] = process.argv.slice(2);
if (!multiPath && !bridgePath) {
  console.error('Usage: node scripts/import-legacy-cache.mjs <multi-provider-embeds.json> [kodik-bridge-cache.json]');
  process.exit(1);
}

const titles = JSON.parse(readFileSync(new URL('../lib/data/titles.json', import.meta.url), 'utf8'));
const slugById = new Map(titles.map((t) => [t.anilistId, t.slug]));
const epCount = new Map(titles.map((t) => [t.anilistId, t.episodes]));

const normUrl = (u) => (typeof u === 'string' && u.startsWith('//') ? `https:${u}` : u || null);
const voiceToSource = (v, pid, pname, tag) => {
  const url = normUrl(v.embedUrl);
  if (!url) return null;
  return {
    id: v.id || `${pid}:${tag}:${v.translationId ?? 'x'}:${url.slice(-20)}`,
    label: v.label || pname,
    providerId: pid,
    providerName: pname,
    kind: 'embed',
    embedUrl: url,
    translationId: String(v.translationId ?? ''),
    voice: v.kind === 'subs' || v.kind === 'subtitles' ? 'subtitles' : 'voice',
  };
};
const PNAME = { kodik: 'Kodik', cvh: 'CVH (AnimeGo)', aniboom: 'AniBoom' };

const cache = existsSync('.cache/providers-resolve-cache.json')
  ? JSON.parse(readFileSync('.cache/providers-resolve-cache.json', 'utf8'))
  : {};
let entries = 0;
let sources = 0;

if (multiPath) {
  const multi = JSON.parse(readFileSync(multiPath, 'utf8'));
  for (const ent of Object.values(multi.entries ?? {})) {
    const slug = slugById.get(ent.id);
    const ep = ent.episode || 1;
    if (!slug || ep > (epCount.get(ent.id) ?? 9999)) continue;
    const list = [];
    const skip = {};
    for (const [pid, prov] of Object.entries(ent.providers ?? {})) {
      const vos = prov.voiceovers ?? [];
      for (const v of vos) {
        const s = voiceToSource(v, pid, prov.providerName || PNAME[pid] || pid, 'legacy');
        if (s) list.push(s);
      }
      const [op, en] = [vos[0]?.opening, vos[0]?.ending];
      if (Array.isArray(op) && op.length === 2) skip.intro = [op[0] | 0, op[1] | 0];
      if (Array.isArray(en) && en.length === 2) skip.outro = [en[0] | 0, en[1] | 0];
    }
    if (!list.length) continue;
    cache[`ep:${slug}:${ep}`] = {
      at: Date.now(),
      ttlMs: 31_536_000_000,
      sources: { sources: list, sourcesUsed: [...new Set(list.map((s) => s.providerId))].sort(), fromCache: false, skip: Object.keys(skip).length ? skip : null },
    };
    entries++;
    sources += list.length;
  }
}

if (bridgePath) {
  const bridge = JSON.parse(readFileSync(bridgePath, 'utf8'));
  for (const [key, val] of Object.entries(bridge)) {
    let k;
    try {
      k = JSON.parse(key);
    } catch {
      continue;
    }
    const aid = Number(k.anilistId ?? 0);
    const ep = Number(k.episode ?? 1) || 1;
    const slug = slugById.get(aid);
    const ckey = `ep:${slug}:${ep}`;
    if (!slug || ep > (epCount.get(aid) ?? 9999) || cache[ckey]) continue;
    const payload = val?.payload;
    if (!payload?.ok) continue;
    const list = (payload.voiceovers ?? []).map((v) => voiceToSource({ ...v, id: null }, 'kodik', 'Kodik', 'legacy')).filter(Boolean);
    if (!list.length) continue;
    cache[ckey] = { at: Date.now(), ttlMs: 31_536_000_000, sources: { sources: list, sourcesUsed: ['kodik'], fromCache: false, skip: null } };
    entries++;
    sources += list.length;
  }
}

mkdirSync('.cache', { recursive: true });
writeFileSync('.cache/providers-resolve-cache.json', JSON.stringify(cache));
console.log(`импортировано записей: ${entries}, источников: ${sources}; всего в кэше: ${Object.keys(cache).length}`);
console.log('перезапустите сервер (npm run dev), чтобы cache-first подхватил новые записи');
