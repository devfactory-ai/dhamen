import {
  createAdherent,
  findAdherentById,
  listAdherents,
  softDeleteAdherent,
  updateAdherent,
} from '@dhamen/db';
import {
  adherentCreateSchema,
  adherentFiltersSchema,
  adherentImportSchema,
  adherentUpdateSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { created, noContent, notFound, paginated, success } from '../lib/response';
import { generateId } from '../lib/ulid';
import { encrypt, decrypt, hashForIndex, maskCIN } from '../lib/encryption';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

/**
 * Get encryption key from environment
 * @throws Error if ENCRYPTION_KEY is not set
 */
function getEncryptionKey(c: { env: Bindings }): string {
  const key = c.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  return key;
}

const adherents = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
adherents.use('*', authMiddleware());

/**
 * GET /api/v1/adherents/me
 * Get the current logged-in adherent's profile
 * Only accessible by ADHERENT role
 */
adherents.get('/me', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  if (!user?.email) {
    return notFound(c, 'Utilisateur non authentifié');
  }

  const encryptionKey = getEncryptionKey(c);

  // Find adherent linked to this user's email
  const adherent = await getDb(c).prepare(
    `SELECT a.*, c.contract_number, c.plan_type as contract_name, c.start_date as contract_start, c.end_date as contract_end, i.name as insurer_name
     FROM adherents a
     LEFT JOIN contracts c ON c.adherent_id = a.id AND UPPER(c.status) = 'ACTIVE'
     LEFT JOIN insurers i ON c.insurer_id = i.id
     WHERE a.email = ? AND a.deleted_at IS NULL`
  )
    .bind(user.email)
    .first();

  if (!adherent) {
    return notFound(c, 'Profil adhérent non trouvé');
  }

  // Parse ayants droit JSON
  let ayantsDroit = [];
  try {
    ayantsDroit = JSON.parse(String(adherent.ayants_droit_json) || '[]');
  } catch {
    ayantsDroit = [];
  }

  // Decrypt sensitive fields (with fallback for legacy ENC_ prefix data)
  let decryptedNationalId: string;
  let decryptedPhone: string | null = null;

  try {
    const encryptedNationalId = String(adherent.national_id_encrypted);
    // Handle both legacy (ENC_) and new (AES-256) encryption formats
    if (encryptedNationalId.startsWith('ENC_')) {
      decryptedNationalId = encryptedNationalId.replace('ENC_', '');
    } else {
      decryptedNationalId = await decrypt(encryptedNationalId, encryptionKey);
    }
  } catch {
    decryptedNationalId = maskCIN('********'); // Fallback if decryption fails
  }

  if (adherent.phone_encrypted) {
    try {
      const encryptedPhone = String(adherent.phone_encrypted);
      if (encryptedPhone.startsWith('ENC_')) {
        decryptedPhone = encryptedPhone.replace('ENC_', '');
      } else {
        decryptedPhone = await decrypt(encryptedPhone, encryptionKey);
      }
    } catch {
      decryptedPhone = null;
    }
  }

  return success(c, {
    adherent: {
      id: adherent.id,
      nationalId: decryptedNationalId,
      firstName: adherent.first_name,
      lastName: adherent.last_name,
      dateOfBirth: adherent.date_of_birth,
      gender: adherent.gender,
      phone: decryptedPhone,
      email: adherent.email,
      address: adherent.address,
      city: adherent.city,
      postalCode: adherent.postal_code,
      contractNumber: adherent.contract_number || 'N/A',
      insurerName: adherent.insurer_name || 'Dhamen',
      relationship: 'PRINCIPAL',
      startDate: adherent.contract_start,
      endDate: adherent.contract_end,
      isActive: true,
      ayantsDroit: ayantsDroit,
    },
  });
});

/**
 * GET /api/v1/adherents/me/ayants-droit
 * Get the current adherent's beneficiaries (ayants droit)
 */
