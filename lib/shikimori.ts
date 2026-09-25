/**
 * Клиент Shikimori (домен .io с 2026 г.): второй источник метаданных —
 * русские названия, описания и ids для поиска в Kodik (shikimori_id).
 * Используется скриптом обогащения датасета и (опционально) сервером.
 */

export interface ShikimoriBrief {
  id: number;
  name: string;
  russian: string | null;
  kind: string;
  score: number;
}

export interface ShikimoriFull extends ShikimoriBrief {
  description: string | null;
  screenshots: { original: string; preview: string }[];
}

const HOSTS = ['https://shikimori.io', 'https://shikimori.one'];
const ua = () => ({ 'User-Agent': process.env.SHIKIMORI_USER_AGENT ?? 'AniNova/2.0 (+http://localhost:3000)' });

async function get<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: ua(), next: { revalidate: 86400 } });
      if (!res.ok) throw new Error(`shikimori ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('shikimori unreachable');
}

export const searchAnime = (query: string, limit = 3) =>
  get<ShikimoriBrief[]>(`/api/animes?limit=${limit}&search=${encodeURIComponent(query)}`);

export const getAnime = (id: number) => get<ShikimoriFull>(`/api/animes/${id}`);

/** HTML → текст: теги долой, сущности базовые, пробелы сжаты. */
export function htmlToText(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const shikimoriUrl = (id: number) => `https://shikimori.io/animes/${id}`;

/** Нормализация имени для сопоставления тайтлов между базами. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^(the|a|an)/, '');
}
