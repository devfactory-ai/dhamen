import type { Context } from 'hono';
import type { JWTPayload, Role } from '@dhamen/shared';

/**
 * Cloudflare Worker bindings
 */
export interface Bindings {
  DB: D1Database;
  CACHE: KVNamespace;
  STORAGE: R2Bucket;
  EVENTS_QUEUE: Queue;
  RATE_LIMITER: DurableObjectNamespace;

  // Environment variables
  ENVIRONMENT: string;
  API_VERSION: string;
  JWT_ISSUER: string;
  JWT_EXPIRES_IN: string;
  REFRESH_EXPIRES_IN: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
}

/**
 * Variables stored in Hono context
 */
export interface Variables {
  user?: JWTPayload;
  requestId: string;
}

/**
 * Hono context with our bindings and variables
 */
export type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Route handler type
 */
export type RouteHandler = (c: AppContext) => Promise<Response> | Response;

/**
 * Middleware configuration
 */
export interface AuthConfig {
  roles?: Role[];
  optional?: boolean;
}
