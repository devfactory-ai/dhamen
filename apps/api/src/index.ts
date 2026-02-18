import { Hono } from 'hono';
import type { Bindings, Variables } from './types';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { health, auth, providers, adherents, contracts, insurers } from './routes';

/**
 * Dhamen API - Cloudflare Worker
 *
 * Main entry point for the Hono API application
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.onError(errorHandler);

// API version prefix
const api = app.basePath('/api/v1');

// Mount routes
api.route('/health', health);
api.route('/auth', auth);
api.route('/providers', providers);
api.route('/adherents', adherents);
api.route('/contracts', contracts);
api.route('/insurers', insurers);

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
