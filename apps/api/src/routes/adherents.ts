import {
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
import { conflict, created, noContent, notFound, paginated, success } from '../lib/response';
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
      insurerName: adherent.insurer_name || 'E-Santé',
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
      insurerName: result.insurer_name || 'E-Santé',
      contractNumber: result.contract_number || 'N/A',
      expiryDate: result.card_expires_at || result.contract_end_date || '2027-12-31',
      status: result.card_status ? result.card_status.toUpperCase() : 'ACTIVE',
      qrCode: null, // Could be generated on-the-fly
      createdAt: result.card_created_at || result.created_at,
    },
  });
});

/**
 * GET /api/v1/adherents/search
 * Quick search for autocomplete (max 10 results)
 */
adherents.get(
  '/search',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const q = c.req.query('q') || '';
    if (q.length < 2) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Le paramètre q doit avoir au moins 2 caractères' },
      }, 400);
    }

    const user = c.get('user');
    const db = getDb(c);
    const likeQ = `%${q}%`;

    let query = `
      SELECT a.id, a.matricule, a.first_name, a.last_name, a.email,
             a.plafond_global, a.plafond_consomme,
             co.name as company_name,
             ct.plan_type as contract_type
      FROM adherents a
      LEFT JOIN companies co ON a.company_id = co.id
      LEFT JOIN contracts ct ON ct.adherent_id = a.id AND UPPER(ct.status) = 'ACTIVE'
      WHERE a.deleted_at IS NULL
        AND (a.matricule LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ?)
    `;
    const params: unknown[] = [likeQ, likeQ, likeQ];

    if (user.insurerId) {
      query += ' AND co.insurer_id = ?';
      params.push(user.insurerId);
    }

    query += ' ORDER BY a.last_name, a.first_name LIMIT 10';

    const { results } = await db.prepare(query).bind(...params).all();

    return success(c, results.map((r: Record<string, unknown>) => ({
      id: r.id,
      matricule: r.matricule,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email || null,
      companyName: r.company_name,
      plafondGlobal: r.plafond_global,
      plafondConsomme: r.plafond_consomme,
      contractType: r.contract_type || null,
    })));
  }
);

/**
 * GET /api/v1/adherents/next-matricule
 * Get next available matricule for a company
 */
adherents.get(
  '/next-matricule',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const companyId = c.req.query('companyId');
    if (!companyId) {
      return success(c, { matricule: '0001' });
    }
    const db = getDb(c);
    const maxResult = await db
      .prepare(
        `SELECT MAX(CAST(matricule AS INTEGER)) as max_mat
         FROM adherents
         WHERE company_id = ? AND matricule IS NOT NULL AND matricule != 'null'
           AND matricule GLOB '[0-9]*' AND deleted_at IS NULL`
      )
      .bind(companyId)
      .first<{ max_mat: number | null }>();
    const next = (maxResult?.max_mat ?? 0) + 1;
    return success(c, { matricule: String(next).padStart(4, '0') });
  }
);

/**
 * GET /api/v1/adherents
 * List adherents with filters and pagination
 */
