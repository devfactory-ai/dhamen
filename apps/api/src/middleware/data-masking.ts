/**
 * Data Masking Middleware
 *
 * Automatically masks sensitive data in logs and error responses.
 * Prevents accidental exposure of PII (Personally Identifiable Information).
 */

import type { MiddlewareHandler } from 'hono';
import { maskCIN, maskRIB, maskPhone, maskEmail } from '../lib/encryption';

/**
 * Patterns for detecting sensitive data
 */
const SENSITIVE_PATTERNS = {
  // CIN tunisien (8 chiffres)
  cin: /\b\d{8}\b/g,
  // RIB bancaire (20 chiffres)
  rib: /\b\d{20}\b/g,
  // Numéro de téléphone tunisien
  phone: /\+216\d{8}\b|\b0[2-9]\d{7}\b/g,
  // Email
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // Token/JWT (long alphanumeric strings)
  token: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  // Password field
  password: /"password"\s*:\s*"[^"]+"/gi,
  // Secret/API key
  secret: /"(secret|api_key|apiKey|API_KEY|token)"\s*:\s*"[^"]+"/gi,
};

/**
 * Mask sensitive data in a string
 */
export function maskSensitiveData(text: string): string {
  let masked = text;

  // Mask JWTs and tokens first (most specific)
  masked = masked.replace(SENSITIVE_PATTERNS.token, '[REDACTED_TOKEN]');

  // Mask passwords and secrets
  masked = masked.replace(SENSITIVE_PATTERNS.password, '"password":"[REDACTED]"');
  masked = masked.replace(SENSITIVE_PATTERNS.secret, (match) => {
    const key = match.match(/"([^"]+)"\s*:/)?.[1] || 'secret';
    return `"${key}":"[REDACTED]"`;
  });

  // Mask PII
  masked = masked.replace(SENSITIVE_PATTERNS.email, (email) => maskEmail(email));
  masked = masked.replace(SENSITIVE_PATTERNS.phone, (phone) => maskPhone(phone));
  masked = masked.replace(SENSITIVE_PATTERNS.rib, (rib) => maskRIB(rib));

  // Mask potential CIN (8-digit numbers that are likely CINs)
  // Be careful: this could mask other 8-digit numbers
  // Only apply in contexts where CIN is expected

  return masked;
}

/**
 * Deep clone and mask sensitive fields in an object
 */
export function maskObject(obj: unknown, fieldsToMask: string[] = []): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return maskSensitiveData(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskObject(item, fieldsToMask));
  }

  if (typeof obj === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Completely redact sensitive fields
      if (
        fieldsToMask.includes(key) ||
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') && lowerKey !== 'push_token' ||
        lowerKey.includes('apikey') ||
        lowerKey === 'authorization'
      ) {
        masked[key] = '[REDACTED]';
      }
      // Mask specific PII fields
      else if (lowerKey === 'cin' && typeof value === 'string') {
        masked[key] = maskCIN(value);
      }
      else if (lowerKey === 'rib' && typeof value === 'string') {
        masked[key] = maskRIB(value);
      }
      else if ((lowerKey === 'phone' || lowerKey === 'telephone') && typeof value === 'string') {
        masked[key] = maskPhone(value);
      }
      else if (lowerKey === 'email' && typeof value === 'string') {
        masked[key] = maskEmail(value);
      }
      // Recursively process nested objects
      else {
        masked[key] = maskObject(value, fieldsToMask);
      }
    }
    return masked;
  }

  return obj;
}

/**
 * Middleware to mask sensitive data in error responses
 */
export const dataMaskingMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();

    // Only process error responses (4xx, 5xx)
    if (c.res.status >= 400) {
      const contentType = c.res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          const body = await c.res.clone().json();
          const maskedBody = maskObject(body);

          c.res = new Response(JSON.stringify(maskedBody), {
            status: c.res.status,
            headers: c.res.headers,
          });
        } catch {
          // If we can't parse/mask, leave response as-is
        }
      }
    }
  };
};

/**
 * Safe logger that masks sensitive data
 */
export function createSafeLogger(prefix: string) {
  return {
    log: (message: string, data?: unknown) => {
      const maskedMessage = maskSensitiveData(message);
      const maskedData = data ? maskObject(data) : undefined;
      console.log(`[${prefix}]`, maskedMessage, maskedData || '');
    },
    error: (message: string, data?: unknown) => {
      const maskedMessage = maskSensitiveData(message);
      const maskedData = data ? maskObject(data) : undefined;
      console.error(`[${prefix}]`, maskedMessage, maskedData || '');
    },
    warn: (message: string, data?: unknown) => {
      const maskedMessage = maskSensitiveData(message);
      const maskedData = data ? maskObject(data) : undefined;
      console.warn(`[${prefix}]`, maskedMessage, maskedData || '');
    },
    info: (message: string, data?: unknown) => {
      const maskedMessage = maskSensitiveData(message);
      const maskedData = data ? maskObject(data) : undefined;
      console.info(`[${prefix}]`, maskedMessage, maskedData || '');
    },
    debug: (message: string, data?: unknown) => {
      const maskedMessage = maskSensitiveData(message);
      const maskedData = data ? maskObject(data) : undefined;
      console.debug(`[${prefix}]`, maskedMessage, maskedData || '');
    },
  };
}

export type SafeLogger = ReturnType<typeof createSafeLogger>;
