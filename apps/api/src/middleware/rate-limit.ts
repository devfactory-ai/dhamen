import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../types';
import { structuredLog } from '../lib/logger';

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Key prefix for different rate limit types */
  keyPrefix?: string;
  /** Use Durable Objects for distributed rate limiting (more accurate but slightly slower) */
  useDurableObjects?: boolean;
}

interface RateLimitState {
  count: number;
  start: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: 'rl',
  useDurableObjects: false,
};

/**
 * Rate limiting middleware with support for both KV and Durable Objects
 * - KV: Faster but eventually consistent (good for general rate limiting)
 * - Durable Objects: Strongly consistent (better for auth/sensitive endpoints)
 */
export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
    const { maxRequests, windowSeconds, keyPrefix, useDurableObjects } = finalConfig;

    // Get client identifier (IP address from Cloudflare)
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const path = new URL(c.req.url).pathname;
    const key = `${keyPrefix}:${clientIP}:${path}`;

    try {
      let allowed: boolean;
      let remaining: number;
      let resetAt: number;
      let retryAfter: number | undefined;

      if (useDurableObjects && c.env.RATE_LIMITER) {
        // Use Durable Objects for strongly consistent rate limiting
        const result = await checkRateLimitDO(c, key, maxRequests, windowSeconds);
        allowed = result.allowed;
        remaining = result.remaining;
        resetAt = result.resetAt;
        retryAfter = result.retryAfter;
      } else {
        // Use KV for eventually consistent rate limiting
        const result = await checkRateLimitKV(c, key, maxRequests, windowSeconds);
        allowed = result.allowed;
        remaining = result.remaining;
        resetAt = result.resetAt;
        retryAfter = result.retryAfter;
      }

      // Set rate limit headers
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(resetAt));

      if (!allowed) {
        if (retryAfter !== undefined) {
          c.header('Retry-After', String(retryAfter));
        }

        structuredLog(c, 'warn', 'Rate limit exceeded', {
          clientIP,
          path,
          limit: maxRequests,
          window: windowSeconds,
        });

        return c.json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Trop de requêtes. Veuillez réessayer plus tard.',
          },
        }, 429);
      }

      return next();
    } catch (error) {
      // SECURITY: Fail-closed approach - deny requests when rate limiting fails
      structuredLog(c, 'error', 'Rate limiting error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clientIP,
        path,
      });

      return c.json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporairement indisponible. Veuillez réessayer.',
        },
      }, 503);
    }
  };
}

/**
 * Check rate limit using Durable Objects (strongly consistent)
 */
async function checkRateLimitDO(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
  const id = c.env.RATE_LIMITER.idFromName(key);
  const stub = c.env.RATE_LIMITER.get(id);

  const response = await stub.fetch(new Request('https://rate-limiter/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxRequests, windowSeconds }),
  }));

  return response.json();
}

/**
 * Check rate limit using KV (eventually consistent but faster)
 */
async function checkRateLimitKV(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Get current request count from KV
  const currentData = await c.env.CACHE.get(key);

  let requestCount = 0;
  let windowStart = now;

  if (currentData) {
    try {
      const parsed = JSON.parse(currentData) as RateLimitState;
      // Validate parsed data
      if (
        typeof parsed.count === 'number' &&
        typeof parsed.start === 'number' &&
        now - parsed.start < windowSeconds
      ) {
        requestCount = parsed.count;
        windowStart = parsed.start;
      }
    } catch {
      // Invalid data in KV, start fresh
    }
  }

  const resetAt = windowStart + windowSeconds;

  // Check if rate limit exceeded
  if (requestCount >= maxRequests) {
    const retryAfter = resetAt - now;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter,
    };
  }

  // Increment request count
  const newCount = requestCount + 1;
  await c.env.CACHE.put(
    key,
    JSON.stringify({ count: newCount, start: windowStart }),
    { expirationTtl: windowSeconds }
  );

  return {
    allowed: true,
    remaining: maxRequests - newCount,
    resetAt,
  };
}

/**
 * Stricter rate limiting for authentication endpoints
 * Uses Durable Objects for strong consistency to prevent brute-force attacks
 */
export const authRateLimit = rateLimitMiddleware({
  maxRequests: 5,
  windowSeconds: 60,
  keyPrefix: 'rl:auth',
  useDurableObjects: true,
});

/**
 * Standard rate limiting for general API endpoints
 */
export const apiRateLimit = rateLimitMiddleware({
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: 'rl:api',
  useDurableObjects: false,
});

/**
 * Lenient rate limiting for read-only endpoints
 */
export const readRateLimit = rateLimitMiddleware({
  maxRequests: 200,
  windowSeconds: 60,
  keyPrefix: 'rl:read',
  useDurableObjects: false,
});

/**
 * Very strict rate limiting for sensitive operations (password reset, etc.)
 */
export const sensitiveRateLimit = rateLimitMiddleware({
  maxRequests: 3,
  windowSeconds: 300, // 5 minutes
  keyPrefix: 'rl:sensitive',
  useDurableObjects: true,
});
