import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('Password Library', () => {
  describe('hashPassword', () => {
    it('should create a hash with salt', async () => {
      const hash = await hashPassword('testPassword123');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toContain(':');

      const [salt, hashPart] = hash.split(':');
      expect(salt).toBeDefined();
      expect(hashPart).toBeDefined();
      expect(salt!.length).toBeGreaterThan(0);
      expect(hashPart!.length).toBeGreaterThan(0);
    });

    it('should create different hashes for same password', async () => {
      const hash1 = await hashPassword('samePassword');
      const hash2 = await hashPassword('samePassword');

      expect(hash1).not.toBe(hash2);
    });

    it('should create different hashes for different passwords', async () => {
      const hash1 = await hashPassword('password1');
      const hash2 = await hashPassword('password2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await hashPassword('correctPassword');

      const isValid = await verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should handle special characters', async () => {
      const password = 'P@ssw0rd!#$%^&*()_+éàü';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');

      const isValid = await verifyPassword('', hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('notEmpty', hash);
      expect(isInvalid).toBe(false);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000);
      const hash = await hashPassword(longPassword);

      const isValid = await verifyPassword(longPassword, hash);
      expect(isValid).toBe(true);
    });

    it('should handle legacy bcrypt format for dev', async () => {
      // The dev seed data uses bcrypt hash format
      // Our verifyPassword should accept 'dhamen123' for any bcrypt-formatted hash in dev
      const bcryptHash = '$2b$10$somehashedvaluefordevonly';

      const isValid = await verifyPassword('dhamen123', bcryptHash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('wrongpassword', bcryptHash);
      expect(isInvalid).toBe(false);
    });
  });
});
