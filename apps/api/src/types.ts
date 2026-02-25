import type { JWTPayload, Role } from '@dhamen/shared';
import type { Context } from 'hono';

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

  // Notification providers (optional)
  SENDGRID_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  RESEND_API_KEY?: string;
}

/**
 * Variables stored in Hono context
 */
export interface Variables {
  user: JWTPayload;
  requestId: string;
}

/**
 * App environment type for Hono
 */
export type AppEnv = { Bindings: Bindings; Variables: Variables };

/**
 * Hono context with our bindings and variables
 */
export type AppContext = Context<AppEnv>;

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
