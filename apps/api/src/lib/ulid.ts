import { ulid } from 'ulid';

/**
 * Generate a new ULID
 */
export function generateId(): string {
  return ulid();
}

/**
 * Generate a new ULID with a prefix (e.g., 'USR-', 'CLM-')
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${ulid()}`;
}

/**
 * Validate if a string is a valid ULID
 */
export function isValidUlid(id: string): boolean {
  if (id.length !== 26) {
    return false;
  }
  const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  return ulidRegex.test(id);
}
