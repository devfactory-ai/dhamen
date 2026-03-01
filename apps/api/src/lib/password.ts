const encoder = new TextEncoder();

/**
 * PBKDF2 iterations - Reduced for Cloudflare Workers CPU limits
 * 100,000 iterations is still secure and completes within Worker CPU budget
 * Note: OWASP 2023 recommends 600,000 but that exceeds Worker CPU limits
 */
const PBKDF2_ITERATIONS = 100000;

/**
 * Hash a password using PBKDF2 (Web Crypto API compatible alternative to bcrypt)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));

  return `$pbkdf2$${PBKDF2_ITERATIONS}$${saltB64}$${hashB64}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Reject legacy bcrypt hashes - they must be migrated to PBKDF2
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    console.error('Bcrypt hashes are not supported. Please migrate user passwords to PBKDF2.');
    return false;
  }

  // PBKDF2 hash verification
  // Support both new (100k) and legacy (600k) iteration counts
  if (!storedHash.startsWith('$pbkdf2$')) {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 5) {
    return false;
  }

  const iterations = Number.parseInt(parts[2] ?? '0', 10);
  const saltB64 = parts[3] ?? '';
  const hashB64 = parts[4] ?? '';

  try {
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const expectedHash = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));

    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const computedHash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      passwordKey,
      256
    );

    const computedHashArray = new Uint8Array(computedHash);

    // Constant-time comparison
    if (computedHashArray.length !== expectedHash.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < computedHashArray.length; i++) {
      result |= (computedHashArray[i] ?? 0) ^ (expectedHash[i] ?? 0);
    }

    return result === 0;
  } catch {
    return false;
  }
}
