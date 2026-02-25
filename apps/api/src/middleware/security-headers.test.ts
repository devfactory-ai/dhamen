/**
 * Security Headers Middleware Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders } from './security-headers';

// Create mock environment
const mockEnv = {
  ENVIRONMENT: 'production',
  DB: {} as D1Database,
  CACHE: {} as KVNamespace,
  STORAGE: {} as R2Bucket,
  EVENTS_QUEUE: {} as Queue,
  RATE_LIMITER: {} as DurableObjectNamespace,
  API_VERSION: 'v1',
  JWT_ISSUER: 'dhamen',
  JWT_EXPIRES_IN: '15m',
  REFRESH_EXPIRES_IN: '7d',
  JWT_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'test-key',
};

describe('Security Headers Middleware', () => {
  const createTestApp = (environment = 'production') => {
    const app = new Hono<{ Bindings: typeof mockEnv }>();
    app.use('*', async (c, next) => {
      // @ts-ignore - set mock environment
      c.env = { ...mockEnv, ENVIRONMENT: environment };
      await next();
    });
    app.use('*', securityHeaders());
    app.get('/test', (c) => c.text('OK'));
    app.get('/api/data', (c) => c.json({ data: 'test' }));
    app.get('/not-found', (c) => c.text('Not Found', 404));
    return app;
  };

  describe('X-Content-Type-Options', () => {
    it('should set nosniff header', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  describe('X-Frame-Options', () => {
    it('should set DENY header to prevent clickjacking', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  describe('X-XSS-Protection', () => {
    it('should set XSS protection header', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });
  });

  describe('Strict-Transport-Security (HSTS)', () => {
    it('should set HSTS header in production', async () => {
      const app = createTestApp('production');
      const res = await app.request('/test');

      const hsts = res.headers.get('Strict-Transport-Security');
      expect(hsts).toContain('max-age=');
      expect(hsts).toContain('includeSubDomains');
    });

    it('should NOT set HSTS header in development', async () => {
      const app = createTestApp('development');
      const res = await app.request('/test');

      const hsts = res.headers.get('Strict-Transport-Security');
      expect(hsts).toBeNull();
    });

    it('should set max-age to at least 1 year in production', async () => {
      const app = createTestApp('production');
      const res = await app.request('/test');

      const hsts = res.headers.get('Strict-Transport-Security');
      const maxAgeMatch = hsts?.match(/max-age=(\d+)/);
      expect(maxAgeMatch).toBeTruthy();
      const maxAge = Number.parseInt(maxAgeMatch?.[1]!, 10);
      expect(maxAge).toBeGreaterThanOrEqual(31536000); // 1 year in seconds
    });
  });

  describe('Referrer-Policy', () => {
    it('should set strict-origin-when-cross-origin policy', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Permissions-Policy', () => {
    it('should restrict dangerous features', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      const policy = res.headers.get('Permissions-Policy');
      expect(policy).toContain('camera=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('geolocation=()');
    });
  });

  describe('Content-Security-Policy', () => {
    it('should set CSP header', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toBeTruthy();
    });

    it('should include default-src directive', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'none'");
    });

    it('should restrict frame-ancestors', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('Cache-Control', () => {
    it('should set no-store for API endpoints', async () => {
      const app = createTestApp();
      const res = await app.request('/api/data');

      const cacheControl = res.headers.get('Cache-Control');
      expect(cacheControl).toContain('no-store');
    });

    it('should prevent caching of sensitive data', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      const cacheControl = res.headers.get('Cache-Control');
      expect(cacheControl).toContain('no-cache');
    });
  });

  describe('Response passthrough', () => {
    it('should not modify response body', async () => {
      const app = createTestApp();
      const res = await app.request('/test');

      const body = await res.text();
      expect(body).toBe('OK');
    });

    it('should preserve JSON responses', async () => {
      const app = createTestApp();
      const res = await app.request('/api/data');

      const body = await res.json();
      expect(body).toEqual({ data: 'test' });
    });

    it('should preserve response status codes', async () => {
      const app = createTestApp();
      const res = await app.request('/not-found');
      expect(res.status).toBe(404);
    });
  });

  describe('All headers present (production)', () => {
    it('should set all security headers on every response in production', async () => {
      const app = createTestApp('production');
      const res = await app.request('/test');

      const requiredHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Referrer-Policy',
        'Permissions-Policy',
        'Content-Security-Policy',
        'Cache-Control',
      ];

      for (const header of requiredHeaders) {
        expect(res.headers.get(header)).toBeTruthy();
      }
    });
  });

  describe('Development mode', () => {
    it('should set basic headers in development', async () => {
      const app = createTestApp('development');
      const res = await app.request('/test');

      // These should always be set
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
    });
  });
});
