/**
 * Batch Processing Service
 *
 * Handles bulk operations for claims, bordereaux, reconciliation, etc.
 */

import type { Bindings } from '../types';

export interface BatchJob {
  id: string;
  type: BatchJobType;
  status: BatchJobStatus;
  params: Record<string, unknown>;
  progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
  results?: BatchResult[];
  errors?: BatchError[];
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export type BatchJobType =
  | 'claims_approve'
  | 'claims_reject'
  | 'claims_process'
  | 'bordereau_generate'
  | 'bordereau_validate'
  | 'reconciliation_run'
  | 'adherents_import'
  | 'adherents_update'
  | 'notifications_send'
  | 'reports_generate'
  | 'data_export';

export type BatchJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BatchResult {
  entityId: string;
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface BatchError {
  entityId?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BatchClaimsApproveParams {
  claimIds: string[];
  approvedBy: string;
  comment?: string;
}

export interface BatchClaimsRejectParams {
  claimIds: string[];
  rejectedBy: string;
  reason: string;
  comment?: string;
}

export interface BatchBordereauGenerateParams {
  insurerId: string;
  providerId?: string;
  startDate: string;
  endDate: string;
  type: 'pharmacie' | 'consultation' | 'all';
}

export interface BatchReconciliationParams {
  insurerId: string;
  startDate: string;
  endDate: string;
  autoMatch: boolean;
}

export interface BatchAdherentsImportParams {
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
}

export class BatchService {
  constructor(private env: Bindings) {}

  /**
   * Create a new batch job
   */
  async createJob(
    type: BatchJobType,
    params: Record<string, unknown>,
    createdBy: string
  ): Promise<BatchJob> {
    const id = this.generateId('batch');
    const now = new Date().toISOString();

    const job: BatchJob = {
      id,
      type,
      status: 'pending',
      params,
      progress: {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
      createdBy,
      createdAt: now,
    };

    await this.env.DB.prepare(
      `INSERT INTO batch_jobs (
        id, type, status, params, progress, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        type,
        'pending',
        JSON.stringify(params),
        JSON.stringify(job.progress),
        createdBy,
        now
      )
      .run();

    return job;
  }

  /**
   * Start processing a batch job
   */
  async processJob(jobId: string): Promise<BatchJob> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'pending') {
      throw new Error(`Job cannot be started: status is ${job.status}`);
    }

    await this.updateJobStatus(jobId, 'running', { startedAt: new Date().toISOString() });

    try {
      switch (job.type) {
        case 'claims_approve':
          await this.processClaimsApprove(job);
          break;
        case 'claims_reject':
          await this.processClaimsReject(job);
          break;
        case 'claims_process':
          await this.processClaimsProcess(job);
          break;
        case 'bordereau_generate':
          await this.processBordereauGenerate(job);
          break;
        case 'bordereau_validate':
          await this.processBordereauValidate(job);
          break;
        case 'reconciliation_run':
          await this.processReconciliation(job);
          break;
        case 'adherents_import':
          await this.processAdherentsImport(job);
          break;
        case 'adherents_update':
          await this.processAdherentsUpdate(job);
          break;
        case 'notifications_send':
          await this.processNotificationsSend(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      return await this.getJob(jobId) as BatchJob;
    } catch (error) {
      await this.updateJobStatus(jobId, 'failed', {
        completedAt: new Date().toISOString(),
        errors: [
          {
            code: 'PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      });
      throw error;
    }
  }

  /**
   * Process bulk claims approval
   */
  private async processClaimsApprove(job: BatchJob): Promise<void> {
    const params = job.params as unknown as BatchClaimsApproveParams;
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    await this.updateProgress(job.id, { total: params.claimIds.length });

    for (let i = 0; i < params.claimIds.length; i++) {
      const claimId = params.claimIds[i]!;

      try {
        // Get claim details
        const claim = await this.env.DB.prepare(
          `SELECT id, montant_demande, statut FROM sante_demandes WHERE id = ?`
        )
          .bind(claimId)
          .first<{ id: string; montant_demande: number; statut: string }>();

        if (!claim) {
          errors.push({
            entityId: claimId,
            code: 'NOT_FOUND',
            message: 'Claim not found',
          });
          continue;
        }

        if (claim.statut !== 'soumise' && claim.statut !== 'en_examen') {
          errors.push({
            entityId: claimId,
            code: 'INVALID_STATUS',
            message: `Cannot approve claim with status: ${claim.statut}`,
          });
          continue;
        }

        // Approve the claim
        await this.env.DB.prepare(
          `UPDATE sante_demandes SET
            statut = 'approuvee',
            montant_approuve = montant_demande,
            date_traitement = datetime('now'),
            traite_par = ?,
            commentaire_traitement = ?,
            updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(params.approvedBy, params.comment || 'Approved in batch', claimId)
          .run();

        results.push({
          entityId: claimId,
          success: true,
          data: { approvedAmount: claim.montant_demande },
        });
      } catch (error) {
        errors.push({
          entityId: claimId,
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Process bulk claims rejection
   */
  private async processClaimsReject(job: BatchJob): Promise<void> {
    const params = job.params as unknown as BatchClaimsRejectParams;
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    await this.updateProgress(job.id, { total: params.claimIds.length });

    for (let i = 0; i < params.claimIds.length; i++) {
      const claimId = params.claimIds[i]!;

      try {
        const claim = await this.env.DB.prepare(
          `SELECT id, statut FROM sante_demandes WHERE id = ?`
        )
          .bind(claimId)
          .first<{ id: string; statut: string }>();

        if (!claim) {
          errors.push({
            entityId: claimId,
            code: 'NOT_FOUND',
            message: 'Claim not found',
          });
          continue;
        }

        await this.env.DB.prepare(
          `UPDATE sante_demandes SET
            statut = 'rejetee',
            montant_approuve = 0,
            motif_rejet = ?,
            date_traitement = datetime('now'),
            traite_par = ?,
            commentaire_traitement = ?,
            updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(params.reason, params.rejectedBy, params.comment || '', claimId)
          .run();

        results.push({
          entityId: claimId,
          success: true,
        });
      } catch (error) {
        errors.push({
          entityId: claimId,
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Process claims (auto-approve based on rules)
   */
  private async processClaimsProcess(job: BatchJob): Promise<void> {
    const params = job.params as {
      insurerId?: string;
      maxAmount?: number;
      autoApproveThreshold: number;
    };

    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    // Get pending claims
    const conditions = ["sd.statut = 'soumise'"];
    const bindings: unknown[] = [];

    if (params.insurerId) {
      conditions.push('c.insurer_id = ?');
      bindings.push(params.insurerId);
    }

    if (params.maxAmount) {
      conditions.push('sd.montant_demande <= ?');
      bindings.push(params.maxAmount);
    }

    const { results: claims } = await this.env.DB.prepare(
      `SELECT sd.id, sd.montant_demande, sd.fraud_score
       FROM sante_demandes sd
       JOIN contracts c ON sd.contract_id = c.id
       WHERE ${conditions.join(' AND ')}
       LIMIT 1000`
    )
      .bind(...bindings)
      .all<{ id: string; montant_demande: number; fraud_score: number | null }>();

    await this.updateProgress(job.id, { total: claims?.length || 0 });

    for (let i = 0; i < (claims?.length || 0); i++) {
      const claim = claims?.[i];
      if (!claim) continue;

      try {
        const fraudScore = claim.fraud_score || 0;

        if (
          claim.montant_demande <= params.autoApproveThreshold &&
          fraudScore < 50
        ) {
          // Auto-approve
          await this.env.DB.prepare(
            `UPDATE sante_demandes SET
              statut = 'approuvee',
              montant_approuve = montant_demande,
              date_traitement = datetime('now'),
              traite_par = 'system-batch',
              commentaire_traitement = 'Auto-approved by batch processing',
              updated_at = datetime('now')
             WHERE id = ?`
          )
            .bind(claim.id)
            .run();

          results.push({
            entityId: claim.id,
            success: true,
            data: { action: 'approved', reason: 'auto-approve' },
          });
        } else {
          // Mark for review
          await this.env.DB.prepare(
            `UPDATE sante_demandes SET
              statut = 'en_examen',
              updated_at = datetime('now')
             WHERE id = ?`
          )
            .bind(claim.id)
            .run();

          results.push({
            entityId: claim.id,
            success: true,
            data: { action: 'review', reason: 'requires manual review' },
          });
        }
      } catch (error) {
        errors.push({
          entityId: claim.id,
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Generate bordereaux in batch
   */
  private async processBordereauGenerate(job: BatchJob): Promise<void> {
    const params = job.params as unknown as BatchBordereauGenerateParams;
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    // Get all approved claims in date range
    const conditions = [
      "sd.statut = 'approuvee'",
      'sd.bordereau_id IS NULL',
      'sd.created_at >= ?',
      'sd.created_at <= ?',
      'c.insurer_id = ?',
    ];
    const bindings: unknown[] = [params.startDate, params.endDate, params.insurerId];

    if (params.providerId) {
      conditions.push('sd.provider_id = ?');
      bindings.push(params.providerId);
    }

    if (params.type !== 'all') {
      conditions.push('sd.type_soin = ?');
      bindings.push(params.type);
    }

    // Group claims by provider
    const { results: providerClaims } = await this.env.DB.prepare(
      `SELECT sd.provider_id, p.name as provider_name,
              COUNT(*) as claim_count,
              SUM(sd.montant_approuve) as total_amount
       FROM sante_demandes sd
       JOIN contracts c ON sd.contract_id = c.id
       LEFT JOIN providers p ON sd.provider_id = p.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY sd.provider_id`
    )
      .bind(...bindings)
      .all<{
        provider_id: string | null;
        provider_name: string | null;
        claim_count: number;
        total_amount: number;
      }>();

    await this.updateProgress(job.id, { total: providerClaims?.length || 0 });

    for (let i = 0; i < (providerClaims?.length || 0); i++) {
      const group = providerClaims?.[i];
      if (!group) continue;

      try {
        if (!group.provider_id) {
          errors.push({
            code: 'NO_PROVIDER',
            message: 'Claims without provider cannot be included in bordereau',
          });
          continue;
        }

        // Create bordereau
        const bordereauId = `brd_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`;
        const now = new Date().toISOString();

        await this.env.DB.prepare(
          `INSERT INTO bordereaux (
            id, insurer_id, provider_id, periode_debut, periode_fin,
            nombre_lignes, montant_total, statut, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'genere', ?, ?)`
        )
          .bind(
            bordereauId,
            params.insurerId,
            group.provider_id,
            params.startDate,
            params.endDate,
            group.claim_count,
            group.total_amount,
            now,
            now
          )
          .run();

        // Link claims to bordereau
        await this.env.DB.prepare(
          `UPDATE sante_demandes SET bordereau_id = ?, updated_at = datetime('now')
           WHERE provider_id = ? AND statut = 'approuvee' AND bordereau_id IS NULL
             AND created_at >= ? AND created_at <= ?
             AND contract_id IN (SELECT id FROM contracts WHERE insurer_id = ?)`
        )
          .bind(bordereauId, group.provider_id, params.startDate, params.endDate, params.insurerId)
          .run();

        results.push({
          entityId: bordereauId,
          success: true,
          data: {
            providerId: group.provider_id,
            providerName: group.provider_name,
            claimCount: group.claim_count,
            totalAmount: group.total_amount,
          },
        });
      } catch (error) {
        errors.push({
          entityId: group.provider_id || 'unknown',
          code: 'GENERATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Validate bordereaux in batch
   */
  private async processBordereauValidate(job: BatchJob): Promise<void> {
    const params = job.params as { bordereauIds: string[]; validatedBy: string };
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    await this.updateProgress(job.id, { total: params.bordereauIds.length });

    for (let i = 0; i < params.bordereauIds.length; i++) {
      const bordereauId = params.bordereauIds[i]!;

      try {
        await this.env.DB.prepare(
          `UPDATE bordereaux SET
            statut = 'valide',
            valide_par = ?,
            date_validation = datetime('now'),
            updated_at = datetime('now')
           WHERE id = ? AND statut = 'genere'`
        )
          .bind(params.validatedBy, bordereauId)
          .run();

        results.push({
          entityId: bordereauId,
          success: true,
        });
      } catch (error) {
        errors.push({
          entityId: bordereauId,
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Run reconciliation in batch
   */
  private async processReconciliation(job: BatchJob): Promise<void> {
    const params = job.params as unknown as BatchReconciliationParams;
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    // Get validated bordereaux without reconciliation
    const { results: bordereaux } = await this.env.DB.prepare(
      `SELECT id, provider_id, montant_total
       FROM bordereaux
       WHERE insurer_id = ? AND statut = 'valide'
         AND created_at >= ? AND created_at <= ?
         AND reconciliation_id IS NULL`
    )
      .bind(params.insurerId, params.startDate, params.endDate)
      .all<{ id: string; provider_id: string; montant_total: number }>();

    await this.updateProgress(job.id, { total: bordereaux?.length || 0 });

    for (let i = 0; i < (bordereaux?.length || 0); i++) {
      const bordereau = bordereaux?.[i];
      if (!bordereau) continue;

      try {
        const reconciliationId = `rec_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`;

        // Create reconciliation record
        await this.env.DB.prepare(
          `INSERT INTO reconciliation_items (
            id, bordereau_id, provider_id, montant_bordereau,
            statut, created_at
          ) VALUES (?, ?, ?, ?, 'en_attente', datetime('now'))`
        )
          .bind(reconciliationId, bordereau.id, bordereau.provider_id, bordereau.montant_total)
          .run();

        // Update bordereau
        await this.env.DB.prepare(
          `UPDATE bordereaux SET reconciliation_id = ?, updated_at = datetime('now') WHERE id = ?`
        )
          .bind(reconciliationId, bordereau.id)
          .run();

        results.push({
          entityId: reconciliationId,
          success: true,
          data: {
            bordereauId: bordereau.id,
            amount: bordereau.montant_total,
          },
        });
      } catch (error) {
        errors.push({
          entityId: bordereau.id,
          code: 'RECONCILIATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Import adherents in batch
   */
  private async processAdherentsImport(job: BatchJob): Promise<void> {
    const params = job.params as unknown as BatchAdherentsImportParams;
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    await this.updateProgress(job.id, { total: params.data.length });

    for (let i = 0; i < params.data.length; i++) {
      const adherent = params.data[i];
      if (!adherent) continue;

      try {
        // Check if adherent already exists
        const existing = await this.env.DB.prepare(
          `SELECT id FROM adherents WHERE matricule = ? OR cin = ?`
        )
          .bind(adherent.matricule, adherent.nationalId)
          .first();

        if (existing) {
          errors.push({
            entityId: adherent.matricule,
            code: 'DUPLICATE',
            message: 'Adherent already exists',
          });
          continue;
        }

        const adherentId = `adh_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`;
        const now = new Date().toISOString();

        await this.env.DB.prepare(
          `INSERT INTO adherents (
            id, contract_id, matricule, prenom, nom, date_naissance,
            cin, email, telephone, est_actif, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
          .bind(
            adherentId,
            params.contractId,
            adherent.matricule,
            adherent.firstName,
            adherent.lastName,
            adherent.dateOfBirth,
            adherent.nationalId,
            adherent.email || null,
            adherent.phone || null,
            now,
            now
          )
          .run();

        results.push({
          entityId: adherentId,
          success: true,
          data: { matricule: adherent.matricule },
        });
      } catch (error) {
        errors.push({
          entityId: adherent.matricule,
          code: 'IMPORT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Update adherents in batch
   */
  private async processAdherentsUpdate(job: BatchJob): Promise<void> {
    const params = job.params as {
      updates: { id: string; data: Record<string, unknown> }[];
    };
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    await this.updateProgress(job.id, { total: params.updates.length });

    for (let i = 0; i < params.updates.length; i++) {
      const update = params.updates[i];
      if (!update) continue;

      try {
        const setClause: string[] = ['updated_at = datetime("now")'];
        const bindings: unknown[] = [];

        for (const [key, value] of Object.entries(update.data)) {
          const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          setClause.push(`${dbKey} = ?`);
          bindings.push(value);
        }

        bindings.push(update.id);

        await this.env.DB.prepare(
          `UPDATE adherents SET ${setClause.join(', ')} WHERE id = ?`
        )
          .bind(...bindings)
          .run();

        results.push({
          entityId: update.id,
          success: true,
        });
      } catch (error) {
        errors.push({
          entityId: update.id,
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Send notifications in batch
   */
  private async processNotificationsSend(job: BatchJob): Promise<void> {
    const params = job.params as {
      notifications: {
        userId: string;
        type: string;
        title: string;
        message: string;
      }[];
    };
    const results: BatchResult[] = [];
    const errors: BatchError[] = [];

    await this.updateProgress(job.id, { total: params.notifications.length });

    for (let i = 0; i < params.notifications.length; i++) {
      const notification = params.notifications[i];
      if (!notification) continue;

      try {
        const notificationId = `notif_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`;

        await this.env.DB.prepare(
          `INSERT INTO notifications (
            id, user_id, type, title, message, is_read, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`
        )
          .bind(
            notificationId,
            notification.userId,
            notification.type,
            notification.title,
            notification.message
          )
          .run();

        results.push({
          entityId: notificationId,
          success: true,
        });
      } catch (error) {
        errors.push({
          entityId: notification.userId,
          code: 'SEND_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await this.updateProgress(job.id, {
        processed: i + 1,
        succeeded: results.length,
        failed: errors.length,
      });
    }

    await this.completeJob(job.id, results, errors);
  }

  /**
   * Get job by ID
   */
  async getJob(id: string): Promise<BatchJob | null> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM batch_jobs WHERE id = ?'
    )
      .bind(id)
      .first();

    return result ? this.mapJob(result) : null;
  }

  /**
   * List jobs
   */
  async listJobs(params: {
    type?: BatchJobType;
    status?: BatchJobStatus;
    createdBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: BatchJob[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.type) {
      conditions.push('type = ?');
      bindings.push(params.type);
    }

    if (params.status) {
      conditions.push('status = ?');
      bindings.push(params.status);
    }

    if (params.createdBy) {
      conditions.push('created_by = ?');
      bindings.push(params.createdBy);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM batch_jobs ${whereClause}`
    )
      .bind(...bindings)
      .first<{ count: number }>();

    const { results } = await this.env.DB.prepare(
      `SELECT * FROM batch_jobs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...bindings, params.limit || 20, params.offset || 0)
      .all();

    return {
      jobs: (results || []).map(this.mapJob),
      total: countResult?.count || 0,
    };
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(id: string): Promise<boolean> {
    const job = await this.getJob(id);
    if (!job || job.status !== 'pending') {
      return false;
    }

    await this.updateJobStatus(id, 'cancelled', {
      completedAt: new Date().toISOString(),
    });

    return true;
  }

  // Private helper methods

  private async updateJobStatus(
    id: string,
    status: BatchJobStatus,
    updates: Partial<BatchJob> = {}
  ): Promise<void> {
    const setClause = ['status = ?'];
    const bindings: unknown[] = [status];

    if (updates.startedAt) {
      setClause.push('started_at = ?');
      bindings.push(updates.startedAt);
    }

    if (updates.completedAt) {
      setClause.push('completed_at = ?');
      bindings.push(updates.completedAt);
    }

    if (updates.errors) {
      setClause.push('errors = ?');
      bindings.push(JSON.stringify(updates.errors));
    }

    bindings.push(id);

    await this.env.DB.prepare(
      `UPDATE batch_jobs SET ${setClause.join(', ')} WHERE id = ?`
    )
      .bind(...bindings)
      .run();
  }

  private async updateProgress(
    id: string,
    progress: Partial<BatchJob['progress']>
  ): Promise<void> {
    const job = await this.getJob(id);
    if (!job) return;

    const newProgress = { ...job.progress, ...progress };

    await this.env.DB.prepare(
      'UPDATE batch_jobs SET progress = ? WHERE id = ?'
    )
      .bind(JSON.stringify(newProgress), id)
      .run();
  }

  private async completeJob(
    id: string,
    results: BatchResult[],
    errors: BatchError[]
  ): Promise<void> {
    const status: BatchJobStatus = errors.length > 0 && results.length === 0 ? 'failed' : 'completed';

    await this.env.DB.prepare(
      `UPDATE batch_jobs SET
        status = ?,
        results = ?,
        errors = ?,
        completed_at = datetime('now')
       WHERE id = ?`
    )
      .bind(status, JSON.stringify(results), JSON.stringify(errors), id)
      .run();
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}${random}`;
  }

  private mapJob(row: Record<string, unknown>): BatchJob {
    return {
      id: row.id as string,
      type: row.type as BatchJobType,
      status: row.status as BatchJobStatus,
      params: JSON.parse(row.params as string),
      progress: JSON.parse(row.progress as string),
      results: row.results ? JSON.parse(row.results as string) : undefined,
      errors: row.errors ? JSON.parse(row.errors as string) : undefined,
      createdBy: row.created_by as string,
      startedAt: (row.started_at as string) || undefined,
      completedAt: (row.completed_at as string) || undefined,
      createdAt: row.created_at as string,
    };
  }
}
