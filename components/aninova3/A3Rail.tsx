'use client';

import { useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons';

/** Горизонтальная лента: scroll-snap, кнопки, логическая группа для D-pad. */
export function A3Rail({
  title,
  action,
  children,
  description,
}: {
  title: string;
  action?: { href: string; label: string };
  children: ReactNode;
  description?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const group = useId();
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: 'smooth' });
  };
  return (
    <section className="a3-section" aria-labelledby={`${group}-title`} data-a3-group={group}>
      <div className="a3-wrap a3-section__head">
        <div>
          <h2 className="a3-h2" id={`${group}-title`}>
            {title}
          </h2>
          {description ? <p className="a3-muted a3-section__desc">{description}</p> : null}
        </div>
        <div className="a3-section__tools">
          {action ? (
            <Link className="a3-link" href={action.href}>
              {action.label} →
            </Link>
          ) : null}
          <button className="a3-iconbtn a3-iconbtn--sm" type="button" onClick={() => scroll(-1)} aria-label={`${title}: назад`}>
            <IconChevronLeft size={18} />
          </button>
          <button className="a3-iconbtn a3-iconbtn--sm" type="button" onClick={() => scroll(1)} aria-label={`${title}: вперёд`}>
            <IconChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="a3-rail" ref={ref} tabIndex={-1}>
        {children}
      </div>
    </section>
  );
}
