/**
 * Security headers middleware
 * Implements OWASP recommended security headers
 */

import type { MiddlewareHandler } from 'hono';
import type { Bindings, Variables } from '../types';

/**
 * Security headers middleware
 * Sets recommended security headers on all responses
 */
export function securityHeaders(): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> {
  return async (c, next) => {
    await next();

    const isProduction = c.env.ENVIRONMENT === 'production';

    // Prevent MIME-type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');

    // XSS protection (legacy, but still useful for older browsers)
    c.header('X-XSS-Protection', '1; mode=block');

    // Force HTTPS in production
    if (isProduction) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Referrer policy - don't leak URL paths
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy - restrict dangerous APIs
    c.header(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );

    // Content Security Policy
    // Strict policy for API - no inline scripts, only same-origin
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );

    // Prevent caching of sensitive data
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
  };
}

/**
 * CORS security middleware
 * More restrictive CORS for production
 */
export function secureCors(): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> {
  return async (c, next) => {
    const origin = c.req.header('Origin');
    const isProduction = c.env.ENVIRONMENT === 'production';

    // Define allowed origins
    const allowedOrigins = isProduction
      ? ['https://dhamen.tn', 'https://app.dhamen.tn', 'https://dhamen-web.pages.dev']
      : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

    // Check if origin is allowed
    if (origin && allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
    }

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      c.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept'
      );
      c.header('Access-Control-Max-Age', '86400'); // 24 hours

      return new Response(null, { status: 204 });
    }

    return next();
  };
}
