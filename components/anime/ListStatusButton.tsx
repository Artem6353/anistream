'use client';

import { useEffect, useRef, useState } from 'react';
import { library, useLibrary } from '@/lib/library';
import { isSessionValid, syncConfigured } from '@/lib/sync';
import { requireAuth } from '@/lib/auth-gate';
import { trackEvent } from '@/lib/achievements';
import { useToast } from '@/components/ui/Toaster';
import type { ListStatus } from '@/lib/types';
import { LIST_STATUS_LABELS } from '@/lib/labels';
import { IconBookmark, IconCheck } from '@/components/ui/icons';

/** Кнопка-выпадашка списков просмотра (как «Добавить в список» на AnimeGO, но локально). */
export function ListStatusButton({ slug }: { slug: string }) {
  const { lists } = useLibrary();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = lists[slug];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="listbtn" ref={ref}>
      <button type="button" className={`btn btn--outline btn--md ${current ? 'is-active' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <IconBookmark size={15} />
        {current ? LIST_STATUS_LABELS[current] : 'Добавить в список'}
      </button>
      {open ? (
        <div className="listbtn__menu" role="menu">
          {(Object.keys(LIST_STATUS_LABELS) as ListStatus[]).map((st) => (
            <button
              key={st}
              type="button"
              role="menuitem"
              className={`listbtn__item ${current === st ? 'is-active' : ''}`}
              onClick={() => {
                const applyStatus = () => {
                  library.setListStatus(slug, st);
                  trackEvent('lists');
                  toast(`Список: ${LIST_STATUS_LABELS[st]}`);
                };
                // Без Supabase список локальный — регистрация не требуется.
                // Если синхронизация включена, действие ждёт успешного входа.
                if (syncConfigured()) requireAuth(isSessionValid, applyStatus);
                else applyStatus();
                setOpen(false);
              }}
            >
              {current === st ? <IconCheck size={14} /> : <span className="listbtn__spacer" />}
              {LIST_STATUS_LABELS[st]}
            </button>
          ))}
          {current ? (
            <button
              type="button"
              role="menuitem"
              className="listbtn__item listbtn__item--danger"
              onClick={() => {
                const removeStatus = () => {
                  library.setListStatus(slug, null);
                  toast('Удалено из списков');
                };
                if (syncConfigured()) requireAuth(isSessionValid, removeStatus);
                else removeStatus();
                setOpen(false);
              }}
            >
              Убрать из списков
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
