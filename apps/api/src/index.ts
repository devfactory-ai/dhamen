import { Hono } from 'hono';
import { createCorsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { apiRateLimit, authRateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import { tenantResolverMiddleware } from './middleware/tenant-resolver';
import {
  adherents,
  auth,
  users,
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
  webhooks,
  publicApi,
  realtime,
  exports,
  compliance,
  ocr,
  cnam,
  analytics,
  documents,
  audit,
  webhooksOutbound,
  publicApiV2,
  batch,
  payments,
  dashboardRealtime,
  contractManagement,
  aiReconciliation,
  mobile,
  monitoring,
  docs,
  virtualCards,
  sms,
  mfVerification,
  medications,
  bulletinsSoins,
  bulletinTemplates,
  bulletinsAgent,
  bulletinsArchive,
  consommation,
  companies,
  appeals,
  preAuthorizations,
  groupContracts,
  medicationFamilyBaremes,
  roles,
  adminStats,
  praticien,
} from './routes';
import type { Bindings, Variables } from './types';

// Export Durable Objects
export { RateLimiter } from './durable-objects/rate-limiter';
export { NotificationHub } from './durable-objects/notification-hub';

/**
 * E-Santé API - Cloudflare Worker
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

// Tenant resolution - routes to correct D1 database based on subdomain
app.use('*', tenantResolverMiddleware);

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
api.route('/users', users);
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

// Webhooks (no auth middleware - uses signature verification)
app.route('/webhooks', webhooks);

// Public API (uses API key auth)
app.route('/public/v1', publicApi);

// Realtime SSE
api.route('/realtime', realtime);

// Exports (PDF, etc.)
api.route('/exports', exports);

// Compliance and GDPR
api.route('/compliance', compliance);

// OCR Document Processing
api.route('/ocr', ocr);

// CNAM Integration
api.route('/cnam', cnam);

// Analytics
api.route('/analytics', analytics);

// Documents (R2)
api.route('/documents', documents);

// Audit logs
api.route('/audit', audit);

// Sprint 13: Webhooks Outbound
api.route('/webhooks-outbound', webhooksOutbound);

// Sprint 13: Batch Processing
api.route('/batch', batch);

// Sprint 13: Payments
api.route('/payments', payments);

// Sprint 13: Public API V2 (uses API key auth)
app.route('/public/v2', publicApiV2);

// Sprint 14: Dashboard Realtime
api.route('/dashboard', dashboardRealtime);

// Sprint 14: Contract Management
api.route('/contract-management', contractManagement);

// Sprint 14: AI Reconciliation
api.route('/ai-reconciliation', aiReconciliation);

// Sprint 14: Mobile Backend (separate base path)
app.route('/mobile/v1', mobile);

// Sprint 15: Monitoring (public health endpoints)
app.route('/monitoring', monitoring);

// Sprint 15: API Documentation
app.route('/docs', docs);

// Virtual Cards (Digital Adherent Cards)
api.route('/cards', virtualCards);

// SMS Gateway
api.route('/sms', sms);

// MF Verification (Matricule Fiscal)
api.route('/mf-verification', mfVerification);

// Medications (Pharmacie Centrale Tunisie)
api.route('/medications', medications);
api.route('/medication-family-baremes', medicationFamilyBaremes);

// Bulletin templates (public - no auth required for downloading blank forms)
// Must be mounted BEFORE /bulletins-soins to prevent route conflict
api.route('/bulletins-soins/templates', bulletinTemplates);
// Bulletins agent routes (saisie, batches, export)
api.route('/bulletins-soins/agent', bulletinsAgent);
api.route('/bulletins-soins/batches', bulletinsAgent);
// Bulletins archive (import CSV, upload scans, search)
api.route('/bulletins-soins/archive', bulletinsArchive);
// Bulletins de soins (adherent paper forms)
api.route('/bulletins-soins', bulletinsSoins);

// Consommation garanties (adherent coverage tracking)
api.route('/consommation', consommation);

// Companies (entreprises with HR)
api.route('/companies', companies);

// Claims Appeals (recours/contestation)
api.route('/appeals', appeals);

// Pre-Authorizations (accord préalable)
api.route('/pre-authorizations', preAuthorizations);

// Group Contracts (contrats d'assurance groupe)
api.route('/group-contracts', groupContracts);

// Roles management (admin panel)
api.route('/roles', roles);

// Admin dashboard stats
api.route('/admin-stats', adminStats);

// Praticien portal (provider-scoped routes)
api.route('/praticien', praticien);

// Root redirect
app.get('/', (c) => {
  return c.json({
    name: 'E-Santé API',
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
