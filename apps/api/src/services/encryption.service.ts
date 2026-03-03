/**
 * Encryption Service
 *
 * Provides AES-256-GCM encryption for sensitive data at rest.
 * Uses Web Crypto API (available in Cloudflare Workers).
 *
 * Usage:
 * - Encrypt PII (national IDs, addresses, phone numbers)
 * - Encrypt medical data
 * - Encrypt financial data
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 128; // Authentication tag length in bits

interface EncryptionResult {
  ciphertext: string;
  iv: string;
  tag?: string;
}

interface DecryptionInput {
  ciphertext: string;
  iv: string;
  tag?: string;
}

/**
 * Encryption Service for sensitive data at rest
 */
export class EncryptionService {
  private key: CryptoKey | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;
  private readonly encodedKey: string;

  constructor(encryptionKey: string) {
    // Key should be base64-encoded 32-byte key for AES-256
    this.encodedKey = encryptionKey;
  }

  /**
   * Initialize the crypto key (lazy loading)
   */
  private async getKey(): Promise<CryptoKey> {
    if (this.key) {
      return this.key;
    }

    if (!this.keyPromise) {
      this.keyPromise = this.importKey();
    }

    this.key = await this.keyPromise;
    return this.key;
  }

  /**
   * Import the encryption key
   */
  private async importKey(): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(this.encodedKey);

    return crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt plaintext data
   */
  async encrypt(plaintext: string): Promise<EncryptionResult> {
    const key = await this.getKey();

    // Generate random IV for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const encoder = new TextEncoder();
    const plaintextBuffer = encoder.encode(plaintext);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv,
        tagLength: TAG_LENGTH,
      },
      key,
      plaintextBuffer
    );

    return {
      ciphertext: this.arrayBufferToBase64(ciphertextBuffer),
      iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
  }

  /**
   * Decrypt ciphertext data
   */
  async decrypt(input: DecryptionInput): Promise<string> {
    const key = await this.getKey();

    const ciphertextBuffer = this.base64ToArrayBuffer(input.ciphertext);
    const iv = this.base64ToArrayBuffer(input.iv);

    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
        tagLength: TAG_LENGTH,
      },
      key,
      ciphertextBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintextBuffer);
  }

  /**
   * Encrypt a value and return it as a single string (iv:ciphertext)
   * Convenient for database storage
   */
  async encryptForStorage(plaintext: string): Promise<string> {
    const result = await this.encrypt(plaintext);
    return `${result.iv}:${result.ciphertext}`;
  }

  /**
   * Decrypt a storage-formatted string (iv:ciphertext)
   */
  async decryptFromStorage(encrypted: string): Promise<string> {
    const [iv, ciphertext] = encrypted.split(':');
    if (!iv || !ciphertext) {
      throw new Error('Invalid encrypted data format');
    }
    return this.decrypt({ iv, ciphertext });
  }

  /**
   * Encrypt an object's specified fields
   */
  async encryptFields<T extends Record<string, unknown>>(
    obj: T,
    fieldsToEncrypt: (keyof T)[]
  ): Promise<T> {
    const result = { ...obj };

    for (const field of fieldsToEncrypt) {
      const value = obj[field];
      if (typeof value === 'string' && value.length > 0) {
        (result[field] as unknown) = await this.encryptForStorage(value);
      }
    }

    return result;
  }

  /**
   * Decrypt an object's specified fields
   */
  async decryptFields<T extends Record<string, unknown>>(
    obj: T,
    fieldsToDecrypt: (keyof T)[]
  ): Promise<T> {
    const result = { ...obj };

    for (const field of fieldsToDecrypt) {
      const value = obj[field];
      if (typeof value === 'string' && value.includes(':')) {
        try {
          (result[field] as unknown) = await this.decryptFromStorage(value);
        } catch {
          // Field might not be encrypted, leave as-is
        }
      }
    }

    return result;
  }

  /**
   * Hash sensitive data for lookups (non-reversible)
   * Uses SHA-256 for consistent hashing
   */
  async hashForLookup(data: string, salt?: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataToHash = salt ? `${salt}:${data}` : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(dataToHash));
    return this.arrayBufferToHex(hashBuffer);
  }

  /**
   * Generate a random encryption key (for key rotation)
   */
  static async generateKey(): Promise<string> {
    const key = await crypto.subtle.generateKey(
      { name: ALGORITHM, length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    ) as CryptoKey;

    const exported = await crypto.subtle.exportKey('raw', key);
    const bytes = new Uint8Array(exported as ArrayBuffer);
    return btoa(String.fromCharCode(...bytes));
  }

  // ==========================================================================
  // Helper methods
  // ==========================================================================

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// =============================================================================
// PII-specific encryption helpers
// =============================================================================

/**
 * Fields that contain PII and should be encrypted
 */
export const PII_FIELDS = {
  adherent: ['nationalId', 'phone', 'email', 'address', 'bankAccount'],
  provider: ['taxId', 'bankAccount', 'phone', 'email'],
  user: ['phone', 'email'],
  claim: ['medicalNotes', 'diagnosis'],
} as const;

/**
 * Create an encryption service from environment bindings
 */
export function createEncryptionService(encryptionKey: string): EncryptionService {
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error('Invalid encryption key: must be at least 32 characters');
  }

  return new EncryptionService(encryptionKey);
}

/**
 * Mask sensitive data for logging/display
 */
export function maskSensitiveData(data: string, visibleChars = 4): string {
  if (!data || data.length <= visibleChars) {
    return '****';
  }

  const visible = data.slice(-visibleChars);
  const masked = '*'.repeat(Math.min(data.length - visibleChars, 8));
  return `${masked}${visible}`;
}

/**
 * Validate national ID format (Tunisia CIN)
 */
export function validateNationalId(nationalId: string): boolean {
  // Tunisia CIN format: 8 digits
  return /^\d{8}$/.test(nationalId);
}

/**
 * Validate Tunisia phone number
 */
export function validatePhoneNumber(phone: string): boolean {
  // Tunisia phone: starts with +216, followed by 8 digits
  return /^\+216\d{8}$/.test(phone) || /^216\d{8}$/.test(phone) || /^\d{8}$/.test(phone);
}
