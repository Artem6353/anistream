import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

/** Переезд Vercel→Netlify: CANONICAL_HOST отдаёт 301 на канонический хост. */

afterEach(() => {
  delete process.env.CANONICAL_HOST;
});

describe('proxy: каноникализация хоста', () => {
  it('запрос на старый хост при заданном CANONICAL_HOST → 301 на новый', () => {
    process.env.CANONICAL_HOST = 'aninova-cataloge.netlify.app';
    const res = proxy(new NextRequest(new URL('https://aninova-catalog.vercel.app/anime/one-piece?x=1')));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://aninova-cataloge.netlify.app/anime/one-piece?x=1');
  });

  it('запрос уже на каноническом хосте → проход без редиректа', () => {
    process.env.CANONICAL_HOST = 'aninova-cataloge.netlify.app';
    const res = proxy(new NextRequest(new URL('https://aninova-cataloge.netlify.app/anime/one-piece')));
    expect(res.status).not.toBe(301);
  });

  it('без CANONICAL_HOST поведения нет (зеркало и прод работают как раньше)', () => {
    const res = proxy(new NextRequest(new URL('https://any.host/catalog')));
    expect(res.status).not.toBe(301);
  });
});
