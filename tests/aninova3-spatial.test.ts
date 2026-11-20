import { describe, expect, it } from 'vitest';
import { pickCandidate, type Box, type Candidate } from '@/lib/aninova3/spatial';

const box = (left: number, top: number, width = 100, height = 50): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});
const c = (id: string, left: number, top: number, group?: string): Candidate => ({ id, box: box(left, top), group });

describe('pickCandidate (TV D-pad)', () => {
  it('идёт вправо к ближайшему в той же строке, а не по диагонали', () => {
    const current = box(0, 0);
    const next = pickCandidate(current, [c('far', 400, 0), c('near', 120, 4), c('below', 120, 200)], 'right');
    expect(next).toBe('near');
  });

  it('вниз выбирает элемент под текущим, штрафуя боковое смещение', () => {
    const current = box(0, 0);
    const next = pickCandidate(current, [c('left', -300, 120), c('under', 10, 80), c('right', 500, 90)], 'down');
    expect(next).toBe('under');
  });

  it('не уходит в противоположную сторону', () => {
    expect(pickCandidate(box(100, 100), [c('left', 0, 100)], 'right')).toBeNull();
    expect(pickCandidate(box(100, 100), [c('up', 100, 0)], 'down')).toBeNull();
  });

  it('внутри рейла Left/Right не выпрыгивает в соседнюю секцию', () => {
    const current = box(300, 500);
    const rails = [c('prev', 100, 500, 'rail'), c('next', 500, 500, 'rail'), c('sidebar', 0, 500, 'side')];
    expect(pickCandidate(current, rails, 'right', { group: 'rail' })).toBe('next');
    expect(pickCandidate(current, rails, 'left', { group: 'rail' })).toBe('prev');
  });

  it('на краю рейла падает в общий пул, а не застревает', () => {
    const current = box(500, 500);
    const next = pickCandidate(current, [c('a', 100, 500, 'rail'), c('b', 900, 500, 'side')], 'right', { group: 'rail' });
    expect(next).toBe('b');
  });

  it('детерминирован при равных расстояниях', () => {
    const next = pickCandidate(box(0, 0), [c('b', 200, 0), c('a', 200, 0)], 'right');
    expect(next).toBe('a');
  });

  it('не выбирает элемент позади при up', () => {
    expect(pickCandidate(box(0, 200), [c('below', 0, 400)], 'up')).toBeNull();
  });
});
