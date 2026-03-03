import { createAuditLog } from '@dhamen/db';
import type { MiddlewareHandler, Context } from 'hono';
import { generateId } from '../lib/ulid';
import { maskObject } from './data-masking';
import type { Bindings, Variables } from '../types';

type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'approve'
  | 'reject'
  | 'view'
  | 'export'
  | 'import'
  | 'verify'
  | 'suspend'
  | 'reactivate'
  | 'revoke';

type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

interface AuditMetadata {
  requestId?: string;
  sessionId?: string;
  deviceId?: string;
  geoLocation?: {
    country?: string;
    city?: string;
    region?: string;
  };
  cloudflare?: {
    colo?: string;
    httpProtocol?: string;
    tlsVersion?: string;
    clientTrustScore?: number;
  };
  performance?: {
    processingTimeMs: number;
    dbQueryCount?: number;
    cacheHit?: boolean;
  };
}

/**
 * Extract Cloudflare-specific metadata from request
 */
function extractCloudflareMetadata(c: Context): AuditMetadata['cloudflare'] {
  return {
    colo: c.req.header('CF-Ray')?.split('-')[1],
    httpProtocol: c.req.header('CF-Visitor')
      ? JSON.parse(c.req.header('CF-Visitor') || '{}').scheme
      : undefined,
    tlsVersion: c.req.header('CF-TLS-Version'),
  };
}

/**
 * Extract geo-location from Cloudflare headers
 */
function extractGeoLocation(c: Context): AuditMetadata['geoLocation'] {
  return {
    country: c.req.header('CF-IPCountry'),
    city: c.req.header('CF-IPCity'),
    region: c.req.header('CF-IPRegion'),
  };
}

/**
 * Determine audit severity based on action and entity type
 */
function determineSeverity(action: AuditAction, entityType: string): AuditSeverity {
  // Critical: security-related actions
  if (action === 'login' || action === 'logout') return 'high';
  if (entityType === 'user' && (action === 'create' || action === 'delete')) return 'critical';
  if (entityType === 'api_key' || entityType === 'webhook') return 'high';

  // High: financial and approval actions
  if (action === 'approve' || action === 'reject') return 'high';
  if (entityType === 'claim' || entityType === 'bordereau' || entityType === 'paiement') return 'medium';

  // Medium: mutations
  if (action === 'create' || action === 'update' || action === 'delete') return 'medium';

  // Low: read operations
  return 'low';
}

/**
 * Fields that should be completely redacted in audit logs
 */
const REDACTED_FIELDS = [
  'password',
  'password_hash',
  'secret',
  'api_key',
  'token',
  'refresh_token',
  'totp_secret',
];

/**
 * Sanitize changes object before storing in audit log
 */
function sanitizeChanges(changes: Record<string, unknown>): Record<string, unknown> {
  return maskObject(changes, REDACTED_FIELDS) as Record<string, unknown>;
}

/**
 * Audit trail middleware for mutations
 * Records all write operations in the audit_logs table with enhanced metadata
 */
