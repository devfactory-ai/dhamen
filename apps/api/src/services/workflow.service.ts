/**
 * Workflow Service
 *
 * Manages complex workflows for health claims processing:
 * - Request additional information
 * - Escalation to supervisors
 * - Multi-level validation
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';
import type { SanteStatutDemande } from '@dhamen/shared';

// Workflow types
export type WorkflowType = 'info_request' | 'escalation' | 'multi_validation';

export type WorkflowStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired';

export interface WorkflowStep {
  id: string;
  stepNumber: number;
  type: 'info_request' | 'approval' | 'review' | 'notification';
  assignedTo: string | null;
  assignedRole: string | null;
  status: WorkflowStatus;
  requiredAction: string;
  responseData?: Record<string, unknown>;
  completedAt?: string;
  completedBy?: string;
  dueDate?: string;
}

export interface WorkflowInstance {
  id: string;
  demandeId: string;
  type: WorkflowType;
  status: WorkflowStatus;
  currentStep: number;
  steps: WorkflowStep[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface InfoRequestData {
  reason: string;
  documentsRequis: string[];
  message: string;
  dueDate: string;
}

export interface EscalationData {
  reason: string;
  priority: 'normal' | 'high' | 'urgent';
  escalateTo: 'supervisor' | 'manager' | 'director';
  notes: string;
}

export interface MultiValidationConfig {
  levels: Array<{
    role: string;
    minAmount?: number;
    required: boolean;
  }>;
}

/**
 * Workflow Service Class
 */
export class WorkflowService {
  private c: Context<{ Bindings: Bindings; Variables: Variables }>;

  constructor(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    this.c = c;
  }

  // ==========================================================================
  // Information Request Workflow
  // ==========================================================================

  /**
   * Start an information request workflow
   */
  async startInfoRequestWorkflow(
    demandeId: string,
    data: InfoRequestData,
    initiatorId: string
  ): Promise<WorkflowInstance> {
    const workflowId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Update demande status
    await this.c.env.DB.prepare(`
      UPDATE sante_demandes
      SET statut = 'info_requise', updated_at = ?
      WHERE id = ?
    `)
      .bind(now, demandeId)
      .run();

    // Create workflow instance
    const workflow: WorkflowInstance = {
      id: workflowId,
      demandeId,
      type: 'info_request',
      status: 'in_progress',
      currentStep: 1,
      steps: [
        {
          id: crypto.randomUUID(),
          stepNumber: 1,
          type: 'info_request',
          assignedTo: null, // Will be assigned to adherent
          assignedRole: 'ADHERENT',
          status: 'pending',
          requiredAction: data.message,
          dueDate: data.dueDate,
        },
        {
          id: crypto.randomUUID(),
          stepNumber: 2,
          type: 'review',
          assignedTo: initiatorId,
          assignedRole: null,
          status: 'pending',
          requiredAction: 'Valider les informations recues',
        },
      ],
      metadata: {
        reason: data.reason,
        documentsRequis: data.documentsRequis,
        initiatorId,
      },
      createdAt: now,
      updatedAt: now,
    };

    // Save workflow to DB
    await this.saveWorkflow(workflow);

    // Create notification for adherent
    await this.createNotification(demandeId, {
      type: 'info_request',
      title: 'Information supplementaire requise',
      message: data.message,
      dueDate: data.dueDate,
    });

    return workflow;
  }

