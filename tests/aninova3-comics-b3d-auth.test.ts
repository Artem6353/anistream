import { afterEach, describe, expect, it } from 'vitest';
import {
  adminCookieName,
  makeAdminCookieValue,
  signAdmin,
  verifyAdminCookie,
} from '../lib/admin-auth';

const previousToken = process.env.ADMIN_TOKEN;

afterEach(() => {
  if (previousToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = previousToken;
});

/**
 * B3-D uses the existing admin-cookie guard, not user_metadata.role. These
 * checks cover the fail-closed primitives that the review route relies on.
 */
describe('B3-D admin access guard', () => {
  it('accepts only a valid non-expired HMAC cookie', () => {
    process.env.ADMIN_TOKEN = 'b3d-test-admin-token';
    const { value } = makeAdminCookieValue();
    expect(adminCookieName()).toBe('anistream_admin');
    expect(verifyAdminCookie(value)).toBe(true);
    expect(verifyAdminCookie(undefined)).toBe(false);
    expect(verifyAdminCookie('')).toBe(false);
    expect(verifyAdminCookie('not-a-cookie')).toBe(false);
    expect(verifyAdminCookie(`${value}0`)).toBe(false);
  });

  it('rejects a correctly signed but expired cookie', () => {
    process.env.ADMIN_TOKEN = 'b3d-test-admin-token';
    const expired = Date.now() - 1_000;
    expect(verifyAdminCookie(`${expired}.${signAdmin(expired)}`)).toBe(false);
  });

  it('fails closed when ADMIN_TOKEN is absent, even for a signed value', () => {
    delete process.env.ADMIN_TOKEN;
    const { value } = makeAdminCookieValue();
    expect(verifyAdminCookie(value)).toBe(false);
  });
});
