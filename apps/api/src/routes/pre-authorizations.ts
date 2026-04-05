/**
 * Pre-Authorization Routes
 *
 * Handles the prior authorization workflow (accord préalable) for expensive
 * or specialized care that requires insurer approval before treatment.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createPreAuthSchema,
  updatePreAuthSchema,
  reviewPreAuthSchema,
  requestInfoPreAuthSchema,
  provideInfoPreAuthSchema,
  approvePreAuthSchema,
  rejectPreAuthSchema,
  cancelPreAuthSchema,
  assignPreAuthReviewerSchema,
  usePreAuthSchema,
  addPreAuthCommentSchema,
  preAuthFiltersSchema,
  preAuthRuleSchema,
  paginationSchema,
} from '@dhamen/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, created, notFound, forbidden, badRequest, paginated } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const preAuthorizations = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
preAuthorizations.use('*', authMiddleware());

// Helper to generate authorization number
function generateAuthorizationNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `AP-${year}-${random}`;
}

/**
 * GET /api/v1/pre-authorizations
 * List pre-authorizations with filters (agents view)
 */
preAuthorizations.get(
  '/',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('query', preAuthFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const filters = c.req.valid('query');
    const user = c.get('user');
    const db = getDb(c);

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    // Dynamic sorting support
    const sortBy = c.req.query('sortBy') || '';
    const sortOrder = (c.req.query('sortOrder') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE clause
    const conditions: string[] = ['pa.deleted_at IS NULL'];
    const params: (string | number)[] = [];

    if (filters.status) {
      conditions.push('pa.status = ?');
      params.push(filters.status);
    }

    if (filters.careType) {
      conditions.push('pa.care_type = ?');
      params.push(filters.careType);
    }

    if (filters.priority) {
      conditions.push('pa.priority = ?');
      params.push(filters.priority);
    }

    if (filters.adherentId) {
      conditions.push('pa.adherent_id = ?');
      params.push(filters.adherentId);
    }

    if (filters.providerId) {
      conditions.push('pa.provider_id = ?');
      params.push(filters.providerId);
    }

    if (filters.reviewerId) {
      conditions.push('pa.reviewer_id = ?');
      params.push(filters.reviewerId);
    }

    if (filters.dateFrom) {
      conditions.push('pa.created_at >= ?');
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push('pa.created_at <= ?');
      params.push(filters.dateTo);
    }

    if (filters.isEmergency !== undefined) {
      conditions.push('pa.is_emergency = ?');
      params.push(filters.isEmergency ? 1 : 0);
    }

    if (filters.search) {
      conditions.push('(a.full_name LIKE ? OR pa.authorization_number LIKE ? OR pa.procedure_description LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Filter by insurer for non-admin users
    if (user.role !== 'ADMIN' && user.insurerId) {
      conditions.push('pa.insurer_id = ?');
      params.push(user.insurerId);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total
      FROM pre_authorizations pa
      JOIN adherents a ON pa.adherent_id = a.id
      WHERE ${whereClause}
    `).bind(...params).first<{ total: number }>();

    // Get pre-authorizations with related data
    const paParams = [...params, limit, offset];
    const preAuthsResult = await db.prepare(`
      SELECT
        pa.*,
        a.full_name as adherent_name,
        a.adherent_number,
        p.name as provider_name,
        p.specialty as provider_specialty,
        r.first_name || ' ' || r.last_name as reviewer_name,
        mr.first_name || ' ' || mr.last_name as medical_reviewer_name
      FROM pre_authorizations pa
      JOIN adherents a ON pa.adherent_id = a.id
      JOIN providers p ON pa.provider_id = p.id
      LEFT JOIN users r ON pa.reviewer_id = r.id
      LEFT JOIN users mr ON pa.medical_reviewer_id = mr.id
      WHERE ${whereClause}
      ${sortBy === 'created_at'
        ? `ORDER BY pa.created_at ${sortOrder}`
        : `ORDER BY
        CASE pa.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          ELSE 4
        END,
        pa.is_emergency DESC,
        pa.created_at DESC`}
      LIMIT ? OFFSET ?
    `).bind(...paParams).all();

    const total = countResult?.total ?? 0;

    return paginated(c, preAuthsResult.results || [], {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/pre-authorizations/provider
 * List pre-authorizations for current provider
 */
preAuthorizations.get(
  '/provider',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'),
  zValidator('query', preAuthFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const filters = c.req.valid('query');
    const user = c.get('user');
    const db = getDb(c);

    if (!user.providerId) {
      return forbidden(c, 'Praticien non associé');
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['pa.deleted_at IS NULL', 'pa.provider_id = ?'];
    const params: (string | number)[] = [user.providerId];

    if (filters.status) {
      conditions.push('pa.status = ?');
      params.push(filters.status);
    }

    if (filters.careType) {
      conditions.push('pa.care_type = ?');
      params.push(filters.careType);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM pre_authorizations pa WHERE ${whereClause}
    `).bind(...params).first<{ total: number }>();

    const preAuthsResult = await db.prepare(`
      SELECT
        pa.*,
        a.full_name as adherent_name,
        a.adherent_number,
        i.name as insurer_name
      FROM pre_authorizations pa
      JOIN adherents a ON pa.adherent_id = a.id
      JOIN insurers i ON pa.insurer_id = i.id
      WHERE ${whereClause}
      ORDER BY pa.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const total = countResult?.total ?? 0;

    return paginated(c, preAuthsResult.results || [], {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/pre-authorizations/stats
 * Get pre-authorization statistics
 */
preAuthorizations.get(
  '/stats',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const user = c.get('user');
    const db = getDb(c);

    const insurerFilter = user.role !== 'ADMIN' && user.insurerId
      ? `AND pa.insurer_id = '${user.insurerId}'`
      : '';

    const stats = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pa.status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN pa.status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN pa.status = 'under_review' THEN 1 ELSE 0 END) as under_review,
        SUM(CASE WHEN pa.status = 'additional_info' THEN 1 ELSE 0 END) as additional_info,
        SUM(CASE WHEN pa.status = 'medical_review' THEN 1 ELSE 0 END) as medical_review,
        SUM(CASE WHEN pa.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN pa.status = 'partially_approved' THEN 1 ELSE 0 END) as partially_approved,
        SUM(CASE WHEN pa.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN pa.status = 'expired' THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN pa.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN pa.status = 'used' THEN 1 ELSE 0 END) as used,
        SUM(CASE WHEN pa.priority = 'urgent' THEN 1 ELSE 0 END) as urgent_count,
        SUM(CASE WHEN pa.is_emergency = 1 THEN 1 ELSE 0 END) as emergency_count,
        SUM(pa.estimated_amount) as total_estimated_amount,
        SUM(pa.approved_amount) as total_approved_amount,
        AVG(CASE
          WHEN pa.decided_at IS NOT NULL
          THEN julianday(pa.decided_at) - julianday(pa.submitted_at)
          ELSE NULL
        END) as avg_decision_days
      FROM pre_authorizations pa
      WHERE pa.deleted_at IS NULL ${insurerFilter}
    `).first();

    // Get by care type breakdown
    const byCareType = await db.prepare(`
      SELECT
        pa.care_type,
        COUNT(*) as count,
        SUM(pa.estimated_amount) as total_estimated,
        SUM(pa.approved_amount) as total_approved
      FROM pre_authorizations pa
      WHERE pa.deleted_at IS NULL ${insurerFilter}
      GROUP BY pa.care_type
    `).all();

    return success(c, {
      overview: stats,
      byCareType: byCareType.results || [],
    });
  }
);

/**
 * GET /api/v1/pre-authorizations/:id
 * Get pre-authorization details
 */
preAuthorizations.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = getDb(c);

  const preAuth = await db.prepare(`
    SELECT
      pa.*,
      a.full_name as adherent_name,
      a.adherent_number,
      a.email as adherent_email,
      a.phone as adherent_phone,
      a.date_of_birth as adherent_dob,
      p.name as provider_name,
      p.specialty as provider_specialty,
      p.address as provider_address,
      i.name as insurer_name,
      co.name as contract_name,
      co.coverage_type,
      r.first_name || ' ' || r.last_name as reviewer_name,
      mr.first_name || ' ' || mr.last_name as medical_reviewer_name,
      cl.reference as linked_claim_reference
    FROM pre_authorizations pa
    JOIN adherents a ON pa.adherent_id = a.id
    JOIN providers p ON pa.provider_id = p.id
    JOIN insurers i ON pa.insurer_id = i.id
    LEFT JOIN contracts co ON pa.contract_id = co.id
    LEFT JOIN users r ON pa.reviewer_id = r.id
    LEFT JOIN users mr ON pa.medical_reviewer_id = mr.id
    LEFT JOIN claims cl ON pa.claim_id = cl.id
    WHERE pa.id = ? AND pa.deleted_at IS NULL
  `).bind(id).first();

  if (!preAuth) {
    return notFound(c, 'Demande d\'accord préalable non trouvée');
  }

  // Check access rights
  const hasAccess =
    user.role === 'ADMIN' ||
    (user.insurerId && preAuth.insurer_id === user.insurerId) ||
    (user.providerId && preAuth.provider_id === user.providerId);

  if (!hasAccess) {
    return forbidden(c, 'Accès non autorisé');
  }

  // Get history
  const history = await db.prepare(`
    SELECT
      pah.*,
      u.first_name || ' ' || u.last_name as user_name
    FROM pre_authorization_history pah
    LEFT JOIN users u ON pah.user_id = u.id
    WHERE pah.pre_auth_id = ?
    ORDER BY pah.created_at DESC
  `).bind(id).all();

  return success(c, {
    ...preAuth,
    documents: preAuth.documents_json ? JSON.parse(preAuth.documents_json as string) : [],
    history: history.results || [],
  });
});

/**
 * POST /api/v1/pre-authorizations
 * Create a new pre-authorization request (provider)
 */
preAuthorizations.post(
  '/',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', createPreAuthSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Verify adherent exists
    const adherent = await db.prepare(`
      SELECT id, insurer_id, contract_id FROM adherents WHERE id = ? AND deleted_at IS NULL
    `).bind(data.adherentId).first<{ id: string; insurer_id: string; contract_id: string }>();

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Verify provider exists
    const provider = await db.prepare(`
      SELECT id FROM providers WHERE id = ? AND deleted_at IS NULL
    `).bind(data.providerId).first();

    if (!provider) {
      return notFound(c, 'Praticien non trouvé');
    }

    // Create pre-authorization
    const id = generateId();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO pre_authorizations (
        id, adherent_id, provider_id, insurer_id, contract_id,
        care_type, procedure_code, procedure_description,
        diagnosis_code, diagnosis_description, medical_justification,
        prescribing_doctor, prescription_date,
        estimated_amount, requested_care_date,
        documents_json, priority, is_emergency,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).bind(
      id,
      data.adherentId,
      data.providerId,
      adherent.insurer_id,
      data.contractId ?? adherent.contract_id,
      data.careType,
      data.procedureCode ?? null,
      data.procedureDescription,
      data.diagnosisCode ?? null,
      data.diagnosisDescription ?? null,
      data.medicalJustification,
      data.prescribingDoctor ?? null,
      data.prescriptionDate ?? null,
      data.estimatedAmount,
      data.requestedCareDate ?? null,
      data.documents ? JSON.stringify(data.documents) : null,
      data.priority,
      data.isEmergency ? 1 : 0,
      now,
      now
    ).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'created', 'draft', 'Demande créée', ?)
    `).bind(historyId, id, user.id, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.create',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { adherentId: data.adherentId, careType: data.careType, estimatedAmount: data.estimatedAmount },
    });

    const newPreAuth = await db.prepare(`
      SELECT * FROM pre_authorizations WHERE id = ?
    `).bind(id).first();

    return created(c, newPreAuth);
  }
);

/**
 * PUT /api/v1/pre-authorizations/:id
 * Update a pre-authorization (only if draft)
 */
preAuthorizations.put(
  '/:id',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', updatePreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, provider_id FROM pre_authorizations WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; provider_id: string }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    if (preAuth.status !== 'draft') {
      return badRequest(c, 'Seules les demandes en brouillon peuvent être modifiées');
    }

    // Check provider access
    if (user.providerId && preAuth.provider_id !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (data.procedureCode !== undefined) {
      updates.push('procedure_code = ?');
      params.push(data.procedureCode);
    }
    if (data.procedureDescription !== undefined) {
      updates.push('procedure_description = ?');
      params.push(data.procedureDescription);
    }
    if (data.diagnosisCode !== undefined) {
      updates.push('diagnosis_code = ?');
      params.push(data.diagnosisCode);
    }
    if (data.diagnosisDescription !== undefined) {
      updates.push('diagnosis_description = ?');
      params.push(data.diagnosisDescription);
    }
    if (data.medicalJustification !== undefined) {
      updates.push('medical_justification = ?');
      params.push(data.medicalJustification);
    }
    if (data.prescribingDoctor !== undefined) {
      updates.push('prescribing_doctor = ?');
      params.push(data.prescribingDoctor);
    }
    if (data.prescriptionDate !== undefined) {
      updates.push('prescription_date = ?');
      params.push(data.prescriptionDate);
    }
    if (data.estimatedAmount !== undefined) {
      updates.push('estimated_amount = ?');
      params.push(data.estimatedAmount);
    }
    if (data.requestedCareDate !== undefined) {
      updates.push('requested_care_date = ?');
      params.push(data.requestedCareDate);
    }
    if (data.documents !== undefined) {
      updates.push('documents_json = ?');
      params.push(JSON.stringify(data.documents));
    }
    if (data.priority !== undefined) {
      updates.push('priority = ?');
      params.push(data.priority);
    }
    if (data.isEmergency !== undefined) {
      updates.push('is_emergency = ?');
      params.push(data.isEmergency ? 1 : 0);
    }

    params.push(id);

    await db.prepare(`
      UPDATE pre_authorizations SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, comment, created_at
      ) VALUES (?, ?, ?, 'modified', 'Demande modifiée', ?)
    `).bind(historyId, id, user.id, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.update',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: data,
    });

    const updated = await db.prepare(`
      SELECT * FROM pre_authorizations WHERE id = ?
    `).bind(id).first();

    return success(c, updated);
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/submit
 * Submit a draft pre-authorization for review
 */
preAuthorizations.post(
  '/:id/submit',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, provider_id, insurer_id, care_type, estimated_amount, is_emergency
      FROM pre_authorizations WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{
      status: string;
      provider_id: string;
      insurer_id: string;
      care_type: string;
      estimated_amount: number;
      is_emergency: number;
    }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    if (preAuth.status !== 'draft') {
      return badRequest(c, 'Cette demande a déjà été soumise');
    }

    // Check provider access
    if (user.providerId && preAuth.provider_id !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    const now = new Date().toISOString();

    // Check for auto-approval rules
    const rule = await db.prepare(`
      SELECT * FROM pre_authorization_rules
      WHERE insurer_id = ? AND care_type = ? AND is_active = 1
    `).bind(preAuth.insurer_id, preAuth.care_type).first<{
      max_auto_approve_amount: number | null;
      requires_medical_review: number;
      default_validity_days: number;
    }>();

    let newStatus = 'pending';
    let authorizationNumber: string | null = null;
    let approvedAmount: number | null = null;
    let validityStartDate: string | null = null;
    let validityEndDate: string | null = null;

    // Auto-approve if amount is below threshold and no medical review required
    if (rule && rule.max_auto_approve_amount !== null &&
        preAuth.estimated_amount <= rule.max_auto_approve_amount &&
        !rule.requires_medical_review) {
      newStatus = 'approved';
      authorizationNumber = generateAuthorizationNumber();
      approvedAmount = preAuth.estimated_amount;
      validityStartDate = now.split('T')[0] ?? null;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (rule.default_validity_days || 30));
      validityEndDate = endDate.toISOString().split('T')[0] ?? null;
    }

    // Emergency requests go to high priority
    const priority = preAuth.is_emergency ? 'urgent' : 'normal';

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = ?,
        authorization_number = ?,
        approved_amount = ?,
        validity_start_date = ?,
        validity_end_date = ?,
        priority = ?,
        submitted_at = ?,
        decided_at = CASE WHEN ? = 'approved' THEN ? ELSE NULL END,
        updated_at = ?
      WHERE id = ?
    `).bind(
      newStatus,
      authorizationNumber,
      approvedAmount,
      validityStartDate,
      validityEndDate,
      priority,
      now,
      newStatus,
      now,
      now,
      id
    ).run();

    // Add history entry
    const historyId = generateId();
    const historyComment = newStatus === 'approved'
      ? `Demande auto-approuvée. N° d'autorisation: ${authorizationNumber}`
      : 'Demande soumise pour examen';

    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'submitted', 'draft', ?, ?, ?)
    `).bind(historyId, id, user.id, newStatus, historyComment, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.submit',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { newStatus, authorizationNumber },
    });

    const updated = await db.prepare(`
      SELECT * FROM pre_authorizations WHERE id = ?
    `).bind(id).first();

    return success(c, updated);
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/review
 * Start reviewing a pre-authorization (agent)
 */
preAuthorizations.post(
  '/:id/review',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', reviewPreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, insurer_id, reviewer_id FROM pre_authorizations
      WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; insurer_id: string; reviewer_id: string | null }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    // Check insurer access
    if (user.role !== 'ADMIN' && user.insurerId && preAuth.insurer_id !== user.insurerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    const now = new Date().toISOString();
    const oldStatus = preAuth.status;

    // Auto-assign reviewer if not assigned
    const reviewerId = preAuth.reviewer_id ?? user.id;

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = ?,
        reviewer_id = ?,
        reviewed_at = CASE WHEN reviewed_at IS NULL THEN ? ELSE reviewed_at END,
        updated_at = ?
      WHERE id = ?
    `).bind(data.status, reviewerId, now, now, id).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'status_changed', ?, ?, ?, ?)
    `).bind(historyId, id, user.id, oldStatus, data.status, data.notes ?? 'Examen en cours', now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.review',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { oldStatus, newStatus: data.status },
    });

    const updated = await db.prepare(`
      SELECT * FROM pre_authorizations WHERE id = ?
    `).bind(id).first();

    return success(c, updated);
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/request-info
 * Request additional information
 */
preAuthorizations.post(
  '/:id/request-info',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', requestInfoPreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, insurer_id FROM pre_authorizations WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; insurer_id: string }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    if (user.role !== 'ADMIN' && user.insurerId && preAuth.insurer_id !== user.insurerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = 'additional_info',
        decision_notes = COALESCE(decision_notes, '') || '[' || ? || '] Info demandée: ' || ? || '\n',
        updated_at = ?
      WHERE id = ?
    `).bind(now, data.requestedInfo, now, id).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'info_requested', ?, 'additional_info', ?, ?)
    `).bind(historyId, id, user.id, preAuth.status, data.requestedInfo, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.request_info',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { requestedInfo: data.requestedInfo },
    });

    return success(c, { infoRequested: true });
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/provide-info
 * Provider provides additional information
 */
preAuthorizations.post(
  '/:id/provide-info',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'),
  zValidator('json', provideInfoPreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, provider_id, documents_json FROM pre_authorizations
      WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; provider_id: string; documents_json: string | null }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    if (user.providerId && preAuth.provider_id !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    if (preAuth.status !== 'additional_info') {
      return badRequest(c, 'Aucune information supplémentaire demandée');
    }

    const now = new Date().toISOString();

    // Merge documents
    let existingDocs = preAuth.documents_json ? JSON.parse(preAuth.documents_json) : [];
    if (data.documents) {
      existingDocs = [...existingDocs, ...data.documents];
    }

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = 'under_review',
        documents_json = ?,
        decision_notes = COALESCE(decision_notes, '') || '[' || ? || '] Info fournie: ' || ? || '\n',
        updated_at = ?
      WHERE id = ?
    `).bind(JSON.stringify(existingDocs), now, data.additionalInfo, now, id).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'info_provided', 'additional_info', 'under_review', ?, ?)
    `).bind(historyId, id, user.id, data.additionalInfo, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.provide_info',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { additionalInfo: data.additionalInfo, documentsAdded: data.documents?.length ?? 0 },
    });

    return success(c, { infoProvided: true });
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/approve
 * Approve a pre-authorization
 */
preAuthorizations.post(
  '/:id/approve',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', approvePreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, insurer_id, estimated_amount FROM pre_authorizations
      WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; insurer_id: string; estimated_amount: number }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    if (user.role !== 'ADMIN' && user.insurerId && preAuth.insurer_id !== user.insurerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    if (['approved', 'partially_approved', 'rejected', 'cancelled', 'used', 'expired'].includes(preAuth.status)) {
      return badRequest(c, 'Cette demande a déjà été traitée');
    }

    const now = new Date().toISOString();
    const authorizationNumber = generateAuthorizationNumber();
    const newStatus = data.isPartial ? 'partially_approved' : 'approved';

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = ?,
        authorization_number = ?,
        approved_amount = ?,
        coverage_rate = ?,
        validity_start_date = ?,
        validity_end_date = ?,
        decision_notes = COALESCE(decision_notes, '') || ?,
        decided_at = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      newStatus,
      authorizationNumber,
      data.approvedAmount,
      data.coverageRate ?? null,
      data.validityStartDate,
      data.validityEndDate,
      data.decisionNotes ? `[${now}] ${data.decisionNotes}\n` : '',
      now,
      now,
      id
    ).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)
    `).bind(
      historyId,
      id,
      user.id,
      preAuth.status,
      newStatus,
      `Approuvé: ${data.approvedAmount} TND. N° ${authorizationNumber}. ${data.decisionNotes ?? ''}`,
      now
    ).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.approve',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: {
        status: newStatus,
        authorizationNumber,
        approvedAmount: data.approvedAmount,
        validityStartDate: data.validityStartDate,
        validityEndDate: data.validityEndDate,
      },
    });

    const updated = await db.prepare(`
      SELECT * FROM pre_authorizations WHERE id = ?
    `).bind(id).first();

    return success(c, updated);
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/reject
 * Reject a pre-authorization
 */
