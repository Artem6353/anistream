/** Пространственный выбор следующего элемента для D-pad.
 * Чистая функция без DOM: покрыта unit-тестами (tests/aninova3-spatial.test.ts).
 * Геометрия — CSS-пиксели, начало координат сверху слева. */

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Candidate {
  id: string;
  box: Box;
  /** Логическая группа: лента/рейл. Внутри группы Left/Right приоритетнее. */
  group?: string | null;
}

const center = (b: Box) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2] as const;

/**
 * Возвращает id ближайшего кандидата в направлении dir.
 * Правила:
 *  - кандидат должен быть смещён по основной оси минимум на 2 px;
 *  - перекрытие по поперечной оси снижает штраф (сосед в той же строке/колонке);
 *  - для Left/Right сначала рассматривается та же группа (рейл), затем все;
 *  - связи решаются детерминированно по id, чтобы фокус не «прыгал».
 */
export function pickCandidate(
  current: Box,
  candidates: Candidate[],
  dir: Dir,
  opts: { group?: string | null } = {},
): string | null {
  const [cx, cy] = center(current);
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;

  const score = (c: Candidate): number | null => {
    const [ex, ey] = center(c.box);
    const dx = ex - cx;
    const dy = ey - cy;
    const along = horizontal ? dx * sign : dy * sign;
    if (along <= 2) return null;
    const across = horizontal ? Math.abs(dy) : Math.abs(dx);
    const overlap = horizontal
      ? Math.min(current.bottom, c.box.bottom) - Math.max(current.top, c.box.top)
      : Math.min(current.right, c.box.right) - Math.max(current.left, c.box.left);
    // Перекрытие по поперечной оси — сильный признак «это сосед, а не диагональ».
    const aligned = overlap > 0 ? 0.35 : 3.2;
    return along + across * aligned + across * 0.15;
  };

  const consider = (pool: Candidate[]) => {
    let best: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const c of pool) {
      if (c.id === '') continue;
      const s = score(c);
      if (s === null) continue;
      if (s < bestScore - 0.01 || (Math.abs(s - bestScore) <= 0.01 && best !== null && c.id < best)) {
        best = c.id;
        bestScore = s;
      }
    }
    return best;
  };

  if (horizontal && opts.group) {
    const same = candidates.filter((c) => c.group === opts.group);
    const inGroup = consider(same);
    if (inGroup) return inGroup;
  }
  return consider(candidates);
}

/** Видимый ли элемент для навигации: не display:none, не hidden, есть размер. */
export function isNavigable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.tabIndex < 0 && !el.hasAttribute('data-a3-focusable')) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}
