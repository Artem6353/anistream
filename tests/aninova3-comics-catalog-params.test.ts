import { describe, expect, it } from 'vitest';
import {
  CATALOG_MAX_PAGE,
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_MAX_QUERY_LENGTH,
  parseComicsCatalogQuery,
  sanitizeSearchTerm,
} from '@/lib/aninova3/comics/catalog-params';
import { CATALOG_PAGE_SIZE } from '@/lib/aninova3/comics/catalog';

describe('sanitizeSearchTerm', () => {
  it('убирает метасимволы PostgREST и управляющие символы', () => {
    expect(sanitizeSearchTerm('  One, Piece (1997) "x" {y} *z*  ')).toBe('One Piece 1997 x y z');
    expect(sanitizeSearchTerm('a\u0000b\u001fc')).toBe('a b c');
    expect(sanitizeSearchTerm('a\\b')).toBe('a b');
  });

  it('ограничивает длину запроса', () => {
    expect(sanitizeSearchTerm('x'.repeat(500))).toHaveLength(CATALOG_MAX_QUERY_LENGTH);
  });
});

describe('parseComicsCatalogQuery', () => {
  it('по умолчанию отдаёт первую страницу и допустимую сортировку', () => {
    expect(parseComicsCatalogQuery({})).toEqual({
      q: '',
      genre: '',
      kind: null,
      role: null,
      sort: 'title',
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    });
  });

  it('принимает известные фильтры', () => {
    const parsed = parseComicsCatalogQuery({
      q: '  One Piece ',
      genre: 'Action',
      kind: 'manga',
      role: 'source',
      sort: 'year',
      page: '3',
      pageSize: '48',
    });
    expect(parsed).toMatchObject({
      q: 'One Piece',
      genre: 'Action',
      kind: 'manga',
      role: 'source',
      sort: 'year',
      page: 3,
      pageSize: 48,
    });
  });

  it('игнорирует неизвестные kind/role/sort вместо 500', () => {
    const parsed = parseComicsCatalogQuery({ kind: 'anime', role: 'admin', sort: 'drop table' });
    expect(parsed.kind).toBeNull();
    expect(parsed.role).toBeNull();
    expect(parsed.sort).toBe('title');
  });

  it('клампит page и pageSize и отбрасывает мусор', () => {
    expect(parseComicsCatalogQuery({ page: '0', pageSize: '-1' })).toMatchObject({ page: 1, pageSize: CATALOG_PAGE_SIZE });
    expect(parseComicsCatalogQuery({ page: '999999', pageSize: '9999' })).toMatchObject({
      page: CATALOG_MAX_PAGE,
      pageSize: CATALOG_MAX_PAGE_SIZE,
    });
    expect(parseComicsCatalogQuery({ page: 'abc', pageSize: 'abc' })).toMatchObject({
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    });
  });

  it('берёт первое значение из повторяющегося параметра', () => {
    expect(parseComicsCatalogQuery({ q: ['first', 'second'] }).q).toBe('first');
  });
});
