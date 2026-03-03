/**
 * Claims Appeal Routes
 *
 * Handles the appeal/contestation workflow for denied or disputed claims.
 * Allows adherents to submit appeals and agents to review and resolve them.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createAppealSchema,
  updateAppealStatusSchema,
  resolveAppealSchema,
  assignReviewerSchema,
  escalateAppealSchema,
  addAppealCommentSchema,
  adherentResponseSchema,
  appealFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, created, notFound, forbidden, badRequest, paginated } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const appeals = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
appeals.use('*', authMiddleware());

/**
 * GET /api/v1/appeals
 * List appeals with filters (agents view)
 */
appeals.get(
  '/',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('query', appealFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const filters = c.req.valid('query');
    const user = c.get('user');
    const db = getDb(c);

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    const conditions: string[] = ['ca.deleted_at IS NULL'];
    const params: (string | number)[] = [];

    if (filters.status) {
      conditions.push('ca.status = ?');
      params.push(filters.status);
    }

    if (filters.reason) {
      conditions.push('ca.reason = ?');
      params.push(filters.reason);
    }

    if (filters.priority) {
      conditions.push('ca.priority = ?');
      params.push(filters.priority);
    }

    if (filters.reviewerId) {
      conditions.push('ca.reviewer_id = ?');
      params.push(filters.reviewerId);
    }

    if (filters.adherentId) {
      conditions.push('ca.adherent_id = ?');
      params.push(filters.adherentId);
    }

    if (filters.claimId) {
      conditions.push('ca.claim_id = ?');
      params.push(filters.claimId);
    }

    if (filters.dateFrom) {
      conditions.push('ca.submitted_at >= ?');
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push('ca.submitted_at <= ?');
      params.push(filters.dateTo);
    }

    if (filters.search) {
      conditions.push('(a.full_name LIKE ? OR cl.reference LIKE ? OR ca.description LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Filter by insurer for non-admin users
    if (user.role !== 'ADMIN' && user.insurerId) {
      conditions.push('cl.insurer_id = ?');
      params.push(user.insurerId);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total
      FROM claim_appeals ca
      JOIN claims cl ON ca.claim_id = cl.id
      JOIN adherents a ON ca.adherent_id = a.id
      WHERE ${whereClause}
    `).bind(...params).first<{ total: number }>();

    // Get appeals with related data
    const appealParams = [...params, limit, offset];
    const appealsResult = await db.prepare(`
      SELECT
        ca.*,
        cl.reference as claim_reference,
        cl.care_type as claim_care_type,
        cl.amount as claim_amount,
        cl.approved_amount as claim_approved_amount,
        cl.status as claim_status,
        a.full_name as adherent_name,
        a.adherent_number,
        a.email as adherent_email,
        r.first_name || ' ' || r.last_name as reviewer_name
      FROM claim_appeals ca
      JOIN claims cl ON ca.claim_id = cl.id
      JOIN adherents a ON ca.adherent_id = a.id
      LEFT JOIN users r ON ca.reviewer_id = r.id
      WHERE ${whereClause}
      ORDER BY
        CASE ca.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          ELSE 4
        END,
        ca.submitted_at DESC
      LIMIT ? OFFSET ?
    `).bind(...appealParams).all();

    const total = countResult?.total ?? 0;

    return paginated(c, appealsResult.results || [], {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/appeals/my-appeals
 * List adherent's own appeals
 */
appeals.get(
  '/my-appeals',
  requireRole('ADHERENT'),
  zValidator('query', paginationSchema),
  async (c) => {
    const user = c.get('user');
    const filters = c.req.valid('query');
    const db = getDb(c);

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM claim_appeals
      WHERE adherent_id = ? AND deleted_at IS NULL
    `).bind(user.id).first<{ total: number }>();

    const appealsResult = await db.prepare(`
      SELECT
        ca.*,
        cl.reference as claim_reference,
        cl.care_type as claim_care_type,
        cl.amount as claim_amount,
        cl.status as claim_status
      FROM claim_appeals ca
      JOIN claims cl ON ca.claim_id = cl.id
      WHERE ca.adherent_id = ? AND ca.deleted_at IS NULL
      ORDER BY ca.submitted_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all();

    const total = countResult?.total ?? 0;

    return paginated(c, appealsResult.results || [], {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/appeals/stats
 * Get appeal statistics
 */
appeals.get(
  '/stats',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const user = c.get('user');
    const db = getDb(c);

    const insurerFilter = user.role !== 'ADMIN' && user.insurerId
      ? `AND cl.insurer_id = '${user.insurerId}'`
      : '';

    const stats = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ca.status = 'submitted' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN ca.status = 'under_review' THEN 1 ELSE 0 END) as under_review,
        SUM(CASE WHEN ca.status = 'additional_info_requested' THEN 1 ELSE 0 END) as additional_info_requested,
        SUM(CASE WHEN ca.status = 'escalated' THEN 1 ELSE 0 END) as escalated,
        SUM(CASE WHEN ca.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN ca.status = 'partially_approved' THEN 1 ELSE 0 END) as partially_approved,
        SUM(CASE WHEN ca.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN ca.status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn,
        SUM(CASE WHEN ca.priority = 'urgent' THEN 1 ELSE 0 END) as urgent_count,
        SUM(CASE WHEN ca.priority = 'high' THEN 1 ELSE 0 END) as high_priority_count,
        AVG(CASE
          WHEN ca.resolved_at IS NOT NULL
          THEN julianday(ca.resolved_at) - julianday(ca.submitted_at)
          ELSE NULL
        END) as avg_resolution_days
      FROM claim_appeals ca
      JOIN claims cl ON ca.claim_id = cl.id
      WHERE ca.deleted_at IS NULL ${insurerFilter}
    `).first();

    // Get by reason breakdown
    const byReason = await db.prepare(`
      SELECT
        ca.reason,
        COUNT(*) as count
      FROM claim_appeals ca
      JOIN claims cl ON ca.claim_id = cl.id
      WHERE ca.deleted_at IS NULL ${insurerFilter}
      GROUP BY ca.reason
    `).all();

    return success(c, {
      overview: stats,
      byReason: byReason.results || [],
    });
  }
);

/**
 * GET /api/v1/appeals/:id
 * Get appeal details
 */
appeals.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = getDb(c);

  const appeal = await db.prepare(`
    SELECT
      ca.*,
      cl.reference as claim_reference,
      cl.care_type as claim_care_type,
      cl.amount as claim_amount,
      cl.approved_amount as claim_approved_amount,
      cl.status as claim_status,
      cl.rejection_reason as claim_rejection_reason,
      a.full_name as adherent_name,
      a.adherent_number,
      a.email as adherent_email,
      a.phone as adherent_phone,
      r.first_name || ' ' || r.last_name as reviewer_name,
      e.first_name || ' ' || e.last_name as escalated_to_name
    FROM claim_appeals ca
    JOIN claims cl ON ca.claim_id = cl.id
    JOIN adherents a ON ca.adherent_id = a.id
    LEFT JOIN users r ON ca.reviewer_id = r.id
    LEFT JOIN users e ON ca.escalated_to = e.id
    WHERE ca.id = ? AND ca.deleted_at IS NULL
  `).bind(id).first();

  if (!appeal) {
    return notFound(c, 'Recours non trouvé');
  }

  // Check access rights
  if (user.role === 'ADHERENT' && appeal.adherent_id !== user.id) {
    return forbidden(c, 'Accès non autorisé');
  }

  // Get comments (filter visibility for adherents)
  const commentsQuery = user.role === 'ADHERENT'
    ? `SELECT * FROM claim_appeal_comments WHERE appeal_id = ? AND is_visible_to_adherent = 1 ORDER BY created_at DESC`
    : `SELECT cac.*, u.first_name || ' ' || u.last_name as user_name
       FROM claim_appeal_comments cac
       LEFT JOIN users u ON cac.user_id = u.id
       WHERE cac.appeal_id = ?
       ORDER BY cac.created_at DESC`;

  const comments = await db.prepare(commentsQuery).bind(id).all();

  return success(c, {
    ...appeal,
    documents: appeal.documents_json ? JSON.parse(appeal.documents_json as string) : [],
    comments: comments.results || [],
  });
});

