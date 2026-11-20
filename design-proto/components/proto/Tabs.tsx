'use client';

import { useId, useRef, useState, type ReactNode } from 'react';

export type TabItem = { id: string; label: string; content: ReactNode };

/* Вкладки: одна логика, разный вид через классы концепции.
   Панели приходят с сервера как ReactNode — клиентского рендера контента нет. */
export function Tabs({
  items,
  className,
  listClassName,
  tabClassName,
  panelClassName,
  label,
}: {
  items: TabItem[];
  className?: string;
  listClassName?: string;
  tabClassName?: string;
  panelClassName?: string;
  label: string;
}) {
  const [active, setActive] = useState(items[0]?.id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (dir: 1 | -1, index: number) => {
    const next = (index + dir + items.length) % items.length;
    setActive(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className={listClassName}>
        {items.map((item, i) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={tabClassName}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  move(1, i);
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  move(-1, i);
                }
                if (e.key === 'Home') {
                  e.preventDefault();
                  setActive(items[0].id);
                  refs.current[0]?.focus();
                }
                if (e.key === 'End') {
                  e.preventDefault();
                  setActive(items[items.length - 1].id);
                  refs.current[items.length - 1]?.focus();
                }
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          className={panelClassName}
          hidden={item.id !== active}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
