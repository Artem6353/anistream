import { cookies } from 'next/headers';

const COOKIE_NAME = 'ani_uid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

/** Только чтение: используется в GET-роутах, не создаёт cookie у случайных посетителей. */
export async function getUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

/** Чтение или создание: используется в POST-роутах, где нужна идентификация анонима. */
export async function getOrCreateUserId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;
  const uid = crypto.randomUUID();
  store.set(COOKIE_NAME, uid, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return uid;
}
