'use client';

import { useEffect } from 'react';
import { reloadLibrary } from '@/lib/library';
import { AUTH_CHANGE_EVENT } from '@/lib/auth-gate';

/** Фикс пер-аккаунт данных: при входе/выходе/смене аккаунта перечитывает библиотеку
    (история/списки/закладки/настройки) из ключа нового scope; ачивки/стрик/счётчики
    читаются динамически по scope-ключу при каждом обращении. */
export function ScopeSync() {
  useEffect(() => {
    const h = () => reloadLibrary();
    window.addEventListener(AUTH_CHANGE_EVENT, h);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, h);
  }, []);
  return null;
}
