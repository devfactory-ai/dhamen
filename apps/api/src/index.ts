import { Hono } from 'hono';
import { createCorsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { apiRateLimit, authRateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import {
  adherents,
  auth,
  claims,
  contracts,
  health,
  insurers,
  providers,
  notifications,
  bordereaux,
  eligibility,
  tarification,
  fraud,
  reconciliation,
  sante,
} from './routes';
import type { Bindings, Variables } from './types';

// Export Durable Objects
export { RateLimiter } from './durable-objects/rate-limiter';

/**
 * Dhamen API - Cloudflare Worker
 *
 * Main entry point for the Hono API application
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global middleware - Security headers first
app.use('*', securityHeaders());

// CORS is environment-aware
app.use('*', async (c, next) => {
  const corsHandler = createCorsMiddleware(c.env.ENVIRONMENT);
  return corsHandler(c, next);
});
app.use('*', requestIdMiddleware);
app.onError(errorHandler);

// API version prefix
const api = app.basePath('/api/v1');

// Apply rate limiting to auth endpoints (stricter)
api.use('/auth/*', authRateLimit);

// Apply rate limiting to other API endpoints
api.use('*', apiRateLimit);

// Mount routes
api.route('/health', health);
api.route('/auth', auth);
api.route('/providers', providers);
api.route('/adherents', adherents);
api.route('/contracts', contracts);
api.route('/insurers', insurers);
api.route('/claims', claims);
api.route('/notifications', notifications);
api.route('/bordereaux', bordereaux);

// AI Agent routes
api.route('/eligibility', eligibility);
api.route('/tarification', tarification);
api.route('/fraud', fraud);
api.route('/reconciliation', reconciliation);

// SoinFlow routes
api.route('/sante', sante);

// Root redirect
app.get('/', (c) => {
  return c.json({
    name: 'Dhamen API',
    version: '0.1.0',
    description: 'Plateforme IA-native de tiers payant santé pour la Tunisie',
    docs: '/api/v1/health',
  });
});

// 404 handler for unmatched routes
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route non trouvée',
      },
    },
    404
  );
});

export default app;