  /**
   * Submit response to information request
   */
  async submitInfoResponse(
    workflowId: string,
    responseData: {
      documents?: string[];
      message: string;
    },
    submitterId: string
  ): Promise<WorkflowInstance> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('WORKFLOW_NOT_FOUND');
    }

    const now = new Date().toISOString();

    // Complete step 1
    const step1 = workflow.steps.find((s) => s.stepNumber === 1);
    if (step1) {
      step1.status = 'completed';
      step1.responseData = responseData;
      step1.completedAt = now;
      step1.completedBy = submitterId;
    }

    // Activate step 2
    const step2 = workflow.steps.find((s) => s.stepNumber === 2);
    if (step2) {
      step2.status = 'in_progress';
    }

    workflow.currentStep = 2;
    workflow.updatedAt = now;

    await this.saveWorkflow(workflow);

    // Notify reviewer
    await this.createNotification(workflow.demandeId, {
      type: 'workflow_update',
      title: 'Information recue',
      message: 'L\'adherent a soumis les informations demandees',
      targetUserId: workflow.metadata.initiatorId as string,
    });

    return workflow;
  }

  // ==========================================================================
  // Escalation Workflow
  // ==========================================================================

  /**
   * Start an escalation workflow
   */
  async startEscalationWorkflow(
    demandeId: string,
    data: EscalationData,
    initiatorId: string
  ): Promise<WorkflowInstance> {
    const workflowId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Determine escalation target role
    const targetRole = {
      supervisor: 'SOIN_GESTIONNAIRE',
      manager: 'SOIN_RESPONSABLE',
      director: 'SOIN_DIRECTEUR',
    }[data.escalateTo] || 'SOIN_GESTIONNAIRE';

    // Create workflow
    const workflow: WorkflowInstance = {
      id: workflowId,
      demandeId,
      type: 'escalation',
      status: 'in_progress',
      currentStep: 1,
      steps: [
        {
          id: crypto.randomUUID(),
          stepNumber: 1,
          type: 'review',
          assignedTo: null,
          assignedRole: targetRole,
          status: 'in_progress',
          requiredAction: `Escalade: ${data.reason}`,
        },
      ],
      metadata: {
        reason: data.reason,
        priority: data.priority,
        escalateTo: data.escalateTo,
        notes: data.notes,
        initiatorId,
        originalStatus: await this.getDemandeStatus(demandeId),
      },
      createdAt: now,
      updatedAt: now,
    };

    // Update demande with escalation flag
    await this.c.env.DB.prepare(`
      UPDATE sante_demandes
      SET is_escalated = 1, escalation_level = ?, updated_at = ?
      WHERE id = ?
    `)
      .bind(data.escalateTo, now, demandeId)
      .run();

    await this.saveWorkflow(workflow);

    // Notify supervisors
    await this.notifyRole(targetRole, {
      type: 'escalation',
      title: `Escalade ${data.priority === 'urgent' ? 'URGENTE' : ''}`,
      message: data.reason,
      demandeId,
      priority: data.priority,
    });

    return workflow;
  }

  /**
   * Resolve escalation
   */
  async resolveEscalation(
    workflowId: string,
    decision: {
      action: 'approve' | 'reject' | 'return';
      notes: string;
      newStatus?: SanteStatutDemande;
    },
    resolverId: string
  ): Promise<WorkflowInstance> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('WORKFLOW_NOT_FOUND');
    }

    const now = new Date().toISOString();

    // Complete the review step
    const currentStep = workflow.steps.find((s) => s.stepNumber === workflow.currentStep);
    if (currentStep) {
      currentStep.status = 'completed';
      currentStep.completedAt = now;
      currentStep.completedBy = resolverId;
      currentStep.responseData = decision;
    }

    workflow.status = 'completed';
    workflow.completedAt = now;
    workflow.updatedAt = now;

    // Update demande based on decision
    if (decision.newStatus) {
      await this.c.env.DB.prepare(`
        UPDATE sante_demandes
        SET statut = ?, is_escalated = 0, escalation_level = NULL, updated_at = ?
        WHERE id = ?
      `)
        .bind(decision.newStatus, now, workflow.demandeId)
        .run();
    }

    await this.saveWorkflow(workflow);

    // Notify initiator
    await this.createNotification(workflow.demandeId, {
      type: 'escalation_resolved',
      title: 'Escalade resolue',
      message: `Decision: ${decision.action}. ${decision.notes}`,
      targetUserId: workflow.metadata.initiatorId as string,
    });

    return workflow;
  }

  // ==========================================================================
  // Multi-Level Validation Workflow
  // ==========================================================================

  /**
   * Start multi-level validation based on amount
   */
  async startMultiValidation(
    demandeId: string,
    montant: number,
    config: MultiValidationConfig
  ): Promise<WorkflowInstance> {
    const workflowId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Determine required validation levels based on amount
    const requiredLevels = config.levels.filter((level) => {
      if (level.required) return true;
      if (level.minAmount && montant >= level.minAmount) return true;
      return false;
    });

    // Create steps for each level
    const steps: WorkflowStep[] = requiredLevels.map((level, index) => ({
      id: crypto.randomUUID(),
      stepNumber: index + 1,
      type: 'approval' as const,
      assignedTo: null,
      assignedRole: level.role,
      status: index === 0 ? 'in_progress' : 'pending',
      requiredAction: `Validation niveau ${index + 1}`,
    }));

    const workflow: WorkflowInstance = {
      id: workflowId,
      demandeId,
      type: 'multi_validation',
      status: 'in_progress',
      currentStep: 1,
      steps,
      metadata: {
        montant,
        totalLevels: steps.length,
        completedLevels: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    // Update demande status
    await this.c.env.DB.prepare(`
      UPDATE sante_demandes
      SET statut = 'en_examen', validation_level = 1, updated_at = ?
      WHERE id = ?
    `)
      .bind(now, demandeId)
      .run();

    await this.saveWorkflow(workflow);

    // Notify first level
    const firstLevel = requiredLevels[0];
    if (firstLevel) {
      await this.notifyRole(firstLevel.role, {
        type: 'validation_required',
        title: 'Validation requise',
        message: `Demande de ${(montant / 1000).toFixed(3)} TND en attente de validation`,
        demandeId,
      });
    }

    return workflow;
  }

  /**
   * Submit validation decision
   */
  async submitValidation(
    workflowId: string,
    decision: {
      approved: boolean;
      notes: string;
    },
    validatorId: string
  ): Promise<WorkflowInstance> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('WORKFLOW_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const currentStep = workflow.steps.find((s) => s.stepNumber === workflow.currentStep);

    if (!currentStep || currentStep.status !== 'in_progress') {
      throw new Error('INVALID_WORKFLOW_STATE');
    }

    // Complete current step
    currentStep.status = 'completed';
    currentStep.completedAt = now;
    currentStep.completedBy = validatorId;
    currentStep.responseData = decision;

    if (!decision.approved) {
      // Validation rejected - end workflow
      workflow.status = 'completed';
      workflow.completedAt = now;

      await this.c.env.DB.prepare(`
        UPDATE sante_demandes
        SET statut = 'rejetee', notes_internes = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(`Rejet niveau ${workflow.currentStep}: ${decision.notes}`, now, workflow.demandeId)
        .run();
    } else {
      // Check if there are more levels
      const nextStep = workflow.steps.find((s) => s.stepNumber === workflow.currentStep + 1);

      if (nextStep) {
        // Move to next level
        nextStep.status = 'in_progress';
        workflow.currentStep += 1;
        workflow.metadata.completedLevels = (workflow.metadata.completedLevels as number) + 1;

        await this.c.env.DB.prepare(`
          UPDATE sante_demandes
          SET validation_level = ?, updated_at = ?
          WHERE id = ?
        `)
          .bind(workflow.currentStep, now, workflow.demandeId)
          .run();

        // Notify next level
        if (nextStep.assignedRole) {
          await this.notifyRole(nextStep.assignedRole, {
            type: 'validation_required',
            title: 'Validation requise',
            message: `Validation niveau ${workflow.currentStep} en attente`,
            demandeId: workflow.demandeId,
          });
        }
      } else {
        // All levels completed
        workflow.status = 'completed';
        workflow.completedAt = now;
        workflow.metadata.completedLevels = workflow.steps.length;

        await this.c.env.DB.prepare(`
          UPDATE sante_demandes
          SET statut = 'approuvee', validation_level = NULL, updated_at = ?
          WHERE id = ?
        `)
          .bind(now, workflow.demandeId)
          .run();
      }
    }

    workflow.updatedAt = now;
    await this.saveWorkflow(workflow);

    return workflow;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<WorkflowInstance | null> {
    const result = await this.c.env.DB.prepare(`
      SELECT id, demande_id, type, status, current_step, steps_json, metadata_json,
             created_at, updated_at, completed_at
      FROM sante_workflows
      WHERE id = ?
    `)
      .bind(workflowId)
      .first<{
        id: string;
        demande_id: string;
        type: WorkflowType;
        status: WorkflowStatus;
        current_step: number;
        steps_json: string;
        metadata_json: string;
        created_at: string;
        updated_at: string;
        completed_at: string | null;
      }>();

    if (!result) return null;

    return {
      id: result.id,
      demandeId: result.demande_id,
      type: result.type,
      status: result.status,
      currentStep: result.current_step,
      steps: JSON.parse(result.steps_json),
      metadata: JSON.parse(result.metadata_json),
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      completedAt: result.completed_at ?? undefined,
    };
  }

  /**
   * Get workflows for a demande
   */
  async getWorkflowsForDemande(demandeId: string): Promise<WorkflowInstance[]> {
    const results = await this.c.env.DB.prepare(`
      SELECT id, demande_id, type, status, current_step, steps_json, metadata_json,
             created_at, updated_at, completed_at
      FROM sante_workflows
      WHERE demande_id = ?
      ORDER BY created_at DESC
    `)
      .bind(demandeId)
      .all<{
        id: string;
        demande_id: string;
        type: WorkflowType;
        status: WorkflowStatus;
        current_step: number;
        steps_json: string;
        metadata_json: string;
        created_at: string;
        updated_at: string;
        completed_at: string | null;
      }>();

    return (results.results || []).map((r) => ({
      id: r.id,
      demandeId: r.demande_id,
      type: r.type,
      status: r.status,
      currentStep: r.current_step,
      steps: JSON.parse(r.steps_json),
      metadata: JSON.parse(r.metadata_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      completedAt: r.completed_at ?? undefined,
    }));
  }

  /**
   * Save workflow to database
   */
  private async saveWorkflow(workflow: WorkflowInstance): Promise<void> {
    const existingWorkflow = await this.getWorkflow(workflow.id);

    if (existingWorkflow) {
      await this.c.env.DB.prepare(`
        UPDATE sante_workflows
        SET status = ?, current_step = ?, steps_json = ?, metadata_json = ?,
            updated_at = ?, completed_at = ?
        WHERE id = ?
      `)
        .bind(
          workflow.status,
          workflow.currentStep,
          JSON.stringify(workflow.steps),
          JSON.stringify(workflow.metadata),
          workflow.updatedAt,
          workflow.completedAt ?? null,
          workflow.id
        )
        .run();
    } else {
      await this.c.env.DB.prepare(`
        INSERT INTO sante_workflows
        (id, demande_id, type, status, current_step, steps_json, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          workflow.id,
          workflow.demandeId,
          workflow.type,
          workflow.status,
          workflow.currentStep,
          JSON.stringify(workflow.steps),
          JSON.stringify(workflow.metadata),
          workflow.createdAt,
          workflow.updatedAt
        )
        .run();
    }
  }

  /**
   * Get demande current status
   */
  private async getDemandeStatus(demandeId: string): Promise<SanteStatutDemande | null> {
    const result = await this.c.env.DB.prepare(`
      SELECT statut FROM sante_demandes WHERE id = ?
    `)
      .bind(demandeId)
      .first<{ statut: SanteStatutDemande }>();

    return result?.statut ?? null;
  }

  /**
   * Create notification for a demande
   */
  private async createNotification(
    demandeId: string,
    data: {
      type: string;
      title: string;
      message: string;
      targetUserId?: string;
      dueDate?: string;
      priority?: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get adherent ID from demande
    const demande = await this.c.env.DB.prepare(`
      SELECT adherent_id FROM sante_demandes WHERE id = ?
    `)
      .bind(demandeId)
      .first<{ adherent_id: string }>();

    const targetUserId = data.targetUserId || demande?.adherent_id;

    if (!targetUserId) return;

    await this.c.env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        crypto.randomUUID(),
        targetUserId,
        data.type,
        data.title,
        data.message,
        JSON.stringify({
          demandeId,
          dueDate: data.dueDate,
          priority: data.priority,
        }),
        now
      )
      .run();
  }

  /**
   * Notify users with specific role
   */
  private async notifyRole(
    role: string,
    data: {
      type: string;
      title: string;
      message: string;
      demandeId: string;
      priority?: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get all users with this role
    const users = await this.c.env.DB.prepare(`
      SELECT id FROM users WHERE role = ? AND is_active = 1
    `)
      .bind(role)
      .all<{ id: string }>();

    // Create notification for each user
    for (const user of users.results || []) {
      await this.c.env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, data_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          crypto.randomUUID(),
          user.id,
          data.type,
          data.title,
          data.message,
          JSON.stringify({
            demandeId: data.demandeId,
            priority: data.priority,
          }),
          now
        )
        .run();
    }
  }
}

/**
 * Create Workflow Service instance
 */
export function createWorkflowService(
  c: Context<{ Bindings: Bindings; Variables: Variables }>
): WorkflowService {
  return new WorkflowService(c);
}

/**
 * Default multi-validation config based on amount
 */
export const DEFAULT_VALIDATION_CONFIG: MultiValidationConfig = {
  levels: [
    { role: 'SOIN_AGENT', required: true },
    { role: 'SOIN_GESTIONNAIRE', minAmount: 500000 }, // 500 TND
    { role: 'SOIN_RESPONSABLE', minAmount: 2000000 }, // 2000 TND
    { role: 'SOIN_DIRECTEUR', minAmount: 10000000 }, // 10000 TND
  ],
};
