/**
 * Tenant Resolver Middleware
 *
 * Resolves tenant from subdomain and routes to the appropriate D1 database.
 * Supports:
 * - star.dhamen.tn -> DB_STAR
 * - gat.dhamen.tn -> DB_GAT
 * - comar.dhamen.tn -> DB_COMAR
 * - ami.dhamen.tn -> DB_AMI
 * - admin.dhamen.tn -> DB_PLATFORM (super admin)
 * - api.dhamen.tn -> DB (legacy, determined by JWT)
 */

import type { MiddlewareHandler } from 'hono';
import type { AppEnv, TenantConfig, Bindings } from '../types';
import { error } from '../lib/response';

/**
 * Extract subdomain from Host header
 */
function extractSubdomain(host: string): string | null {
  const hostLower = host.toLowerCase();

  // Development mode
  if (hostLower.includes('localhost') || hostLower.includes('127.0.0.1')) {
    // Check for subdomain in localhost: star.localhost:8787
    const parts = hostLower.split('.');
    if (parts.length >= 2 && parts[0] && parts[0] !== 'localhost') {
      return parts[0];
    }
    return null;
  }

  // Workers dev preview: dhamen-api.yassine-techini.workers.dev
  if (hostLower.includes('workers.dev')) {
    // In preview, use X-Tenant-Code header instead
    return null;
  }

  // Production/staging: star.dhamen.tn or star.api.dhamen.tn
  const match = hostLower.match(/^([a-z0-9-]+)\.(?:api\.)?dhamen\.tn/);
  if (match?.[1]) {
    return match[1];
  }

  // Cloudflare Pages preview: star.dhamen-web.pages.dev
  const pagesMatch = hostLower.match(/^([a-z0-9-]+)\.dhamen-web\.pages\.dev/);
  if (pagesMatch?.[1] && !pagesMatch[1].match(/^[a-f0-9]{8}$/)) {
    // Exclude commit hashes (8 hex chars)
    return pagesMatch[1];
  }

  return null;
}

/**
 * Map subdomain to database binding name
 */
function getDbBinding(subdomain: string): keyof Bindings | null {
  const mapping: Record<string, keyof Bindings> = {
    star: 'DB_STAR',
    gat: 'DB_GAT',
    comar: 'DB_COMAR',
    ami: 'DB_AMI',
    bh: 'DB_BH',
    platform: 'DB_PLATFORM',
    admin: 'DB_PLATFORM',
  };
  return mapping[subdomain] || null;
}

/**
 * Tenant Resolver Middleware
 *
 * Sets c.get('tenantDb') and c.get('tenant') based on subdomain or header
 */
export const tenantResolverMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const host = c.req.header('Host') || '';
  const hostLower = host.toLowerCase();
  const isDev = hostLower.includes('localhost') || hostLower.includes('127.0.0.1');
  let subdomain = extractSubdomain(host);

  // Fallback: Check X-Tenant-Code header (for API access without subdomain)
  if (!subdomain) {
    const tenantHeader = c.req.header('X-Tenant-Code');
    if (tenantHeader) {
      subdomain = tenantHeader.toLowerCase();
    }
  }

  // Fallback: Try to resolve tenant from JWT insurerId
  if (!subdomain) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        // Decode JWT payload without verification (tenant resolver runs before auth)
        const token = authHeader.slice(7);
        const payloadB64 = token.split('.')[1];
        if (payloadB64) {
          const payload = JSON.parse(atob(payloadB64));
          if (payload.insurerId) {
            const insurer = await c.env.DB.prepare(
              'SELECT code FROM insurers WHERE id = ?'
            ).bind(payload.insurerId).first<{ code: string }>();
            if (insurer?.code) {
              subdomain = insurer.code.toLowerCase();
            }
          }
        }
      } catch {
        // Ignore JWT decode errors, fall through to default DB
      }
    }
  }

  // Platform/Admin context (no subdomain, or admin subdomain)
  if (!subdomain || subdomain === 'admin' || subdomain === 'api' || subdomain === 'app') {
    // Use legacy DB for backward compatibility during migration
    // After full migration, change to DB_PLATFORM
    c.set('tenantDb', c.env.DB);
    c.set('isPlatformAdmin', subdomain === 'admin');
    return next();
  }

  // Build tenant config for resolved subdomain
  const tenant: TenantConfig = {
    tenantId: subdomain,
    code: subdomain.toUpperCase(),
    name: `${subdomain.toUpperCase()} Assurances`,
    subdomain,
    databaseBinding: getDbBinding(subdomain) || 'DB',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  // In development, always use c.env.DB (single shared database).
  // Tenant-specific D1 databases (DB_STAR, DB_GAT, etc.) are only used in production
  // where each tenant has its own fully migrated and populated database.
  if (isDev) {
    c.set('tenantDb', c.env.DB);
    c.set('tenant', tenant);
    c.set('isPlatformAdmin', false);
    return next();
  }

  // Check hardcoded tenant mapping first (faster than KV lookup)
  const dbBinding = getDbBinding(subdomain);
  if (dbBinding) {
    const db = c.env[dbBinding] as D1Database;

    // If the tenant DB exists, verify it has tables; otherwise fall back to legacy DB.
    if (db) {
      try {
        await db.prepare('SELECT 1 FROM users LIMIT 1').first();
        c.set('tenantDb', db);
      } catch {
        // Tenant DB not migrated — fall back to legacy DB
        c.set('tenantDb', c.env.DB);
      }
    } else {
      c.set('tenantDb', c.env.DB);
    }

    c.set('tenant', tenant);
    c.set('isPlatformAdmin', false);
    return next();
  }

  // Lookup tenant in KV registry (for dynamically added tenants)
  try {
    const cached = await c.env.TENANT_REGISTRY.get(`tenant:${subdomain}`, 'json') as TenantConfig | null;

    if (!cached) {
      return error(c, 'TENANT_NOT_FOUND', `Tenant ${subdomain} not found`, 404);
    }

    if (cached.status !== 'active') {
      return error(c, 'TENANT_SUSPENDED', `Tenant ${subdomain} is ${cached.status}`, 403);
    }

    // Get database from binding
    const db = c.env[cached.databaseBinding as keyof Bindings] as D1Database;
    if (!db) {
      return error(c, 'TENANT_DB_NOT_CONFIGURED', `Database for tenant ${subdomain} is not configured`, 500);
    }

    c.set('tenantDb', db);
    c.set('tenant', cached);
    c.set('isPlatformAdmin', false);
    return next();
  } catch (err) {
    console.error('Tenant resolution error:', err);
    // Fallback to legacy DB on error
    c.set('tenantDb', c.env.DB);
    c.set('isPlatformAdmin', false);
    return next();
  }
};

/**
 * Middleware to ensure tenant context exists
 * Use after tenantResolverMiddleware for routes that require tenant context
 */
export const requireTenant: MiddlewareHandler<AppEnv> = async (c, next) => {
  const tenant = c.get('tenant');
  if (!tenant) {
    return error(c, 'TENANT_REQUIRED', 'This endpoint requires a tenant context. Use a tenant subdomain or X-Tenant-Code header.', 400);
  }
  return next();
};

/**
 * Middleware to ensure platform admin context
 * Use for super admin only routes
 */
export const requirePlatformAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const isPlatformAdmin = c.get('isPlatformAdmin');
  const user = c.get('user');

  if (!isPlatformAdmin || user?.role !== 'ADMIN') {
    return error(c, 'PLATFORM_ADMIN_REQUIRED', 'This endpoint requires platform admin access.', 403);
  }
  return next();
};

export default tenantResolverMiddleware;
