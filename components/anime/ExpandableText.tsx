'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export function ExpandableText({ text, lines = 3 }: { text: string; lines?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 4);
  }, [text, lines]);

  return (
    <div className="expandable">
      <p ref={ref} className={`expandable__text ${open ? 'is-open' : ''}`} style={{ ['--lines' as string]: lines }}>
        {text}
      </p>
      {overflowing ? (
        <button type="button" className="expandable__toggle" onClick={() => setOpen((v) => !v)}>
          {open ? 'Свернуть' : 'Развернуть'}
        </button>
      ) : null}
    </div>
  );
}
