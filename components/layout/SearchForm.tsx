'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDebouncedValue } from '@/lib/hooks';
import { IconSearch } from '@/components/ui/icons';

/** Живой поиск: дебаунс + замена URL без полной перезагрузки навигации. */
export function SearchForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const debounced = useDebouncedValue(value, 300);
  const router = useRouter();

  useEffect(() => {
    const url = debounced ? `/search?q=${encodeURIComponent(debounced)}` : '/search';
    router.replace(url, { scroll: false });
  }, [debounced, router]);

  /* S5: цель Метрики «search» — первый непустой запрос сессии ввода
     (событие aninova:goal ловит components/system/Metrika.tsx). */
  const prevDebounced = useRef(debounced);
  useEffect(() => {
    if (debounced.trim() && !prevDebounced.current.trim()) {
      window.dispatchEvent(new CustomEvent('aninova:goal', { detail: 'search' }));
    }
    prevDebounced.current = debounced;
  }, [debounced]);

  return (
    <form className="search-form" role="search" onSubmit={(e) => e.preventDefault()}>
      <IconSearch size={17} />
      <input
        className="input"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Название, жанр или год…"
        aria-label="Поисковый запрос"
        autoFocus
      />
    </form>
  );
}
