'use client';

import { useState } from 'react';
import { Icon } from './Icon';

/* Кнопка-состояние карточки: демонстрирует «сохранено / не сохранено»
   без записи в БД. aria-pressed — чтобы состояние читалось скринридером. */
export function SaveButton({ label = 'В закладки', className }: { label?: string; className?: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <button type="button" className={className} aria-pressed={saved} onClick={() => setSaved((v) => !v)}>
      <Icon name="bookmark" size={15} filled={saved} />
      {saved ? 'В закладках' : label}
    </button>
  );
}