adherents.get('/me/ayants-droit', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  if (!user?.email) {
    return notFound(c, 'Utilisateur non authentifié');
  }

  const adherent = await getDb(c).prepare(
    `SELECT id, first_name, last_name, ayants_droit_json FROM adherents WHERE email = ? AND deleted_at IS NULL`
  )
    .bind(user.email)
    .first();

  if (!adherent) {
    return notFound(c, 'Adhérent non trouvé');
  }

  // Parse ayants droit JSON
  let ayantsDroit = [];
  try {
    ayantsDroit = JSON.parse(String(adherent.ayants_droit_json) || '[]');
  } catch {
    ayantsDroit = [];
  }

  return success(c, {
    principal: {
      id: adherent.id,
      nom: adherent.last_name,
      prenom: adherent.first_name,
    },
    ayantsDroit: ayantsDroit,
    total: ayantsDroit.length,
  });
});

/**
 * GET /api/v1/adherents/me/contract
 * Get the current adherent's contract details
 */
adherents.get('/me/contract', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  if (!user?.email) {
    return notFound(c, 'Utilisateur non authentifié');
  }

  // Find adherent and their active contract
  const result = await getDb(c).prepare(
    `SELECT c.id, c.contract_number, c.plan_type, c.start_date, c.end_date,
            c.annual_limit, c.coverage_json, c.status,
            i.name as insurer_name,
            (SELECT COALESCE(SUM(sd.montant_rembourse), 0)
             FROM sante_demandes sd
             WHERE sd.adherent_id = a.id
               AND sd.statut IN ('approuvee', 'en_paiement', 'payee')
               AND strftime('%Y', sd.date_soin) = strftime('%Y', 'now')) as used_amount
     FROM adherents a
     JOIN contracts c ON c.adherent_id = a.id AND UPPER(c.status) = 'ACTIVE'
     JOIN insurers i ON c.insurer_id = i.id
     WHERE a.email = ? AND a.deleted_at IS NULL`
  )
    .bind(user.email)
    .first();

  if (!result) {
    return notFound(c, 'Contrat non trouvé');
  }

  // Parse coverage from JSON
  let coverage: Record<string, { reimbursementRate?: number }> = {};
  try {
    coverage = JSON.parse(String(result.coverage_json) || '{}');
  } catch {
    coverage = {};
  }

  const usedAmount = Number(result.used_amount) || 0;
  const annualLimit = Number(result.annual_limit) || 0;

  return success(c, {
    contract: {
      id: result.id,
      contractNumber: result.contract_number,
      name: result.plan_type,
      type: String(result.plan_type).toUpperCase(),
      insurerName: result.insurer_name,
      startDate: result.start_date,
      endDate: result.end_date,
      status: result.status,
      coveragePharmacy: (coverage.pharmacy?.reimbursementRate || 0) * 100,
      coverageConsultation: (coverage.consultation?.reimbursementRate || 0) * 100,
      coverageLab: (coverage.lab?.reimbursementRate || 0) * 100,
      coverageHospitalization: (coverage.hospitalization?.reimbursementRate || 0) * 100,
      annualCeiling: annualLimit,
      usedAmount: usedAmount,
      remainingAmount: Math.max(0, annualLimit - usedAmount),
    },
  });
});

/**
 * GET /api/v1/adherents/me/claims
 * Get the current adherent's claims history
 */
adherents.get('/me/claims', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  if (!user?.email) {
    return notFound(c, 'Utilisateur non authentifié');
  }

  const page = Number(c.req.query('page')) || 1;
  const limit = Number(c.req.query('limit')) || 10;
  const offset = (page - 1) * limit;

  // Find adherent
  const adherent = await getDb(c).prepare(
    'SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL'
  )
    .bind(user.email)
    .first();

  if (!adherent) {
    return notFound(c, 'Adhérent non trouvé');
  }

  // Get claims from sante_demandes
  const claims = await getDb(c).prepare(
    `SELECT sd.*, sp.nom as praticien_nom, sp.prenom as praticien_prenom,
            sp.specialite as praticien_specialite
     FROM sante_demandes sd
     LEFT JOIN sante_praticiens sp ON sd.praticien_id = sp.id
     WHERE sd.adherent_id = ?
     ORDER BY sd.date_soin DESC
     LIMIT ? OFFSET ?`
  )
    .bind(adherent.id, limit, offset)
    .all();

  // Get total count
  const countResult = await getDb(c).prepare(
    'SELECT COUNT(*) as count FROM sante_demandes WHERE adherent_id = ?'
  )
    .bind(adherent.id)
    .first();

  const total = Number(countResult?.count) || 0;

  // Map sante_demandes statut to frontend status
  const STATUS_MAP: Record<string, string> = {
    soumise: 'PENDING',
    en_examen: 'PENDING',
    info_requise: 'PENDING',
    approuvee: 'APPROVED',
    en_paiement: 'APPROVED',
    payee: 'PAID',
    rejetee: 'REJECTED',
  };

  // Map type_soin to frontend type
  const TYPE_MAP: Record<string, string> = {
    pharmacie: 'PHARMACY',
    consultation: 'CONSULTATION',
    laboratoire: 'LAB',
    hospitalisation: 'HOSPITALIZATION',
    dentaire: 'DENTAL',
    optique: 'OPTICAL',
  };

  return success(c, {
    claims: claims.results.map((cl) => {
      const praticienName = cl.praticien_nom
        ? `${cl.praticien_prenom || ''} ${cl.praticien_nom}`.trim()
        : 'Inconnu';
      return {
        id: cl.id,
        claimNumber: cl.numero_demande,
        type: TYPE_MAP[String(cl.type_soin)] || String(cl.type_soin).toUpperCase(),
        providerName: praticienName,
        date: cl.date_soin || cl.created_at,
        totalAmount: cl.montant_demande,
        coveredAmount: cl.montant_rembourse || 0,
        status: STATUS_MAP[String(cl.statut)] || 'PENDING',
        items: [],
      };
    }),
    total,
  });
});

