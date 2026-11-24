import { describe, expect, it } from 'vitest';
import { previewAuthNext, PREVIEW_AUTH_PATH, PREVIEW_PROFILE_PATH } from '@/lib/aninova3/preview-auth';

describe('previewAuthNext', () => {
  it('по умолчанию ведёт в preview-кабинет', () => {
    expect(previewAuthNext(undefined)).toBe(PREVIEW_PROFILE_PATH);
    expect(previewAuthNext(null)).toBe(PREVIEW_PROFILE_PATH);
  });

  it('переписывает production-разделы в preview', () => {
    expect(previewAuthNext('/catalog')).toBe('/preview/aninova-3/catalog');
    expect(previewAuthNext('/anime/one-piece/1?from=auth#top')).toBe('/preview/aninova-3/anime/one-piece/1?from=auth#top');
    expect(previewAuthNext('/profile/alpha')).toBe('/preview/aninova-3/profile/alpha');
    expect(previewAuthNext('/')).toBe('/preview/aninova-3');
  });

  it('сохраняет уже preview-адрес', () => {
    expect(previewAuthNext(PREVIEW_PROFILE_PATH)).toBe(PREVIEW_PROFILE_PATH);
    expect(previewAuthNext('/preview/aninova-3/catalog?page=2')).toBe('/preview/aninova-3/catalog?page=2');
  });

  it('не пускает open redirect и возвращает в preview-кабинет', () => {
    for (const evil of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(previewAuthNext(evil)).toBe(PREVIEW_PROFILE_PATH);
    }
    expect(previewAuthNext('/unknown-private-route')).toBe(PREVIEW_PROFILE_PATH);
  });

  it('не зацикливает форму саму на себя', () => {
    expect(previewAuthNext(PREVIEW_AUTH_PATH)).toBe(PREVIEW_PROFILE_PATH);
    expect(previewAuthNext(`${PREVIEW_AUTH_PATH}?next=/preview/aninova-3/profile`)).toBe(PREVIEW_PROFILE_PATH);
  });
});
