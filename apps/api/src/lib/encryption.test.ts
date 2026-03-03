import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  hashForIndex,
  mask,
  maskCIN,
  maskRIB,
  maskPhone,
  maskEmail,
  createEncryptionService,
} from './encryption';

describe('Encryption Service', () => {
  const secret = 'test-secret-key-for-encryption-32chars!';

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const plaintext = 'Sensitive data: CIN 12345678';
      const encrypted = await encrypt(plaintext, secret);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);

      const decrypted = await decrypt(encrypted, secret);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', async () => {
      const plaintext = 'Same data twice';
      const encrypted1 = await encrypt(plaintext, secret);
      const encrypted2 = await encrypt(plaintext, secret);

      expect(encrypted1).not.toBe(encrypted2);

      expect(await decrypt(encrypted1, secret)).toBe(plaintext);
      expect(await decrypt(encrypted2, secret)).toBe(plaintext);
    });

    it('should fail decryption with wrong secret', async () => {
      const plaintext = 'Secret message';
      const encrypted = await encrypt(plaintext, secret);

      await expect(decrypt(encrypted, 'wrong-secret')).rejects.toThrow();
    });

    it('should handle empty string', async () => {
      const encrypted = await encrypt('', secret);
      const decrypted = await decrypt(encrypted, secret);
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', async () => {
      const plaintext = 'Données sensibles: محمد بن علي 🔒';
      const encrypted = await encrypt(plaintext, secret);
      const decrypted = await decrypt(encrypted, secret);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid encrypted format', async () => {
      await expect(decrypt('invalid', secret)).rejects.toThrow('Invalid encrypted data format');
      await expect(decrypt('a:b', secret)).rejects.toThrow('Invalid encrypted data format');
    });
  });

  describe('hashForIndex', () => {
    it('should produce consistent hash for same input', async () => {
      const value = '12345678';
      const hash1 = await hashForIndex(value, secret);
      const hash2 = await hashForIndex(value, secret);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hash for different inputs', async () => {
      const hash1 = await hashForIndex('12345678', secret);
      const hash2 = await hashForIndex('87654321', secret);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash with different secrets', async () => {
      const value = '12345678';
      const hash1 = await hashForIndex(value, secret);
      const hash2 = await hashForIndex(value, 'different-secret');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('mask', () => {
    it('should mask with default visible chars', () => {
      expect(mask('12345678')).toBe('****5678');
    });

    it('should mask with custom visible chars', () => {
      expect(mask('12345678', 2)).toBe('******78');
      expect(mask('12345678', 6)).toBe('**345678');
    });

    it('should fully mask short strings', () => {
      expect(mask('123', 4)).toBe('***');
      expect(mask('ab', 4)).toBe('**');
    });
  });

  describe('maskCIN', () => {
    it('should mask CIN correctly', () => {
      expect(maskCIN('12345678')).toBe('****5678');
      expect(maskCIN('09876543')).toBe('****6543');
    });
  });

  describe('maskRIB', () => {
    it('should mask RIB correctly', () => {
      expect(maskRIB('12345678901234567890')).toBe('**************567890');
    });
  });

  describe('maskPhone', () => {
    it('should mask Tunisian phone number', () => {
      expect(maskPhone('+21612345678')).toBe('+216****5678');
      expect(maskPhone('+21698765432')).toBe('+216****5432');
    });

    it('should mask other phone formats', () => {
      expect(maskPhone('0612345678')).toBe('******5678');
    });
  });

  describe('maskEmail', () => {
    it('should mask email correctly', () => {
      expect(maskEmail('john.doe@example.com')).toBe('j*******@example.com');
      // For local part <= 2 chars, all characters are masked
      expect(maskEmail('ab@test.tn')).toBe('**@test.tn');
    });

    it('should handle invalid email', () => {
      expect(maskEmail('invalid')).toBe('***@***');
    });
  });

  describe('createEncryptionService', () => {
    it('should create a bound service', async () => {
      const service = createEncryptionService(secret);

      const encrypted = await service.encrypt('test data');
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe('test data');
    });

    it('should expose all mask functions', () => {
      const service = createEncryptionService(secret);

      expect(service.maskCIN('12345678')).toBe('****5678');
      expect(service.maskPhone('+21612345678')).toBe('+216****5678');
    });
  });
});