export function auditMiddleware(options: {
  action: AuditAction;
  entityType: string;
  getEntityId: (c: Context<{ Bindings: Bindings; Variables: Variables }>) => string;
  getChanges?: (c: Context<{ Bindings: Bindings; Variables: Variables }>) => Promise<Record<string, unknown>>;
  severity?: AuditSeverity;
  skipOnFailure?: boolean;
}): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    const startTime = Date.now();
    const requestId = c.get('requestId') || generateId();

    // Execute the route handler
    await next();

    // Only log successful mutations (or all if skipOnFailure is false)
    const status = c.res.status;
    const shouldLog = options.skipOnFailure === false
      ? true
      : (status >= 200 && status < 300);

    if (shouldLog) {
      try {
        const user = c.get('user');
        const entityId = options.getEntityId(c);
        let changes: Record<string, unknown> = {};

        if (options.getChanges) {
          try {
            changes = await options.getChanges(c);
          } catch {
            // Request body may have already been consumed
          }
        }

        // Build comprehensive metadata
        const metadata: AuditMetadata = {
          requestId,
          sessionId: c.req.header('X-Session-ID'),
          deviceId: c.req.header('X-Device-ID'),
          geoLocation: extractGeoLocation(c),
          cloudflare: extractCloudflareMetadata(c),
          performance: {
            processingTimeMs: Date.now() - startTime,
          },
        };

        const severity = options.severity || determineSeverity(options.action, options.entityType);

        await createAuditLog(c.env.DB, generateId(), {
          userId: user?.sub,
          action: `${options.entityType}.${options.action}`,
          entityType: options.entityType,
          entityId,
          changes: {
            ...sanitizeChanges(changes),
            _metadata: metadata,
            _severity: severity,
            _status: status,
          },
          ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For'),
          userAgent: c.req.header('User-Agent'),
        });
      } catch (err) {
        // Log error but don't fail the request
        console.error('Audit log failed:', err);
      }
    }
  };
}

/**
 * Log an audit event manually (for complex flows)
 * Uses fire-and-forget pattern to avoid blocking responses
 */
export async function logAudit(
  db: D1Database,
  options: {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    changes?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    severity?: AuditSeverity;
    metadata?: AuditMetadata;
  },
  /** Optional execution context for non-blocking writes */
  ctx?: ExecutionContext
): Promise<void> {
  const sanitizedChanges = options.changes
    ? sanitizeChanges(options.changes)
    : undefined;

  const auditPromise = createAuditLog(db, generateId(), {
    ...options,
    changes: sanitizedChanges
      ? {
          ...sanitizedChanges,
          _severity: options.severity || 'medium',
          _metadata: options.metadata,
        }
      : undefined,
  }).catch((err) => {
    // Log error but don't fail the request
    console.error('Audit log failed:', err);
  });

  // If execution context is provided, use waitUntil for non-blocking write
  if (ctx) {
    ctx.waitUntil(auditPromise);
  } else {
    // Fallback to blocking await if no context
    await auditPromise;
  }
}

/**
 * Log a security event (login attempts, MFA, etc.)
 * Uses fire-and-forget pattern when ctx is provided
 */
export async function logSecurityEvent(
  db: D1Database,
  options: {
    userId?: string;
    action: 'login_success' | 'login_failure' | 'mfa_success' | 'mfa_failure' | 'password_change' | 'session_expired';
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  },
  ctx?: ExecutionContext
): Promise<void> {
  const auditPromise = createAuditLog(db, generateId(), {
    userId: options.userId,
    action: `security.${options.action}`,
    entityType: 'security',
    entityId: options.userId || 'anonymous',
    changes: {
      ...options.details,
      _severity: options.action.includes('failure') ? 'high' : 'medium',
    },
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  }).catch((err) => console.error('Security audit log failed:', err));

  if (ctx) {
    ctx.waitUntil(auditPromise);
  } else {
    await auditPromise;
  }
}

/**
 * Log a data access event (for compliance/GDPR)
 * Uses fire-and-forget pattern when ctx is provided
 */
export async function logDataAccess(
  db: D1Database,
  options: {
    userId: string;
    entityType: string;
    entityId: string;
    accessType: 'view' | 'export' | 'print' | 'download';
    ipAddress?: string;
    userAgent?: string;
    reason?: string;
  },
  ctx?: ExecutionContext
): Promise<void> {
  const auditPromise = createAuditLog(db, generateId(), {
    userId: options.userId,
    action: `data.${options.accessType}`,
    entityType: options.entityType,
    entityId: options.entityId,
    changes: {
      accessType: options.accessType,
      reason: options.reason,
      _severity: 'low',
    },
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  }).catch((err) => console.error('Data access audit log failed:', err));

  if (ctx) {
    ctx.waitUntil(auditPromise);
  } else {
    await auditPromise;
  }
}
