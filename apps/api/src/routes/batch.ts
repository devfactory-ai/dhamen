/**
 * Batch Processing Routes
 *
 * Manage batch jobs for bulk operations
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireAuth, requireRole } from '../middleware/auth';
import { BatchService, type BatchJobType } from '../services/batch.service';

const batch = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
batch.use('*', authMiddleware());
batch.use('*', requireAuth);

/**
 * POST /batch/jobs
 * Create a new batch job
 */
batch.post(
  '/jobs',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const body = await c.req.json<{
      type: BatchJobType;
      params: Record<string, unknown>;
    }>();

    if (!body.type || !body.params) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'type et params sont requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const batchService = new BatchService(c.env);

    const job = await batchService.createJob(body.type, body.params, user.id);

    return c.json({
      success: true,
      data: job,
    }, 201);
  }
);

/**
 * GET /batch/jobs
 * List batch jobs
 */
batch.get(
  '/jobs',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const type = c.req.query('type') as BatchJobType | undefined;
    const status = c.req.query('status') as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | undefined;
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const batchService = new BatchService(c.env);

    const result = await batchService.listJobs({ type, status, limit, offset });

    return c.json({
      success: true,
      data: result.jobs,
      meta: {
        total: result.total,
        limit,
        offset,
      },
    });
  }
);

/**
 * GET /batch/jobs/:id
 * Get job details
 */
batch.get(
  '/jobs/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const id = c.req.param('id');

    const batchService = new BatchService(c.env);
    const job = await batchService.getJob(id);

    if (!job) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job non trouvé' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: job,
    });
  }
);

/**
 * POST /batch/jobs/:id/start
 * Start processing a job
 */
batch.post(
  '/jobs/:id/start',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const id = c.req.param('id');

    const batchService = new BatchService(c.env);

    try {
      const job = await batchService.processJob(id);

      return c.json({
        success: true,
        data: job,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: 'PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'Processing failed',
          },
        },
        400
      );
    }
  }
);

/**
 * POST /batch/jobs/:id/cancel
 * Cancel a pending job
 */
batch.post(
  '/jobs/:id/cancel',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');

    const batchService = new BatchService(c.env);
    const cancelled = await batchService.cancelJob(id);

    if (!cancelled) {
      return c.json(
        {
          success: false,
          error: { code: 'CANNOT_CANCEL', message: 'Job ne peut pas être annulé' },
        },
        400
      );
    }

    return c.json({
      success: true,
      data: { cancelled: true },
    });
  }
);

/**
 * POST /batch/claims/approve
 * Bulk approve claims
 */
batch.post(
  '/claims/approve',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const body = await c.req.json<{
      claimIds: string[];
      comment?: string;
    }>();

    if (!body.claimIds || body.claimIds.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'claimIds requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const batchService = new BatchService(c.env);

    const job = await batchService.createJob(
      'claims_approve',
      {
        claimIds: body.claimIds,
        approvedBy: user.id,
        comment: body.comment,
      },
      user.id
    );

    // Start processing immediately
    const completedJob = await batchService.processJob(job.id);

    return c.json({
      success: true,
      data: completedJob,
    });
  }
);

/**
 * POST /batch/claims/reject
 * Bulk reject claims
 */
batch.post(
  '/claims/reject',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const body = await c.req.json<{
      claimIds: string[];
      reason: string;
      comment?: string;
    }>();

    if (!body.claimIds || body.claimIds.length === 0 || !body.reason) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'claimIds et reason requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const batchService = new BatchService(c.env);

    const job = await batchService.createJob(
      'claims_reject',
      {
        claimIds: body.claimIds,
        rejectedBy: user.id,
        reason: body.reason,
        comment: body.comment,
      },
      user.id
    );

    const completedJob = await batchService.processJob(job.id);

    return c.json({
      success: true,
      data: completedJob,
    });
  }
);

/**
 * POST /batch/bordereaux/generate
 * Generate bordereaux in batch
 */
