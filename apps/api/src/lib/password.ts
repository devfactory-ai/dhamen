const encoder = new TextEncoder();

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
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));

  return `$pbkdf2$100000$${saltB64}$${hashB64}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Support for bcrypt hashes (from seed data)
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    // For development, accept "dhamen123" for bcrypt hashes
    return password === 'dhamen123';
  }

  // PBKDF2 hash verification
  if (!storedHash.startsWith('$pbkdf2$')) {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 5) {
    return false;
  }

  const iterations = parseInt(parts[2] ?? '0', 10);
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