/**
 * GET /api/v1/adherents/me/card
 * Get the current adherent's virtual card
 */
adherents.get('/me/card', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  if (!user?.email) {
    return notFound(c, 'Utilisateur non authentifié');
  }

  // Find adherent with contract and virtual card info
  // contracts.adherent_id references adherents.id
  const result = await getDb(c).prepare(
    `SELECT a.*,
            c.contract_number, c.end_date as contract_end_date,
            i.name as insurer_name,
            vc.id as card_id, vc.card_number, vc.status as card_status,
            vc.expires_at as card_expires_at, vc.created_at as card_created_at
     FROM adherents a
     LEFT JOIN contracts c ON c.adherent_id = a.id AND UPPER(c.status) = 'ACTIVE'
     LEFT JOIN insurers i ON c.insurer_id = i.id
     LEFT JOIN virtual_cards vc ON vc.adherent_id = a.id AND UPPER(vc.status) = 'ACTIVE'
     WHERE a.email = ? AND a.deleted_at IS NULL`
  )
    .bind(user.email)
    .first<{
      id: string;
      first_name: string;
      last_name: string;
      created_at: string;
      contract_number?: string;
      contract_end_date?: string;
      insurer_name?: string;
      card_id?: string;
      card_number?: string;
      card_status?: string;
      card_expires_at?: string;
      card_created_at?: string;
    }>();

  if (!result) {
    return notFound(c, 'Adhérent non trouvé');
  }

  // If no virtual card exists, generate card info from adherent data
  const cardNumber = result.card_number || `DHM${String(result.id).slice(-12).toUpperCase()}`;

  return success(c, {
    card: {
      id: result.card_id || result.id,
      cardNumber: cardNumber,
      holderName: `${result.first_name} ${result.last_name}`,
      insurerName: result.insurer_name || 'Dhamen',
      contractNumber: result.contract_number || 'N/A',
      expiryDate: result.card_expires_at || result.contract_end_date || '2027-12-31',
      status: result.card_status ? result.card_status.toUpperCase() : 'ACTIVE',
      qrCode: null, // Could be generated on-the-fly
      createdAt: result.card_created_at || result.created_at,
    },
  });
});

/**
 * GET /api/v1/adherents
 * List adherents with filters and pagination
 */
adherents.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', adherentFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { city, search, page, limit } = c.req.valid('query');

    const { data, total } = await listAdherents(getDb(c), {
      city,
      search,
      page,
      limit,
    });

    return paginated(c, data, {
      page: page ?? 1,
      limit: limit ?? 20,
      total,
      totalPages: Math.ceil(total / (limit ?? 20)),
    });
  }
);

/**
 * GET /api/v1/adherents/:id
 * Get an adherent by ID
 */
adherents.get(
  '/:id',
  requireRole(
    'ADMIN',
    'INSURER_ADMIN',
    'INSURER_AGENT',
    'PHARMACIST',
    'DOCTOR',
    'LAB_MANAGER',
    'CLINIC_ADMIN'
  ),
  async (c) => {
    const id = c.req.param('id');
    const adherent = await findAdherentById(getDb(c), id);

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    return success(c, adherent);
  }
);

