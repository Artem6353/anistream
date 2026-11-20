import type { CSSProperties } from 'react';
import type { DemoComic } from '@/lib/aninova3/comics-demo';

/** Обложка комикса: типографическая композиция, без чужих изображений.
 *  Это осознанно «оформленное состояние», а не поддельный официальный постер. */
export function A3Cover({ comic, size = 'md' }: { comic: DemoComic; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`a3-cover a3-cover--${size}`} style={{ '--cover-tone': comic.tone } as CSSProperties} aria-hidden>
      <span className="a3-cover__mark">демо</span>
      <span className="a3-cover__mono" aria-hidden>
        {comic.title.slice(0, 1)}
      </span>
      <span className="a3-cover__title">{comic.title}</span>
      <span className="a3-cover__sub">{comic.subtitle}</span>
      <span className="a3-cover__ru">RU</span>
    </span>
  );
}
