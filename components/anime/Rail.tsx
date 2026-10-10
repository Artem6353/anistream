'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons';

/** Горизонтальная лента со скролл-сnap, стрелками и краевыми затемнениями. */
export function Rail({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: { href: string; label: string };
  children: ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  // Scroll events can fire many times per frame on touch screens. Batch the
  // measurement to one animation frame and avoid React renders when edge state
  // hasn't changed.
  const update = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const el = ref.current;
      if (!el) return;
      const left = el.scrollLeft > 8;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
      setEdges((previous) =>
        previous.left === left && previous.right === right
          ? previous
          : { left, right },
      );
    });
  }, []);

  useEffect(() => {
    update();
    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [update]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="rail-section" id={id} aria-label={title}>
      <div className="rail-head">
        <h2 className="section-title">{title}</h2>
        <div className="rail-head__right">
          {action ? (
            <Link className="rail-more" href={action.href}>
              {action.label}
            </Link>
          ) : null}
          <div className="rail-arrows">
            <button
              type="button"
              className={`icon-btn rail-arrow ${edges.left ? '' : 'is-disabled'}`}
              onClick={() => scroll(-1)}
              aria-label={`Прокрутить ${title} влево`}
              tabIndex={edges.left ? 0 : -1}
            >
              <IconChevronLeft size={16} />
            </button>
            <button
              type="button"
              className={`icon-btn rail-arrow ${edges.right ? '' : 'is-disabled'}`}
              onClick={() => scroll(1)}
              aria-label={`Прокрутить ${title} вправо`}
              tabIndex={edges.right ? 0 : -1}
            >
              <IconChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="rail" ref={ref} onScroll={update} onTransitionEnd={update}>
        {children}
      </div>
    </section>
  );
}
