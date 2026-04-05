import type { JWTPayload, Role } from '@dhamen/shared';
import type { Context } from 'hono';

/**
 * Tenant configuration stored in KV registry
 */
export interface TenantConfig {
  tenantId: string;
  code: string;           // STAR, GAT, COMAR, AMI
  name: string;
  subdomain: string;
  databaseBinding: string; // DB_STAR, DB_GAT, DB_COMAR, DB_AMI
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
  config?: {
    allowedCareTypes?: string[];
    maxClaimAmount?: number;
    autoApproveThreshold?: number;
    fraudScoreThreshold?: number;
    bordereauCycle?: 'daily' | 'weekly' | 'monthly';
    branding?: {
      logo?: string;
      primaryColor?: string;
      companyName?: string;
    };
  };
}

/**
 * Cloudflare Worker bindings
 */
export interface Bindings {
  // Legacy single DB (kept for backward compatibility during migration)
  DB: D1Database;

  // Multi-tenant D1 databases
  DB_PLATFORM: D1Database;
  DB_STAR: D1Database;
  DB_GAT: D1Database;
  DB_COMAR: D1Database;
  DB_AMI: D1Database;
  DB_BH: D1Database;

  // KV namespaces
  CACHE: KVNamespace;
  TENANT_REGISTRY: KVNamespace;

  // Storage
  STORAGE: R2Bucket;
  EVENTS_QUEUE: Queue;
  RATE_LIMITER: DurableObjectNamespace;
  NOTIFICATION_HUB: DurableObjectNamespace;
  AI: Ai;

  // Environment variables
  ENVIRONMENT: string;
  API_VERSION: string;
  JWT_ISSUER: string;
  JWT_EXPIRES_IN: string;
  REFRESH_EXPIRES_IN: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;

  // Optional configuration
  API_BASE_URL?: string;
  WEB_BASE_URL?: string;
  OCR_URL?: string;
  GEMINI_API_KEY?: string;

  // Notification providers (optional)
  SENDGRID_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  BREVO_API_KEY?: string;

  // Cloudflare Turnstile
  TURNSTILE_SECRET_KEY?: string;

  // WebAuthn / Passkey
  WEBAUTHN_RP_NAME?: string;
  WEBAUTHN_RP_ID?: string;

  // Webhooks
  WEBHOOK_SECRET?: string;

  // CNAM Integration (optional)
  CNAM_API_URL?: string;
  CNAM_API_KEY?: string;
}

/**
 * API Key context for public API
 */
export interface ApiKeyContext {
  id: string;
  type?: string;
  name?: string;
  insurerId?: string | null;
  providerId?: string | null;
  partnerId?: string;
  partnerType?: 'insurer' | 'provider' | 'pharmacy' | 'lab' | 'third_party';
  scopes?: string[];
  permissions?: string[];
  rateLimit?: number;
  isActive?: boolean;
}

/**
 * Legacy tenant context (for backward compatibility with existing tenant.ts)
 */
export interface LegacyTenantContext {
  tenantId: string;
  tenantType: 'insurer' | 'platform';
  tenantName: string;
  tenantConfig: {
    allowedCareTypes: string[];
    maxClaimAmount: number;
    autoApproveThreshold: number;
    fraudScoreThreshold: number;
    bordereauCycle: 'daily' | 'weekly' | 'monthly';
    notificationChannels: string[];
    customFields?: Record<string, unknown>;
    branding?: {
      logo?: string;
      primaryColor?: string;
      companyName?: string;
    };
  };
}

/**
 * Variables stored in Hono context
 */
export interface Variables {
  user: JWTPayload;
  requestId: string;
  apiKey?: ApiKeyContext;

  // Multi-tenant context (new architecture)
  tenant?: TenantConfig | LegacyTenantContext;
  tenantDb: D1Database;
  isPlatformAdmin: boolean;
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
