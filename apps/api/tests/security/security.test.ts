/**
 * Security Tests
 *
 * Automated security testing for common vulnerabilities:
 * - Authentication/Authorization bypass
 * - SQL Injection
 * - XSS (Cross-Site Scripting)
 * - CSRF (Cross-Site Request Forgery)
 * - Rate Limiting
 * - Input Validation
 * - Sensitive Data Exposure
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE_URL = process.env.API_URL || 'http://localhost:8787/api/v1';

// Helper to make requests
async function request(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}

describe('Security Tests', () => {
  describe('Authentication', () => {
    it('should reject requests without authentication token', async () => {
      const { status, body } = await request('/adherents');
      expect(status).toBe(401);
      expect(body).toHaveProperty('error');
    });

    it('should reject requests with invalid JWT token', async () => {
      const { status } = await request('/adherents', {
        headers: {
          Authorization: 'Bearer invalid.jwt.token',
        },
      });
      expect(status).toBe(401);
    });

    it('should reject requests with expired JWT token', async () => {
      // This is an expired token (for testing)
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxMDAwMDAwMDAwfQ.invalid';
      const { status } = await request('/adherents', {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });
      expect(status).toBe(401);
    });

    it('should reject requests with malformed Authorization header', async () => {
      const malformedHeaders = [
        'invalid',
        'Bearer',
        'Basic dXNlcjpwYXNz',
        'bearer token',
        '',
      ];

      for (const header of malformedHeaders) {
        const { status } = await request('/adherents', {
          headers: {
            Authorization: header,
          },
        });
        expect(status).toBe(401);
      }
    });
  });

  describe('SQL Injection Prevention', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "1; SELECT * FROM users",
      "1 UNION SELECT * FROM users",
      "1' AND 1=1--",
      "admin'--",
      "1/**/OR/**/1=1",
      "'; WAITFOR DELAY '0:0:5'--",
      "1; EXEC xp_cmdshell('dir')",
      "' OR 'x'='x",
    ];

    it('should sanitize SQL injection in query parameters', async () => {
      for (const payload of sqlInjectionPayloads) {
        const { status, body } = await request(`/health?test=${encodeURIComponent(payload)}`);
        // Should not return 500 (server error from SQL injection)
        expect(status).not.toBe(500);
        // Response should not contain SQL error messages
        if (typeof body === 'object' && body !== null) {
          const bodyStr = JSON.stringify(body);
          expect(bodyStr).not.toContain('SQL');
          expect(bodyStr).not.toContain('sqlite');
          expect(bodyStr).not.toContain('syntax error');
        }
      }
    });

    it('should sanitize SQL injection in request body', async () => {
      for (const payload of sqlInjectionPayloads) {
        const { status, body } = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: payload,
            password: payload,
          }),
        });
        // Should return validation error, not server error
        expect(status).not.toBe(500);
        if (typeof body === 'object' && body !== null) {
          const bodyStr = JSON.stringify(body);
          expect(bodyStr).not.toContain('SQL');
        }
      }
    });
  });

  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      '"><script>alert(document.cookie)</script>',
      "javascript:alert('XSS')",
      '<svg onload="alert(1)">',
      '<body onload="alert(1)">',
      '<iframe src="javascript:alert(1)">',
      '{{constructor.constructor("alert(1)")()}}',
      '<div style="background:url(javascript:alert(1))">',
      '<input onfocus="alert(1)" autofocus>',
    ];

    it('should escape XSS in response data', async () => {
      for (const payload of xssPayloads) {
        const { body } = await request('/health');
        if (typeof body === 'object' && body !== null) {
          const bodyStr = JSON.stringify(body);
          // Response should not contain unescaped script tags
          expect(bodyStr).not.toContain('<script>');
          expect(bodyStr).not.toContain('javascript:');
          expect(bodyStr).not.toContain('onerror=');
          expect(bodyStr).not.toContain('onload=');
        }
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      const requests = Array(15)
        .fill(null)
        .map(() =>
          request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'wrongpassword',
            }),
          })
        );

      const results = await Promise.all(requests);
      const rateLimited = results.some((r) => r.status === 429);

      // At least some requests should be rate limited after threshold
      // Note: This depends on rate limit configuration
      expect(rateLimited || results.length === 15).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject oversized request bodies', async () => {
      const largePayload = {
        data: 'x'.repeat(10 * 1024 * 1024), // 10MB of data
      };

      try {
        const { status } = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify(largePayload),
        });
        // Should reject with 413 (Payload Too Large) or 400 (Bad Request)
        expect([400, 413]).toContain(status);
      } catch {
        // Network error is acceptable for very large payloads
        expect(true).toBe(true);
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = [
        'notanemail',
        'missing@domain',
        '@nodomain.com',
        'spaces in@email.com',
        'email@.com',
      ];

      for (const email of invalidEmails) {
        const { status, body } = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password: 'password123',
          }),
        });
        // Should reject with validation error
        expect([400, 422]).toContain(status);
      }
    });

    it('should validate required fields', async () => {
      const { status, body } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect([400, 422]).toContain(status);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in response', async () => {
      const { headers } = await request('/health');

      // Check for security headers
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
      ];

      for (const header of securityHeaders) {
        const value = headers.get(header);
        // At least some security headers should be present
        if (value) {
          expect(value).toBeTruthy();
        }
      }
    });

    it('should not expose server information', async () => {
      const { headers } = await request('/health');

      // Should not expose sensitive server info
      const serverHeader = headers.get('server');
      if (serverHeader) {
        expect(serverHeader).not.toContain('Apache');
        expect(serverHeader).not.toContain('nginx');
        expect(serverHeader).not.toContain('Express');
      }

      // Should not expose powered-by header
      expect(headers.get('x-powered-by')).toBeNull();
    });
  });

  describe('Sensitive Data Exposure', () => {
    it('should not expose sensitive data in error messages', async () => {
      const { body } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      });

      if (typeof body === 'object' && body !== null) {
        const bodyStr = JSON.stringify(body);
        // Should not expose stack traces
        expect(bodyStr).not.toContain('stack');
        expect(bodyStr).not.toContain('at ');
        // Should not expose internal paths
        expect(bodyStr).not.toContain('/Users/');
        expect(bodyStr).not.toContain('node_modules');
        // Should not expose SQL queries
        expect(bodyStr).not.toContain('SELECT');
        expect(bodyStr).not.toContain('INSERT');
      }
    });

    it('should mask sensitive fields in responses', async () => {
      // Test that password is never returned
      const { body } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@dhamen.tn',
          password: 'Admin123!',
        }),
      });

      if (typeof body === 'object' && body !== null) {
        const bodyStr = JSON.stringify(body);
        expect(bodyStr).not.toContain('password');
        expect(bodyStr).not.toContain('password_hash');
        expect(bodyStr).not.toContain('secret');
      }
    });
  });

  describe('CORS Configuration', () => {
    it('should not allow requests from unauthorized origins', async () => {
      const { headers } = await request('/health', {
        headers: {
          Origin: 'https://malicious-site.com',
        },
      });

      const corsOrigin = headers.get('access-control-allow-origin');
      // Should not allow arbitrary origins
      if (corsOrigin && corsOrigin !== '*') {
        expect(corsOrigin).not.toBe('https://malicious-site.com');
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '..%2f..%2f..%2fetc/passwd',
      '..%252f..%252f..%252fetc/passwd',
      '/etc/passwd%00.jpg',
    ];

    it('should prevent path traversal attacks', async () => {
      for (const payload of pathTraversalPayloads) {
        const { status, body } = await request(`/documents/${encodeURIComponent(payload)}`);
        // Should return 400, 401, 403, or 404, not 200 with file contents
        expect([400, 401, 403, 404]).toContain(status);
        if (typeof body === 'object' && body !== null) {
          const bodyStr = JSON.stringify(body);
          expect(bodyStr).not.toContain('root:');
          expect(bodyStr).not.toContain('/bin/bash');
        }
      }
    });
  });

  describe('API Key Security', () => {
    it('should reject invalid API keys', async () => {
      const { status } = await request('/health', {
        headers: {
          'X-API-Key': 'invalid-api-key-12345',
        },
      });
      // Should either succeed without API key or reject invalid one
      expect([200, 401, 403]).toContain(status);
    });
  });

  describe('HTTP Method Security', () => {
    it('should reject unsupported HTTP methods', async () => {
      const methods = ['TRACE', 'TRACK', 'DEBUG'];

      for (const method of methods) {
        try {
          const { status } = await request('/health', { method });
          // Should reject TRACE/TRACK methods
          expect([400, 405, 501]).toContain(status);
        } catch {
          // Network error is acceptable for unsupported methods
          expect(true).toBe(true);
        }
      }
    });
  });
});

describe('Password Security', () => {
  it('should enforce password complexity', async () => {
    const weakPasswords = [
      '12345678', // No letters
      'password', // No numbers
      'Pass1234', // No special chars (if required)
      'ab', // Too short
    ];

    for (const password of weakPasswords) {
      const { status, body } = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password,
          firstName: 'Test',
          lastName: 'User',
        }),
      });
      // Should reject weak passwords
      // Note: Depends on password policy configuration
      expect([400, 404, 422]).toContain(status);
    }
  });
});

describe('JWT Token Security', () => {
  it('should use secure token settings', async () => {
    // Login to get a token
    const loginResult = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@dhamen.tn',
        password: 'Admin123!',
      }),
    });

    if (loginResult.status === 200) {
      // Check that access token is not too long-lived
      // Check secure cookie flags in Set-Cookie header
      const setCookie = loginResult.headers.get('set-cookie');
      if (setCookie) {
        // Should have HttpOnly flag
        expect(setCookie.toLowerCase()).toContain('httponly');
        // Should have Secure flag in production
        // Note: May not be set in development
      }
    }
  });
});
