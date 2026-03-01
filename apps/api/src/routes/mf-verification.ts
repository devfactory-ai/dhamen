/**
 * MF (Matricule Fiscal) Verification Routes
 *
 * API endpoints for verifying practitioner tax IDs
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, error, paginated, created, notFound, badRequest } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const mfVerification = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
mfVerification.use('*', authMiddleware());

// Schemas
const verifyMFSchema = z.object({
  providerId: z.string().min(1),
  mfNumber: z.string().min(7).max(20).regex(/^[0-9]{7}[A-Z]{3}[0-9]{3}$/, 'Format MF invalide (ex: 1234567ABC123)'),
  companyName: z.string().optional(),
  activityType: z.string().optional(),
  documentUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

const updateVerificationSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().optional(),
  expiresAt: z.string().optional(),
});

/**
 * POST /verify
 * Submit MF for verification
 */
mfVerification.post(
  '/verify',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', verifyMFSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // Check if provider exists
    const provider = await getDb(c).prepare(
      'SELECT id, name FROM providers WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(data.providerId)
      .first();

    if (!provider) {
      return notFound(c, 'Prestataire non trouvé');
    }

    // Check if MF already verified for another provider
    const existingMF = await getDb(c).prepare(
      `SELECT pv.*, p.name as provider_name
       FROM practitioner_mf_verifications pv
       JOIN providers p ON pv.provider_id = p.id
       WHERE pv.mf_number = ? AND pv.verification_status = 'verified' AND pv.provider_id != ?`
    )
      .bind(data.mfNumber, data.providerId)
      .first();

    if (existingMF) {
      return badRequest(c, `Ce MF est déjà attribué au prestataire: ${existingMF.provider_name}`);
    }

    // Create verification record
    const id = generateId();
    const now = new Date().toISOString();

    await getDb(c).prepare(
      `INSERT INTO practitioner_mf_verifications
       (id, provider_id, mf_number, company_name, activity_type, verification_status, document_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
      .bind(
        id,
        data.providerId,
        data.mfNumber,
        data.companyName || null,
        data.activityType || null,
        data.documentUrl || null,
        now,
        now
      )
      .run();

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'mf.submit',
      entityType: 'provider',
      entityId: data.providerId,
      changes: { mfNumber: data.mfNumber },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, {
      id,
      providerId: data.providerId,
      mfNumber: data.mfNumber,
      status: 'pending',
      message: 'Vérification MF soumise avec succès',
    });
  }
);

/**
 * PUT /:id/status
 * Update verification status (verify or reject)
 */
mfVerification.put(
  '/:id/status',
  requireRole('ADMIN'),
  zValidator('json', updateVerificationSchema),
  async (c) => {
    const verificationId = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Get verification
    const verification = await getDb(c).prepare(
      'SELECT * FROM practitioner_mf_verifications WHERE id = ?'
    )
      .bind(verificationId)
      .first();

    if (!verification) {
      return notFound(c, 'Vérification non trouvée');
    }

    const now = new Date().toISOString();

    // Update verification
    await getDb(c).prepare(
      `UPDATE practitioner_mf_verifications
       SET verification_status = ?,
           verification_date = ?,
           verified_by = ?,
           verification_source = 'manual',
           rejection_reason = ?,
           expires_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        data.status,
        now,
        user?.sub,
        data.rejectionReason || null,
        data.expiresAt || null,
        now,
        verificationId
      )
      .run();

    // If verified, update provider
    if (data.status === 'verified') {
      await getDb(c).prepare(
        `UPDATE providers
         SET mf_number = ?, mf_verified = 1, mf_verification_id = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(verification.mf_number, verificationId, now, verification.provider_id)
        .run();
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: data.status === 'verified' ? 'mf.verify' : 'mf.reject',
      entityType: 'provider',
      entityId: String(verification.provider_id),
      changes: {
        mfNumber: verification.mf_number,
        status: data.status,
        reason: data.rejectionReason
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      id: verificationId,
      status: data.status,
      message: data.status === 'verified'
        ? 'MF vérifié avec succès'
        : 'MF rejeté',
    });
  }
);

/**
 * GET /
 * List all MF verifications
 */
mfVerification.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const status = c.req.query('status');
    const offset = (page - 1) * limit;

    let query = `
      SELECT pv.*, p.name as provider_name, p.type as provider_type,
             u.first_name || ' ' || u.last_name as verified_by_name
      FROM practitioner_mf_verifications pv
      JOIN providers p ON pv.provider_id = p.id
      LEFT JOIN users u ON pv.verified_by = u.id
    `;
    const params: (string | number)[] = [];

    if (status) {
      query += ' WHERE pv.verification_status = ?';
      params.push(status);
    }

    query += ' ORDER BY pv.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const verifications = await getDb(c).prepare(query).bind(...params).all();

    // Count total
    let countQuery = 'SELECT COUNT(*) as count FROM practitioner_mf_verifications';
    if (status) {
      countQuery += ' WHERE verification_status = ?';
    }
    const countResult = status
      ? await getDb(c).prepare(countQuery).bind(status).first()
      : await getDb(c).prepare(countQuery).first();

    const total = Number(countResult?.count) || 0;

    return paginated(c, verifications.results, { page, limit, total });
  }
);

/**
 * GET /provider/:providerId
 * Get MF verification status for a provider
 */
mfVerification.get(
  '/provider/:providerId',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const providerId = c.req.param('providerId');

    const verification = await getDb(c).prepare(
      `SELECT pv.*, p.name as provider_name,
              u.first_name || ' ' || u.last_name as verified_by_name
       FROM practitioner_mf_verifications pv
       JOIN providers p ON pv.provider_id = p.id
       LEFT JOIN users u ON pv.verified_by = u.id
       WHERE pv.provider_id = ?
       ORDER BY pv.created_at DESC
       LIMIT 1`
    )
      .bind(providerId)
      .first();

    if (!verification) {
      return success(c, { verification: null, hasVerification: false });
    }

    return success(c, { verification, hasVerification: true });
  }
);

/**
 * GET /:id
 * Get verification details
 */
mfVerification.get(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const verification = await getDb(c).prepare(
      `SELECT pv.*, p.name as provider_name, p.type as provider_type,
              u.first_name || ' ' || u.last_name as verified_by_name
       FROM practitioner_mf_verifications pv
       JOIN providers p ON pv.provider_id = p.id
       LEFT JOIN users u ON pv.verified_by = u.id
       WHERE pv.id = ?`
    )
      .bind(id)
      .first();

    if (!verification) {
      return notFound(c, 'Vérification non trouvée');
    }

    return success(c, { verification });
  }
);

export { mfVerification };
