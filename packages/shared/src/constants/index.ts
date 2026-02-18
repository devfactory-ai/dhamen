/**
 * Constants index - re-export all constants
 */

export * from './roles';
export * from './errors';
export * from './claim-status';

// Common constants
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// JWT configuration
export const JWT_EXPIRES_IN_SECONDS = 900; // 15 minutes
export const REFRESH_EXPIRES_IN_SECONDS = 86400; // 24 hours

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  ELIGIBILITY: 300, // 5 minutes
  TARIFF: 3600, // 1 hour
  PROVIDER_STATUS: 900, // 15 minutes
  SESSION: 86400, // 24 hours
} as const;

// Rate limiting
export const RATE_LIMITS = {
  DEFAULT: { requests: 100, windowMs: 60000 }, // 100 req/min
  AUTH: { requests: 10, windowMs: 60000 }, // 10 req/min
  SENSITIVE: { requests: 30, windowMs: 60000 }, // 30 req/min
} as const;

// Tunisian context
export const TUNISIA = {
  COUNTRY_CODE: 'TN',
  PHONE_PREFIX: '+216',
  CURRENCY: 'TND',
  CURRENCY_SUBUNIT: 'millimes',
  CURRENCY_DECIMALS: 3,
} as const;
