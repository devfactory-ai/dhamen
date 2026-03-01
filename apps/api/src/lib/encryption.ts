/**
 * Encryption service for sensitive data (AES-256-GCM)
 *
 * Uses Web Crypto API for Cloudflare Workers compatibility.
 * Encrypts sensitive data like CIN, bank details, medical info.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Generate a random IV (Initialization Vector) for AES-GCM
 * 12 bytes is recommended for AES-GCM
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Derive an AES-256 key from a secret using PBKDF2
 */
async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert ArrayBuffer or Uint8Array to hex string
 */
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt sensitive data using AES-256-GCM
 *
 * Returns format: salt:iv:ciphertext (all hex encoded)
 */
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = generateIV();
  const key = await deriveKey(secret, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  const saltHex = bufferToHex(salt);
  const ivHex = bufferToHex(iv);
  const ciphertextHex = bufferToHex(ciphertext);

  return `${saltHex}:${ivHex}:${ciphertextHex}`;
}

/**
 * Decrypt data encrypted with AES-256-GCM
 *
 * Expects format: salt:iv:ciphertext (all hex encoded)
 */
export async function decrypt(encrypted: string, secret: string): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [saltHex, ivHex, ciphertextHex] = parts;
  if (!saltHex || !ivHex || !ciphertextHex) {
    throw new Error('Invalid encrypted data format');
  }

  const salt = hexToBuffer(saltHex);
  const iv = hexToBuffer(ivHex);
  const ciphertext = hexToBuffer(ciphertextHex);

  const key = await deriveKey(secret, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return decoder.decode(plaintext);
}

/**
 * Hash sensitive data for indexing (SHA-256)
 * Useful for searchable encrypted fields
 */
export async function hashForIndex(value: string, secret: string): Promise<string> {
  const data = encoder.encode(value + secret);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hash);
}

/**
 * Mask sensitive data for display
 * Example: "12345678" -> "****5678"
 */
export function mask(value: string, visibleChars = 4): string {
  if (value.length <= visibleChars) {
    return '*'.repeat(value.length);
  }
  const masked = '*'.repeat(value.length - visibleChars);
  return masked + value.slice(-visibleChars);
}

/**
 * Mask CIN (Carte d'Identité Nationale tunisienne)
 * Format: 8 digits -> "****5678"
 */
export function maskCIN(cin: string): string {
  return mask(cin, 4);
}

/**
 * Mask bank account number (RIB)
 * Format: 20 digits -> "**************678901"
 */
export function maskRIB(rib: string): string {
  return mask(rib, 6);
}

/**
 * Mask phone number
 * Format: "+21612345678" -> "+216****5678"
 */
export function maskPhone(phone: string): string {
  if (phone.startsWith('+216')) {
    return phone.slice(0, 4) + '****' + phone.slice(-4);
  }
  return mask(phone, 4);
}

/**
 * Mask email address
 * Format: "john.doe@example.com" -> "j***.d**@example.com"
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';

  const maskedLocal = local.length <= 2
    ? '*'.repeat(local.length)
    : local[0] + '*'.repeat(local.length - 1);

  return `${maskedLocal}@${domain}`;
}

/**
 * Encryption service with bound secret
 */
export function createEncryptionService(secret: string) {
  return {
    encrypt: (plaintext: string) => encrypt(plaintext, secret),
    decrypt: (encrypted: string) => decrypt(encrypted, secret),
    hashForIndex: (value: string) => hashForIndex(value, secret),
    mask,
    maskCIN,
    maskRIB,
    maskPhone,
    maskEmail,
  };
}

export type EncryptionService = ReturnType<typeof createEncryptionService>;
