/**
 * TOTP (Time-based One-Time Password) implementation
 * RFC 6238 compliant for MFA authentication
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a cryptographically secure random secret for TOTP
 * Returns a 20-byte secret encoded in Base32
 */
export function generateTOTPSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

/**
 * Base32 encode a Uint8Array
 */
function base32Encode(data: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * Base32 decode a string to Uint8Array
 */
function base32Decode(encoded: string): Uint8Array {
  const cleanEncoded = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const result: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanEncoded) {
    const index = BASE32_CHARS.indexOf(char);
    if (index === -1) { continue; }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      result.push((value >>> bits) & 0xff);
    }
  }

  return new Uint8Array(result);
}

/**
 * Generate HMAC-SHA1 using Web Crypto API
 */
async function hmacSHA1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return new Uint8Array(signature);
}

/**
 * Convert a number to a 8-byte big-endian buffer
 */
function intToBytes(num: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(num), false);
  return new Uint8Array(buffer);
}

/**
 * Generate a TOTP code for a given secret and time
 * @param secret - Base32 encoded secret
 * @param timeStep - Time step in seconds (default 30)
 * @param digits - Number of digits in the OTP (default 6)
 * @param time - Unix timestamp in milliseconds (default: current time)
 */
export async function generateTOTP(
  secret: string,
  timeStep = 30,
  digits = 6,
  time?: number
): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor((time ?? Date.now()) / 1000 / timeStep);
  const counterBytes = intToBytes(counter);

  const hmac = await hmacSHA1(key, counterBytes);

  // Dynamic truncation
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
}

/**
 * Verify a TOTP code
 * @param code - The OTP code to verify
 * @param secret - Base32 encoded secret
 * @param window - Number of time steps to check before/after current time (default 1)
 * @returns true if the code is valid
 */
export async function verifyTOTP(
  code: string,
  secret: string,
  window = 1
): Promise<boolean> {
  // Sanitize input
  const cleanCode = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return false;
  }

  const now = Date.now();
  const timeStep = 30;

  // Check current time step and adjacent ones (to handle clock drift)
  for (let i = -window; i <= window; i++) {
    const time = now + i * timeStep * 1000;
    const expectedCode = await generateTOTP(secret, timeStep, 6, time);
    if (timeSafeEqual(cleanCode, expectedCode)) {
      return true;
    }
  }

  return false;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timeSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate a TOTP provisioning URI for QR code generation
 * @param secret - Base32 encoded secret
 * @param email - User's email address
 * @param issuer - Application name (default: "Dhamen")
 */
export function generateTOTPUri(
  secret: string,
  email: string,
  issuer = 'Dhamen'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate backup codes for account recovery
 * @param count - Number of backup codes to generate (default 10)
 * @returns Array of 8-character alphanumeric codes
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding I, O, 0, 1 for readability

  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let code = '';
    for (const byte of bytes) {
      code += chars[byte % chars.length];
    }
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }

  return codes;
}

/**
 * Hash backup codes for secure storage
 * Uses SHA-256 for fast verification while still being secure
 */
export async function hashBackupCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const cleanCode = code.replace(/-/g, '').toUpperCase();
  const data = encoder.encode(cleanCode);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a backup code against stored hashes
 * Returns the index of the matched code, or -1 if not found
 */
export async function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): Promise<number> {
  const inputHash = await hashBackupCode(code);

  for (let i = 0; i < hashedCodes.length; i++) {
    if (timeSafeEqual(inputHash, hashedCodes[i] ?? '')) {
      return i;
    }
  }

  return -1;
}

/**
 * Roles that require MFA
 * Note: Disabled for demo environment - in production, all staff roles should require MFA
 * Original roles: ADMIN, INSURER_ADMIN, INSURER_AGENT, PHARMACIST, DOCTOR, LAB_MANAGER, CLINIC_ADMIN
 */
export const MFA_REQUIRED_ROLES = [] as const;

/**
 * Check if a role requires MFA
 */
export function roleRequiresMFA(role: string): boolean {
  return MFA_REQUIRED_ROLES.includes(role as (typeof MFA_REQUIRED_ROLES)[number]);
}
