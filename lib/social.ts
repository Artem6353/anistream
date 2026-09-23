/**
 * Социальный слой: отзывы с оценкой + комментарии с ответами и лайками.
 * Два адаптера:
 *  - local (по умолчанию): localStorage, работает везде и сразу;
 *  - supabase (общий между посетителями): REST PostgREST без SDK,
 *    включается переменными NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *    (схема: supabase/schema.sql, бесплатно).
 * XSS-защита: текст рендерится только как text-node (React экранирует), HTML не пропускается.
 */

export interface ReviewItem {
  id: string;
  slug: string;
  name: string;
  rating: number | null; // 1..10 для отзывов, null для комментария
  text: string;
  ts: number;
  likes: number;
  dislikes: number;
  parent: string | null;
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const SOCIAL_MODE: 'supabase' | 'local' = SUPA_URL && SUPA_KEY ? 'supabase' : 'local';

const lsKey = (slug: string) => `anistream:reviews:${slug}`;

function lsLoad(slug: string): ReviewItem[] {
  try {
    return JSON.parse(localStorage.getItem(lsKey(slug)) ?? '[]') as ReviewItem[];
  } catch {
    return [];
  }
}

function lsSave(slug: string, items: ReviewItem[]) {
  localStorage.setItem(lsKey(slug), JSON.stringify(items));
}

export async function loadReviews(slug: string): Promise<ReviewItem[]> {
  if (SOCIAL_MODE === 'supabase') {
    try {
      const r = await fetch(`/api/social/reviews?slug=${encodeURIComponent(slug)}`);
      if (r.ok) {
        const j = await r.json();
        return (j.items ?? []) as ReviewItem[];
      }
    } catch {}
  }
  return lsLoad(slug).sort((a, b) => b.ts - a.ts);
}

export interface CaptchaChallenge {
  question: string;
  token: string;
}

export async function fetchCaptcha(): Promise<CaptchaChallenge | null> {
  try {
    const r = await fetch('/api/social/captcha');
    return r.ok ? ((await r.json()) as CaptchaChallenge) : null;
  } catch {
    return null;
  }
}

export async function addReview(
  item: Omit<ReviewItem, 'id' | 'ts' | 'likes' | 'dislikes'>,
  captcha?: { token: string; answer: number },
  turnstile?: string,
): Promise<{ item?: ReviewItem; error?: string }> {
  const full: ReviewItem = { ...item, id: crypto.randomUUID?.() ?? String(Date.now()), ts: Date.now(), likes: 0, dislikes: 0 };
  if (SOCIAL_MODE === 'supabase') {
    try {
      const r = await fetch('/api/social/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...full, captcha, turnstile }),
      });
      if (r.ok) return { item: ((await r.json()).item ?? full) as ReviewItem };
      return { error: ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'ошибка отправки' };
    } catch {
      return { error: 'сеть недоступна' };
    }
  }
  const items = lsLoad(item.slug);
  items.push(full);
  lsSave(item.slug, items);
  return { item: full };
}

export async function voteReview(slug: string, id: string, dir: 1 | -1): Promise<void> {
  if (SOCIAL_MODE === 'supabase') {
    try {
      const cur = await loadReviews(slug);
      const item = cur.find((x) => x.id === id);
      if (!item) return;
      const patch = dir === 1 ? { likes: item.likes + 1 } : { dislikes: item.dislikes + 1 };
      await fetch(`${SUPA_URL}/rest/v1/reviews?id=eq.${id}`, {
        method: 'PATCH',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return;
    } catch {}
  }
  const items = lsLoad(slug);
  const item = items.find((x) => x.id === id);
  if (!item) return;
  if (dir === 1) item.likes += 1;
  else item.dislikes += 1;
  lsSave(slug, items);
}
