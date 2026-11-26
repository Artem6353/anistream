import { createHash } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item !== undefined) result[key] = sortValue(item);
    }
    return result;
  }
  return value;
}

export function hashObject(value: unknown): string {
  return sha256(canonicalJson(value));
}

/** Deterministic internal UUID. It is a hash of an internal key, not a source id. */
export function stableUuid(key: string): string {
  const hex = sha256(`aninova:b3b:${key}`);
  const bytes = hex.slice(0, 32).split('');
  bytes[12] = '5';
  bytes[16] = ((parseInt(bytes[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = bytes.join('');
  return [value.slice(0, 8), value.slice(8, 12), value.slice(12, 16), value.slice(16, 20), value.slice(20, 32)].join('-');
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizedTitle(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase('ru-RU');
}

export function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://') && value.length <= 2000;
}

export function hasCyrillic(value: string): boolean {
  return /[А-Яа-яЁё]/.test(value);
}

export function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

export function asIsoDate(value: unknown, fallback?: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') return fallback ?? null;
  const raw = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback ?? null;
  return parsed.toISOString();
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
