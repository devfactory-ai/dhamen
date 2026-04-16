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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  async (c) => {
    const q = c.req.query('q') || '';
    const nationalId = c.req.query('nationalId') || '';
    const companyId = c.req.query('companyId') || '';

    if (!nationalId && q.length < 2) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Le paramètre q doit avoir au moins 2 caractères' },
      }, 400);
    }

    const user = c.get('user');
    const db = getDb(c);

    // HR role: must have a company_id
    if (user.role === 'HR' && !user.companyId) {
      return c.json({
        success: false,
        error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' },
      }, 403);
    }

    const today = new Date().toISOString().split('T')[0];
    let query = `
      SELECT a.id, a.matricule, a.first_name, a.last_name, a.email,
             a.plafond_global, a.plafond_consomme,
             co.name as company_name,
             (SELECT ct.plan_type FROM contracts ct WHERE ct.adherent_id = a.id AND UPPER(ct.status) = 'ACTIVE' ORDER BY ct.created_at DESC LIMIT 1) as contract_type,
             (SELECT ct.end_date FROM contracts ct WHERE ct.adherent_id = a.id AND UPPER(ct.status) = 'ACTIVE' ORDER BY ct.created_at DESC LIMIT 1) as contract_end_date,
             (SELECT ct.contract_number FROM contracts ct WHERE ct.adherent_id = a.id AND UPPER(ct.status) = 'ACTIVE' ORDER BY ct.created_at DESC LIMIT 1) as contract_number
      FROM adherents a
      LEFT JOIN companies co ON a.company_id = co.id
      WHERE a.deleted_at IS NULL AND a.is_active = 1 AND a.parent_adherent_id IS NULL
    `;
    const params: unknown[] = [];

    if (nationalId) {
      // Search by national ID hash (encrypted field)
      const encryptionKey = getEncryptionKey(c);
      const idHash = await hashForIndex(nationalId, encryptionKey);
      query += ' AND a.national_id_hash = ?';
      params.push(idHash);
    } else {
      const likeQ = `%${q}%`;
      query += ' AND (a.matricule LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ?)';
      params.push(likeQ, likeQ, likeQ);
    }

    // Filter by company if provided (agent selecting a specific company)
    if (companyId && companyId !== '__INDIVIDUAL__') {
      query += ' AND a.company_id = ?';
      params.push(companyId);
    }

    // HR: scope to own company only
    if (user.role === 'HR') {
      query += ' AND a.company_id = ?';
      params.push(user.companyId);
    } else if (user.insurerId) {
      query += " AND (co.insurer_id = ? OR a.company_id IS NULL OR a.company_id = '__INDIVIDUAL__')";
      params.push(user.insurerId);
    }

    query += ' ORDER BY a.last_name, a.first_name LIMIT 10';

    const { results } = await db.prepare(query).bind(...params).all();

    return success(c, results.map((r: Record<string, unknown>) => {
      const endDate = r.contract_end_date as string | null;
      let contractWarning: string | null = null;
      if (!endDate && !r.contract_type) {
        contractWarning = 'Aucun contrat actif';
      } else if (endDate && endDate < today!) {
        contractWarning = `Contrat expiré depuis le ${endDate}`;
      } else if (endDate) {
        const daysLeft = Math.ceil((new Date(endDate).getTime() - new Date(today!).getTime()) / 86400000);
        if (daysLeft <= 30) {
          contractWarning = `Contrat expire dans ${daysLeft} jour(s) (${endDate})`;
        }
      }
      return {
        id: r.id,
        matricule: r.matricule,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email || null,
        companyName: r.company_name,
        plafondGlobal: r.plafond_global,
        plafondConsomme: r.plafond_consomme,
        contractType: r.contract_type || null,
        contractEndDate: endDate || null,
        contractNumber: r.contract_number || null,
        contractWarning,
      };
    }));
  }
);

/**
 * GET /api/v1/adherents/check
 * Quick check if an adherent exists by matricule + if company has active contract
 */
