/**
 * Cookie Utilities Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
} from './cookies';

describe('Cookie Utilities', () => {
  describe('setAccessTokenCookie', () => {
    it('should set HttpOnly cookie in production (same-origin)', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        // Pass isCrossOrigin=false for same-origin behavior
        setAccessTokenCookie(c, 'test-token', 3600, true, false);
        return c.text('OK');
      });

      const res = await app.request('/test');
      const setCookie = res.headers.get('Set-Cookie');

      expect(setCookie).toContain('access_token=test-token');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Max-Age=3600');
      expect(setCookie).toContain('Path=/');
    });

    it('should set cross-origin cookie with SameSite=None (default)', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        // Default isCrossOrigin=true
        setAccessTokenCookie(c, 'test-token', 3600, true);
        return c.text('OK');
      });

      const res = await app.request('/test');
      const setCookie = res.headers.get('Set-Cookie');

      expect(setCookie).toContain('access_token=test-token');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=None');
    });

    it('should set Lax cookie in development (same-origin)', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        // Pass isCrossOrigin=false for same-origin behavior
        setAccessTokenCookie(c, 'test-token', 3600, false, false);
        return c.text('OK');
      });

      const res = await app.request('/test');
      const setCookie = res.headers.get('Set-Cookie');

      expect(setCookie).toContain('access_token=test-token');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      // Secure is still true because of cross-origin compatibility
      expect(setCookie).toContain('Secure');
    });

    it('should URL-encode special characters in token', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        setAccessTokenCookie(c, 'token=with;special&chars', 3600, true);
        return c.text('OK');
      });

      const res = await app.request('/test');
      const setCookie = res.headers.get('Set-Cookie');

      expect(setCookie).toContain('access_token=');
      expect(setCookie).not.toContain('token=with;special&chars'); // Should be encoded
    });
  });

  describe('setRefreshTokenCookie', () => {
    it('should set cookie with restricted path', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        setRefreshTokenCookie(c, 'refresh-token', 604800, true);
        return c.text('OK');
      });

      const res = await app.request('/test');
      const setCookie = res.headers.get('Set-Cookie');

      expect(setCookie).toContain('refresh_token=refresh-token');
      expect(setCookie).toContain('Path=/api/v1/auth/refresh');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
    });

    it('should have longer max-age for refresh tokens', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        setRefreshTokenCookie(c, 'refresh-token', 604800, true); // 7 days
        return c.text('OK');
      });

      const res = await app.request('/test');
      const setCookie = res.headers.get('Set-Cookie');

      expect(setCookie).toContain('Max-Age=604800');
    });
  });

  describe('clearAuthCookies', () => {
    it('should clear both tokens by setting max-age to 0', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        clearAuthCookies(c, true);
        return c.text('OK');
      });

      const res = await app.request('/test');
      const setCookie = res.headers.get('Set-Cookie');

      expect(setCookie).toContain('access_token=');
      expect(setCookie).toContain('Max-Age=0');
    });
  });

  describe('getAccessTokenFromCookie', () => {
    it('should extract access token from cookie header', async () => {
      const app = new Hono();
      let extractedToken: string | undefined;

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: 'access_token=my-jwt-token; other=value',
        },
      });

      expect(extractedToken).toBe('my-jwt-token');
    });

    it('should return undefined when no cookie header', async () => {
      const app = new Hono();
      let extractedToken: string | undefined = 'not-undefined';

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test');

      expect(extractedToken).toBeUndefined();
    });

    it('should return undefined when access_token not present', async () => {
      const app = new Hono();
      let extractedToken: string | undefined = 'not-undefined';

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: 'other_cookie=value',
        },
      });

      expect(extractedToken).toBeUndefined();
    });

    it('should handle URL-encoded cookie values', async () => {
      const app = new Hono();
      let extractedToken: string | undefined;

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: 'access_token=token%3Dwith%3Bspecial',
        },
      });

      expect(extractedToken).toBe('token=with;special');
    });
  });

  describe('getRefreshTokenFromCookie', () => {
    it('should extract refresh token from cookie header', async () => {
      const app = new Hono();
      let extractedToken: string | undefined;

      app.get('/test', (c) => {
        extractedToken = getRefreshTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: 'refresh_token=my-refresh-token',
        },
      });

      expect(extractedToken).toBe('my-refresh-token');
    });

    it('should handle multiple cookies correctly', async () => {
      const app = new Hono();
      let accessToken: string | undefined;
      let refreshToken: string | undefined;

      app.get('/test', (c) => {
        accessToken = getAccessTokenFromCookie(c);
        refreshToken = getRefreshTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: 'access_token=access123; refresh_token=refresh456; other=value',
        },
      });

      expect(accessToken).toBe('access123');
      expect(refreshToken).toBe('refresh456');
    });
  });

  describe('Cookie parsing edge cases', () => {
    it('should handle empty cookie header', async () => {
      const app = new Hono();
      let extractedToken: string | undefined = 'not-undefined';

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: '',
        },
      });

      expect(extractedToken).toBeUndefined();
    });

    it('should handle cookie with empty value', async () => {
      const app = new Hono();
      let extractedToken: string | undefined;

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: 'access_token=',
        },
      });

      expect(extractedToken).toBe('');
    });

    it('should handle malformed cookie header gracefully', async () => {
      const app = new Hono();
      let extractedToken: string | undefined = 'not-undefined';

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: ';;;invalid;;;',
        },
      });

      expect(extractedToken).toBeUndefined();
    });

    it('should handle cookies with = in value', async () => {
      const app = new Hono();
      let extractedToken: string | undefined;

      app.get('/test', (c) => {
        extractedToken = getAccessTokenFromCookie(c);
        return c.text('OK');
      });

      await app.request('/test', {
        headers: {
          Cookie: 'access_token=eyJ0=oken==',
        },
      });

      expect(extractedToken).toBe('eyJ0=oken==');
    });
  });
});
