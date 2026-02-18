import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJWT, verifyJWT, signRefreshToken, verifyRefreshToken } from './jwt';

const TEST_SECRET = 'test-secret-key-for-testing-purposes';

describe('JWT Library', () => {
  beforeEach(() => {
    // Mock Date.now for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('signJWT', () => {
    it('should create a valid JWT token', async () => {
      const payload = {
        sub: 'user-123',
        role: 'ADMIN' as const,
      };

      const token = await signJWT(payload, TEST_SECRET, 3600);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include iat, exp, and iss claims', async () => {
      const payload = {
        sub: 'user-123',
        role: 'PHARMACIST' as const,
      };

      const token = await signJWT(payload, TEST_SECRET, 3600);
      const [, payloadB64] = token.split('.');
      const decodedPayload = JSON.parse(atob(payloadB64!.replace(/-/g, '+').replace(/_/g, '/')));

      expect(decodedPayload.iat).toBeDefined();
      expect(decodedPayload.exp).toBe(decodedPayload.iat + 3600);
      expect(decodedPayload.iss).toBe('dhamen');
      expect(decodedPayload.sub).toBe('user-123');
      expect(decodedPayload.role).toBe('PHARMACIST');
    });
  });

  describe('verifyJWT', () => {
    it('should verify a valid token', async () => {
      const payload = {
        sub: 'user-456',
        role: 'DOCTOR' as const,
      };

      const token = await signJWT(payload, TEST_SECRET, 3600);
      const verified = await verifyJWT(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe('user-456');
      expect(verified?.role).toBe('DOCTOR');
      expect(verified?.iss).toBe('dhamen');
    });

    it('should reject an expired token', async () => {
      const payload = {
        sub: 'user-789',
        role: 'ADMIN' as const,
      };

      const token = await signJWT(payload, TEST_SECRET, 60); // 1 minute

      // Advance time by 2 minutes
      vi.advanceTimersByTime(2 * 60 * 1000);

      const verified = await verifyJWT(token, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('should reject a token with invalid signature', async () => {
      const payload = {
        sub: 'user-000',
        role: 'ADMIN' as const,
      };

      const token = await signJWT(payload, TEST_SECRET, 3600);
      const tampered = token.slice(0, -5) + 'xxxxx';

      const verified = await verifyJWT(tampered, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('should reject a token signed with different secret', async () => {
      const payload = {
        sub: 'user-111',
        role: 'ADMIN' as const,
      };

      const token = await signJWT(payload, 'different-secret', 3600);
      const verified = await verifyJWT(token, TEST_SECRET);

      expect(verified).toBeNull();
    });

    it('should reject malformed tokens', async () => {
      expect(await verifyJWT('', TEST_SECRET)).toBeNull();
      expect(await verifyJWT('invalid', TEST_SECRET)).toBeNull();
      expect(await verifyJWT('a.b', TEST_SECRET)).toBeNull();
      expect(await verifyJWT('a.b.c.d', TEST_SECRET)).toBeNull();
    });
  });

  describe('signRefreshToken', () => {
    it('should create a valid refresh token', async () => {
      const token = await signRefreshToken('user-refresh-123', TEST_SECRET, 86400);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include type=refresh in payload', async () => {
      const token = await signRefreshToken('user-refresh-456', TEST_SECRET, 86400);
      const [, payloadB64] = token.split('.');
      const decodedPayload = JSON.parse(atob(payloadB64!.replace(/-/g, '+').replace(/_/g, '/')));

      expect(decodedPayload.type).toBe('refresh');
      expect(decodedPayload.sub).toBe('user-refresh-456');
      expect(decodedPayload.iss).toBe('dhamen');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', async () => {
      const token = await signRefreshToken('user-verify-123', TEST_SECRET, 86400);
      const verified = await verifyRefreshToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe('user-verify-123');
      expect(verified?.type).toBe('refresh');
      expect(verified?.iss).toBe('dhamen');
    });

    it('should reject an expired refresh token', async () => {
      const token = await signRefreshToken('user-expired', TEST_SECRET, 60);

      vi.advanceTimersByTime(2 * 60 * 1000);

      const verified = await verifyRefreshToken(token, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('should reject a regular JWT as refresh token', async () => {
      const regularJwt = await signJWT(
        { sub: 'user-regular', role: 'ADMIN' as const },
        TEST_SECRET,
        3600
      );

      const verified = await verifyRefreshToken(regularJwt, TEST_SECRET);
      expect(verified).toBeNull();
    });
  });
});