adherents.get(
  '/check',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const matricule = c.req.query('matricule');
    const companyId = c.req.query('companyId');

    if (!matricule || !companyId) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'matricule et companyId requis' },
      }, 400);
    }

    const db = getDb(c);

    // Check adherent
    const adherent = await db.prepare(
      `SELECT id, first_name, last_name FROM adherents
       WHERE matricule = ? AND company_id = ? AND deleted_at IS NULL AND is_active = 1
       LIMIT 1`
    ).bind(matricule, companyId).first<{ id: string; first_name: string; last_name: string }>();

    // Check active contract only if adherent exists
    let contract: { id: string; contract_number: string; status: string } | null = null;
    if (adherent) {
      contract = await db.prepare(
        `SELECT id, contract_number, status FROM group_contracts
         WHERE company_id = ? AND deleted_at IS NULL AND status = 'active'
         LIMIT 1`
      ).bind(companyId).first<{ id: string; contract_number: string; status: string }>();
    }

    return success(c, {
      adherent_found: !!adherent,
      contract_found: !!contract,
      adherent: adherent ? { id: adherent.id, first_name: adherent.first_name, last_name: adherent.last_name } : null,
      contract: contract ? { id: contract.id, contract_number: contract.contract_number } : null,
    });
  }
);

/**
 * GET /api/v1/adherents/next-matricule
 * Get next available matricule for a company
 */
adherents.get(
  '/next-matricule',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  async (c) => {
    const user = c.get('user');
    // HR: force own company_id
    const companyId = user.role === 'HR' ? user.companyId : c.req.query('companyId');
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 20;
    const search = c.req.query('search') || undefined;
    const city = c.req.query('city') || undefined;
    const isActiveParam = c.req.query('isActive');
    const dossierCompletParam = c.req.query('dossierComplet');
    const contractTypeParam = c.req.query('contractType');
    const user = c.get('user');
    const db = getDb(c);
    const offset = (page - 1) * limit;

    // HR role: must have a company_id
    if (user.role === 'HR' && !user.companyId) {
      return c.json({
        success: false,
        error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' },
      }, 403);
    }

    let whereClause = 'a.deleted_at IS NULL AND a.parent_adherent_id IS NULL';
    const params: unknown[] = [];

    // HR: force scope to own company (ignore companyId query param)
    if (user.role === 'HR') {
      whereClause += ' AND a.company_id = ?';
      params.push(user.companyId);
    } else {
      const companyId = c.req.query('companyId') || undefined;
      if (companyId) {
        whereClause += ' AND a.company_id = ?';
        params.push(companyId);
      }
    }

    // Filter by contract type: individual = no company, group = has company
    if (contractTypeParam === 'individual') {
      whereClause += " AND (a.company_id IS NULL OR a.company_id = '' OR a.company_id = '__INDIVIDUAL__')";
    } else if (contractTypeParam === 'group') {
      whereClause += " AND a.company_id IS NOT NULL AND a.company_id != '' AND a.company_id != '__INDIVIDUAL__'";
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
      whereClause += " AND (co.insurer_id = ? OR a.company_id IS NULL OR a.company_id = '__INDIVIDUAL__')";
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
adherents.get('/export', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const search = c.req.query('search');

  // HR role: must have a company_id
  if (user.role === 'HR' && !user.companyId) {
    return c.json({
      success: false,
      error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' },
    }, 403);
  }

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

  // HR: force scope to own company
  if (user.role === 'HR') {
    query += ' AND a.company_id = ?';
    binds.push(user.companyId);
  } else {
    if (user.insurerId) {
      query += ' AND c.insurer_id = ?';
      binds.push(user.insurerId);
    }
    const companyId = c.req.query('companyId');
    if (companyId) {
      query += ' AND a.company_id = ?';
      binds.push(companyId);
    }
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
      companyId: user.role === 'HR' ? user.companyId : (c.req.query('companyId') ?? 'all'),
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  async (c) => {
    const adherentId = c.req.param('id');
    const user = c.get('user');

    // HR: verify adherent belongs to their company
    if (user.role === 'HR') {
      const adherentCheck = await getDb(c).prepare('SELECT company_id FROM adherents WHERE id = ? AND deleted_at IS NULL').bind(adherentId).first<{ company_id: string | null }>();
      if (!adherentCheck || adherentCheck.company_id !== user.companyId) {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cet adhérent n\'appartient pas à votre entreprise' } }, 403);
      }
    }
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 10;
    const offset = (page - 1) * limit;
    const db = getDb(c);

    // Get adherent matricule to also match bulletins linked by matricule (handles duplicates)
    const adherentRecord = await db
      .prepare('SELECT matricule FROM adherents WHERE id = ? AND deleted_at IS NULL')
      .bind(adherentId)
      .first<{ matricule: string | null }>();
    const adherentMatricule = adherentRecord?.matricule;

    // Match by adherent_id OR adherent_matricule (catches bulletins linked to auto-created duplicates)
    const whereClause = adherentMatricule
      ? `(bs.adherent_id = ? OR bs.adherent_matricule = ?)`
      : `bs.adherent_id = ?`;
    const bindParams = adherentMatricule
      ? [adherentId, adherentMatricule]
      : [adherentId];

    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM bulletins_soins bs WHERE ${whereClause}`)
      .bind(...bindParams)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    const { results } = await db
      .prepare(
        `SELECT bs.id, bs.bulletin_date, bs.bulletin_number, bs.status, bs.total_amount, bs.reimbursed_amount, bs.care_type, bs.created_at,
                (SELECT COUNT(*) FROM actes_bulletin ab WHERE ab.bulletin_id = bs.id) as actes_count
         FROM bulletins_soins bs
         WHERE ${whereClause}
         ORDER BY bs.bulletin_date DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...bindParams, limit, offset)
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  async (c) => {
    const id = c.req.param('id');
    const annee = Number(c.req.query('annee')) || new Date().getFullYear();
    const db = getDb(c);
    const user = c.get('user');

    // Check adherent exists
    const adherent = await db
      .prepare('SELECT id, company_id FROM adherents WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<{ id: string; company_id: string | null }>();

    // HR: verify company ownership
    if (user.role === 'HR' && adherent && adherent.company_id !== user.companyId) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cet adhérent n\'appartient pas à votre entreprise' } }, 403);
    }

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
    let global = all.find((p) => p.familleActeId === null) || null;
    const parFamille = all.filter((p) => p.familleActeId !== null);

    // Fallback: if no plafonds_beneficiaire rows, build global from adherents.plafond_global/plafond_consomme
    if (!global && parFamille.length === 0) {
      const adh = await db
        .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
        .bind(id)
        .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
      if (adh?.plafond_global && adh.plafond_global > 0) {
        const plafond = adh.plafond_global;
        const consomme = adh.plafond_consomme || 0;
        global = {
          id: 'legacy-global',
          adherentId: id,
          contractId: null,
          annee,
          familleActeId: null,
          typeMaladie: 'ordinaire',
          montantPlafond: plafond,
          montantConsomme: consomme,
          familleCode: null,
          familleLabel: null,
          pourcentageConsomme: plafond > 0 ? Math.round((consomme / plafond) * 100) : 0,
          montantRestant: Math.max(0, plafond - consomme),
          createdAt: null,
          updatedAt: null,
        };
      }
    }

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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  async (c) => {
    const id = c.req.param('id');
    const db = getDb(c);
    const user = c.get('user');

    // Get the adherent
    const adherent = await db
      .prepare('SELECT * FROM adherents WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<Record<string, unknown>>();

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // HR: verify company ownership
    if (user.role === 'HR' && adherent.company_id !== user.companyId) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cet adhérent n\'appartient pas à votre entreprise' } }, 403);
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
      phone: r.phone_encrypted ? String(r.phone_encrypted) : null,
      nationalId: r.national_id_encrypted ? String(r.national_id_encrypted) : null,
      typePieceIdentite: r.type_piece_identite || 'CIN',
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
 * POST /api/v1/adherents/:id/add-ayant-droit
 * Add a single ayant droit (conjoint or enfant) to an existing adherent
 * without removing existing ayants droit.
 */