/**
 * POST /api/v1/appeals
 * Submit a new appeal (adherent)
 */
appeals.post(
  '/',
  requireRole('ADHERENT'),
  zValidator('json', createAppealSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Verify claim exists and belongs to adherent
    const claim = await db.prepare(`
      SELECT id, adherent_id, status
      FROM claims
      WHERE id = ? AND deleted_at IS NULL
    `).bind(data.claimId).first<{
      id: string;
      adherent_id: string;
      status: string;
    }>();

    if (!claim) {
      return notFound(c, 'Sinistre non trouvé');
    }

    if (claim.adherent_id !== user.id) {
      return forbidden(c, 'Ce sinistre ne vous appartient pas');
    }

    // Check if there's already an active appeal for this claim
    const existingAppeal = await db.prepare(`
      SELECT id FROM claim_appeals
      WHERE claim_id = ? AND status NOT IN ('approved', 'partially_approved', 'rejected', 'withdrawn')
      AND deleted_at IS NULL
    `).bind(data.claimId).first();

    if (existingAppeal) {
      return badRequest(c, 'Un recours est déjà en cours pour ce sinistre');
    }

    // Create appeal
    const id = generateId();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO claim_appeals (
        id, claim_id, adherent_id, reason, description,
        documents_json, status, priority, submitted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'submitted', 'normal', ?, ?, ?)
    `).bind(
      id,
      data.claimId,
      user.id,
      data.reason,
      data.description,
      data.documents ? JSON.stringify(data.documents) : null,
      now,
      now,
      now
    ).run();

    // Add initial comment
    const commentId = generateId();
    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, 'status_change', 'Recours soumis', 1, ?)
    `).bind(commentId, id, user.id, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'appeals.create',
      entityType: 'claim_appeals',
      entityId: id,
      changes: { claimId: data.claimId, reason: data.reason },
    });

    const newAppeal = await db.prepare(`
      SELECT * FROM claim_appeals WHERE id = ?
    `).bind(id).first();

    return created(c, newAppeal);
  }
);

