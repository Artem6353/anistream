import { deflateRawSync, inflateRawSync } from 'node:zlib';

const PREFIX = 'z1:';
const MAX_INFLATED_BYTES = 1_000_000;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const SOURCE_FIELDS = [
  ['id', 'i'],
  ['label', 'l'],
  ['providerId', 'p'],
  ['providerName', 'n'],
  ['kind', 'k'],
  ['embedUrl', 'e'],
  ['files', 'f'],
  ['translationId', 't'],
  ['voice', 'v'],
  ['guessed', 'g'],
  ['synthesized', 'y'],
  ['contentType', 'c'],
];
const EPISODE_META_FIELDS = [
  ['sourcesUsed', 'u'],
  ['fromCache', 'f'],
  ['cachedAt', 'c'],
  ['skip', 'k'],
  ['errors', 'e'],
  ['providerChecks', 'p'],
];
const SOURCE_KNOWN = new Set(SOURCE_FIELDS.map(([key]) => key));
const EPISODE_META_KNOWN = new Set(['sources', ...EPISODE_META_FIELDS.map(([key]) => key)]);
const RECORD_KNOWN = new Set(['at', 'ttlMs', 'sources']);

function extraFields(value, known) {
  const extra = {};
  for (const [key, child] of Object.entries(value)) {
    if (!known.has(key)) extra[key] = child;
  }
  return Object.keys(extra).length ? extra : undefined;
}

function compactSource(source) {
  if (!isRecord(source)) return { r: source };
  const compact = {};
  for (const [key, shortKey] of SOURCE_FIELDS) {
    if (hasOwn(source, key) && source[key] !== undefined) compact[shortKey] = source[key];
  }
  const extras = extraFields(source, SOURCE_KNOWN);
  if (extras) compact.x = extras;
  return compact;
}

function expandSource(compact) {
  if (!isRecord(compact)) return compact;
  if (hasOwn(compact, 'r')) return compact.r;
  const source = isRecord(compact.x) ? { ...compact.x } : {};
  for (const [key, shortKey] of SOURCE_FIELDS) {
    if (hasOwn(compact, shortKey)) source[key] = compact[shortKey];
  }
  return source;
}

function compactRecord(record) {
  if (!isRecord(record) || !isRecord(record.sources)) {
    throw new TypeError('Episode cache record must be an object with a sources object.');
  }
  const meta = record.sources;
  const compact = { v: 1, s: (Array.isArray(meta.sources) ? meta.sources : []).map(compactSource) };

  if (hasOwn(record, 'at') && record.at !== undefined) compact.a = record.at;
  if (hasOwn(record, 'ttlMs') && record.ttlMs !== undefined) compact.t = record.ttlMs;

  for (const [key, shortKey] of EPISODE_META_FIELDS) {
    if (hasOwn(meta, key) && meta[key] !== undefined) compact[shortKey] = meta[key];
  }

  const metaExtras = extraFields(meta, EPISODE_META_KNOWN);
  if (metaExtras) compact.m = metaExtras;

  const recordExtras = extraFields(record, RECORD_KNOWN);
  if (recordExtras) compact.x = recordExtras;
  return compact;
}

function expandRecord(compact) {
  if (!isRecord(compact) || compact.v !== 1 || !Array.isArray(compact.s)) {
    throw new TypeError('Unsupported compressed episode cache format.');
  }
  const record = isRecord(compact.x) ? { ...compact.x } : {};
  if (hasOwn(compact, 'a')) record.at = compact.a;
  if (hasOwn(compact, 't')) record.ttlMs = compact.t;

  const meta = isRecord(compact.m) ? { ...compact.m } : {};
  meta.sources = compact.s.map(expandSource);
  for (const [key, shortKey] of EPISODE_META_FIELDS) {
    if (hasOwn(compact, shortKey)) meta[key] = compact[shortKey];
  }
  record.sources = meta;
  return record;
}

/**
 * Losslessly compress one episode cache record into a versioned "z1:" value.
 * Unknown fields are retained under extension maps, so newer readers can add
 * metadata without silently losing it during a round-trip.
 */
export function encodeEpisodeCacheValue(record) {
  const json = JSON.stringify(compactRecord(record));
  if (typeof json !== 'string') throw new TypeError('Episode cache record is not serializable.');
  return PREFIX + deflateRawSync(Buffer.from(json, 'utf8')).toString('base64');
}

/**
 * Decode the current compact format, while remaining compatible with legacy
 * uncompressed JSON values already stored in Redis.
 */
export function decodeEpisodeCacheValue(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Episode cache value must be a non-empty string.');
  }

  let parsed;
  if (value.startsWith(PREFIX)) {
    const encoded = value.slice(PREFIX.length);
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new TypeError('Compressed episode cache value is not valid base64.');
    }
    let raw;
    try {
      raw = inflateRawSync(Buffer.from(encoded, 'base64'), { maxOutputLength: MAX_INFLATED_BYTES });
    } catch {
      throw new TypeError('Compressed episode cache value could not be inflated.');
    }
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new TypeError('Compressed episode cache payload is not valid JSON.');
    }
    return expandRecord(parsed);
  }

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError('Episode cache value is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new TypeError('Episode cache value has an invalid shape.');
  return parsed;
}

export const EPISODE_CACHE_COMPRESSION_PREFIX = PREFIX;
