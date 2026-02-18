import type { MiddlewareHandler } from 'hono';
import type { Bindings, Variables } from '../types';
import { createAuditLog } from '@dhamen/db';
import { generateId } from '../lib/ulid';

type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'approve' | 'reject';

/**
 * Audit trail middleware for mutations
 * Records all write operations in the audit_logs table
 */
export function auditMiddleware(options: {
  action: AuditAction;
  entityType: string;
  getEntityId: (c: { req: { param: (name: string) => string } }) => string;
  getChanges?: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
}): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    const startTime = Date.now();

    // Execute the route handler
    await next();

    // Only log successful mutations
    const status = c.res.status;
    if (status >= 200 && status < 300) {
      try {
        const user = c.get('user');
        const entityId = options.getEntityId(c);
        let changes: Record<string, unknown> | undefined;

        if (options.getChanges) {
          try {
            changes = await options.getChanges(c);
          } catch {
            // Request body may have already been consumed
          }
        }

        await createAuditLog(c.env.DB, generateId(), {
          userId: user?.sub,
          action: `${options.entityType}.${options.action}`,
          entityType: options.entityType,
          entityId,
          changes: {
            ...changes,
            processingTimeMs: Date.now() - startTime,
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
  }
): Promise<void> {
  await createAuditLog(db, generateId(), options);
}
