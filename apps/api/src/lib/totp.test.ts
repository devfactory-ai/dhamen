/**
 * TOTP (Time-based One-Time Password) Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateTOTPUri,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  roleRequiresMFA,
} from './totp';

describe('TOTP Library', () => {
  describe('generateTOTPSecret', () => {
    it('should generate a Base32 encoded secret', () => {
      const secret = generateTOTPSecret();

      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      // Base32 uses only A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('should generate secrets of consistent length', () => {
      const secret1 = generateTOTPSecret();
      const secret2 = generateTOTPSecret();

      // 20 bytes * 8 bits / 5 bits per Base32 char = 32 chars
      expect(secret1.length).toBe(32);
      expect(secret2.length).toBe(32);
    });

    it('should generate unique secrets', () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 10; i++) {
        secrets.add(generateTOTPSecret());
      }
      expect(secrets.size).toBe(10);
    });
  });

  describe('generateTOTP', () => {
    it('should generate a 6-digit code', async () => {
      const secret = generateTOTPSecret();
      const code = await generateTOTP(secret);

      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate consistent codes for the same time', async () => {
      const secret = generateTOTPSecret();
      const time = 1700000000000; // Fixed time

      const code1 = await generateTOTP(secret, 30, 6, time);
      const code2 = await generateTOTP(secret, 30, 6, time);

      expect(code1).toBe(code2);
    });

    it('should generate different codes for different time steps', async () => {
      const secret = generateTOTPSecret();
      const time1 = 1700000000000;
      const time2 = time1 + 30000; // 30 seconds later

      const code1 = await generateTOTP(secret, 30, 6, time1);
      const code2 = await generateTOTP(secret, 30, 6, time2);

      expect(code1).not.toBe(code2);
    });

    it('should generate different codes for different secrets', async () => {
      const secret1 = generateTOTPSecret();
      const secret2 = generateTOTPSecret();
      const time = 1700000000000;

      const code1 = await generateTOTP(secret1, 30, 6, time);
      const code2 = await generateTOTP(secret2, 30, 6, time);

      expect(code1).not.toBe(code2);
    });

    it('should pad codes with leading zeros', async () => {
      // Test multiple times to ensure padding works
      const secret = generateTOTPSecret();
      for (let i = 0; i < 5; i++) {
        const time = 1700000000000 + i * 30000;
        const code = await generateTOTP(secret, 30, 6, time);
        expect(code.length).toBe(6);
      }
    });
  });

  describe('verifyTOTP', () => {
    it('should verify a valid code', async () => {
      const secret = generateTOTPSecret();
      const code = await generateTOTP(secret);

      const isValid = await verifyTOTP(code, secret);

      expect(isValid).toBe(true);
    });

    it('should reject an invalid code', async () => {
      const secret = generateTOTPSecret();

      const isValid = await verifyTOTP('000000', secret);

      // Very unlikely to match
      expect(isValid).toBe(false);
    });

    it('should reject malformed codes', async () => {
      const secret = generateTOTPSecret();

      expect(await verifyTOTP('12345', secret)).toBe(false); // Too short
      expect(await verifyTOTP('1234567', secret)).toBe(false); // Too long
      expect(await verifyTOTP('abcdef', secret)).toBe(false); // Non-numeric
      expect(await verifyTOTP('', secret)).toBe(false); // Empty
    });

    it('should handle codes with spaces', async () => {
      const secret = generateTOTPSecret();
      const code = await generateTOTP(secret);

      // Add spaces (common when users copy-paste)
      const codeWithSpaces = `${code.slice(0, 3)} ${code.slice(3)}`;

      const isValid = await verifyTOTP(codeWithSpaces, secret);

      expect(isValid).toBe(true);
    });

    it('should accept codes within the time window', async () => {
      const secret = generateTOTPSecret();
      const now = Date.now();

      // Generate code for previous time step
      const previousCode = await generateTOTP(secret, 30, 6, now - 30000);

      // Should still be valid with window=1
      const isValid = await verifyTOTP(previousCode, secret, 1);

      expect(isValid).toBe(true);
    });
  });

  describe('generateTOTPUri', () => {
    it('should generate a valid otpauth URI', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'user@example.com';

      const uri = generateTOTPUri(secret, email);

      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain(secret);
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });

    it('should encode special characters in email', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'user+test@example.com';

      const uri = generateTOTPUri(secret, email);

      expect(uri).toContain(encodeURIComponent(email));
    });

    it('should use custom issuer', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'user@example.com';
      const issuer = 'My App';

      const uri = generateTOTPUri(secret, email, issuer);

      expect(uri).toContain(encodeURIComponent(issuer));
    });

    it('should use E-Santé as default issuer', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'user@example.com';

      const uri = generateTOTPUri(secret, email);

      expect(uri).toContain('E-Sant');
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 10 codes by default', () => {
      const codes = generateBackupCodes();

      expect(codes).toHaveLength(10);
    });

    it('should generate specified number of codes', () => {
      const codes = generateBackupCodes(5);

      expect(codes).toHaveLength(5);
    });

    it('should generate codes in XXXX-XXXX format', () => {
      const codes = generateBackupCodes();

      for (const code of codes) {
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
    });

    it('should not include confusing characters (I, O, 0, 1)', () => {
      const codes = generateBackupCodes(20);

      for (const code of codes) {
        expect(code).not.toMatch(/[IO01]/);
      }
    });

    it('should generate unique codes', () => {
      const codes = generateBackupCodes(10);
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(10);
    });
  });

  describe('hashBackupCode', () => {
    it('should hash a backup code', async () => {
      const code = 'ABCD-EFGH';

      const hash = await hashBackupCode(code);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      // SHA-256 produces 64 hex characters
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce consistent hashes', async () => {
      const code = 'ABCD-EFGH';

      const hash1 = await hashBackupCode(code);
      const hash2 = await hashBackupCode(code);

      expect(hash1).toBe(hash2);
    });

    it('should normalize codes (remove dashes, uppercase)', async () => {
      const hash1 = await hashBackupCode('ABCD-EFGH');
      const hash2 = await hashBackupCode('abcdefgh');
      const hash3 = await hashBackupCode('abcd-efgh');

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce different hashes for different codes', async () => {
      const hash1 = await hashBackupCode('ABCD-EFGH');
      const hash2 = await hashBackupCode('WXYZ-1234');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify a valid backup code', async () => {
      const codes = ['ABCD-EFGH', 'WXYZ-1234'];
      const hashedCodes = await Promise.all(codes.map(hashBackupCode));

      const index = await verifyBackupCode('ABCD-EFGH', hashedCodes);

      expect(index).toBe(0);
    });

    it('should return correct index for matched code', async () => {
      const codes = ['AAAA-AAAA', 'BBBB-BBBB', 'CCCC-CCCC'];
      const hashedCodes = await Promise.all(codes.map(hashBackupCode));

      const index = await verifyBackupCode('CCCC-CCCC', hashedCodes);

      expect(index).toBe(2);
    });

    it('should return -1 for invalid code', async () => {
      const codes = ['ABCD-EFGH'];
      const hashedCodes = await Promise.all(codes.map(hashBackupCode));

      const index = await verifyBackupCode('INVALID1', hashedCodes);

      expect(index).toBe(-1);
    });

    it('should handle empty hashed codes array', async () => {
      const index = await verifyBackupCode('ABCD-EFGH', []);

      expect(index).toBe(-1);
    });

    it('should verify codes case-insensitively', async () => {
      const codes = ['ABCD-EFGH'];
      const hashedCodes = await Promise.all(codes.map(hashBackupCode));

      const index = await verifyBackupCode('abcd-efgh', hashedCodes);

      expect(index).toBe(0);
    });
  });

  describe('roleRequiresMFA', () => {
    it('should NOT require MFA for ADMIN', () => {
      expect(roleRequiresMFA('ADMIN')).toBe(false);
    });

    it('should require MFA for all non-ADMIN roles', () => {
      expect(roleRequiresMFA('INSURER_ADMIN')).toBe(true);
      expect(roleRequiresMFA('INSURER_AGENT')).toBe(true);
      expect(roleRequiresMFA('HR')).toBe(true);
      expect(roleRequiresMFA('PHARMACIST')).toBe(true);
      expect(roleRequiresMFA('DOCTOR')).toBe(true);
      expect(roleRequiresMFA('LAB_MANAGER')).toBe(true);
      expect(roleRequiresMFA('CLINIC_ADMIN')).toBe(true);
      expect(roleRequiresMFA('PRATICIEN')).toBe(true);
      expect(roleRequiresMFA('ADHERENT')).toBe(true);
    });

    it('should NOT require MFA for unknown roles', () => {
      expect(roleRequiresMFA('UNKNOWN_ROLE')).toBe(false);
      expect(roleRequiresMFA('')).toBe(false);
    });
  });
});