/**
 * PATCH /api/v1/appeals/:id/status
 * Update appeal status (agent)
 */
appeals.patch(
  '/:id/status',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', updateAppealStatusSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const appeal = await db.prepare(`
      SELECT ca.*, cl.insurer_id
      FROM claim_appeals ca
      JOIN claims cl ON ca.claim_id = cl.id
      WHERE ca.id = ? AND ca.deleted_at IS NULL
    `).bind(id).first<{
      status: string;
      insurer_id: string;
      reviewed_at: string | null;
      reviewer_id: string | null;
    }>();

    if (!appeal) {
      return notFound(c, 'Recours non trouvé');
    }

    // Check insurer access
    if (user.role !== 'ADMIN' && user.insurerId && appeal.insurer_id !== user.insurerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    const now = new Date().toISOString();
    const oldStatus = appeal.status;

    // Update appeal
    const updateFields = ['status = ?', 'updated_at = ?'];
    const updateParams: (string | null)[] = [data.status, now];

    if (data.status === 'under_review' && !appeal.reviewed_at) {
      updateFields.push('reviewed_at = ?');
      updateParams.push(now);
    }

    if (data.internalNotes) {
      updateFields.push('internal_notes = COALESCE(internal_notes, \'\') || ? || \'\n\'');
      updateParams.push(`[${now}] ${data.internalNotes}`);
    }

    if (data.priority) {
      updateFields.push('priority = ?');
      updateParams.push(data.priority);
    }

    // If not assigned yet, assign to current user
    if (!appeal.reviewer_id) {
      updateFields.push('reviewer_id = ?');
      updateParams.push(user.id);
    }

    updateParams.push(id);

    await db.prepare(`
      UPDATE claim_appeals SET ${updateFields.join(', ')} WHERE id = ?
    `).bind(...updateParams).run();

    // Add status change comment
    const commentId = generateId();
    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, 'status_change', ?, 1, ?)
    `).bind(
      commentId,
      id,
      user.id,
      `Statut modifié: ${oldStatus} → ${data.status}`,
      now
    ).run();

    await logAudit(db, {
      userId: user.id,
      action: 'appeals.update_status',
      entityType: 'claim_appeals',
      entityId: id,
      changes: { oldStatus, newStatus: data.status },
    });

    const updated = await db.prepare(`
      SELECT * FROM claim_appeals WHERE id = ?
    `).bind(id).first();

    return success(c, updated);
  }
);

/**
 * POST /api/v1/appeals/:id/resolve
 * Resolve an appeal (agent/admin)
 */