adherents.post(
  '/:id/add-ayant-droit',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');
    const db = getDb(c);
    const user = c.get('user');
    const encryptionKey = getEncryptionKey(c);

    const body = await c.req.json();
    const { lienParente, firstName, lastName, dateOfBirth, gender, phone, email, nationalId, typePieceIdentite } = body;

    if (!lienParente || !firstName || !lastName || !dateOfBirth) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'lienParente, firstName, lastName et dateOfBirth sont requis' } }, 400);
    }
    if (!['C', 'E'].includes(lienParente)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'lienParente doit être C (conjoint) ou E (enfant)' } }, 400);
    }

    // Get principal
    const principal = await db
      .prepare('SELECT * FROM adherents WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<Record<string, unknown>>();

    if (!principal) {
      return notFound(c, 'Adhérent principal non trouvé');
    }

    // Check if conjoint already exists
    if (lienParente === 'C') {
      const existingConjoint = await db
        .prepare('SELECT id FROM adherents WHERE parent_adherent_id = ? AND code_type = ? AND deleted_at IS NULL')
        .bind(id, 'C')
        .first();
      if (existingConjoint) {
        return conflict(c, 'Un conjoint existe déjà pour cet adhérent');
      }
    }

    // Count existing enfants
    const { results: existingEnfants } = await db
      .prepare('SELECT id FROM adherents WHERE parent_adherent_id = ? AND code_type = ? AND deleted_at IS NULL')
      .bind(id, 'E')
      .all();

    const principalMatricule = String(principal.matricule || id);
    const suffix = lienParente === 'C'
      ? 'C1'
      : `E${existingEnfants.length + 1}`;
    const adMatricule = `${principalMatricule}-${suffix}`;

    // Get next rang_pres
    const maxRang = await db
      .prepare('SELECT MAX(rang_pres) as max_rang FROM adherents WHERE parent_adherent_id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<{ max_rang: number | null }>();
    const rangPres = (maxRang?.max_rang ?? 0) + 1;

    const adId = generateId();
    const adEncryptedNationalId = await encrypt(nationalId || '', encryptionKey);
    const adNationalIdHash = nationalId ? await hashForIndex(nationalId, encryptionKey) : null;
    const adEncryptedPhone = phone ? await encrypt(phone, encryptionKey) : null;

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
        adId, adEncryptedNationalId, adNationalIdHash, firstName, lastName,
        dateOfBirth, gender ?? null,
        adEncryptedPhone, email || null,
        principal.company_id, adMatricule,
        lienParente, id, rangPres,
        typePieceIdentite ?? 'CIN', 'NON_TEMPORAIRE'
      )
      .run();

    // Ensure principal has code_type 'A'
    await db.prepare('UPDATE adherents SET code_type = ? WHERE id = ?').bind('A', id).run();

    await logAudit(db, {
      userId: user?.sub,
      action: 'adherent.add_ayant_droit',
      entityType: 'adherent',
      entityId: adId,
      changes: { parentId: id, codeType: lienParente, firstName, lastName },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, {
      id: adId,
      matricule: adMatricule,
      firstName,
      lastName,
      dateOfBirth,
      gender: gender ?? null,
      email: email || null,
      codeType: lienParente,
      parentAdherentId: id,
      rangPres,
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
    'CLINIC_ADMIN',
    'HR'
  ),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const adherent = await findAdherentById(getDb(c), id);

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // HR: verify company ownership
    if (user.role === 'HR' && adherent.companyId !== user.companyId) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cet adhérent n\'appartient pas à votre entreprise' } }, 403);
    }

    // Decrypt sensitive fields before sending to client
    const encryptionKey = getEncryptionKey(c);
    const decrypted: Record<string, unknown> = { ...adherent };

    // nationalId (stored as nationalIdEncrypted)
    if (adherent.nationalIdEncrypted) {
      try {
        const enc = String(adherent.nationalIdEncrypted);
        decrypted.nationalId = enc.startsWith('ENC_') ? enc.replace('ENC_', '') : await decrypt(enc, encryptionKey);
      } catch { decrypted.nationalId = ''; }
    }
    delete decrypted.nationalIdEncrypted;

    // phone (stored as phoneEncrypted)
    if (adherent.phoneEncrypted) {
      try {
        const enc = String(adherent.phoneEncrypted);
        decrypted.phone = enc.startsWith('ENC_') ? enc.replace('ENC_', '') : await decrypt(enc, encryptionKey);
      } catch { decrypted.phone = null; }
    }
    delete decrypted.phoneEncrypted;

    // mobile (stored encrypted)
    if (adherent.mobile) {
      try {
        const enc = String(adherent.mobile);
        decrypted.mobile = enc.startsWith('ENC_') ? enc.replace('ENC_', '') : await decrypt(enc, encryptionKey);
      } catch { decrypted.mobile = null; }
    }

    // rib (stored encrypted)
    if (adherent.rib) {
      try {
        const enc = String(adherent.rib);
        decrypted.rib = enc.startsWith('ENC_') ? enc.replace('ENC_', '') : await decrypt(enc, encryptionKey);
      } catch { decrypted.rib = null; }
    }

    return success(c, decrypted);
  }
);

