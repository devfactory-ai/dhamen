/**
 * Database Helper
 *
 * Provides helper functions for accessing the tenant-specific database.
 * This helper ensures routes get the correct database based on tenant context.
 */

import type { Context } from 'hono';
import type { AppEnv } from '../types';

/**
 * Get the tenant-specific database from context
 *
 * This function returns the database instance based on the resolved tenant.
 * It checks for tenantDb (set by tenant-resolver middleware) first,
 * then falls back to the legacy DB binding for backward compatibility.
 *
 * @param c - Hono context
 * @returns D1Database instance for the current tenant
 */
export function getDb(c: Context<AppEnv>): D1Database {
  // First try to get tenant-specific DB (set by tenant-resolver middleware)
  const tenantDb = c.get('tenantDb');
  if (tenantDb) {
    return tenantDb;
  }

  // Fallback to legacy DB binding
  return c.env.DB;
}

/**
 * Get the platform database (for cross-tenant operations)
 *
 * @param c - Hono context
 * @returns D1Database instance for the platform
 */
export function getPlatformDb(c: Context<AppEnv>): D1Database {
  return c.env.DB_PLATFORM;
}

/**
 * Check if current context is platform admin
 *
 * @param c - Hono context
 * @returns boolean indicating if context is platform admin
 */
export function isPlatformAdmin(c: Context<AppEnv>): boolean {
  return c.get('isPlatformAdmin') === true;
}

/**
 * Get current tenant configuration
 *
 * @param c - Hono context
 * @returns TenantConfig or undefined if no tenant context
 */
export function getTenant(c: Context<AppEnv>) {
  return c.get('tenant');
}
