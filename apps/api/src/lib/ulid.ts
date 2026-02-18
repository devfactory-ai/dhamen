import { ulid } from 'ulid';

/**
 * Generate a new ULID
 */
export function generateId(): string {
  return ulid();
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
