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
import { validerMatriculeFiscal, formaterMatriculeFiscal } from '@dhamen/shared';

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
 * POST /lookup
 * Lookup practitioner by MF number
 * Returns existing provider if found, or auto-registers a new one
 * Used during bulletin creation for instant MF validation
 */
const lookupMFSchema = z.object({
  mfNumber: z.string().min(7).max(20),
  providerName: z.string().optional(),
  providerType: z.enum(['pharmacist', 'doctor', 'lab', 'clinic']).optional(),
  speciality: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
});

mfVerification.post(
  '/lookup',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', lookupMFSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Validate MF format using Tunisian matricule fiscal rules
    const mfValidation = validerMatriculeFiscal(
      data.mfNumber,
      data.providerType as 'pharmacist' | 'doctor' | 'lab' | 'clinic' | undefined
    );

    if (!mfValidation.valid) {
      return badRequest(c, `Matricule fiscal invalide : ${mfValidation.errors.join('. ')}`);
    }

    // Use normalized form for DB lookups
    const normalizedMf = mfValidation.normalized!;
    const formattedMf = formaterMatriculeFiscal(normalizedMf);

    // Search for existing provider with this MF (try normalized, raw, license_no, and stripped comparison)
    const existingProvider = await db.prepare(
      `SELECT p.id, p.name, p.type, p.speciality, p.address, p.city,
              p.phone, p.email, p.mf_number, p.mf_verified,
              p.license_no
       FROM providers p
       WHERE (p.mf_number = ? OR p.mf_number = ? OR p.license_no = ?
              OR REPLACE(REPLACE(REPLACE(REPLACE(p.mf_number, '/', ''), '.', ''), '-', ''), ' ', '') = ?)
         AND p.deleted_at IS NULL AND p.is_active = 1
       LIMIT 1`
    )
      .bind(normalizedMf, data.mfNumber.trim().toUpperCase(), `MF-${normalizedMf}`, normalizedMf)
      .first();

    if (existingProvider) {
      // Found existing provider
      return success(c, {
        status: 'found',
        provider: existingProvider,
        mfVerified: existingProvider.mf_verified === 1,
        mfFormatted: formattedMf,
        validation: { warnings: mfValidation.warnings },
      });
    }

    // Also check in MF verifications table (may be pending/verified for a provider)
    const existingVerification = await db.prepare(
      `SELECT pv.*, p.id as provider_id, p.name as provider_name,
              p.type as provider_type, p.speciality, p.address, p.city
       FROM practitioner_mf_verifications pv
       JOIN providers p ON pv.provider_id = p.id
       WHERE pv.mf_number = ? AND p.deleted_at IS NULL
       ORDER BY pv.created_at DESC
       LIMIT 1`
    )
      .bind(normalizedMf)
      .first();

    if (existingVerification) {
      return success(c, {
        status: 'found',
        provider: {
          id: existingVerification.provider_id,
          name: existingVerification.provider_name,
          type: existingVerification.provider_type,
          speciality: existingVerification.speciality,
          address: existingVerification.address,
          city: existingVerification.city,
          mf_number: normalizedMf,
          mf_verified: existingVerification.verification_status === 'verified',
        },
        mfVerified: existingVerification.verification_status === 'verified',
        verificationStatus: existingVerification.verification_status,
        mfFormatted: formattedMf,
        validation: { warnings: mfValidation.warnings },
      });
    }

    // MF not found — if enough info provided, auto-register
    if (!data.providerName) {
      return success(c, {
        status: 'not_found',
        mfNumber: normalizedMf,
        mfFormatted: formattedMf,
        validation: { warnings: mfValidation.warnings },
        message: 'MF non trouvé. Fournir providerName pour auto-enregistrer.',
      });
    }

    // Auto-register new provider
    const providerId = generateId();
    const now = new Date().toISOString();
    const licenseNo = `MF-${normalizedMf}`;
    const provType = data.providerType || 'doctor';

    await db.prepare(
      `INSERT INTO providers
       (id, type, name, license_no, speciality, address, city,
        mf_number, mf_verified, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`
    )
      .bind(
        providerId,
        provType,
        data.providerName,
        licenseNo,
        data.speciality || null,
        data.address || 'À compléter',
        data.city || 'À compléter',
        normalizedMf,
        now,
        now
      )
      .run();

    // Also insert into sante_praticiens (annuaire praticiens)
    const santePraticienId = generateId();
    const santeType = provType === 'pharmacist' ? 'pharmacien'
      : provType === 'lab' ? 'laborantin'
      : provType === 'clinic' ? 'autre'
      : 'medecin';
    const santeSpecialite = provType === 'pharmacist' ? 'Pharmacie'
      : provType === 'lab' ? 'Laboratoire'
      : provType === 'clinic' ? 'Hospitalisation'
      : data.speciality || 'Médecine générale';

    await db.prepare(
      `INSERT INTO sante_praticiens
       (id, provider_id, nom, specialite, type_praticien, adresse, ville,
        est_conventionne, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`
    )
      .bind(
        santePraticienId,
        providerId,
        data.providerName,
        santeSpecialite,
        santeType,
        data.address || null,
        data.city || null,
        now,
        now
      )
      .run();

    // Create a pending MF verification
    const verificationId = generateId();
    await db.prepare(
      `INSERT INTO practitioner_mf_verifications
       (id, provider_id, mf_number, verification_status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`
    )
      .bind(verificationId, providerId, normalizedMf, now, now)
      .run();

    // Audit log
    await logAudit(db, {
      userId: user?.sub,
      action: 'mf.auto_register',
      entityType: 'provider',
      entityId: providerId,
      changes: {
        mfNumber: normalizedMf,
        mfFormatted: formattedMf,
        providerName: data.providerName,
        providerType: provType,
        categorie: mfValidation.parts?.categorie,
        santePraticienId,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      status: 'created',
      provider: {
        id: providerId,
        name: data.providerName,
        type: data.providerType || 'doctor',
        speciality: data.speciality || null,
        address: data.address || 'À compléter',
        city: data.city || 'À compléter',
        mf_number: normalizedMf,
        mf_verified: false,
      },
      mfVerified: false,
      verificationId,
      message: 'Nouveau praticien enregistré automatiquement. Vérification MF en attente.',
    });
  }
);

/**
 * POST /verify
 * Submit MF for verification
 */
mfVerification.post(
  '/verify',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
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
      return notFound(c, 'Praticien non trouvé');
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
      return badRequest(c, `Ce MF est déjà attribué au praticien: ${existingMF.provider_name}`);
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
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
