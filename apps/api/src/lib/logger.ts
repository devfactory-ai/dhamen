import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  environment?: string;
  data?: Record<string, unknown>;
}

/**
 * Structured logger for Workers
 * Creates a logger instance with request context
 */
export function createLogger(requestId?: string, userId?: string, environment?: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId,
      userId,
      environment,
      data,
    };

    // In production, this is sent to Cloudflare Logpush or a log aggregator
    // Console output is structured JSON for easy parsing
    const output = JSON.stringify(entry);

    switch (level) {
      case 'debug':
        if (environment !== 'production') {
          // biome-ignore lint/suspicious/noConsoleLog: Required for logging
          console.log(output);
        }
        break;
      case 'info':
        // biome-ignore lint/suspicious/noConsoleLog: Required for logging
        console.log(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
  };
}

export type Logger = ReturnType<typeof createLogger>;

/**
 * Helper function to log structured data from a Hono context
 * Automatically extracts requestId and userId from context
 */
export function structuredLog(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const requestId = c.get('requestId');
  const user = c.get('user');
  const userId = user?.sub;
  const environment = c.env?.ENVIRONMENT || 'development';

  const logger = createLogger(requestId, userId, environment);

  switch (level) {
    case 'debug':
      logger.debug(message, data);
      break;
    case 'info':
      logger.info(message, data);
      break;
    case 'warn':
      logger.warn(message, data);
      break;
    case 'error':
      logger.error(message, data);
      break;
  }
}

/**
 * Log audit event for mutations
 * Used to track changes to data for compliance
 */
export function logAuditEvent(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, unknown>
): void {
  structuredLog(c, 'info', `Audit: ${action} ${entityType}`, {
    action,
    entityType,
    entityId,
    changes,
  });
}

/**
 * Log security event
 * Used for authentication, authorization failures, etc.
 */
export function logSecurityEvent(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  event: string,
  details?: Record<string, unknown>
): void {
  const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';

  structuredLog(c, 'warn', `Security: ${event}`, {
    event,
    clientIP,
    userAgent,
    ...details,
  });
}

/**
 * Log performance metric
 * Used to track request latency, DB query times, etc.
 */
export function logPerformance(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  operation: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  structuredLog(c, 'info', `Performance: ${operation}`, {
    operation,
    durationMs,
    ...metadata,
  });
}
