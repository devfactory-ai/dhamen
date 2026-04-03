import { cors } from 'hono/cors';

/**
 * Environment-aware CORS configuration
 * In production, only allow specific domains
 * In development/staging, allow localhost and preview deployments
 */
export function createCorsMiddleware(environment: string) {
  return cors({
    origin: (origin) => {
      // Allow requests with no origin (mobile apps, server-to-server)
      // In production, this should be more restrictive
      if (!origin) {
        return environment === 'production' ? null : '*';
      }

      // Production: strict allowlist only
      const productionOrigins = [
        'https://app.dhamen.tn',
        'https://dhamen.tn',
        'https://e-sante.com.tn',
        'https://app.e-sante.com.tn',
      ];

      // Staging: allow staging domains
      const stagingOrigins = [
        'https://staging.dhamen.tn',
        'https://dhamen-web-staging.pages.dev',
        'https://staging.e-sante.com.tn',
        'https://app-staging.e-sante.com.tn',
      ];

      // Development: allow localhost and preview deployments
      const developmentOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
      ];

      // Check production origins
      if (productionOrigins.includes(origin)) {
        return origin;
      }

      // Check staging origins (allowed in staging and dev)
      if (environment !== 'production' && stagingOrigins.includes(origin)) {
        return origin;
      }

      // Check development origins (in development and staging)
      if ((environment === 'development' || environment === 'staging') && developmentOrigins.includes(origin)) {
        return origin;
      }

      // Allow all *.dhamen.tn and *.e-sante.com.tn subdomains
      if (origin.endsWith('.dhamen.tn') || origin.endsWith('.e-sante.com.tn')) {
        return origin;
      }

      // Allow Cloudflare Pages deployments only for the dhamen project
      // and only in non-production environments
      if (environment !== 'production') {
        // Cloudflare Pages domains (main, dev, staging)
        if (origin === 'https://dhamen-web.pages.dev' ||
            origin === 'https://dhamen-web-dev.pages.dev' ||
            origin === 'https://dhamen-web-staging.pages.dev') {
          return origin;
        }
        // Preview deployments (with hash prefix, e.g. abc123.dhamen-web-dev.pages.dev)
        if (origin.match(/^https:\/\/[a-z0-9-]+\.dhamen-web(-dev|-staging)?\.pages\.dev$/)) {
          return origin;
        }
      }

      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-Code'],
    exposeHeaders: ['X-Request-ID', 'X-Total-Count', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
    credentials: true,
  });
}

/**
 * Default CORS middleware (for backwards compatibility)
 * Uses development settings - should be replaced with createCorsMiddleware in index.ts
 */
export const corsMiddleware = createCorsMiddleware('development');