adherents.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 20;
    const search = c.req.query('search') || undefined;
    const city = c.req.query('city') || undefined;
    const companyId = c.req.query('companyId') || undefined;
    const isActiveParam = c.req.query('isActive');
    const dossierCompletParam = c.req.query('dossierComplet');
    const user = c.get('user');
    const db = getDb(c);
    const offset = (page - 1) * limit;

    let whereClause = 'a.deleted_at IS NULL';
    const params: unknown[] = [];

    if (companyId) {
      whereClause += ' AND a.company_id = ?';
      params.push(companyId);
    }

    if (isActiveParam === 'true') {
      whereClause += ' AND a.is_active = 1';
    } else if (isActiveParam === 'false') {
      whereClause += ' AND a.is_active = 0';
    }

    if (dossierCompletParam === 'false') {
      whereClause += ' AND (a.dossier_complet = 0 OR a.dossier_complet IS NULL)';
    } else if (dossierCompletParam === 'true') {
      whereClause += ' AND a.dossier_complet = 1';
    }

    if (user.insurerId) {
      whereClause += ' AND co.insurer_id = ?';
      params.push(user.insurerId);
    }

    if (city) {
      whereClause += ' AND a.city = ?';
      params.push(city);
    }

    if (search) {
      whereClause += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.matricule LIKE ? OR a.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM adherents a LEFT JOIN companies co ON a.company_id = co.id WHERE ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    const { results } = await db
      .prepare(
        `SELECT a.*, co.name as company_name
         FROM adherents a
         LEFT JOIN companies co ON a.company_id = co.id
         WHERE ${whereClause}
         ORDER BY a.last_name, a.first_name ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    return paginated(c, results.map((r: Record<string, unknown>) => ({
      id: r.id,
      matricule: r.matricule,
      firstName: r.first_name,
      lastName: r.last_name,
      dateOfBirth: r.date_of_birth,
      gender: r.gender,
      email: r.email,
      city: r.city,
      companyId: r.company_id,
      companyName: r.company_name,
      plafondGlobal: r.plafond_global,
      plafondConsomme: r.plafond_consomme,
      ayantsDroitJson: r.ayants_droit_json,
      isActive: r.is_active === 1 || r.is_active === true,
      dossierComplet: r.dossier_complet === 1 || r.dossier_complet === true || r.dossier_complet === null,
      createdAt: r.created_at,
    })), {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/adherents/export
 * Export adherents as CSV
 * Query params: ?companyId=xxx&search=xxx
 */
adherents.get('/export', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const companyId = c.req.query('companyId');
  const search = c.req.query('search');

  let query = `
    SELECT a.matricule, a.first_name, a.last_name, a.date_of_birth, a.gender,
           a.email, a.phone_encrypted, a.national_id_encrypted, a.city,
           a.is_active, a.plafond_global, a.plafond_consomme,
           a.date_debut_adhesion, a.date_fin_adhesion,
           c.name as company_name, c.matricule_fiscal
    FROM adherents a
    LEFT JOIN companies c ON a.company_id = c.id
    WHERE a.deleted_at IS NULL
  `;
  const binds: unknown[] = [];

  if (user.insurerId) {
    query += ' AND c.insurer_id = ?';
    binds.push(user.insurerId);
  }

  if (companyId) {
    query += ' AND a.company_id = ?';
    binds.push(companyId);
  }

  if (search) {
    query += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.matricule LIKE ?)';
    const s = `%${search}%`;
    binds.push(s, s, s);
  }

  query += ' ORDER BY a.last_name, a.first_name LIMIT 10000';

  const { results } = await db.prepare(query).bind(...binds).all();

  const headers = [
    'Matricule', 'Nom', 'Prénom', 'Date Naissance', 'Genre',
    'Email', 'Ville', 'Statut', 'Plafond Global', 'Plafond Consommé',
    'Début Adhésion', 'Fin Adhésion', 'Entreprise', 'MF Entreprise',
  ];

  const escapeCSV = (val: unknown): string => {
    const str = val == null ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [headers.map(escapeCSV).join(',')];

  for (const row of results as Record<string, unknown>[]) {
    const plafondGlobal = row.plafond_global != null ? Number(row.plafond_global) / 1000 : '';
    const plafondConsomme = row.plafond_consomme != null ? Number(row.plafond_consomme) / 1000 : '';

    csvRows.push([
      escapeCSV(row.matricule),
      escapeCSV(row.last_name),
      escapeCSV(row.first_name),
      escapeCSV(row.date_of_birth),
      escapeCSV(row.gender),
      escapeCSV(row.email),
      escapeCSV(row.city),
      escapeCSV(row.is_active ? 'Actif' : 'Inactif'),
      escapeCSV(plafondGlobal),
      escapeCSV(plafondConsomme),
      escapeCSV(row.date_debut_adhesion),
      escapeCSV(row.date_fin_adhesion),
      escapeCSV(row.company_name),
      escapeCSV(row.matricule_fiscal),
    ].join(','));
  }

  const csvContent = '\uFEFF' + csvRows.join('\n');

  await logAudit(db, {
    userId: user?.sub,
    action: 'adherent.export',
    entityType: 'adherent',
    entityId: 'bulk',
    changes: {
      format: 'csv',
      count: results.length,
      companyId: companyId ?? 'all',
    },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="adherents_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

/**
 * GET /api/v1/adherents/:id/bulletins
 * Get an adherent's bulletin history
 */
adherents.get(
  '/:id/bulletins',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const adherentId = c.req.param('id');
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 10;
    const offset = (page - 1) * limit;
    const db = getDb(c);

    const countResult = await db
      .prepare('SELECT COUNT(*) as count FROM bulletins_soins WHERE adherent_id = ?')
      .bind(adherentId)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    const { results } = await db
      .prepare(
        `SELECT bs.id, bs.bulletin_date, bs.bulletin_number, bs.status, bs.total_amount, bs.reimbursed_amount, bs.care_type, bs.created_at,
                (SELECT COUNT(*) FROM actes_bulletin ab WHERE ab.bulletin_id = bs.id) as actes_count
         FROM bulletins_soins bs
         WHERE bs.adherent_id = ?
         ORDER BY bs.bulletin_date DESC
         LIMIT ? OFFSET ?`
      )
      .bind(adherentId, limit, offset)
      .all();

    return paginated(c, results.map((r: Record<string, unknown>) => ({
      id: r.id,
      bulletinNumber: r.bulletin_number,
      dateSoins: r.bulletin_date,
      status: r.status,
      careType: r.care_type,
      declaredAmount: r.total_amount,
      reimbursedAmount: r.reimbursed_amount,
      actesCount: r.actes_count,
      createdAt: r.created_at,
    })), {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/adherents/:id/plafonds
 * Get adherent's reimbursement ceiling consumption
 */
adherents.get(
  '/:id/plafonds',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');
    const annee = Number(c.req.query('annee')) || new Date().getFullYear();
    const db = getDb(c);

    // Check adherent exists
    const adherent = await db
      .prepare('SELECT id FROM adherents WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Get all plafonds for this adherent and year
    const { results } = await db
      .prepare(
        `SELECT p.*, fa.code as famille_code, fa.label as famille_label
         FROM plafonds_beneficiaire p
         LEFT JOIN familles_actes fa ON p.famille_acte_id = fa.id
         WHERE p.adherent_id = ? AND p.annee = ?
         ORDER BY fa.ordre ASC NULLS FIRST`
      )
      .bind(id, annee)
      .all();

    const mapPlafond = (r: Record<string, unknown>) => {
      const plafond = Number(r.montant_plafond) || 0;
      const consomme = Number(r.montant_consomme) || 0;
      return {
        id: r.id,
        adherentId: r.adherent_id,
        contractId: r.contract_id,
        annee: r.annee,
        familleActeId: r.famille_acte_id,
        typeMaladie: r.type_maladie,
        montantPlafond: plafond,
        montantConsomme: consomme,
        familleCode: r.famille_code || null,
        familleLabel: r.famille_label || null,
        pourcentageConsomme: plafond > 0 ? Math.round((consomme / plafond) * 100) : 0,
        montantRestant: Math.max(0, plafond - consomme),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    };

    const all = results.map((r: Record<string, unknown>) => mapPlafond(r));
    const global = all.find((p) => p.familleActeId === null) || null;
    const parFamille = all.filter((p) => p.familleActeId !== null);

    return success(c, {
      global,
      parFamille,
      totalConsomme: all.reduce((sum, p) => sum + (p.familleActeId ? p.montantConsomme : 0), 0),
      totalPlafond: global?.montantPlafond || 0,
    });
  }
);

/**
 * GET /api/v1/adherents/:id/famille
 * Get adherent's family group (principal + ayants-droit)
 */
adherents.get(
  '/:id/famille',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');
    const db = getDb(c);

    // Get the adherent
    const adherent = await db
      .prepare('SELECT * FROM adherents WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<Record<string, unknown>>();

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Determine the principal id
    const principalId = adherent.parent_adherent_id ? String(adherent.parent_adherent_id) : id;

    // Get principal
    const principal = await db
      .prepare('SELECT * FROM adherents WHERE id = ? AND deleted_at IS NULL')
      .bind(principalId)
      .first<Record<string, unknown>>();

    if (!principal) {
      return notFound(c, 'Adhérent principal non trouvé');
    }

    // Get all ayants-droit
    const { results: ayantsDroit } = await db
      .prepare('SELECT * FROM adherents WHERE parent_adherent_id = ? AND deleted_at IS NULL ORDER BY rang_pres ASC')
      .bind(principalId)
      .all();

    const mapAdherent = (r: Record<string, unknown>) => ({
      id: r.id,
      matricule: r.matricule,
      firstName: r.first_name,
      lastName: r.last_name,
      dateOfBirth: r.date_of_birth,
      gender: r.gender,
      email: r.email || null,
      phone: r.phone || null,
      codeType: r.code_type || 'A',
      rangPres: r.rang_pres ?? 0,
      codeSituationFam: r.code_situation_fam,
      parentAdherentId: r.parent_adherent_id,
    });

    const conjoint = ayantsDroit.find((a: Record<string, unknown>) => a.code_type === 'C') || null;
    const enfants = ayantsDroit.filter((a: Record<string, unknown>) => a.code_type === 'E');

    return success(c, {
      principal: mapAdherent(principal),
      conjoint: conjoint ? mapAdherent(conjoint) : null,
      enfants: enfants.map((e: Record<string, unknown>) => mapAdherent(e)),
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

    // Encrypt sensitive data with AES-256-GCM — skip costly PBKDF2 when values are empty
    const encryptedNationalId = data.nationalId ? await encrypt(data.nationalId, encryptionKey) : '';
    const encryptedPhone = data.phone ? await encrypt(data.phone, encryptionKey) : undefined;

    // Store hash for searchability (allows lookup without decryption)
    const nationalIdHash = data.nationalId ? await hashForIndex(data.nationalId, encryptionKey) : null;

    const id = generateId();
    const db = getDb(c);
    const now = new Date().toISOString();

    // Check matricule uniqueness within the company
    if (data.matricule && data.companyId) {
      const existing = await db
        .prepare('SELECT id FROM adherents WHERE company_id = ? AND matricule = ? AND deleted_at IS NULL')
        .bind(data.companyId, data.matricule)
        .first();
      if (existing) {
        return conflict(c, `Le matricule "${data.matricule}" existe déjà dans cette entreprise`);
      }
    }

    // Auto-generate matricule if not provided (sequential per company, like Acorad)
    let matricule = data.matricule || null;
    if (!matricule && data.companyId) {
      const maxResult = await db
        .prepare(
          `SELECT MAX(CAST(matricule AS INTEGER)) as max_mat
           FROM adherents
           WHERE company_id = ? AND matricule IS NOT NULL AND matricule != 'null'
             AND matricule GLOB '[0-9]*'`
        )
        .bind(data.companyId)
        .first<{ max_mat: number | null }>();
      const next = (maxResult?.max_mat ?? 0) + 1;
      matricule = String(next).padStart(4, '0');
    }

    // Encrypt mobile and RIB if provided
    const encryptedMobile = data.mobile ? await encrypt(data.mobile, encryptionKey) : null;
    const encryptedRib = data.rib ? await encrypt(data.rib, encryptionKey) : null;

    await db
      .prepare(
        `INSERT INTO adherents (
          id, national_id_encrypted, national_id_hash, first_name, last_name,
          date_of_birth, gender, lieu_naissance, etat_civil, date_mariage,
          phone_encrypted, mobile_encrypted, email,
          rue, address, city, postal_code, lat, lng,
          company_id, matricule, plafond_global,
          date_debut_adhesion, date_fin_adhesion, rang, is_active,
          banque, rib_encrypted, regime_social, handicap,
          fonction, maladie_chronique, matricule_conjoint,
          type_piece_identite, date_edition_piece, contre_visite_obligatoire, etat_fiche, credit,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id, encryptedNationalId, nationalIdHash, data.firstName, data.lastName,
        data.dateOfBirth, data.gender ?? null, data.lieuNaissance ?? null, data.etatCivil ?? null, data.dateMarriage ?? null,
        encryptedPhone ?? null, encryptedMobile, data.email ?? null,
        data.rue ?? null, data.address ?? null, data.city ?? null, data.postalCode ?? null, data.lat ?? null, data.lng ?? null,
        data.companyId ?? null, matricule, data.plafondGlobal ?? null,
        data.dateDebutAdhesion ?? null, data.dateFinAdhesion ?? null, data.rang ?? 0, data.isActive !== false ? 1 : 0,
        data.banque ?? null, encryptedRib, data.regimeSocial ?? null, data.handicap ? 1 : 0,
        data.fonction ?? null, data.maladiChronique ? 1 : 0, data.matriculeConjoint ?? null,
        data.typePieceIdentite ?? 'CIN', data.dateEditionPiece ?? null, data.contreVisiteObligatoire ? 1 : 0, data.etatFiche ?? 'NON_TEMPORAIRE', data.credit ?? 0,
        now, now
      )
      .run();

    await logAudit(db, {
      userId: user?.sub,
      action: 'adherent.create',
      entityType: 'adherent',
      entityId: id,
      changes: { firstName: data.firstName, lastName: data.lastName, companyId: data.companyId, matricule: data.matricule },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    // --- Créer les ayants droit (conjoint + enfants) ---
    const ayantsDroitCreated: Array<{ id: string; matricule: string; codeType: string; firstName: string; lastName: string }> = [];
    if (data.ayantsDroit && data.ayantsDroit.length > 0) {
      // Validate: max 1 conjoint
      const conjoints = data.ayantsDroit.filter((a) => a.lienParente === 'C');
      if (conjoints.length > 1) {
        return conflict(c, 'Un seul conjoint est autorisé par adhérent');
      }

      let rangCounter = 1;
      for (const ad of data.ayantsDroit) {
        const adId = generateId();
        const adEncryptedNationalId = await encrypt(ad.nationalId || '', encryptionKey);
        const adNationalIdHash = ad.nationalId ? await hashForIndex(ad.nationalId, encryptionKey) : null;
        const adEncryptedPhone = ad.phone ? await encrypt(ad.phone, encryptionKey) : null;

        // Matricule ayant droit: basé sur le principal (ex: 0001-C1, 0001-E1, 0001-E2)
        const suffix = ad.lienParente === 'C'
          ? 'C1'
          : `E${data.ayantsDroit.filter((x, i) => x.lienParente === 'E' && i <= data.ayantsDroit!.indexOf(ad)).length}`;
        const adMatricule = `${matricule}-${suffix}`;

        await db
          .prepare(
            `INSERT INTO adherents (
              id, national_id_encrypted, national_id_hash, first_name, last_name,
              date_of_birth, gender, etat_civil,
              phone_encrypted, email,
              company_id, company_name, matricule, plafond_global,
              date_debut_adhesion, date_fin_adhesion, is_active,
              code_type, parent_adherent_id, rang_pres, code_situation_fam,
              type_piece_identite, etat_fiche,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            adId, adEncryptedNationalId, adNationalIdHash, ad.firstName, ad.lastName,
            ad.dateOfBirth, ad.gender ?? null, ad.etatCivil ?? null,
            adEncryptedPhone, ad.email || null,
            data.companyId ?? null, null, adMatricule, data.plafondGlobal ?? null,
            data.dateDebutAdhesion ?? null, data.dateFinAdhesion ?? null, 1,
            ad.lienParente, id, rangCounter,
            ad.lienParente === 'C' ? 'M' : 'C',
            ad.typePieceIdentite ?? 'CIN', 'NON_TEMPORAIRE',
            now, now
          )
          .run();

        ayantsDroitCreated.push({
          id: adId,
          matricule: adMatricule,
          codeType: ad.lienParente,
          firstName: ad.firstName,
          lastName: ad.lastName,
        });

        await logAudit(db, {
          userId: user?.sub,
          action: 'adherent.create_ayant_droit',
          entityType: 'adherent',
          entityId: adId,
          changes: { parentId: id, codeType: ad.lienParente, firstName: ad.firstName, lastName: ad.lastName },
          ipAddress: c.req.header('CF-Connecting-IP'),
          userAgent: c.req.header('User-Agent'),
        });

        rangCounter++;
      }
    }

    // Mettre à jour le code_type du principal à 'A' s'il a des ayants droit
    if (ayantsDroitCreated.length > 0) {
      await db.prepare('UPDATE adherents SET code_type = ? WHERE id = ?').bind('A', id).run();
    }

    const result = await db
      .prepare(`SELECT a.*, co.name as co_name FROM adherents a LEFT JOIN companies co ON a.company_id = co.id WHERE a.id = ?`)
      .bind(id)
      .first<Record<string, unknown>>();

    return created(c, {
      id,
      matricule,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth,
      gender: data.gender,
      email: data.email,
      city: data.city,
      companyId: data.companyId,
      companyName: result?.co_name,
      plafondGlobal: data.plafondGlobal,
      plafondConsomme: 0,
      createdAt: now,
      ayantsDroit: ayantsDroitCreated,
    });
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
    const db = getDb(c);

    // Check adherent exists
    const existing = await db.prepare('SELECT id, company_id FROM adherents WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ id: string; company_id: string }>();
    if (!existing) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Check matricule uniqueness within the company on update
    if (data.matricule && existing.company_id) {
      const duplicate = await db
        .prepare('SELECT id FROM adherents WHERE company_id = ? AND matricule = ? AND id != ? AND deleted_at IS NULL')
        .bind(existing.company_id, data.matricule, id)
        .first();
      if (duplicate) {
        return conflict(c, `Le matricule "${data.matricule}" existe déjà dans cette entreprise`);
      }
    }

    // Build dynamic SET clause
    const updates: string[] = [];
    const params: unknown[] = [];

    const simpleFields: Record<string, unknown> = {
      first_name: data.firstName,
      last_name: data.lastName,
      date_of_birth: data.dateOfBirth,
      gender: data.gender,
      lieu_naissance: data.lieuNaissance,
      etat_civil: data.etatCivil,
      date_mariage: data.dateMarriage,
      email: data.email,
      rue: data.rue,
      address: data.address,
      city: data.city,
      postal_code: data.postalCode,
      lat: data.lat,
      lng: data.lng,
      matricule: data.matricule,
      plafond_global: data.plafondGlobal,
      date_debut_adhesion: data.dateDebutAdhesion,
      date_fin_adhesion: data.dateFinAdhesion,
      rang: data.rang,
      banque: data.banque,
      regime_social: data.regimeSocial,
      fonction: data.fonction,
      matricule_conjoint: data.matriculeConjoint,
      type_piece_identite: data.typePieceIdentite,
      date_edition_piece: data.dateEditionPiece,
      etat_fiche: data.etatFiche,
      credit: data.credit,
    };

    for (const [col, val] of Object.entries(simpleFields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        params.push(val);
      }
    }

    // Boolean fields
    if (data.isActive !== undefined) { updates.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }
    if (data.handicap !== undefined) { updates.push('handicap = ?'); params.push(data.handicap ? 1 : 0); }
    if (data.maladiChronique !== undefined) { updates.push('maladie_chronique = ?'); params.push(data.maladiChronique ? 1 : 0); }
    if (data.contreVisiteObligatoire !== undefined) { updates.push('contre_visite_obligatoire = ?'); params.push(data.contreVisiteObligatoire ? 1 : 0); }

    // Encrypted fields
    if (data.phone !== undefined) {
      updates.push('phone_encrypted = ?');
      params.push(data.phone ? await encrypt(data.phone, encryptionKey) : null);
    }
    if (data.mobile !== undefined) {
      updates.push('mobile_encrypted = ?');
      params.push(data.mobile ? await encrypt(data.mobile, encryptionKey) : null);
    }
    if (data.rib !== undefined) {
      updates.push('rib_encrypted = ?');
      params.push(data.rib ? await encrypt(data.rib, encryptionKey) : null);
    }

    if (updates.length === 0) {
      return success(c, { id, message: 'Aucune modification' });
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await db.prepare(`UPDATE adherents SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

    await logAudit(db, {
      userId: user?.sub,
      action: 'adherent.update',
      entityType: 'adherent',
      entityId: id,
      changes: { firstName: data.firstName, lastName: data.lastName, matricule: data.matricule },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    // --- Update ayants droit if provided ---
    if (data.ayantsDroit !== undefined) {
      const conjoints = (data.ayantsDroit || []).filter((a) => a.lienParente === 'C');
      if (conjoints.length > 1) {
        return conflict(c, 'Un seul conjoint est autorisé par adhérent');
      }

      // Soft-delete existing ayants droit
      await db
        .prepare('UPDATE adherents SET deleted_at = datetime(\'now\') WHERE parent_adherent_id = ? AND deleted_at IS NULL')
        .bind(id)
        .run();

      // Re-create from payload
      const principalMatricule = (await db.prepare('SELECT matricule FROM adherents WHERE id = ?').bind(id).first<{ matricule: string }>())?.matricule || '0000';
      let rangCounter = 1;

      for (const ad of data.ayantsDroit || []) {
        const adId = generateId();
        const adEncryptedNationalId = await encrypt(ad.nationalId || '', encryptionKey);
        const adNationalIdHash = ad.nationalId ? await hashForIndex(ad.nationalId, encryptionKey) : null;
        const adEncryptedPhone = ad.phone ? await encrypt(ad.phone, encryptionKey) : null;

        const suffix = ad.lienParente === 'C'
          ? 'C1'
          : `E${(data.ayantsDroit || []).filter((x, i) => x.lienParente === 'E' && i <= (data.ayantsDroit || []).indexOf(ad)).length}`;
        const adMatricule = `${principalMatricule}-${suffix}`;

        await db
          .prepare(
            `INSERT INTO adherents (
              id, national_id_encrypted, national_id_hash, first_name, last_name,
              date_of_birth, gender,
              phone_encrypted, email,
              company_id, matricule,
              is_active, code_type, parent_adherent_id, rang_pres,
              type_piece_identite, etat_fiche,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          )
          .bind(
            adId, adEncryptedNationalId, adNationalIdHash, ad.firstName, ad.lastName,
            ad.dateOfBirth, ad.gender ?? null,
            adEncryptedPhone, ad.email || null,
            existing.company_id, adMatricule,
            ad.lienParente, id, rangCounter,
            ad.typePieceIdentite ?? 'CIN', 'NON_TEMPORAIRE'
          )
          .run();

        await logAudit(db, {
          userId: user?.sub,
          action: 'adherent.update_ayant_droit',
          entityType: 'adherent',
          entityId: adId,
          changes: { parentId: id, codeType: ad.lienParente, firstName: ad.firstName, lastName: ad.lastName },
          ipAddress: c.req.header('CF-Connecting-IP'),
          userAgent: c.req.header('User-Agent'),
        });

        rangCounter++;
      }

      // Update principal code_type
      if ((data.ayantsDroit || []).length > 0) {
        await db.prepare('UPDATE adherents SET code_type = ? WHERE id = ?').bind('A', id).run();
      }
    }

    // Return updated adherent
    const updated = await db
      .prepare(`SELECT a.*, co.name as company_name FROM adherents a LEFT JOIN companies co ON a.company_id = co.id WHERE a.id = ?`)
      .bind(id)
      .first<Record<string, unknown>>();

    return success(c, {
      id,
      matricule: updated?.matricule,
      firstName: updated?.first_name,
      lastName: updated?.last_name,
      dateOfBirth: updated?.date_of_birth,
      gender: updated?.gender,
      email: updated?.email,
      city: updated?.city,
      companyId: updated?.company_id,
      companyName: updated?.company_name,
      plafondGlobal: updated?.plafond_global,
      plafondConsomme: updated?.plafond_consomme,
    });
  }
);

/**
 * POST /api/v1/adherents/import
 * Bulk import adherents from CSV data
 */
adherents.post(
  '/import',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', adherentImportSchema, (result, c) => {
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
      console.error('[adherent-import] Zod validation failed:', JSON.stringify(errors));
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: errors } }, 400);
    }
  }),
  async (c) => {
    const { adherents: rows, skipDuplicates, companyId } = c.req.valid('json');
    const user = c.get('user');
    const encryptionKey = getEncryptionKey(c);

    console.log(`[adherent-import] Starting import: ${rows.length} rows, skipDuplicates=${skipDuplicates}, companyId=${companyId}`);

    const results = {
      success: 0,
      skipped: 0,
      errors: [] as { row: number; nationalId: string; error: string }[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      try {
        console.log(`[adherent-import] Row ${i + 1}: nationalId=${maskCIN(row.nationalId)}, name=${row.firstName} ${row.lastName}`);
        // Check for existing adherent using hash index (allows lookup without decryption)
        const nationalIdHash = await hashForIndex(row.nationalId, encryptionKey);
        const existingCheck = await getDb(c).prepare(
          'SELECT id FROM adherents WHERE national_id_hash = ? AND deleted_at IS NULL'
        )
          .bind(nationalIdHash)
          .first();

        if (existingCheck) {
          console.log(`[adherent-import] Row ${i + 1}: DUPLICATE found (id=${(existingCheck as { id: string }).id})`);
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
        const encryptedRib = row.rib ? await encrypt(row.rib, encryptionKey) : null;

        await getDb(c).prepare(
          `INSERT INTO adherents (
            id, national_id_encrypted, national_id_hash, first_name, last_name,
            date_of_birth, gender, phone_encrypted, email, address, city,
            company_id, matricule, code_type, rang_pres, code_situation_fam,
            date_debut_adhesion, date_fin_adhesion, date_mariage,
            rib_encrypted, postal_code, handicap, maladie_chronique,
            is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
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
            row.city || null,
            companyId || null,
            row.matricule || null,
            row.memberType || 'A',
            row.rang ? Number(row.rang) : 0,
            row.maritalStatus || null,
            row.dateDebutAdhesion || null,
            row.dateFinAdhesion || null,
            row.dateMarriage || null,
            encryptedRib,
            row.postalCode || null,
            row.handicap ? 1 : 0,
            row.chronicDisease ? 1 : 0
          )
          .run();

        results.success++;
        console.log(`[adherent-import] Row ${i + 1}: SUCCESS (id=${id})`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error(`[adherent-import] Row ${i + 1}: ERROR - ${errMsg}`);
        results.errors.push({
          row: i + 1,
          nationalId: maskCIN(row.nationalId), // Mask in error messages
          error: errMsg,
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
adherents.delete('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
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

/**
 * POST /api/v1/adherents/bulk-delete
 * Soft delete multiple adherents
 */
adherents.post('/bulk-delete', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const body = await c.req.json<{ ids: string[] }>();
  const ids = body.ids;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Liste d\'IDs requise' } }, 400);
  }

  if (ids.length > 100) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 100 adhérents à la fois' } }, 400);
  }

  try {
    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(',');
    await db
      .prepare(`UPDATE adherents SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`)
      .bind(now, now, ...ids)
      .run();

    await logAudit(db, {
      userId: user?.sub,
      action: 'adherent.bulk_delete',
      entityType: 'adherent',
      entityId: ids.join(','),
      changes: { count: ids.length },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return c.json({ success: true, data: { deleted: ids.length } });
  } catch (error) {
    console.error('Error bulk deleting adherents:', error);
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la suppression' } }, 500);
  }
});

export { adherents };
