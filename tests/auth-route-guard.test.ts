import { describe, expect, it } from 'vitest';
import { isProtectedPath, safeNextPath } from '../lib/supabase/middleware';

/**
 * Защита маршрутов: ошибка здесь либо закрывает публичные профили от гостей
 * (SEO и UX), либо оставляет личный кабинет открытым (утечка приватных данных).
 */
describe('isProtectedPath', () => {
  it('личный кабинет защищён', () => {
    for (const path of ['/profile', '/profile/']) expect(isProtectedPath(path), path).toBe(true);
  });

  it('локальные вкладки остаются доступны без входа (осознанное поведение)', () => {
    for (const path of ['/profile/list', '/profile/history', '/profile/bookmarks', '/profile/settings']) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });

  it('публичные профили и чужие маршруты открыты', () => {
    for (const path of ['/profile/kirito', '/profile/kirito/lists', '/', '/catalog', '/anime/one-piece', '/auth']) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });

  it('похожие, но другие префиксы не путаются', () => {
    expect(isProtectedPath('/profiles')).toBe(false);
    expect(isProtectedPath('/profilex/list')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('разрешает только внутренние пути', () => {
    expect(safeNextPath('/profile/list')).toBe('/profile/list');
    expect(safeNextPath(null)).toBe('/profile');
    expect(safeNextPath('')).toBe('/profile');
  });

  it('блокирует открытый редирект', () => {
    for (const evil of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(safeNextPath(evil), evil).toBe('/profile');
    }
  });
});
