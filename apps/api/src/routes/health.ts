import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { success } from '../lib/response';

const health = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Track server start time
const startTime = Date.now();

/**
 * GET /api/v1/health
 * Health check endpoint
 */
health.get('/', async (c) => {
  const checks: {
    database: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    cache: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    storage: { status: 'ok' | 'error'; error?: string };
  } = {
    database: { status: 'ok' },
    cache: { status: 'ok' },
    storage: { status: 'ok' },
  };

  // Check D1 database
  try {
    const dbStart = Date.now();
    await c.env.DB.prepare('SELECT 1').first();
    checks.database.latencyMs = Date.now() - dbStart;
  } catch (err) {
    checks.database.status = 'error';
    checks.database.error = err instanceof Error ? err.message : 'Unknown error';
  }

  // Check KV cache
  try {
    const cacheStart = Date.now();
    await c.env.CACHE.get('health-check');
    checks.cache.latencyMs = Date.now() - cacheStart;
  } catch (err) {
    checks.cache.status = 'error';
    checks.cache.error = err instanceof Error ? err.message : 'Unknown error';
  }

  // Check R2 storage (just verify binding exists)
  try {
    if (!c.env.STORAGE) {
      throw new Error('Storage binding not configured');
    }
  } catch (err) {
    checks.storage.status = 'error';
    checks.storage.error = err instanceof Error ? err.message : 'Unknown error';
  }

  // Calculate overall status
  const allOk = Object.values(checks).every((check) => check.status === 'ok');
  const anyError = Object.values(checks).some((check) => check.status === 'error');

  const status = anyError ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

  // Calculate uptime
  const uptimeMs = Date.now() - startTime;
  const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
  const uptime = `${days}d ${hours}h ${minutes}m`;

  return success(c, {
    status,
    version: '0.1.0',
    environment: c.env.ENVIRONMENT,
    checks,
    uptime,
  });
});

export { health };