preAuthorizations.post(
  '/:id/reject',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', rejectPreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, insurer_id FROM pre_authorizations WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; insurer_id: string }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    if (user.role !== 'ADMIN' && user.insurerId && preAuth.insurer_id !== user.insurerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    if (['approved', 'partially_approved', 'rejected', 'cancelled', 'used', 'expired'].includes(preAuth.status)) {
      return badRequest(c, 'Cette demande a déjà été traitée');
    }

    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = 'rejected',
        decision_reason = ?,
        decision_notes = COALESCE(decision_notes, '') || ?,
        decided_at = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      data.decisionReason,
      data.decisionNotes ? `[${now}] ${data.decisionNotes}\n` : '',
      now,
      now,
      id
    ).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'rejected', ?, 'rejected', ?, ?)
    `).bind(historyId, id, user.id, preAuth.status, `Rejeté: ${data.decisionReason}`, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.reject',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { reason: data.decisionReason },
    });

    const updated = await db.prepare(`
      SELECT * FROM pre_authorizations WHERE id = ?
    `).bind(id).first();

    return success(c, updated);
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/cancel
 * Cancel a pre-authorization (provider)
 */
preAuthorizations.post(
  '/:id/cancel',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', cancelPreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, provider_id, insurer_id FROM pre_authorizations
      WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; provider_id: string; insurer_id: string }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    // Check access
    const hasAccess =
      user.role === 'ADMIN' ||
      (user.insurerId && preAuth.insurer_id === user.insurerId) ||
      (user.providerId && preAuth.provider_id === user.providerId);

    if (!hasAccess) {
      return forbidden(c, 'Accès non autorisé');
    }

    // Can only cancel if not already finalized
    if (['rejected', 'cancelled', 'used'].includes(preAuth.status)) {
      return badRequest(c, 'Cette demande ne peut plus être annulée');
    }

    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = 'cancelled',
        decision_notes = COALESCE(decision_notes, '') || '[' || ? || '] Annulé: ' || ? || '\n',
        updated_at = ?
      WHERE id = ?
    `).bind(now, data.reason, now, id).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'cancelled', ?, 'cancelled', ?, ?)
    `).bind(historyId, id, user.id, preAuth.status, data.reason, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.cancel',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { reason: data.reason },
    });

    return success(c, { cancelled: true });
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/assign
 * Assign reviewer to pre-authorization
 */
preAuthorizations.post(
  '/:id/assign',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', assignPreAuthReviewerSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const now = new Date().toISOString();

    const updateField = data.isMedicalReviewer ? 'medical_reviewer_id' : 'reviewer_id';

    await db.prepare(`
      UPDATE pre_authorizations SET ${updateField} = ?, updated_at = ? WHERE id = ?
    `).bind(data.reviewerId, now, id).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, comment, created_at
      ) VALUES (?, ?, ?, 'assigned', ?, ?)
    `).bind(historyId, id, user.id, data.isMedicalReviewer ? 'Médecin conseil assigné' : 'Gestionnaire assigné', now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.assign',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { reviewerId: data.reviewerId, isMedicalReviewer: data.isMedicalReviewer },
    });

    return success(c, { assigned: true });
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/use
 * Link pre-authorization to a claim (mark as used)
 */
