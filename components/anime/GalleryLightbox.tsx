'use client';

import { useEffect, useState } from 'react';

/** Галерея кадров с лайтбоксом (клавиши: Esc, ←/→). */
export function GalleryLightbox({ images, title }: { images: string[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((v) => (v === null ? v : (v + 1) % images.length));
      if (e.key === 'ArrowLeft') setOpen((v) => (v === null ? v : (v - 1 + images.length) % images.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, images.length]);

  return (
    <div className="gallery">
      {images.map((src, i) => (
        <button key={src} type="button" className="gallery__item" onClick={() => setOpen(i)} aria-label={`Кадр ${i + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/img?url=${encodeURIComponent(src)}`} alt={`Кадр из аниме ${title}, ${i + 1}`} loading="lazy" />
        </button>
      ))}
      {open !== null ? (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/img?url=${encodeURIComponent(images[open])}`} alt={`Кадр из аниме ${title}`} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox__nav" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn" onClick={() => setOpen((open - 1 + images.length) % images.length)} aria-label="Предыдущий кадр">
              ←
            </button>
            <span>
              {open + 1} / {images.length}
            </span>
            <button type="button" className="icon-btn" onClick={() => setOpen((open + 1) % images.length)} aria-label="Следующий кадр">
              →
            </button>
            <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Закрыть">
              ✕
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
