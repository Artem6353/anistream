'use client';

/** Auth-gate (ТЗ блок 14): если действие требует входа, а пользователь не залогинен —
    действие ставится в очередь и открывается модалка входа; после успешного входа
    действие выполняется автоматически. */
let pendingAction: (() => void) | null = null;

export const OPEN_AUTH_EVENT = 'anistream:open-auth';
export const AUTH_CHANGE_EVENT = 'anistream:auth-change';

export function queueAuthAction(fn: () => void) {
  pendingAction = fn;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT));
}

export function takeAuthAction(): (() => void) | null {
  const fn = pendingAction;
  pendingAction = null;
  return fn;
}

export function onOpenAuth(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(OPEN_AUTH_EVENT, h);
  return () => window.removeEventListener(OPEN_AUTH_EVENT, h);
}

export function notifyAuthChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
}

/** Требовать вход перед действием: fn выполнится сразу (если залогинен) или после входа. */
export function requireAuth(isLogged: () => boolean, fn: () => void) {
  if (isLogged()) fn();
  else queueAuthAction(fn);
}
