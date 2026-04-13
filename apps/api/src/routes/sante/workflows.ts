/**
 * SoinFlow Workflows Routes
 *
 * API endpoints for workflow management:
 * - Information requests
 * - Escalations
 * - Multi-level validations
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';
import { authMiddleware, requireAuth, requireRole } from '../../middleware/auth';
import { successData as success, errorData as error } from '../../lib/response';
import {
  createWorkflowService,
  DEFAULT_VALIDATION_CONFIG,
} from '../../services/workflow.service';

export const workflows = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
workflows.use('*', authMiddleware());
workflows.use('*', requireAuth);

// ==========================================================================
// Schema Validations
// ==========================================================================

const InfoRequestSchema = z.object({
  demandeId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  documentsRequis: z.array(z.string()).default([]),
  message: z.string().min(1).max(2000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const InfoResponseSchema = z.object({
  workflowId: z.string().uuid(),
  documents: z.array(z.string()).optional(),
  message: z.string().min(1).max(2000),
});

const EscalationSchema = z.object({
  demandeId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
  escalateTo: z.enum(['supervisor', 'manager', 'director']).default('supervisor'),
  notes: z.string().max(2000).default(''),
});

const EscalationResolveSchema = z.object({
  workflowId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'return']),
  notes: z.string().max(2000).default(''),
  newStatus: z.enum([
    'soumise', 'en_examen', 'info_requise', 'approuvee', 'en_paiement', 'payee', 'rejetee',
  ]).optional(),
});

const ValidationSchema = z.object({
  workflowId: z.string().uuid(),
  approved: z.boolean(),
  notes: z.string().max(2000).default(''),
});

// ==========================================================================
// Information Request Endpoints
// ==========================================================================

/**
 * POST /info-request - Start information request workflow
 */
workflows.post(
  '/info-request',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const body = await c.req.json();
    const validation = InfoRequestSchema.safeParse(body);

    if (!validation.success) {
      return c.json(error('VALIDATION_ERROR', validation.error.message), 400);
    }

    const user = c.get('user');
    const service = createWorkflowService(c);

    try {
      const workflow = await service.startInfoRequestWorkflow(
        validation.data.demandeId,
        {
          reason: validation.data.reason,
          documentsRequis: validation.data.documentsRequis,
          message: validation.data.message,
          dueDate: validation.data.dueDate,
        },
        user.id
      );

      return c.json(success(workflow));
    } catch (err) {
      console.error('Failed to start info request:', err);
      return c.json(error('WORKFLOW_ERROR', 'Erreur lors de la creation du workflow'), 500);
    }
  }
);

/**
 * POST /info-response - Submit response to information request
 */
workflows.post(
  '/info-response',
  requireAuth, // Any authenticated user (adherent or agent)
  async (c) => {
    const body = await c.req.json();
    const validation = InfoResponseSchema.safeParse(body);

    if (!validation.success) {
      return c.json(error('VALIDATION_ERROR', validation.error.message), 400);
    }

    const user = c.get('user');
    const service = createWorkflowService(c);

    try {
      const workflow = await service.submitInfoResponse(
        validation.data.workflowId,
        {
          documents: validation.data.documents,
          message: validation.data.message,
        },
        user.id
      );

      return c.json(success(workflow));
    } catch (err) {
      if (err instanceof Error && err.message === 'WORKFLOW_NOT_FOUND') {
        return c.json(error('NOT_FOUND', 'Workflow non trouve'), 404);
      }
      console.error('Failed to submit info response:', err);
      return c.json(error('WORKFLOW_ERROR', 'Erreur lors de la soumission'), 500);
    }
  }
);

// ==========================================================================
// Escalation Endpoints
// ==========================================================================

/**
 * POST /escalation - Start escalation workflow
 */
workflows.post(
  '/escalation',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const body = await c.req.json();
    const validation = EscalationSchema.safeParse(body);

    if (!validation.success) {
      return c.json(error('VALIDATION_ERROR', validation.error.message), 400);
    }

    const user = c.get('user');
    const service = createWorkflowService(c);

    try {
      const workflow = await service.startEscalationWorkflow(
        validation.data.demandeId,
        {
          reason: validation.data.reason,
          priority: validation.data.priority,
          escalateTo: validation.data.escalateTo,
          notes: validation.data.notes,
        },
        user.id
      );

      return c.json(success(workflow));
    } catch (err) {
      console.error('Failed to start escalation:', err);
      return c.json(error('WORKFLOW_ERROR', 'Erreur lors de l\'escalade'), 500);
    }
  }
);

/**
 * POST /escalation/resolve - Resolve escalation
 */
workflows.post(
  '/escalation/resolve',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR', 'ADMIN'),
  async (c) => {
    const body = await c.req.json();
    const validation = EscalationResolveSchema.safeParse(body);

    if (!validation.success) {
      return c.json(error('VALIDATION_ERROR', validation.error.message), 400);
    }

    const user = c.get('user');
    const service = createWorkflowService(c);

    try {
      const workflow = await service.resolveEscalation(
        validation.data.workflowId,
        {
          action: validation.data.action,
          notes: validation.data.notes,
          newStatus: validation.data.newStatus,
        },
        user.id
      );

      return c.json(success(workflow));
    } catch (err) {
      if (err instanceof Error && err.message === 'WORKFLOW_NOT_FOUND') {
        return c.json(error('NOT_FOUND', 'Workflow non trouve'), 404);
      }
      console.error('Failed to resolve escalation:', err);
      return c.json(error('WORKFLOW_ERROR', 'Erreur lors de la resolution'), 500);
    }
  }
);