batch.post(
  '/bordereaux/generate',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const body = await c.req.json<{
      insurerId: string;
      providerId?: string;
      startDate: string;
      endDate: string;
      type?: 'pharmacie' | 'consultation' | 'all';
    }>();

    if (!body.insurerId || !body.startDate || !body.endDate) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'insurerId, startDate et endDate requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const batchService = new BatchService(c.env);

    const job = await batchService.createJob(
      'bordereau_generate',
      {
        insurerId: body.insurerId,
        providerId: body.providerId,
        startDate: body.startDate,
        endDate: body.endDate,
        type: body.type || 'all',
      },
      user.id
    );

    const completedJob = await batchService.processJob(job.id);

    return c.json({
      success: true,
      data: completedJob,
    });
  }
);

/**
 * POST /batch/bordereaux/validate
 * Validate bordereaux in batch
 */
batch.post(
  '/bordereaux/validate',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const body = await c.req.json<{
      bordereauIds: string[];
    }>();

    if (!body.bordereauIds || body.bordereauIds.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'bordereauIds requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const batchService = new BatchService(c.env);

    const job = await batchService.createJob(
      'bordereau_validate',
      {
        bordereauIds: body.bordereauIds,
        validatedBy: user.id,
      },
      user.id
    );

    const completedJob = await batchService.processJob(job.id);

    return c.json({
      success: true,
      data: completedJob,
    });
  }
);

/**
 * POST /batch/reconciliation
 * Run reconciliation in batch
 */
batch.post(
  '/reconciliation',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const body = await c.req.json<{
      insurerId: string;
      startDate: string;
      endDate: string;
      autoMatch?: boolean;
    }>();

    if (!body.insurerId || !body.startDate || !body.endDate) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'insurerId, startDate et endDate requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const batchService = new BatchService(c.env);

    const job = await batchService.createJob(
      'reconciliation_run',
      {
        insurerId: body.insurerId,
        startDate: body.startDate,
        endDate: body.endDate,
        autoMatch: body.autoMatch ?? true,
      },
      user.id
    );

    const completedJob = await batchService.processJob(job.id);

    return c.json({
      success: true,
      data: completedJob,
    });
  }
);

/**
 * POST /batch/adherents/import
 * Import adherents in batch
 */
batch.post(
  '/adherents/import',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const body = await c.req.json<{
      contractId: string;
      data: {
        matricule: string;
        firstName: string;
        lastName: string;
        dateOfBirth: string;
        nationalId: string;
        email?: string;
        phone?: string;
      }[];
    }>();

    if (!body.contractId || !body.data || body.data.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'contractId et data requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const batchService = new BatchService(c.env);

    const job = await batchService.createJob(
      'adherents_import',
      {
        contractId: body.contractId,
        data: body.data,
      },
      user.id
    );

    const completedJob = await batchService.processJob(job.id);

    return c.json({
      success: true,
      data: completedJob,
    });
  }
);

/**
 * GET /batch/types
 * List available batch job types
 */
batch.get('/types', (c) => {
  const types = [
    { code: 'claims_approve', label: 'Approbation en lot des demandes', category: 'claims' },
    { code: 'claims_reject', label: 'Rejet en lot des demandes', category: 'claims' },
    { code: 'claims_process', label: 'Traitement automatique des demandes', category: 'claims' },
    { code: 'bordereau_generate', label: 'Génération des bordereaux', category: 'bordereaux' },
    { code: 'bordereau_validate', label: 'Validation des bordereaux', category: 'bordereaux' },
    { code: 'reconciliation_run', label: 'Exécution du rapprochement', category: 'reconciliation' },
    { code: 'adherents_import', label: 'Import des adhérents', category: 'adherents' },
    { code: 'adherents_update', label: 'Mise à jour des adhérents', category: 'adherents' },
    { code: 'notifications_send', label: 'Envoi de notifications', category: 'notifications' },
    { code: 'reports_generate', label: 'Génération de rapports', category: 'reports' },
    { code: 'data_export', label: 'Export de données', category: 'data' },
  ];

  return c.json({
    success: true,
    data: types,
  });
});

export default batch;
