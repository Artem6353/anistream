'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/* Переключатель «список / сетка» без повторного рендера серверного контента:
   состояние живёт в data-view контейнера, вид — в CSS концепции. */
export function ViewToggle({
  targetId,
  label,
  initial = 'list',
}: {
  targetId: string;
  label?: string;
  initial?: 'list' | 'grid';
}) {
  const [view, setView] = useState<'list' | 'grid'>(initial);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.dataset.view = view;
  }, [view, targetId]);

  return (
    <div className="vt" role="group" aria-label={label ?? 'Вид каталога'} data-proto-view-toggle>
      <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} title="Списком">
        <Icon name="list" size={15} />
        <span className="sr-only">Списком</span>
      </button>
      <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} title="Сеткой">
        <Icon name="grid" size={15} />
        <span className="sr-only">Сеткой</span>
      </button>
    </div>
  );
}