appeals.post(
  '/:id/resolve',
  requireRole('INSURER_ADMIN', 'ADMIN'),
  zValidator('json', resolveAppealSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const appeal = await db.prepare(`
      SELECT ca.*, cl.insurer_id, cl.id as claim_id
      FROM claim_appeals ca
      JOIN claims cl ON ca.claim_id = cl.id
      WHERE ca.id = ? AND ca.deleted_at IS NULL
    `).bind(id).first<{
      status: string;
      insurer_id: string;
      claim_id: string;
    }>();

    if (!appeal) {
      return notFound(c, 'Recours non trouvé');
    }

    if (user.role !== 'ADMIN' && user.insurerId && appeal.insurer_id !== user.insurerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    const now = new Date().toISOString();

    // Update appeal
    await db.prepare(`
      UPDATE claim_appeals SET
        status = ?,
        resolution_type = ?,
        resolution_notes = ?,
        resolution_amount = ?,
        resolved_at = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      data.status,
      data.resolutionType,
      data.resolutionNotes,
      data.resolutionAmount ?? null,
      now,
      now,
      id
    ).run();

    // If approved or partially approved, update the original claim
    if (data.status === 'approved' || data.status === 'partially_approved') {
      const newApprovedAmount = data.resolutionAmount ?? null;

      if (newApprovedAmount !== null) {
        await db.prepare(`
          UPDATE claims SET
            approved_amount = ?,
            status = 'approved',
            processed_at = ?,
            updated_at = ?
          WHERE id = ?
        `).bind(newApprovedAmount, now, now, appeal.claim_id).run();
      } else if (data.status === 'approved') {
        // Full reversal - approve with original amount
        await db.prepare(`
          UPDATE claims SET
            approved_amount = amount,
            status = 'approved',
            processed_at = ?,
            updated_at = ?
          WHERE id = ?
        `).bind(now, now, appeal.claim_id).run();
      }
    }

    // Add resolution comment
    const commentId = generateId();
    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, 'resolution', ?, 1, ?)
    `).bind(
      commentId,
      id,
      user.id,
      `Recours ${data.status === 'approved' ? 'approuvé' : data.status === 'partially_approved' ? 'partiellement approuvé' : 'rejeté'}. ${data.resolutionNotes}`,
      now
    ).run();

    await logAudit(db, {
      userId: user.id,
      action: 'appeals.resolve',
      entityType: 'claim_appeals',
      entityId: id,
      changes: {
        status: data.status,
        resolutionType: data.resolutionType,
        resolutionAmount: data.resolutionAmount,
      },
    });

    const updated = await db.prepare(`
      SELECT * FROM claim_appeals WHERE id = ?
    `).bind(id).first();

    return success(c, updated);
  }
);

/**
 * POST /api/v1/appeals/:id/assign
 * Assign reviewer to appeal
 */
appeals.post(
  '/:id/assign',
  requireRole('INSURER_ADMIN', 'ADMIN'),
  zValidator('json', assignReviewerSchema),
  async (c) => {
    const id = c.req.param('id');
    const { reviewerId } = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE claim_appeals SET reviewer_id = ?, updated_at = ? WHERE id = ?
    `).bind(reviewerId, now, id).run();

    // Add comment
    const commentId = generateId();
    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, 'status_change', 'Dossier assigné à un gestionnaire', 1, ?)
    `).bind(commentId, id, user.id, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'appeals.assign',
      entityType: 'claim_appeals',
      entityId: id,
      changes: { reviewerId },
    });

    return success(c, { assigned: true });
  }
);

/**
 * POST /api/v1/appeals/:id/escalate
 * Escalate appeal to supervisor
 */
appeals.post(
  '/:id/escalate',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', escalateAppealSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE claim_appeals SET
        status = 'escalated',
        escalated_to = ?,
        priority = 'high',
        updated_at = ?
      WHERE id = ?
    `).bind(data.escalatedTo, now, id).run();

    // Add escalation comment
    const commentId = generateId();
    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, 'escalation', ?, 0, ?)
    `).bind(commentId, id, user.id, `Escaladé: ${data.reason}`, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'appeals.escalate',
      entityType: 'claim_appeals',
      entityId: id,
      changes: { escalatedTo: data.escalatedTo, reason: data.reason },
    });

    return success(c, { escalated: true });
  }
);