// ==========================================================================
// Multi-Level Validation Endpoints
// ==========================================================================

/**
 * POST /validation/start - Start multi-level validation
 */
workflows.post(
  '/validation/start',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const body = await c.req.json();
    const demandeId = body.demandeId;
    const montant = body.montant;

    if (!demandeId || typeof montant !== 'number') {
      return c.json(error('VALIDATION_ERROR', 'demandeId et montant requis'), 400);
    }

    const service = createWorkflowService(c);

    try {
      const workflow = await service.startMultiValidation(
        demandeId,
        montant,
        DEFAULT_VALIDATION_CONFIG
      );

      return c.json(success(workflow));
    } catch (err) {
      console.error('Failed to start validation:', err);
      return c.json(error('WORKFLOW_ERROR', 'Erreur lors du demarrage de la validation'), 500);
    }
  }
);

/**
 * POST /validation/submit - Submit validation decision
 */
workflows.post(
  '/validation/submit',
  requireRole('SOIN_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR', 'ADMIN'),
  async (c) => {
    const body = await c.req.json();
    const validation = ValidationSchema.safeParse(body);

    if (!validation.success) {
      return c.json(error('VALIDATION_ERROR', validation.error.message), 400);
    }

    const user = c.get('user');
    const service = createWorkflowService(c);

    try {
      const workflow = await service.submitValidation(
        validation.data.workflowId,
        {
          approved: validation.data.approved,
          notes: validation.data.notes,
        },
        user.id
      );

      return c.json(success(workflow));
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'WORKFLOW_NOT_FOUND') {
          return c.json(error('NOT_FOUND', 'Workflow non trouve'), 404);
        }
        if (err.message === 'INVALID_WORKFLOW_STATE') {
          return c.json(error('INVALID_STATE', 'Etat du workflow invalide'), 400);
        }
      }
      console.error('Failed to submit validation:', err);
      return c.json(error('WORKFLOW_ERROR', 'Erreur lors de la validation'), 500);
    }
  }
);

// ==========================================================================
// Query Endpoints
// ==========================================================================

/**
 * GET /demande/:demandeId - Get workflows for a demande
 */
workflows.get(
  '/demande/:demandeId',
  requireAuth,
  async (c) => {
    const demandeId = c.req.param('demandeId');
    const service = createWorkflowService(c);

    try {
      const workflowsList = await service.getWorkflowsForDemande(demandeId);
      return c.json(success(workflowsList));
    } catch (err) {
      console.error('Failed to get workflows:', err);
      return c.json(error('QUERY_ERROR', 'Erreur lors de la recuperation'), 500);
    }
  }
);

/**
 * GET /:workflowId - Get specific workflow
 */
workflows.get(
  '/:workflowId',
  requireAuth,
  async (c) => {
    const workflowId = c.req.param('workflowId');
    const service = createWorkflowService(c);

    try {
      const workflow = await service.getWorkflow(workflowId);
      if (!workflow) {
        return c.json(error('NOT_FOUND', 'Workflow non trouve'), 404);
      }
      return c.json(success(workflow));
    } catch (err) {
      console.error('Failed to get workflow:', err);
      return c.json(error('QUERY_ERROR', 'Erreur lors de la recuperation'), 500);
    }
  }
);

/**
 * GET /pending - Get pending workflows for current user's role
 */
workflows.get(
  '/pending/my',
  requireAuth,
  async (c) => {
    const user = c.get('user');

    try {
      const results = await getDb(c).prepare(`
        SELECT w.id, w.demande_id, w.type, w.status, w.current_step,
               w.steps_json, w.metadata_json, w.created_at,
               d.numero_demande, d.montant_demande, d.type_soin
        FROM sante_workflows w
        JOIN sante_demandes d ON w.demande_id = d.id
        WHERE w.status = 'in_progress'
          AND EXISTS (
            SELECT 1 FROM json_each(w.steps_json) AS step
            WHERE json_extract(step.value, '$.status') = 'in_progress'
              AND (
                json_extract(step.value, '$.assignedTo') = ?
                OR json_extract(step.value, '$.assignedRole') = ?
              )
          )
        ORDER BY w.created_at DESC
        LIMIT 50
      `)
        .bind(user.id, user.role)
        .all();

      const pendingWorkflows = (results.results || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        demandeId: r.demande_id,
        type: r.type,
        status: r.status,
        currentStep: r.current_step,
        steps: JSON.parse(r.steps_json as string),
        metadata: JSON.parse(r.metadata_json as string),
        createdAt: r.created_at,
        demande: {
          numero: r.numero_demande,
          montant: r.montant_demande,
          typeSoin: r.type_soin,
        },
      }));

      return c.json(success(pendingWorkflows));
    } catch (err) {
      console.error('Failed to get pending workflows:', err);
      return c.json(error('QUERY_ERROR', 'Erreur lors de la recuperation'), 500);
    }
  }
);