preAuthorizations.post(
  '/:id/use',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', usePreAuthSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT status, provider_id, validity_end_date FROM pre_authorizations
      WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ status: string; provider_id: string; validity_end_date: string | null }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    if (!['approved', 'partially_approved'].includes(preAuth.status)) {
      return badRequest(c, 'Cette autorisation n\'est pas valide');
    }

    // Check if expired
    if (preAuth.validity_end_date && new Date(preAuth.validity_end_date) < new Date()) {
      return badRequest(c, 'Cette autorisation a expiré');
    }

    // Verify claim exists
    const claim = await db.prepare(`
      SELECT id FROM claims WHERE id = ? AND deleted_at IS NULL
    `).bind(data.claimId).first();

    if (!claim) {
      return notFound(c, 'Sinistre non trouvé');
    }

    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE pre_authorizations SET
        status = 'used',
        claim_id = ?,
        used_at = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(data.claimId, now, now, id).run();

    // Add history entry
    const historyId = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, old_status, new_status, comment, created_at
      ) VALUES (?, ?, ?, 'used', ?, 'used', ?, ?)
    `).bind(historyId, id, user.id, preAuth.status, `Lié au sinistre ${data.claimId}`, now).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorizations.use',
      entityType: 'pre_authorizations',
      entityId: id,
      changes: { claimId: data.claimId },
    });

    return success(c, { used: true });
  }
);

/**
 * POST /api/v1/pre-authorizations/:id/comments
 * Add comment to pre-authorization history
 */
preAuthorizations.post(
  '/:id/comments',
  zValidator('json', addPreAuthCommentSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const preAuth = await db.prepare(`
      SELECT provider_id, insurer_id FROM pre_authorizations WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first<{ provider_id: string; insurer_id: string }>();

    if (!preAuth) {
      return notFound(c, 'Demande non trouvée');
    }

    // Check access
    const hasAccess =
      user.role === 'ADMIN' ||
      (user.insurerId && preAuth.insurer_id === user.insurerId) ||
      (user.providerId && preAuth.provider_id === user.providerId);

    if (!hasAccess) {
      return forbidden(c, 'Accès non autorisé');
    }

    const historyId = generateId();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO pre_authorization_history (
        id, pre_auth_id, user_id, action, comment, is_internal, created_at
      ) VALUES (?, ?, ?, 'comment', ?, ?, ?)
    `).bind(historyId, id, user.id, data.comment, data.isInternal ? 1 : 0, now).run();

    // Update pre-auth updated_at
    await db.prepare(`
      UPDATE pre_authorizations SET updated_at = ? WHERE id = ?
    `).bind(now, id).run();

    return created(c, {
      id: historyId,
      comment: data.comment,
      isInternal: data.isInternal,
      createdAt: now,
    });
  }
);

/**
 * GET /api/v1/pre-authorizations/rules
 * Get pre-authorization rules for an insurer
 */
preAuthorizations.get(
  '/rules',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const user = c.get('user');
    const db = getDb(c);

    if (!user.insurerId && user.role !== 'ADMIN') {
      return forbidden(c, 'Assureur non associé');
    }

    const insurerId = c.req.query('insurerId') ?? user.insurerId;

    const rules = await db.prepare(`
      SELECT * FROM pre_authorization_rules
      WHERE insurer_id = ?
      ORDER BY care_type, procedure_code
    `).bind(insurerId).all();

    return success(c, rules.results || []);
  }
);

/**
 * POST /api/v1/pre-authorizations/rules
 * Create or update a pre-authorization rule
 */
preAuthorizations.post(
  '/rules',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', preAuthRuleSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    if (!user.insurerId && user.role !== 'ADMIN') {
      return forbidden(c, 'Assureur non associé');
    }

    const insurerId = user.insurerId ?? c.req.query('insurerId');

    if (!insurerId) {
      return badRequest(c, 'Assureur requis');
    }

    const now = new Date().toISOString();

    // Check if rule exists
    const existingRule = await db.prepare(`
      SELECT id FROM pre_authorization_rules
      WHERE insurer_id = ? AND care_type = ? AND (procedure_code = ? OR (procedure_code IS NULL AND ? IS NULL))
    `).bind(insurerId, data.careType, data.procedureCode ?? null, data.procedureCode ?? null).first<{ id: string }>();

    if (existingRule) {
      // Update existing rule
      await db.prepare(`
        UPDATE pre_authorization_rules SET
          max_auto_approve_amount = ?,
          requires_medical_review = ?,
          requires_documents = ?,
          min_days_advance = ?,
          default_validity_days = ?,
          is_active = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        data.maxAutoApproveAmount ?? null,
        data.requiresMedicalReview ? 1 : 0,
        data.requiresDocuments ? 1 : 0,
        data.minDaysAdvance,
        data.defaultValidityDays,
        data.isActive ? 1 : 0,
        now,
        existingRule.id
      ).run();

      await logAudit(db, {
        userId: user.id,
        action: 'pre_authorization_rules.update',
        entityType: 'pre_authorization_rules',
        entityId: existingRule.id,
        changes: data,
      });

      const updated = await db.prepare(`
        SELECT * FROM pre_authorization_rules WHERE id = ?
      `).bind(existingRule.id).first();

      return success(c, updated);
    }

    // Create new rule
    const id = generateId();
    await db.prepare(`
      INSERT INTO pre_authorization_rules (
        id, insurer_id, care_type, procedure_code,
        max_auto_approve_amount, requires_medical_review, requires_documents,
        min_days_advance, default_validity_days, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      insurerId,
      data.careType,
      data.procedureCode ?? null,
      data.maxAutoApproveAmount ?? null,
      data.requiresMedicalReview ? 1 : 0,
      data.requiresDocuments ? 1 : 0,
      data.minDaysAdvance,
      data.defaultValidityDays,
      data.isActive ? 1 : 0,
      now,
      now
    ).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorization_rules.create',
      entityType: 'pre_authorization_rules',
      entityId: id,
      changes: data,
    });

    const newRule = await db.prepare(`
      SELECT * FROM pre_authorization_rules WHERE id = ?
    `).bind(id).first();

    return created(c, newRule);
  }
);

/**
 * DELETE /api/v1/pre-authorizations/rules/:id
 * Delete a pre-authorization rule
 */
preAuthorizations.delete(
  '/rules/:ruleId',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const ruleId = c.req.param('ruleId');
    const user = c.get('user');
    const db = getDb(c);

    const rule = await db.prepare(`
      SELECT insurer_id FROM pre_authorization_rules WHERE id = ?
    `).bind(ruleId).first<{ insurer_id: string }>();

    if (!rule) {
      return notFound(c, 'Règle non trouvée');
    }

    if (user.role !== 'ADMIN' && user.insurerId && rule.insurer_id !== user.insurerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    await db.prepare(`
      DELETE FROM pre_authorization_rules WHERE id = ?
    `).bind(ruleId).run();

    await logAudit(db, {
      userId: user.id,
      action: 'pre_authorization_rules.delete',
      entityType: 'pre_authorization_rules',
      entityId: ruleId,
      changes: {},
    });

    return success(c, { deleted: true });
  }
);

export { preAuthorizations };
