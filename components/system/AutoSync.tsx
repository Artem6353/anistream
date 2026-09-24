'use client';

import { useEffect, useRef } from 'react';
import { useLibrary } from '@/lib/library';
import { SessionExpiredError, getToken, isSessionValid, pushLocal } from '@/lib/sync';

const DEBOUNCE_MS = 10_000;
/**
 * Жёсткий потолок ожидания. Причина: PlayerShell пишет историю каждые 5 секунд,
 * пока открыт плеер, — «чистый» trailing-debounce на 10 с в таких условиях не
 * сработает НИКОГДА (каждый тик переносит таймер). Поэтому: debounce 10 с для
 * одиночных изменений (списки, ручные правки), но не реже раза в MAX_WAIT_MS
 * при непрерывных изменениях. Итог: ≤ 2 пуша в минуту при просмотре.
 */
const MAX_WAIT_MS = 30_000;

/**
 * Фоновая автосинхронизация локальной библиотеки (списки + история) с
 * Supabase — без кнопок. Ничего не рендерит, монтируется один раз в
 * app/layout.tsx. Кнопки в SyncSection остаются как ручной fallback.
 *
 * Поведение:
 *  - первый рендер пропускаем (не пушим сразу после логина пустой стор);
 *  - без токена / с мёртвой сессией Supabase не дёргаем вообще;
 *  - ошибки глушим в console.warn (без тостов — чтобы не мешать просмотру);
 *  - на SessionExpiredError останавливаемся и не пытаемся логиниться;
 *    после повторного входа (сессия снова валидна) автосинк возобновляется.
 */
export function AutoSync() {
  const { history, lists } = useLibrary();
  const timerRef = useRef<number | null>(null);
  const firstRender = useRef(true);
  const stoppedRef = useRef(false);
  const pushingRef = useRef(false);
  const lastPushRef = useRef(0);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!getToken() || !isSessionValid()) return;
    stoppedRef.current = false; // сессия снова жива (перелогин) — разрешаем пуш

    if (timerRef.current) window.clearTimeout(timerRef.current);
    const sinceLast = Date.now() - lastPushRef.current;
    const wait = sinceLast >= MAX_WAIT_MS ? 0 : Math.min(DEBOUNCE_MS, MAX_WAIT_MS - sinceLast);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (stoppedRef.current || pushingRef.current) return;
      if (!getToken() || !isSessionValid()) return; // сессия умерла, пока ждали
      pushingRef.current = true;
      lastPushRef.current = Date.now();
      pushLocal(lists, history)
        .then((saved) => {
          console.info(`[autosync] pushed ${saved} rows (${Object.keys(lists).length} lists, ${history.length} history)`);
        })
        .catch((e: unknown) => {
          if (e instanceof SessionExpiredError) {
            stoppedRef.current = true; // не логинимся заново — просто останавливаемся
            console.warn('[autosync] session expired — stopped until next login');
          } else {
            console.warn('[autosync] failed:', e instanceof Error ? e.message : e);
          }
        })
        .finally(() => {
          pushingRef.current = false;
        });
    }, wait);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [history, lists]);

  return null;
}