/**
 * POST /api/v1/appeals/:id/comments
 * Add comment to appeal
 */
appeals.post(
  '/:id/comments',
  zValidator('json', addAppealCommentSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Verify appeal exists
    const appeal = await db.prepare(`
      SELECT adherent_id FROM claim_appeals WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ adherent_id: string }>();

    if (!appeal) {
      return notFound(c, 'Recours non trouvé');
    }

    // Adherents can only add adherent_message type
    if (user.role === 'ADHERENT') {
      if (appeal.adherent_id !== user.id) {
        return forbidden(c, 'Accès non autorisé');
      }
      if (data.commentType !== 'adherent_message') {
        return badRequest(c, 'Type de commentaire non autorisé');
      }
    }

    const commentId = generateId();
    const now = new Date().toISOString();

    // Adherent messages are always visible to adherent
    const isVisible = user.role === 'ADHERENT' ? 1 : (data.isVisibleToAdherent ? 1 : 0);

    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(commentId, id, user.id, data.commentType, data.content, isVisible, now).run();

    // Update appeal updated_at
    await db.prepare(`
      UPDATE claim_appeals SET updated_at = ? WHERE id = ?
    `).bind(now, id).run();

    return created(c, {
      id: commentId,
      content: data.content,
      commentType: data.commentType,
      createdAt: now,
    });
  }
);

/**
 * POST /api/v1/appeals/:id/respond
 * Adherent responds to information request
 */
appeals.post(
  '/:id/respond',
  requireRole('ADHERENT'),
  zValidator('json', adherentResponseSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const appeal = await db.prepare(`
      SELECT adherent_id, status, documents_json FROM claim_appeals
      WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{
      adherent_id: string;
      status: string;
      documents_json: string | null;
    }>();

    if (!appeal) {
      return notFound(c, 'Recours non trouvé');
    }

    if (appeal.adherent_id !== user.id) {
      return forbidden(c, 'Accès non autorisé');
    }

    const now = new Date().toISOString();

    // Update appeal with response and new documents
    let existingDocs = appeal.documents_json ? JSON.parse(appeal.documents_json) : [];
    if (data.documents) {
      existingDocs = [...existingDocs, ...data.documents];
    }

    await db.prepare(`
      UPDATE claim_appeals SET
        adherent_response = ?,
        documents_json = ?,
        status = CASE WHEN status = 'additional_info_requested' THEN 'under_review' ELSE status END,
        updated_at = ?
      WHERE id = ?
    `).bind(data.response, JSON.stringify(existingDocs), now, id).run();

    // Add response comment
    const commentId = generateId();
    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, 'adherent_message', ?, 1, ?)
    `).bind(commentId, id, user.id, data.response, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'appeals.respond',
      entityType: 'claim_appeals',
      entityId: id,
      changes: { response: data.response, documentsAdded: data.documents?.length ?? 0 },
    });

    return success(c, { responded: true });
  }
);

/**
 * POST /api/v1/appeals/:id/withdraw
 * Adherent withdraws their appeal
 */
appeals.post(
  '/:id/withdraw',
  requireRole('ADHERENT'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c);

    const appeal = await db.prepare(`
      SELECT adherent_id, status FROM claim_appeals
      WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ adherent_id: string; status: string }>();

    if (!appeal) {
      return notFound(c, 'Recours non trouvé');
    }

    if (appeal.adherent_id !== user.id) {
      return forbidden(c, 'Accès non autorisé');
    }

    // Can only withdraw if not already resolved
    if (['approved', 'partially_approved', 'rejected', 'withdrawn'].includes(appeal.status)) {
      return badRequest(c, 'Ce recours ne peut plus être retiré');
    }

    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE claim_appeals SET status = 'withdrawn', resolved_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, now, id).run();

    // Add withdrawal comment
    const commentId = generateId();
    await db.prepare(`
      INSERT INTO claim_appeal_comments (
        id, appeal_id, user_id, comment_type, content, is_visible_to_adherent, created_at
      ) VALUES (?, ?, ?, 'status_change', 'Recours retiré par l''adhérent', 1, ?)
    `).bind(commentId, id, user.id, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'appeals.withdraw',
      entityType: 'claim_appeals',
      entityId: id,
      changes: { previousStatus: appeal.status },
    });

    return success(c, { withdrawn: true });
  }
);

export { appeals };
