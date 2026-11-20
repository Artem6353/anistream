'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isNavigable, pickCandidate } from '@/lib/aninova3/spatial';

const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const K_FOCUS = 'a3:focus-map';
const K_VISITED = 'a3:visited';
const SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isTextEntry(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute('role') === 'slider' || el.getAttribute('role') === 'spinbutton') return true;
  return !!el.closest('[data-a3-native-keys]');
}

function readMap(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(K_FOCUS) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, string>) {
  try {
    sessionStorage.setItem(K_FOCUS, JSON.stringify(map));
  } catch {
    /* приватный режим */
  }
}

/** Активный оверлей (поиск, меню) — навигация не должна уходить в фон. */
function overlayScope(): HTMLElement | null {
  const list = Array.from(document.querySelectorAll<HTMLElement>('[data-a3-overlay="true"]'));
  return list.length ? list[list.length - 1] : null;
}

function activeScope(): HTMLElement | null {
  return overlayScope() ?? document.querySelector<HTMLElement>('[data-a3-nav-root]');
}

/**
 * Единый сбор фокусируемых элементов: один и тот же порядок и один и тот же
 * id для focusin и для стрелок. Иначе индексные id из разных списков совпадают
 * и фокус «залипает» на одном элементе.
 */
function stableId(el: HTMLElement, index: number): string {
  const explicit = el.dataset.a3Key;
  if (explicit) return `k:${explicit}`;
  const cls = (el.className || '').split(' ')[0];
  const href = el.getAttribute('href');
  if (href) return `h:${href}#${cls}`;
  const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48);
  if (label) return `t:${el.tagName}:${cls}:${label}`;
  return `i:${index}`;
}

function collect(scope: HTMLElement, path: string): HTMLElement[] {
  const items = Array.from(scope.querySelectorAll<HTMLElement>(SELECTOR)).filter(
    (el) => isNavigable(el) && !el.closest('[data-a3-skip-focus]'),
  );
  /* Одинаковые href (логотип и «Главная») различаем классом и номером вхождения:
     id не должен зависеть от индекса в списке, иначе после возврата фокус уезжает. */
  const seen = new Map<string, number>();
  items.forEach((el, i) => {
    const base = stableId(el, i);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    el.dataset.a3FocusId = `${path}#${base}~${n}`;
  });
  return items;
}

/** D-pad: стрелки, Enter/OK (нативный), Back/Escape, восстановление фокуса. */
export function RemoteNav({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  // Запоминаем, где был фокус на каждом маршруте — чтобы вернуться туда после «назад».
  useEffect(() => {
    if (!enabled) return;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el === document.body) return;
      if (!el.matches(SELECTOR)) return;
      const scope = el.closest<HTMLElement>('[data-a3-nav-root]');
      if (!scope) return;
      collect(scope, pathname);
      const id = el.dataset.a3FocusId;
      if (!id) return;
      const map = readMap();
      map[pathname] = id;
      saveMap(map);
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [enabled, pathname]);

  // Возврат на ранее посещённый маршрут: восстанавливаем логичную позицию.
  useEffect(() => {
    if (!enabled) return;
    try {
      const visited = new Set<string>(JSON.parse(sessionStorage.getItem(K_VISITED) ?? '[]'));
      visited.add(pathname);
      sessionStorage.setItem(K_VISITED, JSON.stringify([...visited]));
    } catch {}
    const t = setTimeout(() => {
      const id = readMap()[pathname];
      if (!id) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      const scope = document.querySelector<HTMLElement>('[data-a3-nav-root]');
      if (!scope) return;
      collect(scope, pathname);
      document.querySelector<HTMLElement>(`[data-a3-focus-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: false });
    }, 90);
    return () => clearTimeout(t);
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;

      if (e.key === 'Escape' || e.key === 'GoBack') {
        // Оверлей закрывает себя сам; сюда событие доходит, только если его нет.
        if (overlayScope()) return;
        e.preventDefault();
        router.back();
        return;
      }

      if (isTextEntry(target)) return;

      const dir = ARROWS[e.key];
      if (!dir) return;

      /* Плеер: сцена сама обрабатывает ←/→ как перемотку. На кнопках контролов
         стрелки двигают фокус, а window-обработчик PlayerShell не должен
         параллельно перематывать видео — поэтому гасим всплытие. */
      const inPlayer = target?.closest<HTMLElement>('[data-a3-player]') ?? null;
      if (inPlayer && target?.hasAttribute('data-a3-stage')) return;

      const scope = activeScope();
      if (!scope) return;
      const current = document.activeElement as HTMLElement | null;
      const inScope = current && current !== document.body && scope.contains(current) ? current : null;
      const items = collect(scope, pathname);
      if (!items.length) return;

      if (!inScope) {
        // Старт с пульта: Down/Right ведут к первому элементу, Up/Left — к последнему.
        e.preventDefault();
        (dir === 'down' || dir === 'right' ? items[0] : items[items.length - 1]).focus();
        return;
      }

      const box = inScope.getBoundingClientRect();
      const candidates = items
        .filter((el) => el !== inScope)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.dataset.a3FocusId as string,
            box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            group: el.closest<HTMLElement>('[data-a3-group]')?.dataset.a3Group ?? null,
          };
        });
      const group = inScope.closest<HTMLElement>('[data-a3-group]')?.dataset.a3Group ?? null;
      const nextId = pickCandidate(
        { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        candidates,
        dir,
        { group },
      );
      if (!nextId) {
        if (inPlayer) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      const next = items.find((el) => el.dataset.a3FocusId === nextId);
      if (!next) return;
      e.preventDefault();
      if (inPlayer) e.stopPropagation();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, pathname, router]);

  return null;
}