/**
 * POST /api/v1/adherents
 * Create a new adherent
 */
adherents.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', adherentCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const encryptionKey = getEncryptionKey(c);

    // Encrypt sensitive data with AES-256-GCM
    const encryptedNationalId = await encrypt(data.nationalId, encryptionKey);
    const encryptedPhone = data.phone ? await encrypt(data.phone, encryptionKey) : undefined;

    // Store hash for searchability (allows lookup without decryption)
    const nationalIdHash = await hashForIndex(data.nationalId, encryptionKey);

    const id = generateId();
    const adherent = await createAdherent(getDb(c), id, data, encryptedNationalId, encryptedPhone);

    // Audit log (without sensitive data)
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'adherent.create',
      entityType: 'adherent',
      entityId: id,
      changes: {
        firstName: data.firstName,
        lastName: data.lastName,
        city: data.city,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, adherent);
  }
);

/**
 * PUT /api/v1/adherents/:id
 * Update an adherent
 */
adherents.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', adherentUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const encryptionKey = getEncryptionKey(c);

    // Encrypt phone if provided with AES-256-GCM
    const encryptedPhone = data.phone ? await encrypt(data.phone, encryptionKey) : undefined;

    const adherent = await updateAdherent(getDb(c), id, data, encryptedPhone);

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'adherent.update',
      entityType: 'adherent',
      entityId: id,
      changes: {
        firstName: data.firstName,
        lastName: data.lastName,
        city: data.city,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, adherent);
  }
);

/**
 * POST /api/v1/adherents/import
 * Bulk import adherents from CSV data
 */
adherents.post(
  '/import',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', adherentImportSchema),
  async (c) => {
    const { adherents: rows, skipDuplicates } = c.req.valid('json');
    const user = c.get('user');
    const encryptionKey = getEncryptionKey(c);

    const results = {
      success: 0,
      skipped: 0,
      errors: [] as { row: number; nationalId: string; error: string }[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      try {
        // Check for existing adherent using hash index (allows lookup without decryption)
        const nationalIdHash = await hashForIndex(row.nationalId, encryptionKey);
        const existingCheck = await getDb(c).prepare(
          'SELECT id FROM adherents WHERE national_id_hash = ? AND deleted_at IS NULL'
        )
          .bind(nationalIdHash)
          .first();

        if (existingCheck) {
          if (skipDuplicates) {
            results.skipped++;
            continue;
          }
          results.errors.push({
            row: i + 1,
            nationalId: maskCIN(row.nationalId), // Mask in error messages
            error: 'Adhérent déjà existant',
          });
          continue;
        }

        // Create adherent with real AES-256-GCM encryption
        const id = generateId();
        const encryptedNationalId = await encrypt(row.nationalId, encryptionKey);
        const encryptedPhone = row.phone ? await encrypt(row.phone, encryptionKey) : null;

        await getDb(c).prepare(
          `INSERT INTO adherents (id, national_id_encrypted, national_id_hash, first_name, last_name, date_of_birth, gender, phone_encrypted, email, address, city, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
          .bind(
            id,
            encryptedNationalId,
            nationalIdHash,
            row.firstName,
            row.lastName,
            row.dateOfBirth,
            row.gender || null,
            encryptedPhone,
            row.email || null,
            row.address || null,
            row.city || null
          )
          .run();

        results.success++;
      } catch (error) {
        results.errors.push({
          row: i + 1,
          nationalId: maskCIN(row.nationalId), // Mask in error messages
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        });
      }
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'adherent.import',
      entityType: 'adherent',
      entityId: 'bulk',
      changes: {
        total: rows.length,
        success: results.success,
        skipped: results.skipped,
        errors: results.errors.length,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, results);
  }
);

/**
 * DELETE /api/v1/adherents/:id
 * Soft delete an adherent
 */
adherents.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const deleted = await softDeleteAdherent(getDb(c), id);

  if (!deleted) {
    return notFound(c, 'Adhérent non trouvé');
  }

  // Audit log
  await logAudit(getDb(c), {
    userId: user?.sub,
    action: 'adherent.delete',
    entityType: 'adherent',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return noContent(c);
});

export { adherents };