/**
 * POST /api/v1/adherents
 * Create a new adherent
 */
adherents.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  zValidator('json', adherentCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const encryptionKey = getEncryptionKey(c);

    // HR: force company_id to own company (BR-003: auto-assign)
    if (user.role === 'HR') {
      if (!user.companyId) {
        return c.json({
          success: false,
          error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' },
        }, 403);
      }
      data.companyId = user.companyId;
    }

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
        (data.companyId && data.companyId !== '__INDIVIDUAL__') ? data.companyId : null, matricule, data.plafondGlobal ?? null,
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

    // --- Créer un contrat individuel en mode individuel (ou si contractNumber fourni) ---
    const isIndividualMode = !data.companyId || data.companyId === '__INDIVIDUAL__';
    if (isIndividualMode || data.contractNumber) {
      // Resolve insurer_id: from user token, or from company's active group contract
      let createInsurerId: string | null = user.insurerId || null;
      if (!createInsurerId && data.companyId && data.companyId !== '__INDIVIDUAL__') {
        const companyGc = await db
          .prepare("SELECT gc.insurer_id FROM group_contracts gc WHERE gc.company_id = ? AND gc.status = 'active' AND gc.deleted_at IS NULL ORDER BY gc.created_at DESC LIMIT 1")
          .bind(data.companyId)
          .first<{ insurer_id: string }>();
        createInsurerId = companyGc?.insurer_id || null;
      }

      if (createInsurerId) {
        const contractId = generateId();
        const now2 = new Date();
        const endDate = new Date(now2);
        endDate.setFullYear(endDate.getFullYear() + 1);
        const contractNumber = data.contractNumber || `${data.matricule || id}-IND`;

        // Find the group contract of the insurer to link guarantees
        let groupContractId: string | null = null;
        const gc = await db
          .prepare("SELECT id FROM group_contracts WHERE insurer_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1")
          .bind(createInsurerId)
          .first<{ id: string }>();
        groupContractId = gc?.id || null;

        await db
          .prepare(
            `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, group_contract_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'individual', ?, ?, 0, ?, '{}', 'active', ?, datetime('now'), datetime('now'))`
          )
          .bind(
            contractId,
            createInsurerId,
            id,
            contractNumber,
            now2.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0],
            data.plafondGlobal ? data.plafondGlobal : null,
            groupContractId
          )
          .run();
      }
    }

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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
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

    // HR: verify company ownership (BR-003)
    if (user.role === 'HR') {
      if (!user.companyId) {
        return c.json({ success: false, error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' } }, 403);
      }
      if (existing.company_id !== user.companyId) {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cet adhérent n\'appartient pas à votre entreprise' } }, 403);
      }
    }

    // Check matricule uniqueness within the company on update
    const targetCompanyId = data.companyId || existing.company_id;
    if (data.matricule && targetCompanyId) {
      const duplicate = await db
        .prepare('SELECT id FROM adherents WHERE company_id = ? AND matricule = ? AND id != ? AND deleted_at IS NULL')
        .bind(targetCompanyId, data.matricule, id)
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
      company_id: data.companyId,
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
    if (data.nationalId !== undefined && data.nationalId !== '') {
      updates.push('national_id_encrypted = ?');
      params.push(await encrypt(data.nationalId, encryptionKey));
      updates.push('national_id_hash = ?');
      params.push(await hashForIndex(data.nationalId, encryptionKey));
    }
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

    // --- Créer/mettre à jour contrat individuel si contractNumber fourni ---
    // Resolve insurer_id: from user token, or from company's active group contract
    let resolvedInsurerId: string | null = user.insurerId || null;
    if (!resolvedInsurerId && existing.company_id) {
      const companyGc = await db
        .prepare("SELECT gc.insurer_id FROM group_contracts gc WHERE gc.company_id = ? AND gc.status = 'active' AND gc.deleted_at IS NULL ORDER BY gc.created_at DESC LIMIT 1")
        .bind(existing.company_id)
        .first<{ insurer_id: string }>();
      resolvedInsurerId = companyGc?.insurer_id || null;
    }

    if (data.contractNumber) {
      // Check if adherent already has ANY contract (any status)
      const existingContract = await db
        .prepare("SELECT id, status FROM contracts WHERE adherent_id = ? ORDER BY created_at DESC LIMIT 1")
        .bind(id)
        .first<{ id: string; status: string }>();

      if (existingContract) {
        // Update contract number (and reactivate if needed)
        await db.prepare('UPDATE contracts SET contract_number = ?, status = \'active\', updated_at = datetime(\'now\') WHERE id = ?')
          .bind(data.contractNumber, existingContract.id).run();
      } else {
        // No contract exists — create one
        // Resolve insurer from group contract if not available
        if (!resolvedInsurerId) {
          // Try from any group contract linked to the company
          const targetCompanyId = data.companyId || existing.company_id;
          if (targetCompanyId) {
            const anyGc = await db
              .prepare("SELECT insurer_id FROM group_contracts WHERE company_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1")
              .bind(targetCompanyId)
              .first<{ insurer_id: string }>();
            resolvedInsurerId = anyGc?.insurer_id || null;
          }
        }
        // Try from any insurer in the system as last resort
        if (!resolvedInsurerId) {
          const anyInsurer = await db
            .prepare("SELECT id FROM insurers WHERE deleted_at IS NULL LIMIT 1")
            .first<{ id: string }>();
          resolvedInsurerId = anyInsurer?.id || null;
        }
        if (resolvedInsurerId) {
          const contractId = generateId();
          const now2 = new Date();
          const endDate = new Date(now2);
          endDate.setFullYear(endDate.getFullYear() + 1);
          let groupContractId: string | null = null;
          const gc = await db
            .prepare("SELECT id FROM group_contracts WHERE insurer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1")
            .bind(resolvedInsurerId)
            .first<{ id: string }>();
          groupContractId = gc?.id || null;
          await db.prepare(
            `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, group_contract_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'individual', ?, ?, 0, ?, '{}', 'active', ?, datetime('now'), datetime('now'))`
          ).bind(
            contractId, resolvedInsurerId, id, data.contractNumber,
            now2.toISOString().split('T')[0], endDate.toISOString().split('T')[0],
            data.plafondGlobal || null, groupContractId
          ).run();
        }
      }
    }

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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
  zValidator('json', adherentImportSchema, (result, c) => {
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
      console.error('[adherent-import] Zod validation failed:', JSON.stringify(errors));
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: errors } }, 400);
    }
  }),
  async (c) => {
    const validated = c.req.valid('json');
    const user = c.get('user');
    const encryptionKey = getEncryptionKey(c);

    // HR: force company_id to own company
    let companyId = validated.companyId;
    if (user.role === 'HR') {
      if (!user.companyId) {
        return c.json({ success: false, error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' } }, 403);
      }
      companyId = user.companyId;
    }

    const { adherents: rows, skipDuplicates } = validated;

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

        try {
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
        } catch {
          // Fallback: minimal INSERT for tenants missing some columns
          await getDb(c).prepare(
            `INSERT INTO adherents (
              id, national_id_encrypted, national_id_hash, first_name, last_name,
              date_of_birth, gender, phone_encrypted, email, address, city,
              company_id, matricule, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
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
              row.matricule || null
            )
            .run();
        }

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
adherents.delete('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // HR: verify company ownership before deletion
  if (user.role === 'HR') {
    if (!user.companyId) {
      return c.json({ success: false, error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' } }, 403);
    }
    const adherentCheck = await getDb(c).prepare('SELECT company_id FROM adherents WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ company_id: string | null }>();
    if (!adherentCheck || adherentCheck.company_id !== user.companyId) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cet adhérent n\'appartient pas à votre entreprise' } }, 403);
    }
  }

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
adherents.post('/bulk-delete', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
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

  // HR: verify all adherents belong to their company
  if (user.role === 'HR') {
    if (!user.companyId) {
      return c.json({ success: false, error: { code: 'NO_COMPANY', message: 'Votre compte n\'est associé à aucune entreprise' } }, 403);
    }
    const placeholdersCheck = ids.map(() => '?').join(',');
    const { results: checkResults } = await db
      .prepare(`SELECT id, company_id FROM adherents WHERE id IN (${placeholdersCheck}) AND deleted_at IS NULL`)
      .bind(...ids)
      .all<{ id: string; company_id: string | null }>();
    const unauthorized = (checkResults || []).filter((r) => r.company_id !== user.companyId);
    if (unauthorized.length > 0) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Certains adhérents n\'appartiennent pas à votre entreprise' } }, 403);
    }
  }

  try {
    let deletedCount = 0;
    for (const adhId of ids) {
      const ok = await softDeleteAdherent(db, adhId);
      if (ok) deletedCount++;
    }

    await logAudit(db, {
      userId: user?.sub,
      action: 'adherent.bulk_delete',
      entityType: 'adherent',
      entityId: ids.join(','),
      changes: { count: deletedCount },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return c.json({ success: true, data: { deleted: deletedCount } });
  } catch (error) {
    console.error('Error bulk deleting adherents:', error);
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la suppression' } }, 500);
  }
});

export { adherents };
