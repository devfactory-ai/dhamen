import { findActeRefByCode, listActesGroupesParFamille, listActesReferentiel } from '@dhamen/db';
/**
 * Bulletins Agent Routes
 * Routes for insurance agents to create, manage batches, and export bulletins
 */
import { actesArraySchema, createBatchSchema, validateBulletinSchema, importLotSchema, validerMatriculeFiscal } from '@dhamen/shared';
import type { ActeInput, ValidateBulletinResponse } from '@dhamen/shared';
import { logAudit } from '../middleware/audit-trail';
import { Hono } from 'hono';
import { generateId } from '../lib/ulid';
import { authMiddleware } from '../middleware/auth';
import { PushNotificationService } from '../services/push-notification.service';
import { RealtimeNotificationsService } from '../services/realtime-notifications.service';
import {
  calculateRemboursementBulletin,
  calculerRemboursement,
  mettreAJourPlafonds,
} from '../services/remboursement.service';
import type {
  CalculRemboursementInput,
  CalculRemboursementResult,
} from '../services/remboursement.service';
import type { Bindings, Variables } from '../types';

const bulletinsAgent = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
bulletinsAgent.use('*', authMiddleware());

// ---------------------------------------------------------------------------
// Mapping care_type → famille_acte_id for plafond initialization
// ---------------------------------------------------------------------------
const CARE_TYPE_TO_FAMILLE: Record<string, string> = {
  consultation_visite: 'fa-001',
  actes_courants: 'fa-002',
  pharmacie: 'fa-003',
  laboratoire: 'fa-004',
  orthopedie: 'fa-005',
  optique: 'fa-006',
  hospitalisation: 'fa-007',
  chirurgie: 'fa-010',
  dentaire: 'fa-011',
  accouchement: 'fa-012',
  cures_thermales: 'fa-013',
  orthodontie: 'fa-014',
  circoncision: 'fa-015',
  transport: 'fa-016',
  frais_funeraires: 'fa-019',
  chirurgie_refractive: 'fa-006', // linked to optique family
  sanatorium: 'fa-013',
  interruption_grossesse: 'fa-012',
};

/**
 * Initialize plafonds_beneficiaire for a newly created individual contract.
 * Creates per-famille plafonds from contract_guarantees + global plafond from group contract.
 */
async function initializePlafondsForAdherent(
  db: D1Database,
  adherentId: string,
  groupContractId: string,
  globalLimit: number | null
): Promise<number> {
  let created = 0;
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];

  // Get guarantees with annual_limit from the group contract
  const { results: guarantees } = await db
    .prepare(
      `SELECT care_type, annual_limit FROM contract_guarantees
       WHERE group_contract_id = ? AND is_active = 1 AND annual_limit IS NOT NULL`
    )
    .bind(groupContractId)
    .all<{ care_type: string; annual_limit: number }>();

  for (const year of years) {
    // Per-famille plafonds from guarantees
    for (const g of (guarantees ?? [])) {
      const familleId = CARE_TYPE_TO_FAMILLE[g.care_type];
      if (!familleId) continue;
      // annual_limit is in DT, plafonds store in millimes (×1000)
      const plafondMillimes = g.annual_limit * 1000;
      for (const maladie of ['ordinaire', 'chronique'] as const) {
        try {
          await db
            .prepare(
              `INSERT OR IGNORE INTO plafonds_beneficiaire
               (id, adherent_id, contract_id, annee, famille_acte_id, type_maladie, montant_plafond, montant_consomme, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
            )
            .bind(generateId(), adherentId, groupContractId, year, familleId, maladie, plafondMillimes)
            .run();
          created++;
        } catch { /* ignore duplicates */ }
      }
    }

    // Global plafond
    if (globalLimit) {
      const globalMillimes = globalLimit * 1000;
      try {
        await db
          .prepare(
            `INSERT OR IGNORE INTO plafonds_beneficiaire
             (id, adherent_id, contract_id, annee, famille_acte_id, type_maladie, montant_plafond, montant_consomme, created_at, updated_at)
             VALUES (?, ?, ?, ?, NULL, 'ordinaire', ?, 0, datetime('now'), datetime('now'))`
          )
          .bind(generateId(), adherentId, groupContractId, year, globalMillimes)
          .run();
        created++;
      } catch { /* ignore duplicates */ }
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Nature acte -> code referentiel mapping (REQ-010 / TASK-003)
// ---------------------------------------------------------------------------

const NATURE_ACTE_MAPPINGS: Array<{ keywords: string[]; code: string; label: string }> = [
  { keywords: ['generaliste', 'medecin general', 'medecin de famille'], code: 'C1', label: 'Consultation généraliste' },
  { keywords: ['specialiste', 'psychiatre', 'cardiologue', 'dermatologue', 'gynecologue', 'gyneco', 'orl', 'pneumologue', 'gastro', 'neurologue', 'urologue', 'endocrinologue', 'ophtalmologue', 'rhumatologue', 'nephrologue', 'oncologue', 'allergologue'], code: 'C2', label: 'Consultation spécialiste' },
  { keywords: ['professeur', 'prof '], code: 'C3', label: 'Consultation professeur' },
  { keywords: ['pharmacie', 'medicament', 'pharmaceut'], code: 'PH1', label: 'Frais pharmaceutiques' },
  { keywords: ['analyse', 'biolog', 'sang', 'labo', 'bilan'], code: 'AN', label: 'Analyses biologiques' },
  { keywords: ['radio', 'radiograph', 'radiologie'], code: 'R', label: 'Radiologie' },
  { keywords: ['echograph', 'echo'], code: 'E', label: 'Échographie' },
  { keywords: ['scanner', 'irm', 'imagerie'], code: 'TS', label: 'Traitements spéciaux (scanner/IRM)' },
  { keywords: ['dentaire', 'dent', 'dentist'], code: 'SD', label: 'Soins et prothèses dentaires' },
  { keywords: ['kine', 'physiother', 'reeducation'], code: 'PC', label: 'Pratiques courantes' },
  { keywords: ['clinique', 'hospitalisation'], code: 'CL', label: 'Hospitalisation clinique' },
  { keywords: ['hopital'], code: 'HP', label: 'Hospitalisation hôpital' },
  { keywords: ['chirurg', 'operation', 'bloc'], code: 'FCH', label: 'Frais chirurgicaux' },
  { keywords: ['optique', 'lunettes', 'verres'], code: 'OPT', label: 'Optique (monture + verres)' },
  { keywords: ['accouchement', 'maternite'], code: 'ACC', label: 'Accouchement' },
  { keywords: ['orthodont'], code: 'ODF', label: 'Soins orthodontiques' },
];

function mapNatureActeToCode(natureActe: string): { code: string; label: string } | null {
  const text = natureActe.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const mapping of NATURE_ACTE_MAPPINGS) {
    if (mapping.keywords.some((kw) => text.includes(kw))) {
      return { code: mapping.code, label: mapping.label };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// OCR proxy endpoint (REQ-010 / TASK-001)
// ---------------------------------------------------------------------------

/**
 * POST /bulletins-soins/agent/analyse-bulletin - Proxy OCR analysis to external service
 * Forwards uploaded scan files, cleans the response, and enriches actes with referentiel codes.
 */
bulletinsAgent.post('/analyse-bulletin', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } },
      403
    );
  }

  try {
    const body = await c.req.parseBody({ all: true });
    const files = body['files'];

    const proxyForm = new FormData();
    if (Array.isArray(files)) {
      for (const file of files) {
        if (file instanceof File) proxyForm.append('files', file);
      }
    } else if (files instanceof File) {
      proxyForm.append('files', files);
    }

    const ocrUrl = c.env.OCR_URL || "https://ocr-api-bh-assurance-dev.yassine-techini.workers.dev/analyse-bulletin";
    const ocrRes = await fetch(ocrUrl, {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: proxyForm,
    });

    if (!ocrRes.ok) {
      return c.json(
        {
          success: false,
          error: { code: 'OCR_ERROR', message: `OCR service returned ${ocrRes.status}` },
        },
        502
      );
    }

    const ocrData: Record<string, unknown> = await ocrRes.json();

    // Clean response: extract JSON from markdown block
    const raw =
      typeof ocrData.raw_response === 'string'
        ? ocrData.raw_response
        : JSON.stringify(ocrData);
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Enrich volet_medical with matched acte codes (TASK-003)
    const db = c.get('tenantDb') ?? c.env.DB;

    if (parsed && Array.isArray(parsed.volet_medical)) {
      for (const acte of parsed.volet_medical) {
        const match = mapNatureActeToCode(acte.nature_acte || '');
        acte.matched_code = match?.code || null;
        acte.matched_label = match?.label || acte.nature_acte || null;

        // Medication matching for pharmacy actes (Bloc 4 - OCR enrichissement)
        // Detect pharmacy from type_soin (OCR), matched code, or nature_acte keywords
        const typeSoinLower = (acte.type_soin || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isPharmacy = typeSoinLower.includes('pharmac') || typeSoinLower.includes('medicament') ||
          match?.code === 'PH1' ||
          (acte.nature_acte || '').toLowerCase().match(/pharmac|medicament|ordonnance/);

        if (isPharmacy) {
          // For pharmacy actes, try multiple search strategies:
          // 1. Search by designation/nature_acte as medication name
          // 2. Search by nom_praticien if it contains "PHARMACIE" (the pharmacy name, not a med)
          const searchText = (acte.designation || acte.nature_acte || '').trim();

          // Split compound entries like "270B + 1.5 AP3" into individual terms
          // Also try the full text as a single search
          const searchTerms: string[] = [];
          if (searchText.length >= 3) {
            searchTerms.push(searchText);
            // Split by common separators: +, /, comma, semicolon
            const parts = searchText.split(/[+/;,]\s*/).map((p: string) => p.trim()).filter((p: string) => p.length >= 3);
            if (parts.length > 1) {
              searchTerms.push(...parts);
            }
          }

          for (const term of searchTerms) {
            if (acte.matched_medication) break; // Already found a match
            const searchPattern = `%${term}%`;
            const medResult = await db
              .prepare(
                `SELECT id, code_pct, code_amm, brand_name, dci, dosage, form,
                        price_public, reimbursement_rate, family_id, is_generic
                 FROM medications
                 WHERE deleted_at IS NULL AND is_active = 1
                   AND (brand_name LIKE ? OR dci LIKE ? OR code_pct LIKE ? OR code_amm LIKE ?)
                 ORDER BY
                   CASE WHEN brand_name LIKE ? THEN 0 WHEN dci LIKE ? THEN 1 ELSE 2 END,
                   brand_name ASC
                 LIMIT 3`
              )
              .bind(searchPattern, searchPattern, searchPattern, searchPattern, `${term}%`, `${term}%`)
              .all();

            if (medResult.results.length > 0) {
              const bestMatch = medResult.results[0]!;
              acte.matched_medication = {
                id: bestMatch.id,
                code_pct: bestMatch.code_pct,
                code_amm: bestMatch.code_amm,
                brand_name: bestMatch.brand_name,
                dci: bestMatch.dci,
                dosage: bestMatch.dosage,
                form: bestMatch.form,
                price_public: bestMatch.price_public,
                reimbursement_rate: bestMatch.reimbursement_rate,
                family_id: bestMatch.family_id,
                is_generic: bestMatch.is_generic,
              };
              if (medResult.results.length > 1) {
                acte.medication_alternatives = medResult.results.slice(1).map((m) => ({
                  id: m.id,
                  code_pct: m.code_pct,
                  brand_name: m.brand_name,
                  dci: m.dci,
                  price_public: m.price_public,
                }));
              }
            }
          }
        }

        // MF extraction + validation (Bloc 4) — using Tunisian MF rules
        const rawMf = (acte.matricule_fiscale || acte.ref_prof_sant || '').trim().toUpperCase();
        if (rawMf) {
          const { validerMatriculeFiscal: validateMf } = await import('@dhamen/shared');
          const mfResult = validateMf(rawMf);
          acte.mf_extracted = mfResult.normalized || rawMf;
          acte.mf_valid = mfResult.valid;
          acte.mf_errors = mfResult.errors;

          // Lookup provider by MF if valid
          if (mfResult.valid && mfResult.normalized) {
            const provider = await db
              .prepare(
                `SELECT id, name, type, speciality FROM providers
                 WHERE mf_number = ? AND deleted_at IS NULL AND is_active = 1
                 LIMIT 1`
              )
              .bind(mfResult.normalized)
              .first();

            if (provider) {
              acte.mf_provider = {
                id: provider.id,
                name: provider.name,
                type: provider.type,
                speciality: provider.speciality,
              };
            }
          }
        }
      }
    }

    return c.json({ success: true, data: parsed });
  } catch (error) {
    console.error('OCR proxy error:', error);
    return c.json(
      {
        success: false,
        error: { code: 'OCR_ERROR', message: "Erreur lors de l'analyse OCR" },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent/actes-referentiel - List available medical acts
 */
bulletinsAgent.get('/actes-referentiel', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const actes = await listActesReferentiel(db);
    return c.json({ success: true, data: actes });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur chargement referentiel' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent/actes-referentiel/groupes - List acts grouped by family
 */
bulletinsAgent.get('/actes-referentiel/groupes', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const groupes = await listActesGroupesParFamille(db);
    return c.json({ success: true, data: groupes });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur chargement referentiel groupe' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent - List agent's bulletins
 */
bulletinsAgent.get('/', async (c) => {
  const user = c.get('user');

  // Only for agents
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const status = c.req.query('status') || 'draft,in_batch';
  const search = c.req.query('search');
  const batchId = c.req.query('batchId');
  const companyId = c.req.query('companyId');

  const statusList = status.split(',');
  const statusPlaceholders = statusList.map(() => '?').join(',');

  let query = `
    SELECT
      bs.*,
      b.name as batch_name
    FROM bulletins_soins bs
    LEFT JOIN bulletin_batches b ON bs.batch_id = b.id
    WHERE bs.status IN (${statusPlaceholders})
  `;
  const params: (string | number)[] = [...statusList];

  // Filter by company or batch — agents see company bulletins, not just their own
  if (companyId) {
    query += ' AND bs.company_id = ?';
    params.push(companyId);
  } else if (batchId) {
    // No company selected — filter by batch only
    query += ' AND bs.batch_id = ?';
    params.push(batchId);
  } else if (user.role !== 'ADMIN') {
    // No company or batch — agents only see their own bulletins
    query += ' AND bs.created_by = ?';
    params.push(user.id);
  }

  if (search) {
    query += ` AND (
      bs.adherent_first_name LIKE ? OR
      bs.adherent_last_name LIKE ? OR
      bs.adherent_matricule LIKE ? OR
      bs.bulletin_number LIKE ?
    )`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  query += ' ORDER BY bs.created_at DESC';

  try {
    const results = await db
      .prepare(query)
      .bind(...params)
      .all();

    return c.json({
      success: true,
      data: results.results || [],
    });
  } catch (error) {
    console.error('Error fetching agent bulletins:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/batches - List batches filtered by company and status
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const companyId = c.req.query('companyId');
  const status = c.req.query('status') || 'all';
  const search = c.req.query('search') || '';
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  if (!companyId) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'companyId requis' },
      },
      400
    );
  }

  const isIndividualMode = companyId === '__INDIVIDUAL__';
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify company belongs to agent's insurer (skip for individual mode)
    if (!isIndividualMode && user.insurerId) {
      const company = await db
        .prepare('SELECT id FROM companies WHERE id = ? AND insurer_id = ?')
        .bind(companyId, user.insurerId)
        .first();

      if (!company) {
        return c.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Entreprise non autorisee' },
          },
          403
        );
      }
    }

    // Build WHERE clause
    const conditions = [isIndividualMode ? 'bb.company_id IS NULL' : 'bb.company_id = ?'];
    const bindings: (string | number)[] = isIndividualMode ? [] : [companyId];

    if (status && status !== 'all') {
      conditions.push('bb.status = ?');
      bindings.push(status);
    }

    if (search) {
      conditions.push('bb.name LIKE ?');
      bindings.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await db
      .prepare(`
        SELECT COUNT(*) as total
        FROM bulletin_batches bb
        WHERE ${whereClause}
      `)
      .bind(...bindings)
      .first<{ total: number }>();

    const total = countResult?.total || 0;

    // Fetch paginated results
    const results = await db
      .prepare(`
      SELECT bb.*,
             COALESCE(agg.bulletins_count, 0) AS bulletins_count,
             COALESCE(agg.total_amount, 0) AS total_amount
      FROM bulletin_batches bb
      LEFT JOIN (
        SELECT batch_id,
               COUNT(*) AS bulletins_count,
               SUM(COALESCE(total_amount, 0)) AS total_amount
        FROM bulletins_soins
        GROUP BY batch_id
      ) agg ON agg.batch_id = bb.id
      WHERE ${whereClause}
      ORDER BY bb.created_at DESC
      LIMIT ? OFFSET ?
    `)
      .bind(...bindings, limit, offset)
      .all();

    return c.json({
      success: true,
      data: results.results || [],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/batches/:id/export - Export batch as CTRL recap CSV (9 columns)
 * Format: UTF-8 BOM, comma separator, one row per adherent (grouped + summed)
 * Columns: Numero_De_Contrat, Souscripteur, Numero_De_Bordereau, Matricule_Isante,
 *          Matricule_Assureur, Nom, Prenom, Rib, Remb
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches/:id/export', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const batchId = c.req.param('id');
  const force = c.req.query('force') === 'true';
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify batch ownership — ADMIN can access any, INSURER roles can access their insurer's batches
    let batch: Record<string, unknown> | null = null;

    if (user.role === 'ADMIN') {
      batch = await db
        .prepare('SELECT * FROM bulletin_batches WHERE id = ?')
        .bind(batchId)
        .first();
    } else if (user.insurerId) {
      batch = await db
        .prepare(`
        SELECT bb.* FROM bulletin_batches bb
        JOIN companies co ON bb.company_id = co.id
        WHERE bb.id = ? AND co.insurer_id = ?
      `)
        .bind(batchId, user.insurerId)
        .first();
    } else {
      batch = await db
        .prepare('SELECT * FROM bulletin_batches WHERE id = ? AND created_by = ?')
        .bind(batchId, user.id)
        .first();
    }

    if (!batch) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lot non trouve' },
        },
        404
      );
    }

    // Prevent re-export unless force=true
    if (batch.status === 'exported' && !force) {
      return c.json(
        {
          success: false,
          error: {
            code: 'BATCH_ALREADY_EXPORTED',
            message: 'Ce lot a déjà été exporté. Utilisez ?force=true pour re-exporter.',
          },
        },
        409
      );
    }

    // CTRL 9-column recap: group by adherent, sum reimbursed amounts
    const recapRows = await db
      .prepare(`
      SELECT
        COALESCE(ct.contract_number, '') AS numero_contrat,
        COALESCE(co.name, '') AS souscripteur,
        bb.name AS numero_bordereau,
        COALESCE(a.matricule, bs.adherent_matricule, '') AS matricule_isante,
        COALESCE(a.matricule, bs.adherent_matricule, '') AS matricule_assureur,
        COALESCE(a.last_name, bs.adherent_last_name, '') AS nom,
        COALESCE(a.first_name, bs.adherent_first_name, '') AS prenom,
        COALESCE(a.rib_encrypted, '') AS rib,
        SUM(COALESCE(bs.reimbursed_amount, 0)) AS remb
      FROM bulletins_soins bs
      JOIN bulletin_batches bb ON bs.batch_id = bb.id
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      LEFT JOIN contracts ct ON ct.adherent_id = a.id AND ct.status = 'active'
      WHERE bs.batch_id = ? AND bs.status IN ('approved', 'reimbursed')
      GROUP BY COALESCE(a.id, bs.adherent_matricule)
      ORDER BY nom, prenom
      LIMIT 5000
    `)
      .bind(batchId)
      .all();

    // Build CSV — 9 columns CTRL format
    const BOM = '\uFEFF';
    const header =
      'Numero_De_Contrat,Souscripteur,Numero_De_Bordereau,Matricule_Isante,Matricule_Assureur,Nom,Prenom,Rib,Remb';
    const rows = (recapRows.results || []).map((r: Record<string, unknown>) => {
      const escape = (v: unknown) => {
        const s = v != null ? String(v) : '';
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        escape(r.numero_contrat),
        escape(r.souscripteur),
        escape(r.numero_bordereau),
        escape(r.matricule_isante),
        escape(r.matricule_assureur),
        escape(r.nom),
        escape(r.prenom),
        escape(r.rib),
        r.remb != null ? Number(r.remb) : 0,
      ].join(',');
    });

    const csvContent = BOM + header + '\n' + rows.join('\n');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `dhamen_ctrl_${batchId}_${today}.csv`;

    // Mark batch as exported
    await db
      .prepare(`
      UPDATE bulletin_batches SET status = 'exported', exported_at = datetime('now') WHERE id = ?
    `)
      .bind(batchId)
      .run();

    // Mark validated bulletins as exported
    await db
      .prepare(`
      UPDATE bulletins_soins SET status = 'exported' WHERE batch_id = ? AND status IN ('approved', 'reimbursed')
    `)
      .bind(batchId)
      .run();

    // Audit trail
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'batch_csv_export', 'bulletin_batches', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        batchId,
        JSON.stringify({
          format: 'ctrl_recap',
          rows_count: (recapRows.results || []).length,
          force,
        }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting batch:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: `Erreur lors de l'export: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/batches/:id/export-detail - Export detailed bordereau CSV
 * Format: UTF-8 BOM, comma separator, one row per acte line
 * Columns: Num_Cont, Mat, Rang_Pres, Nom_Pren_Prest, Dat_Bs, Cod_Act,
 *          Frais_Engag, Mnt_Act_Remb, Cod_Msgr, Lib_Msgr, Ref_Prof_Sant, Nom_Prof_Sant
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches/:id/export-detail', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const batchId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify batch ownership — ADMIN can access any, INSURER roles can access their insurer's batches
    let batch: Record<string, unknown> | null = null;

    if (user.role === 'ADMIN') {
      batch = await db
        .prepare('SELECT * FROM bulletin_batches WHERE id = ?')
        .bind(batchId)
        .first();
    } else if (user.insurerId) {
      batch = await db
        .prepare(`
        SELECT bb.* FROM bulletin_batches bb
        JOIN companies co ON bb.company_id = co.id
        WHERE bb.id = ? AND co.insurer_id = ?
      `)
        .bind(batchId, user.insurerId)
        .first();
    } else {
      batch = await db
        .prepare('SELECT * FROM bulletin_batches WHERE id = ? AND created_by = ?')
        .bind(batchId, user.id)
        .first();
    }

    if (!batch) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lot non trouve' },
        },
        404
      );
    }

    // Detailed bordereau: one row per acte line
    const detailRows = await db
      .prepare(`
      SELECT
        COALESCE(ct.contract_number, '') AS num_cont,
        COALESCE(a.matricule, bs.adherent_matricule, '') AS mat,
        COALESCE(a.rang_pres, bs.rang_pres, 0) AS rang_pres,
        COALESCE(a.last_name || ' ' || a.first_name, bs.adherent_last_name || ' ' || bs.adherent_first_name, '') AS nom_pren_prest,
        bs.bulletin_date AS dat_bs,
        COALESCE(ab.code, '') AS cod_act,
        COALESCE(ab.amount, 0) AS frais_engag,
        COALESCE(ab.montant_rembourse, 0) AS mnt_act_remb,
        COALESCE(ab.cod_msgr, '') AS cod_msgr,
        COALESCE(ab.lib_msgr, '') AS lib_msgr,
        COALESCE(ab.ref_prof_sant, '') AS ref_prof_sant,
        COALESCE(ab.nom_prof_sant, bs.provider_name, '') AS nom_prof_sant
      FROM bulletins_soins bs
      JOIN actes_bulletin ab ON ab.bulletin_id = bs.id
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN contracts ct ON ct.adherent_id = a.id AND ct.status = 'active'
      WHERE bs.batch_id = ? AND bs.status IN ('approved', 'reimbursed', 'exported')
      ORDER BY mat, dat_bs, ab.created_at
      LIMIT 10000
    `)
      .bind(batchId)
      .all();

    // Build CSV — 12 columns detailed format
    const BOM = '\uFEFF';
    const header =
      'Num_Cont,Mat,Rang_Pres,Nom_Pren_Prest,Dat_Bs,Cod_Act,Frais_Engag,Mnt_Act_Remb,Cod_Msgr,Lib_Msgr,Ref_Prof_Sant,Nom_Prof_Sant';
    const rows = (detailRows.results || []).map((r: Record<string, unknown>) => {
      const escape = (v: unknown) => {
        const s = v != null ? String(v) : '';
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        escape(r.num_cont),
        escape(r.mat),
        r.rang_pres != null ? Number(r.rang_pres) : 0,
        escape(r.nom_pren_prest),
        escape(r.dat_bs),
        escape(r.cod_act),
        r.frais_engag != null ? Number(r.frais_engag) : 0,
        r.mnt_act_remb != null ? Number(r.mnt_act_remb) : 0,
        escape(r.cod_msgr),
        escape(r.lib_msgr),
        escape(r.ref_prof_sant),
        escape(r.nom_prof_sant),
      ].join(',');
    });

    const csvContent = BOM + header + '\n' + rows.join('\n');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `dhamen_detail_${batchId}_${today}.csv`;

    // Audit trail
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'batch_detail_csv_export', 'bulletin_batches', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        batchId,
        JSON.stringify({
          format: 'bordereau_detail',
          rows_count: (detailRows.results || []).length,
        }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting batch detail:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: `Erreur lors de l'export detaille: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent/:id - Get bulletin details with actes
 */
bulletinsAgent.get('/:id', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const bulletin = await db
      .prepare(
        'SELECT bs.*, b.name as batch_name FROM bulletins_soins bs LEFT JOIN bulletin_batches b ON bs.batch_id = b.id WHERE bs.id = ? AND bs.created_by = ?'
      )
      .bind(bulletinId, user.id)
      .first();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    const actes = await db
      .prepare(
        `SELECT ab.*,
                m.brand_name as medication_name, m.dci as medication_dci, m.code_pct as medication_code_pct,
                mf.name as medication_family_name,
                ar.code as acte_ref_code, ar.label as acte_ref_label,
                p.name as provider_name_resolved, p.mf_number as provider_mf
         FROM actes_bulletin ab
         LEFT JOIN medications m ON ab.medication_id = m.id
         LEFT JOIN medication_families mf ON ab.medication_family_id = mf.id
         LEFT JOIN actes_referentiel ar ON ab.acte_ref_id = ar.id
         LEFT JOIN providers p ON ab.provider_id = p.id
         WHERE ab.bulletin_id = ?
         ORDER BY ab.created_at`
      )
      .bind(bulletinId)
      .all();

    // Fetch adherent plafond if linked
    let plafondGlobal: number | null = null;
    let plafondConsomme: number | null = null;
    if (bulletin.adherent_id) {
      const adh = await db
        .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
        .bind(bulletin.adherent_id)
        .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
      if (adh) {
        plafondGlobal = adh.plafond_global;
        plafondConsomme = adh.plafond_consomme;
      }
    }

    // plafond_consomme_avant = current consumption minus this bulletin's reimbursement
    const reimbursedAmount = (bulletin.reimbursed_amount as number) || 0;
    const plafondConsommeAvant =
      plafondConsomme != null ? plafondConsomme - reimbursedAmount : null;

    return c.json({
      success: true,
      data: {
        ...bulletin,
        actes: actes.results || [],
        plafond_global: plafondGlobal,
        plafond_consomme: plafondConsomme,
        plafond_consomme_avant: plafondConsommeAvant,
      },
    });
  } catch (error) {
    console.error('Error fetching bulletin:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
      },
      500
    );
  }
});

/**
 * DELETE /bulletins-soins/agent/:id - Delete a draft bulletin
 */
bulletinsAgent.delete('/:id', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // All insurer roles and admins can delete any bulletin in their tenant
    const bulletin = await db
      .prepare('SELECT id, status FROM bulletins_soins WHERE id = ?')
      .bind(bulletinId)
      .first();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    if (bulletin.status === 'exported') {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Impossible de supprimer un bulletin exporte',
          },
        },
        400
      );
    }

    // Delete actes first, then bulletin
    await db.batch([
      db.prepare('DELETE FROM actes_bulletin WHERE bulletin_id = ?').bind(bulletinId),
      db.prepare('DELETE FROM bulletins_soins WHERE id = ?').bind(bulletinId),
    ]);

    return c.json({ success: true, data: { id: bulletinId } });
  } catch (error) {
    console.error('Error deleting bulletin:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la suppression' },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/bulk-delete - Delete multiple bulletins
 */
bulletinsAgent.post('/bulk-delete', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' } }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const body = await c.req.json<{ ids: string[] }>();
  const ids = body.ids;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Liste d\'IDs requise' } }, 400);
  }

  if (ids.length > 100) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 100 bulletins à la fois' } }, 400);
  }

  try {
    // Check for exported bulletins
    const placeholders = ids.map(() => '?').join(',');
    const exported = await db
      .prepare(`SELECT id FROM bulletins_soins WHERE id IN (${placeholders}) AND status = 'exported'`)
      .bind(...ids)
      .all();

    if (exported.results.length > 0) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: `${exported.results.length} bulletin(s) exporté(s) ne peuvent pas être supprimés` } }, 400);
    }

    // Delete actes then bulletins
    const batchResults = await db.batch([
      db.prepare(`DELETE FROM actes_bulletin WHERE bulletin_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM bulletins_soins WHERE id IN (${placeholders}) AND status != 'exported'`).bind(...ids),
    ]);

    const deletedCount = batchResults[1]?.meta?.changes ?? ids.length;

    await logAudit(db, {
      userId: user.id,
      action: 'bulletin.bulk_delete',
      entityType: 'bulletin',
      entityId: ids.join(','),
      changes: { count: deletedCount },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return c.json({ success: true, data: { deleted: deletedCount } });
  } catch (error) {
    console.error('Error bulk deleting bulletins:', error);
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la suppression' } }, 500);
  }
});

/**
 * POST /bulletins-soins/agent/bulk-delete-batches - Delete multiple batches
 */
bulletinsAgent.post('/bulk-delete-batches', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' } }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const body = await c.req.json<{ ids: string[] }>();
  const ids = body.ids;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Liste d\'IDs requise' } }, 400);
  }

  try {
    const placeholders = ids.map(() => '?').join(',');
    // Delete bulletins in these batches first, then the batches
    await db.batch([
      db.prepare(`DELETE FROM actes_bulletin WHERE bulletin_id IN (SELECT id FROM bulletins_soins WHERE batch_id IN (${placeholders}) AND status != 'exported')`).bind(...ids),
      db.prepare(`DELETE FROM bulletins_soins WHERE batch_id IN (${placeholders}) AND status != 'exported'`).bind(...ids),
      db.prepare(`DELETE FROM bulletin_batches WHERE id IN (${placeholders})`).bind(...ids),
    ]);

    await logAudit(db, {
      userId: user.id,
      action: 'batch.bulk_delete',
      entityType: 'batch',
      entityId: ids.join(','),
      changes: { count: ids.length },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return c.json({ success: true, data: { deleted: ids.length } });
  } catch (error) {
    console.error('Error bulk deleting batches:', error);
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la suppression' } }, 500);
  }
});

/**
 * POST /bulletins-soins/agent/estimate - Estimate reimbursement without creating a bulletin
 */
bulletinsAgent.post('/estimate', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const body = await c.req.json<{
    adherent_matricule: string;
    bulletin_date: string;
    actes: Array<{ code?: string; amount: number; care_type?: string }>;
  }>();

  const { adherent_matricule, bulletin_date, actes } = body;
  if (!adherent_matricule || !actes || actes.length === 0) {
    return c.json({ success: true, data: { reimbursed_amount: null, details: [] } });
  }

  try {
    // Find adherent — same logic as /create: normalize whitespace, filter by insurer only when applicable
    const cleanMatricule = adherent_matricule.replace(/\s+/g, '');
    const insurerFilter = user.insurerId
      ? `AND (co.insurer_id = ? OR a.company_id IS NULL OR a.company_id = '__INDIVIDUAL__')`
      : '';
    const joinClause = user.insurerId
      ? 'LEFT JOIN companies co ON a.company_id = co.id'
      : '';
    const bindParams = user.insurerId
      ? [cleanMatricule, user.insurerId]
      : [cleanMatricule];
    const adherent = await db
      .prepare(
        `SELECT a.id FROM adherents a ${joinClause} WHERE REPLACE(a.matricule, ' ', '') = ? AND a.deleted_at IS NULL ${insurerFilter}`
      )
      .bind(...bindParams)
      .first<{ id: string }>();

    if (!adherent) {
      return c.json({ success: true, data: { reimbursed_amount: null, details: [], warning: 'Adherent non trouvé' } });
    }

    // Find best contract (prioritize group_contract_id)
    const contract = await db
      .prepare(
        `SELECT c.id FROM contracts c
         WHERE c.adherent_id = ? AND c.status = 'active'
           AND c.start_date <= ? AND c.end_date >= ?
         ORDER BY CASE WHEN c.group_contract_id IS NOT NULL THEN 0 ELSE 1 END, c.created_at DESC
         LIMIT 1`
      )
      .bind(adherent.id, bulletin_date, bulletin_date)
      .first<{ id: string }>();

    if (!contract) {
      // Fetch all contracts for this adherent so the frontend can show a selector
      const { results: allContracts } = await db
        .prepare(
          `SELECT c.id, c.contract_number, c.plan_type, c.status, c.start_date, c.end_date
           FROM contracts c WHERE c.adherent_id = ?
           ORDER BY c.end_date DESC`
        )
        .bind(adherent.id)
        .all<{ id: string; contract_number: string; plan_type: string; status: string; start_date: string; end_date: string }>();

      // Fallback: legacy calculation with referentiel rates
      const details = [];
      let total = 0;
      for (const acte of actes) {
        const code = acte.code?.trim();
        if (!code) { details.push({ code: null, amount: acte.amount, reimbursed: 0 }); continue; }
        const ref = await findActeRefByCode(db, code);
        const taux = (ref as { taux_remboursement?: number } | null)?.taux_remboursement || 0;
        const reimbursed = Math.round(acte.amount * taux);
        total += reimbursed;
        details.push({ code, amount: acte.amount, taux, reimbursed });
      }

      const hasContracts = allContracts && allContracts.length > 0;
      const warning = hasContracts
        ? `Aucun contrat actif à la date du ${bulletin_date} — ${allContracts.length} contrat(s) existant(s)`
        : 'Cet adhérent n\'a aucun contrat enregistré';

      return c.json({
        success: true,
        data: {
          reimbursed_amount: total,
          details,
          warning,
          no_active_contract: true,
          contracts: allContracts || [],
        },
      });
    }

    // Contract-aware calculation
    const details = [];
    let total = 0;
    for (const acte of actes) {
      const code = acte.code?.trim();
      if (!code) { details.push({ code: null, amount: acte.amount, reimbursed: 0 }); continue; }
      const ref = await findActeRefByCode(db, code);
      if (!ref) { details.push({ code, amount: acte.amount, reimbursed: 0 }); continue; }
      try {
        const calcInput: CalculRemboursementInput = {
          adherentId: adherent.id,
          contractId: contract.id,
          acteRefId: (ref as { id: string }).id,
          fraisEngages: acte.amount,
          dateSoin: bulletin_date,
          typeMaladie: 'ordinaire',
        };
        const result = await calculerRemboursement(db, calcInput);
        total += result.montantRembourse;
        details.push({ code, amount: acte.amount, reimbursed: result.montantRembourse, type: result.typeCalcul, valeur: result.valeurBareme });
      } catch {
        // Fallback to referentiel rate
        const taux = (ref as { taux_remboursement?: number }).taux_remboursement || 0;
        const reimbursed = Math.round(acte.amount * taux);
        total += reimbursed;
        details.push({ code, amount: acte.amount, taux, reimbursed });
      }
    }

    return c.json({ success: true, data: { reimbursed_amount: total, details } });
  } catch (error) {
    console.error('Error estimating reimbursement:', error);
    return c.json({ success: true, data: { reimbursed_amount: null, details: [] } });
  }
});

/**
 * POST /bulletins-soins/agent/create - Create a new bulletin (agent saisie)
 */
bulletinsAgent.post('/create', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const formData = await c.req.parseBody();

  // Extract form fields
  const bulletinDate = formData['bulletin_date'] as string;
  const adherentMatricule = formData['adherent_matricule'] as string;
  const adherentFirstName = formData['adherent_first_name'] as string;
  const adherentLastName = formData['adherent_last_name'] as string;
  const adherentNationalId = (formData['adherent_national_id'] as string) || null;
  const adherentEmail = (formData['adherent_email'] as string) || null;
  const beneficiaryName = (formData['beneficiary_name'] as string) || null;
  const beneficiaryId = (formData['beneficiary_id'] as string) || null;
  const beneficiaryRelationship = (formData['beneficiary_relationship'] as string) || null;
  const providerName = (formData['provider_name'] as string) || null;
  const providerSpecialty = (formData['provider_specialty'] as string) || null;
  // care_type is now per-acte; top-level is optional fallback
  const careTypeFallback = (formData['care_type'] as string) || null;
  const careDescription = (formData['care_description'] as string) || null;
  const adherentAddress = (formData['adherent_address'] as string) || null;
  const batchId = (formData['batch_id'] as string) || null;
  const companyId = (formData['company_id'] as string) || null;
  const userBulletinNumber = (formData['bulletin_number'] as string) || null;

  // Parse actes array (JSON string from form)
  const actesRaw = formData['actes'] as string;
  let actes: { code?: string; label: string; amount: number; ref_prof_sant?: string; nom_prof_sant?: string; provider_id?: string; care_type?: string; cod_msgr?: string; lib_msgr?: string; care_description?: string; medication_id?: string; medication_family_id?: string; acte_ref_id?: string }[] = [];

  if (actesRaw) {
    try {
      const parsed = JSON.parse(actesRaw);
      const result = actesArraySchema.safeParse(parsed);
      if (!result.success) {
        return c.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: result.error.errors.map((e) => e.message).join(', '),
            },
          },
          400
        );
      }
      actes = result.data;
    } catch {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Format des actes invalide' },
        },
        400
      );
    }
  }

  // Calculate total from actes if provided, otherwise use legacy total_amount field
  const totalAmount =
    actes.length > 0
      ? actes.reduce((sum, a) => sum + a.amount, 0)
      : Number.parseFloat(formData['total_amount'] as string);

  // Derive care_type from first acte or fallback to top-level field
  const careType = actes[0]?.care_type || careTypeFallback || 'consultation';

  // Validate required fields
  // Note: nom/prénom are optional — only matricule is required to identify adherent
  if (
    !bulletinDate ||
    !adherentMatricule ||
    isNaN(totalAmount)
  ) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Champs requis manquants' },
      },
      400
    );
  }

  // company_id is required for agent/insurer users
  if (!companyId && ['INSURER_AGENT', 'INSURER_ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'MISSING_COMPANY', message: 'Entreprise (company_id) requise pour créer un bulletin' },
      },
      400
    );
  }

  // Validate bulletin date — not future, not older than 12 months
  const bulletinDateObj = new Date(bulletinDate);
  const now = new Date();
  if (bulletinDateObj > now) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'La date du bulletin ne peut pas être dans le futur' },
      },
      400
    );
  }

  // Validate MF (matricule fiscale) on each acte — required for all care types
  if (actes.length > 0) {
    const actesWithoutMf = actes
      .map((a, i) => ({ index: i, ref: a.ref_prof_sant }))
      .filter((a) => !a.ref || a.ref.trim().length < 7);
    if (actesWithoutMf.length > 0) {
      return c.json(
        {
          success: false,
          error: {
            code: 'MF_REQUIRED',
            message: `Matricule fiscale obligatoire pour chaque acte. Acte(s) sans MF : ${actesWithoutMf.map((a) => a.index + 1).join(', ')}`,
          },
        },
        400
      );
    }
  }

  // Generate bulletin number (use user-provided if available)
  const bulletinId = generateId();
  const bulletinNumber = userBulletinNumber || `BS-${new Date().getFullYear()}-${bulletinId.slice(-8).toUpperCase()}`;

  // Check bulletin number uniqueness within company
  if (companyId && userBulletinNumber) {
    const duplicateBulletin = await db
      .prepare(
        `SELECT id FROM bulletins_soins WHERE bulletin_number = ? AND company_id = ?`
      )
      .bind(bulletinNumber, companyId)
      .first();

    if (duplicateBulletin) {
      return c.json(
        {
          success: false,
          error: {
            code: 'DUPLICATE_BULLETIN_NUMBER',
            message: `Le numéro de bulletin "${bulletinNumber}" existe déjà pour cette société`,
          },
        },
        409
      );
    }
  }

  // Handle file upload (scan)
  let scanUrl: string | null = null;
  const storage = c.env.STORAGE;

  // Find scan files in formData
  for (const key of Object.keys(formData)) {
    if (key.startsWith('scan_') && formData[key] instanceof File) {
      const file = formData[key] as File;
      if (file.size > 0) {
        const fileName = `bulletins/${bulletinId}/${key}_${file.name}`;
        const arrayBuffer = await file.arrayBuffer();
        await storage.put(fileName, arrayBuffer, {
          httpMetadata: { contentType: file.type },
        });
        scanUrl = `https://dhamen-files.${c.env.ENVIRONMENT === 'production' ? '' : 'dev.'}r2.cloudflarestorage.com/${fileName}`;
        break; // Just use the first scan for now
      }
    }
  }

  try {
    // Validate batch if provided
    if (batchId) {
      // ADMIN can access any batch
      // INSURER_ADMIN / INSURER_AGENT can use any batch from their insurer's companies
      let batchQuery: string;
      const batchParams: string[] = [batchId];

      if (user.role === 'ADMIN') {
        batchQuery =
          'SELECT id, status, created_by FROM bulletin_batches WHERE id = ?';
      } else if (user.insurerId) {
        batchQuery =
          'SELECT bb.id, bb.status, bb.created_by FROM bulletin_batches bb LEFT JOIN companies co ON bb.company_id = co.id WHERE bb.id = ? AND (co.insurer_id = ? OR bb.company_id IS NULL)';
        batchParams.push(user.insurerId);
      } else {
        batchQuery =
          'SELECT id, status, created_by FROM bulletin_batches WHERE id = ? AND created_by = ?';
        batchParams.push(user.id);
      }

      const batch = await db
        .prepare(batchQuery)
        .bind(...batchParams)
        .first();

      if (!batch) {
        return c.json(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Lot non trouve ou non autorise' },
          },
          404
        );
      }

      if (batch.status !== 'open') {
        return c.json(
          {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: "Le lot n'est plus ouvert" },
          },
          400
        );
      }
    }

    // Find adherent by matricule and verify identity coherence
    // Always filter by insurer to prevent cross-insurer data leaks
    let adherentId: string | null = null;
    let adherentResult: Record<string, unknown> | null = null;

    const adherentSelectCols = 'a.id, a.first_name, a.last_name, a.national_id_hash';

    // Clean matricule for matching (strip whitespace)
    const cleanMatricule = adherentMatricule.replace(/\s+/g, '');

    const insurerFilter = user.insurerId
      ? `AND (co.insurer_id = ? OR a.company_id IS NULL OR a.company_id = '__INDIVIDUAL__')`
      : '';
    const joinClause = user.insurerId
      ? 'LEFT JOIN companies co ON a.company_id = co.id'
      : '';

    // Step 1: Exact matricule match
    adherentResult = await db
      .prepare(
        `SELECT ${adherentSelectCols} FROM adherents a ${joinClause} WHERE REPLACE(a.matricule, ' ', '') = ? AND a.deleted_at IS NULL ${insurerFilter}`
      )
      .bind(...(user.insurerId ? [cleanMatricule, user.insurerId] : [cleanMatricule]))
      .first();

    // Step 2: National ID fallback
    if (!adherentResult && adherentNationalId) {
      adherentResult = await db
        .prepare(
          `SELECT ${adherentSelectCols} FROM adherents a ${joinClause} WHERE (a.national_id_encrypted LIKE ? OR a.national_id_hash = ?) AND a.deleted_at IS NULL ${insurerFilter}`
        )
        .bind(...(user.insurerId ? [`%${adherentNationalId}%`, adherentNationalId, user.insurerId] : [`%${adherentNationalId}%`, adherentNationalId]))
        .first();
    }

    // Step 3: Name fallback (case-insensitive)
    if (!adherentResult && adherentFirstName && adherentLastName) {
      adherentResult = await db
        .prepare(
          `SELECT ${adherentSelectCols} FROM adherents a ${joinClause} WHERE LOWER(a.first_name) = LOWER(?) AND LOWER(a.last_name) = LOWER(?) AND a.deleted_at IS NULL ${insurerFilter}`
        )
        .bind(...(user.insurerId ? [adherentFirstName, adherentLastName, user.insurerId] : [adherentFirstName, adherentLastName]))
        .first();
    }

    let adherentAutoCreated = false;

    if (!adherentResult) {
      // Auto-create adherent so bulletin submission is never blocked
      const newAdherentId = generateId();
      const firstName = adherentFirstName || '';
      const lastName = adherentLastName || adherentFirstName || 'Inconnu';

      // Use company_id from form (selected company), fallback to first company of insurer
      // In individual mode, company_id should be NULL
      const isIndividualMode = companyId === '__INDIVIDUAL__';
      let adherentCompanyId: string | null = isIndividualMode ? null : companyId;
      if (!adherentCompanyId && !isIndividualMode && user.insurerId) {
        const company = await db
          .prepare('SELECT id FROM companies WHERE insurer_id = ? LIMIT 1')
          .bind(user.insurerId)
          .first<{ id: string }>();
        adherentCompanyId = company?.id || null;
      }

      try {
        await db
          .prepare(`
            INSERT INTO adherents (id, matricule, first_name, last_name, national_id_encrypted, date_of_birth, company_id, is_active, dossier_complet, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '1900-01-01', ?, 1, 0, datetime('now'), datetime('now'))
          `)
          .bind(
            newAdherentId,
            adherentMatricule,
            firstName,
            lastName,
            adherentNationalId || `IMPORT_${adherentMatricule}`,
            adherentCompanyId
          )
          .run();
      } catch {
        // Fallback: minimal INSERT for tenants missing dossier_complet column
        await db
          .prepare(`
            INSERT INTO adherents (id, matricule, first_name, last_name, national_id_encrypted, date_of_birth, company_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '1900-01-01', ?, 1, datetime('now'), datetime('now'))
          `)
          .bind(
            newAdherentId,
            adherentMatricule,
            firstName,
            lastName,
            adherentNationalId || `IMPORT_${adherentMatricule}`,
            adherentCompanyId
          )
          .run();
      }

      adherentId = newAdherentId;
      adherentAutoCreated = true;

      // Auto-create individual contract linked to active group contract
      try {
        let activeGroupContract: { id: string; insurer_id: string; effective_date: string; annual_renewal_date: string | null; annual_global_limit: number | null } | null = null;

        if (adherentCompanyId) {
          // Group mode: find group contract by company
          activeGroupContract = await db
            .prepare(
              `SELECT id, insurer_id, effective_date, annual_renewal_date, annual_global_limit
               FROM group_contracts
               WHERE company_id = ? AND status = 'active' AND deleted_at IS NULL
               ORDER BY created_at DESC LIMIT 1`
            )
            .bind(adherentCompanyId)
            .first();
        } else if (user.insurerId) {
          // Individual mode: find any active group contract for this insurer
          activeGroupContract = await db
            .prepare(
              `SELECT id, insurer_id, effective_date, annual_renewal_date, annual_global_limit
               FROM group_contracts
               WHERE insurer_id = ? AND status = 'active' AND deleted_at IS NULL
               ORDER BY created_at DESC LIMIT 1`
            )
            .bind(user.insurerId)
            .first();
        }

        if (activeGroupContract) {
          const indContractId = generateId();
          let indEndDate = activeGroupContract.annual_renewal_date;
          if (!indEndDate) {
            const d = new Date(activeGroupContract.effective_date);
            d.setFullYear(d.getFullYear() + 1);
            indEndDate = d.toISOString().split('T')[0]!;
          }
          await db
            .prepare(
              `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, created_at, updated_at, group_contract_id)
               VALUES (?, ?, ?, ?, 'individual', ?, ?, 0, ?, '{}', 'active', datetime('now'), datetime('now'), ?)`
            )
            .bind(
              indContractId,
              activeGroupContract.insurer_id,
              newAdherentId,
              `${adherentMatricule}-IND`,
              activeGroupContract.effective_date,
              indEndDate,
              activeGroupContract.annual_global_limit ? activeGroupContract.annual_global_limit * 1000 : null,
              activeGroupContract.id
            )
            .run();
          console.log('[SAISIE] Auto-created individual contract for new adherent:', newAdherentId, '→ group:', activeGroupContract.id);
          const plafondsCount = await initializePlafondsForAdherent(db, newAdherentId, activeGroupContract.id, activeGroupContract.annual_global_limit);
          console.log('[SAISIE] Initialized', plafondsCount, 'plafonds for new adherent:', newAdherentId);
        } else if (user.insurerId) {
          // No group contract found — create a standalone contract with insurer_id
          const indContractId = generateId();
          const now = new Date();
          const endDate = new Date(now);
          endDate.setFullYear(endDate.getFullYear() + 1);
          await db
            .prepare(
              `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'individual', ?, ?, 0, NULL, '{}', 'active', datetime('now'), datetime('now'))`
            )
            .bind(
              indContractId,
              user.insurerId,
              newAdherentId,
              `${adherentMatricule}-IND`,
              now.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0]
            )
            .run();
          console.log('[SAISIE] Auto-created standalone individual contract for new adherent:', newAdherentId);
        }
      } catch (contractErr) {
        console.error('[SAISIE] Failed to auto-create contract:', contractErr instanceof Error ? contractErr.message : contractErr);
      }
    } else {
      // Verify identity coherence: matricule must match the name or CIN provided
      const dbFirstName = adherentResult.first_name as string | null;
      const dbLastName = adherentResult.last_name as string | null;
      const nameMatches =
        !adherentFirstName || !adherentLastName ||
        (dbFirstName?.toLowerCase() === adherentFirstName.toLowerCase() &&
        dbLastName?.toLowerCase() === adherentLastName.toLowerCase());
      const cinMatches =
        !adherentNationalId ||
        !adherentResult.national_id_hash ||
        adherentResult.national_id_hash === adherentNationalId;

      if (!nameMatches && !cinMatches) {
        return c.json(
          {
            success: false,
            error: {
              code: 'ADHERENT_IDENTITY_MISMATCH',
              message:
                "Le matricule ne correspond pas au nom/prénom ou CIN saisi. Vérifiez les informations de l'adhérent.",
            },
          },
          400
        );
      }

      adherentId = adherentResult.id as string;
      // Update adherent email if provided and not already set
      if (adherentEmail) {
        await db
          .prepare('UPDATE adherents SET email = ? WHERE id = ? AND (email IS NULL OR email = ?)')
          .bind(adherentEmail, adherentId, adherentEmail)
          .run();
      }
      // Update matricule if empty
      if (adherentMatricule) {
        await db
          .prepare(
            'UPDATE adherents SET matricule = ? WHERE id = ? AND (matricule IS NULL OR matricule = "")'
          )
          .bind(adherentMatricule, adherentId)
          .run();
      }

      // Auto-create individual contract if adherent exists but has no active contract
      const existingContract = await db
        .prepare("SELECT id FROM contracts WHERE adherent_id = ? AND status = 'active' LIMIT 1")
        .bind(adherentId)
        .first<{ id: string }>();

      if (!existingContract) {
        try {
          const adherentCompanyId = (companyId && companyId !== '__INDIVIDUAL__') ? companyId : (adherentResult as Record<string, unknown>).company_id as string | null;
          let activeGroupContract: { id: string; insurer_id: string; effective_date: string; annual_renewal_date: string | null; annual_global_limit: number | null } | null = null;

          if (adherentCompanyId && adherentCompanyId !== '__INDIVIDUAL__') {
            activeGroupContract = await db
              .prepare(
                `SELECT id, insurer_id, effective_date, annual_renewal_date, annual_global_limit
                 FROM group_contracts
                 WHERE company_id = ? AND status = 'active' AND deleted_at IS NULL
                 ORDER BY created_at DESC LIMIT 1`
              )
              .bind(adherentCompanyId)
              .first();
          } else if (user.insurerId) {
            // Individual mode: find any active group contract for this insurer
            activeGroupContract = await db
              .prepare(
                `SELECT id, insurer_id, effective_date, annual_renewal_date, annual_global_limit
                 FROM group_contracts
                 WHERE insurer_id = ? AND status = 'active' AND deleted_at IS NULL
                 ORDER BY created_at DESC LIMIT 1`
              )
              .bind(user.insurerId)
              .first();
          }

          if (activeGroupContract) {
            const indContractId = generateId();
            let indEndDate = activeGroupContract.annual_renewal_date;
            if (!indEndDate) {
              const d = new Date(activeGroupContract.effective_date);
              d.setFullYear(d.getFullYear() + 1);
              indEndDate = d.toISOString().split('T')[0]!;
            }
            await db
              .prepare(
                `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, created_at, updated_at, group_contract_id)
                 VALUES (?, ?, ?, ?, 'individual', ?, ?, 0, ?, '{}', 'active', datetime('now'), datetime('now'), ?)`
              )
              .bind(
                indContractId,
                activeGroupContract.insurer_id,
                adherentId,
                `${adherentMatricule}-IND`,
                activeGroupContract.effective_date,
                indEndDate,
                activeGroupContract.annual_global_limit ? activeGroupContract.annual_global_limit * 1000 : null,
                activeGroupContract.id
              )
              .run();
            console.log('[SAISIE] Auto-created individual contract for existing adherent:', adherentId, '→ group:', activeGroupContract.id);
            const plafondsCount = await initializePlafondsForAdherent(db, adherentId, activeGroupContract.id, activeGroupContract.annual_global_limit);
            console.log('[SAISIE] Initialized', plafondsCount, 'plafonds for existing adherent:', adherentId);
          } else if (user.insurerId) {
            // No group contract found — create a standalone contract
            const indContractId = generateId();
            const now = new Date();
            const endDate = new Date(now);
            endDate.setFullYear(endDate.getFullYear() + 1);
            await db
              .prepare(
                `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'individual', ?, ?, 0, NULL, '{}', 'active', datetime('now'), datetime('now'))`
              )
              .bind(
                indContractId,
                user.insurerId,
                adherentId,
                `${adherentMatricule}-IND`,
                now.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
              )
              .run();
            console.log('[SAISIE] Auto-created standalone individual contract for existing adherent:', adherentId);
          }
        } catch (contractErr) {
          console.error('[SAISIE] Failed to auto-create contract for existing adherent:', contractErr instanceof Error ? contractErr.message : contractErr);
        }
      }
    }

    const status = batchId ? 'in_batch' : 'draft';

    // --- Provider lookup / auto-registration per acte ---
    // Phase 1: Parallel lookup for all actes at once
    const providerIds: Array<string | null> = [];
    const newlyRegisteredProviders: Array<{ id: string; name: string; mfNumber: string }> = [];

    // Pre-compute MF data for all actes
    const actesMfData = actes.map((acte) => {
      const rawMf = (acte.ref_prof_sant || '').trim().toUpperCase();
      const nomPraticien = (acte.nom_prof_sant || '').trim();
      if (!rawMf || rawMf.length < 7) return { rawMf, nomPraticien, normalizedMf: '', skip: true, acte };
      const mfResult = validerMatriculeFiscal(rawMf);
      const normalizedMf = mfResult.normalized || rawMf.replace(/[/\s-]/g, '');
      return { rawMf, nomPraticien, normalizedMf, skip: false, acte };
    });

    // Parallel provider lookups (read-only, safe to parallelize)
    const lookupResults = await Promise.all(
      actesMfData.map(async (mfData) => {
        if (mfData.skip) return { found: false as const, id: null };

        // If frontend already resolved provider_id, verify it
        if (mfData.acte.provider_id) {
          const frontendProvider = await db
            .prepare('SELECT id, name FROM providers WHERE id = ? AND deleted_at IS NULL AND is_active = 1')
            .bind(mfData.acte.provider_id)
            .first<{ id: string; name: string }>();
          if (frontendProvider) return { found: true as const, id: frontendProvider.id };
        }

        // Search by MF (normalized, raw, license_no, or stripped DB value)
        const [existingProvider, existingByVerification] = await Promise.all([
          db
            .prepare(
              `SELECT id, name FROM providers
               WHERE (mf_number = ? OR mf_number = ? OR license_no = ? OR license_no = ?
                      OR REPLACE(REPLACE(REPLACE(REPLACE(mf_number, '/', ''), '.', ''), '-', ''), ' ', '') = ?)
                 AND deleted_at IS NULL AND is_active = 1
               LIMIT 1`
            )
            .bind(mfData.normalizedMf, mfData.rawMf, `MF-${mfData.normalizedMf}`, mfData.rawMf, mfData.normalizedMf)
            .first<{ id: string; name: string }>(),
          db
            .prepare(
              `SELECT p.id, p.name FROM practitioner_mf_verifications pmv
               JOIN providers p ON pmv.provider_id = p.id
               WHERE pmv.mf_number = ? AND p.deleted_at IS NULL
               LIMIT 1`
            )
            .bind(mfData.normalizedMf)
            .first<{ id: string; name: string }>(),
        ]);

        if (existingProvider) return { found: true as const, id: existingProvider.id };
        if (existingByVerification) return { found: true as const, id: existingByVerification.id };
        return { found: false as const, id: null };
      })
    );

    // Phase 2: Sequential auto-registration only for providers not found
    for (let i = 0; i < actes.length; i++) {
      const mfData = actesMfData[i]!;
      const lookupResult = lookupResults[i]!;

      if (mfData.skip) {
        providerIds.push(null);
        continue;
      }

      if (lookupResult.found) {
        providerIds.push(lookupResult.id);
        continue;
      }

      // Provider not found — auto-register
      const acte = mfData.acte;
      const acteCareType = (acte.care_type || careType || 'consultation') as string;
      const provType = acteCareType === 'pharmacy' ? 'pharmacist' : acteCareType === 'lab' ? 'lab' : acteCareType === 'hospital' ? 'clinic' : 'doctor';
      const effectiveName = mfData.nomPraticien.length >= 2 ? mfData.nomPraticien : `Praticien MF ${mfData.normalizedMf}`;

      try {
        const newProviderId = generateId();
        const licenseNo = `MF-${mfData.normalizedMf}`;

        // Check if license_no already exists (UNIQUE constraint)
        const existingByLicense = await db
          .prepare('SELECT id, name FROM providers WHERE license_no = ? AND deleted_at IS NULL LIMIT 1')
          .bind(licenseNo)
          .first<{ id: string; name: string }>();

        if (existingByLicense) {
          providerIds.push(existingByLicense.id);
          continue;
        }

        // Insert into providers table
        await db
          .prepare(
            `INSERT INTO providers (id, type, name, license_no, mf_number, mf_verified, is_active, address, city, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, 1, 'À compléter', 'À compléter', datetime('now'), datetime('now'))`
          )
          .bind(newProviderId, provType, effectiveName, licenseNo, mfData.rawMf)
          .run();

        // Fire secondary inserts in parallel (sante_praticiens, MF verification, audit)
        const santePraticienId = generateId();
        const santeType = acteCareType === 'pharmacy' ? 'pharmacien'
          : acteCareType === 'lab' ? 'laborantin'
          : acteCareType === 'hospital' ? 'autre'
          : 'medecin';
        const santeSpecialite = acteCareType === 'pharmacy' ? 'Pharmacie'
          : acteCareType === 'lab' ? 'Laboratoire'
          : acteCareType === 'hospital' ? 'Hospitalisation'
          : 'Médecine générale';
        const verificationId = generateId();

        await Promise.allSettled([
          db
            .prepare(
              `INSERT INTO sante_praticiens (id, provider_id, nom, specialite, type_praticien, est_conventionne, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 0, 1, datetime('now'), datetime('now'))`
            )
            .bind(santePraticienId, newProviderId, effectiveName, santeSpecialite, santeType)
            .run(),
          db
            .prepare(
              `INSERT INTO practitioner_mf_verifications (id, provider_id, mf_number, verification_status, created_at, updated_at)
               VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))`
            )
            .bind(verificationId, newProviderId, mfData.rawMf)
            .run(),
          logAudit(db, {
            userId: user.id,
            action: 'provider.auto_register',
            entityType: 'provider',
            entityId: newProviderId,
            changes: { mfNumber: mfData.normalizedMf, name: effectiveName, source: 'bulletin_creation', santePraticienId },
            ipAddress: c.req.header('CF-Connecting-IP'),
            userAgent: c.req.header('User-Agent'),
          }),
        ]);

        console.log('[PROVIDER-LOOKUP] Auto-registered provider:', newProviderId, effectiveName, mfData.normalizedMf);
        providerIds.push(newProviderId);
        newlyRegisteredProviders.push({ id: newProviderId, name: effectiveName, mfNumber: mfData.normalizedMf });
      } catch (providerError) {
        const errMsg = providerError instanceof Error ? providerError.message : String(providerError);
        console.error('[PROVIDER-LOOKUP] Auto-register failed:', errMsg, providerError);
        newlyRegisteredProviders.push({ id: 'ERROR', name: errMsg, mfNumber: mfData.normalizedMf });
        const retryProvider = await db
          .prepare('SELECT id, name FROM providers WHERE mf_number = ? AND deleted_at IS NULL LIMIT 1')
          .bind(mfData.normalizedMf)
          .first<{ id: string; name: string }>();
        providerIds.push(retryProvider?.id || null);
      }
    }

    // Use first provider for bulletin-level provider_id
    const bulletinProviderId = providerIds.find((id) => id !== null) || null;
    console.log('[SAISIE] providerIds resolved:', JSON.stringify(providerIds), '→ bulletinProviderId:', bulletinProviderId);

    // Fallback: derive provider_name from first acte's nom_prof_sant if not provided at bulletin level
    const effectiveProviderName = providerName || (actes.length > 0 && (actes[0] as Record<string, unknown>).nom_prof_sant) || null;

    // Insert bulletin
    // Use beneficiary_id from form data, or resolve from adherent family if relationship is provided
    const effectiveBeneficiaryId = beneficiaryRelationship === 'self' ? null : beneficiaryId;

    await db
      .prepare(`
      INSERT INTO bulletins_soins (
        id, bulletin_number, bulletin_date, adherent_id, adherent_matricule,
        adherent_first_name, adherent_last_name, adherent_national_id, adherent_address,
        beneficiary_id, beneficiary_name, beneficiary_relationship,
        provider_id, provider_name, provider_specialty, care_type, care_description,
        total_amount, scan_url, batch_id, company_id, status, created_by,
        submission_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `)
      .bind(
        bulletinId,
        bulletinNumber,
        bulletinDate,
        adherentId,
        adherentMatricule,
        adherentFirstName,
        adherentLastName,
        adherentNationalId,
        adherentAddress,
        effectiveBeneficiaryId,
        beneficiaryName,
        beneficiaryRelationship,
        bulletinProviderId,
        effectiveProviderName,
        providerSpecialty,
        careType,
        careDescription,
        totalAmount,
        scanUrl,
        batchId,
        companyId,
        status,
        user.id
      )
      .run();

    // Insert actes and calculate reimbursement
    let reimbursedAmount: number | null = null;
    const warnings: string[] = [];

    if (actes.length > 0) {
      // Try contract-bareme-aware calculation first, fallback to legacy
      // Lookup adherent contract for bareme-aware calculation
      let contractId: string | null = null;
      if (adherentId) {
        // Prioritize contracts with group_contract_id (they have guarantees/baremes)
        const contract = await db
          .prepare(
            `SELECT c.id FROM contracts c
           WHERE c.adherent_id = ? AND c.status = 'active'
             AND c.start_date <= ? AND c.end_date >= ?
           ORDER BY CASE WHEN c.group_contract_id IS NOT NULL THEN 0 ELSE 1 END, c.created_at DESC
           LIMIT 1`
          )
          .bind(adherentId, bulletinDate, bulletinDate)
          .first<{ id: string }>();
        contractId = contract?.id ?? null;
      }

      // Resolve acte_ref_id + medication matches in parallel for all actes
      // Skip lookups when frontend already provides pre-resolved IDs
      const isPharmacy = careType === 'pharmacy' || careType === 'pharmacie_chronique';

      const [acteRefs, medicationMatches] = await Promise.all([
        // Parallel acte ref lookups — skip if acte_ref_id provided
        Promise.all(
          actes.map(async (acte) => {
            if (acte.acte_ref_id) {
              const ref = await db
                .prepare('SELECT id, taux_remboursement FROM actes_referentiel WHERE id = ? AND is_active = 1')
                .bind(acte.acte_ref_id)
                .first<{ id: string; taux_remboursement: number }>();
              if (ref) return { ref, code: acte.code?.trim() || '' };
            }
            const code = acte.code?.trim();
            if (code) {
              const ref = await findActeRefByCode(db, code);
              return { ref: ref as { id: string; taux_remboursement: number } | null, code };
            }
            return { ref: null, code: '' };
          })
        ),
        // Parallel medication lookups — skip if medication_id provided
        Promise.all(
          actes.map(async (acte) => {
            if (acte.medication_id) {
              const med = await db
                .prepare('SELECT id, family_id, reimbursement_rate FROM medications WHERE id = ?')
                .bind(acte.medication_id)
                .first<{ id: string; family_id: string | null; reimbursement_rate: number | null }>();
              if (med) {
                return { medicationId: med.id, medicationFamilyId: acte.medication_family_id || med.family_id, tauxApplique: med.reimbursement_rate };
              }
            }
            if (!isPharmacy) return { medicationId: null, medicationFamilyId: null, tauxApplique: null };
            const code = acte.code?.trim();
            if (!code) return { medicationId: null, medicationFamilyId: null, tauxApplique: null };
            const med = await db
              .prepare(
                `SELECT id, family_id, reimbursement_rate FROM medications
                 WHERE (code_pct = ? OR code_amm = ?) AND deleted_at IS NULL AND is_active = 1
                 LIMIT 1`
              )
              .bind(code, code)
              .first<{ id: string; family_id: string | null; reimbursement_rate: number | null }>();
            if (med) {
              return { medicationId: med.id, medicationFamilyId: med.family_id, tauxApplique: med.reimbursement_rate };
            }
            return { medicationId: null, medicationFamilyId: null, tauxApplique: null };
          })
        ),
      ]);

      // Contract-bareme-aware calculation (TASK-006)
      if (contractId && adherentId) {
        const baremeResults: CalculRemboursementResult[] = [];
        let totalRembourse = 0;

        for (let i = 0; i < actes.length; i++) {
          const acte = actes[i]!;
          const acteRefInfo = acteRefs[i]!;

          if (acteRefInfo.ref) {
            try {
              const medMatch = medicationMatches[i];
              const calcInput: CalculRemboursementInput = {
                adherentId,
                contractId,
                acteRefId: acteRefInfo.ref.id,
                fraisEngages: acte.amount,
                dateSoin: bulletinDate,
                typeMaladie: (careType === 'pharmacie_chronique' ? 'chronique' : 'ordinaire') as
                  | 'ordinaire'
                  | 'chronique',
                medicationFamilyId: medMatch?.medicationFamilyId ?? undefined,
              };
              const result = await calculerRemboursement(db, calcInput);
              baremeResults.push(result);
              totalRembourse += result.montantRembourse;
            } catch {
              // If bareme not found, use legacy calculation for this acte
              baremeResults.push({
                montantRembourse: Math.round(
                  acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                ),
                typeCalcul: 'taux',
                valeurBareme: acteRefInfo.ref.taux_remboursement || 0,
                plafondActeApplique: false,
                plafondFamilleApplique: false,
                plafondGlobalApplique: false,
                details: {
                  montantBrut: Math.round(acte.amount * (acteRefInfo.ref.taux_remboursement || 0)),
                  apresPlafondActe: Math.round(
                    acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                  ),
                  apresPlafondFamille: Math.round(
                    acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                  ),
                  apresPlafondGlobal: Math.round(
                    acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                  ),
                },
              });
              totalRembourse += baremeResults[baremeResults.length - 1]!.montantRembourse;
            }
          } else {
            baremeResults.push({
              montantRembourse: 0,
              typeCalcul: 'taux',
              valeurBareme: 0,
              plafondActeApplique: false,
              plafondFamilleApplique: false,
              plafondGlobalApplique: false,
              details: {
                montantBrut: 0,
                apresPlafondActe: 0,
                apresPlafondFamille: 0,
                apresPlafondGlobal: 0,
              },
            });
          }
        }

        reimbursedAmount = totalRembourse;

        // Insert actes with bareme-aware reimbursement data + medication fields
        const stmts = actes.map((acte, i) => {
          const acteId = generateId();
          const baremeResult = baremeResults[i]!;
          const medMatch = medicationMatches[i];
          return db
            .prepare(
              `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, care_type, taux_remboursement, montant_rembourse, remboursement_brut, plafond_depasse, acte_ref_id, ref_prof_sant, nom_prof_sant, provider_id, cod_msgr, lib_msgr, medication_id, medication_family_id, taux_applique, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM actes_referentiel WHERE code = ? AND is_active = 1), ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            )
            .bind(
              acteId,
              bulletinId,
              acte.code?.trim() || null,
              acte.label,
              acte.amount,
              acte.care_type || careType,
              baremeResult.valeurBareme,
              baremeResult.montantRembourse,
              baremeResult.details.montantBrut,
              baremeResult.plafondActeApplique ||
                baremeResult.plafondFamilleApplique ||
                baremeResult.plafondGlobalApplique
                ? 1
                : 0,
              acte.code?.trim() || null,
              acte.ref_prof_sant?.trim() || null,
              acte.nom_prof_sant?.trim() || null,
              providerIds[i] || null,
              acte.cod_msgr?.trim() || null,
              acte.lib_msgr?.trim() || null,
              medMatch?.medicationId || null,
              medMatch?.medicationFamilyId || null,
              medMatch?.tauxApplique || null
            );
        });
        await db.batch(stmts);

        // Update bulletin reimbursed_amount
        await db
          .prepare('UPDATE bulletins_soins SET reimbursed_amount = ? WHERE id = ?')
          .bind(reimbursedAmount, bulletinId)
          .run();

        // Update plafonds via mettreAJourPlafonds for each acte (TASK-006)
        // Parallel lookup of famille_ids, then sequential plafond updates
        const annee = Number(bulletinDate.split('-')[0]);
        const typeMaladie = (careType === 'pharmacie_chronique' ? 'chronique' : 'ordinaire') as 'ordinaire' | 'chronique';

        const familleIds = await Promise.all(
          actes.map(async (_acte, i) => {
            const acteRefInfo = acteRefs[i]!;
            const baremeResult = baremeResults[i]!;
            if (acteRefInfo.ref && baremeResult.montantRembourse > 0) {
              const row = await db
                .prepare('SELECT famille_id FROM actes_referentiel WHERE id = ?')
                .bind(acteRefInfo.ref.id)
                .first<{ famille_id: string | null }>();
              return row?.famille_id ?? null;
            }
            return null;
          })
        );

        // Sequential plafond updates (shared counter — cannot parallelize)
        for (let i = 0; i < actes.length; i++) {
          const baremeResult = baremeResults[i]!;
          if (baremeResult.montantRembourse > 0 && familleIds[i] !== undefined) {
            await mettreAJourPlafonds(
              db, adherentId, contractId, annee,
              familleIds[i]!, baremeResult.montantRembourse, typeMaladie
            );
          }
        }

        // Also update legacy adherent plafond_consomme for backward compat
        if (reimbursedAmount > 0) {
          await db
            .prepare(
              'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
            )
            .bind(reimbursedAmount, adherentId)
            .run();
        }
      } else {
        // Legacy calculation fallback (no contract found)
        if (!contractId) {
          warnings.push('Aucun contrat actif trouvé pour cet adhérent. Le remboursement a été calculé avec les taux par défaut, sans barèmes contractuels ni plafonds. Veuillez créer et appliquer un contrat pour un calcul précis.');
        }
        const actesInput: ActeInput[] = [];
        for (let i = 0; i < actes.length; i++) {
          const acte = actes[i]!;
          const acteRefInfo = acteRefs[i]!;
          actesInput.push({
            code: acteRefInfo.code || '',
            label: acte.label,
            montantActe: acte.amount,
            tauxRemboursement: acteRefInfo.ref?.taux_remboursement || 0,
          });
        }

        // Get adherent plafond
        // If plafond_global is NULL (e.g. individual mode, no contract), treat as unlimited
        let plafondRestant = Number.MAX_SAFE_INTEGER;
        if (adherentId) {
          const adh = await db
            .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
            .bind(adherentId)
            .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
          if (adh && adh.plafond_global) {
            plafondRestant = adh.plafond_global - (adh.plafond_consomme || 0);
          }
        }

        // Calculate reimbursement (legacy)
        const calcul = calculateRemboursementBulletin(actesInput, plafondRestant);
        reimbursedAmount = calcul.totalRembourse;

        // Insert actes with reimbursement data + medication fields
        const stmts = actes.map((acte, i) => {
          const acteId = generateId();
          const acteResult = calcul.actes[i]!;
          const medMatch = medicationMatches[i];
          return db
            .prepare(
              `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, care_type, taux_remboursement, montant_rembourse, remboursement_brut, plafond_depasse, acte_ref_id, ref_prof_sant, nom_prof_sant, provider_id, cod_msgr, lib_msgr, medication_id, medication_family_id, taux_applique, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM actes_referentiel WHERE code = ? AND is_active = 1), ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            )
            .bind(
              acteId,
              bulletinId,
              acte.code?.trim() || null,
              acte.label,
              acte.amount,
              acte.care_type || careType,
              acteResult.tauxRemboursement,
              acteResult.remboursementFinal,
              acteResult.remboursementBrut,
              acteResult.plafondDepasse ? 1 : 0,
              acte.code?.trim() || null,
              acte.ref_prof_sant?.trim() || null,
              acte.nom_prof_sant?.trim() || null,
              providerIds[i] || null,
              acte.cod_msgr?.trim() || null,
              acte.lib_msgr?.trim() || null,
              medMatch?.medicationId || null,
              medMatch?.medicationFamilyId || null,
              medMatch?.tauxApplique || null
            );
        });
        await db.batch(stmts);

        // Update bulletin reimbursed_amount
        await db
          .prepare('UPDATE bulletins_soins SET reimbursed_amount = ? WHERE id = ?')
          .bind(reimbursedAmount, bulletinId)
          .run();

        // Update adherent plafond_consomme
        if (adherentId && reimbursedAmount > 0) {
          await db
            .prepare(
              'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
            )
            .bind(reimbursedAmount, adherentId)
            .run();
        }
      }
    }

    return c.json(
      {
        success: true,
        data: {
          id: bulletinId,
          bulletin_number: bulletinNumber,
          status,
          actes_count: actes.length,
          reimbursed_amount: reimbursedAmount,
          provider_id: bulletinProviderId,
          provider_ids_per_acte: providerIds,
          adherent_auto_created: adherentAutoCreated || undefined,
          newlyRegisteredProviders: newlyRegisteredProviders.length > 0 ? newlyRegisteredProviders : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      },
      201
    );
  } catch (error) {
    console.error('Error creating bulletin:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: error instanceof Error ? error.message : 'Erreur lors de la creation',
        },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/batches - Create a new batch for a company
 */
bulletinsAgent.post('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const body = await c.req.json();

  const parsed = createBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join(', '),
        },
      },
      400
    );
  }

  const { name, companyId } = parsed.data;
  const isIndividualMode = companyId === '__INDIVIDUAL__';

  try {
    // Verify company belongs to agent's insurer (skip for individual mode)
    if (!isIndividualMode && user.insurerId) {
      const company = await db
        .prepare('SELECT id FROM companies WHERE id = ? AND insurer_id = ?')
        .bind(companyId, user.insurerId)
        .first();

      if (!company) {
        return c.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Entreprise non autorisee' },
          },
          403
        );
      }
    }

    const batchId = generateId();

    await db
      .prepare(`
      INSERT INTO bulletin_batches (id, name, status, company_id, created_by, created_at)
      VALUES (?, ?, 'open', ?, ?, datetime('now'))
    `)
      .bind(batchId, name, isIndividualMode ? null : companyId, user.id)
      .run();

    return c.json(
      {
        success: true,
        data: { id: batchId, name, companyId, status: 'open' },
      },
      201
    );
  } catch (error) {
    console.error('Error creating batch:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la creation du lot' },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/import-lot - Import a batch of bulletins from parsed CSV/XLSX data
 */
bulletinsAgent.post('/import-lot', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } },
      403
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const body = await c.req.json();

  const parsed = importLotSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join(', '),
        },
      },
      400
    );
  }

  const { companyId, batchName, bulletins } = parsed.data;

  try {
    // Verify company belongs to agent's insurer
    if (user.insurerId) {
      const company = await db
        .prepare('SELECT id FROM companies WHERE id = ? AND insurer_id = ?')
        .bind(companyId, user.insurerId)
        .first();

      if (!company) {
        return c.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Entreprise non autorisee' } },
          403
        );
      }
    }

    // Create batch
    const batchId = generateId();
    await db
      .prepare(`
        INSERT INTO bulletin_batches (id, name, status, company_id, created_by, created_at)
        VALUES (?, ?, 'open', ?, ?, datetime('now'))
      `)
      .bind(batchId, batchName, companyId, user.id)
      .run();

    // Process each bulletin
    const results: Array<{ id: string; bulletin_number: string; adherent_matricule: string; adherent_name?: string; status: string; skipped?: boolean; reason?: string; adherent_auto_created?: boolean }> = [];
    let totalImported = 0;
    let skipped = 0;

    for (const bulletin of bulletins) {
      const bulletinId = generateId();
      const bulletinNumber = `BS-${new Date().getFullYear()}-${bulletinId.slice(-8).toUpperCase()}`;
      const totalAmount = bulletin.actes.reduce((sum, a) => sum + a.amount, 0);

      // Find adherent by matricule
      // 1. Try exact matricule within selected company
      // 2. Fall back to any company of this insurer
      // 3. Try name-based match within company
      // 4. Auto-create adherent if not found (so import is never blocked)
      let adherentId: string | null = null;
      const adherentSelectCols = 'a.id, a.first_name, a.last_name';
      let adherentAutoCreated = false;

      // Try 1: find by matricule within the selected company (active only)
      let adherentResult = await db
        .prepare(`SELECT ${adherentSelectCols} FROM adherents a WHERE a.matricule = ? AND a.company_id = ? AND a.deleted_at IS NULL`)
        .bind(bulletin.adherent_matricule, companyId)
        .first();

      // Try 1b: if found deleted, restore it
      if (!adherentResult) {
        const deletedAdherent = await db
          .prepare(`SELECT ${adherentSelectCols} FROM adherents a WHERE a.matricule = ? AND a.company_id = ? AND a.deleted_at IS NOT NULL`)
          .bind(bulletin.adherent_matricule, companyId)
          .first();
        if (deletedAdherent) {
          await db.prepare(`UPDATE adherents SET deleted_at = NULL, is_active = 1, updated_at = datetime('now') WHERE id = ?`).bind(deletedAdherent.id).run();
          adherentResult = deletedAdherent;
          console.log('[IMPORT] Restored soft-deleted adherent:', deletedAdherent.id, bulletin.adherent_matricule);
        }
      }

      // Try 2: find by matricule within any company of this insurer
      if (!adherentResult && user.insurerId) {
        adherentResult = await db
          .prepare(`SELECT ${adherentSelectCols} FROM adherents a JOIN companies co ON a.company_id = co.id WHERE a.matricule = ? AND co.insurer_id = ? AND a.deleted_at IS NULL`)
          .bind(bulletin.adherent_matricule, user.insurerId)
          .first();
      }

      // Try 3: find by name match within the selected company
      if (!adherentResult && bulletin.adherent_first_name && bulletin.adherent_last_name) {
        adherentResult = await db
          .prepare(`SELECT ${adherentSelectCols} FROM adherents a WHERE a.company_id = ? AND LOWER(TRIM(a.first_name)) = LOWER(?) AND LOWER(TRIM(a.last_name)) = LOWER(?) AND a.deleted_at IS NULL`)
          .bind(companyId, bulletin.adherent_first_name.trim(), bulletin.adherent_last_name.trim())
          .first();
      }

      // Try 4: find by last_name only (SPROLS often has only the family name as adherent)
      if (!adherentResult && bulletin.adherent_last_name) {
        adherentResult = await db
          .prepare(`SELECT ${adherentSelectCols} FROM adherents a WHERE a.company_id = ? AND LOWER(TRIM(a.last_name)) = LOWER(?) AND a.deleted_at IS NULL`)
          .bind(companyId, bulletin.adherent_last_name.trim())
          .first();
      }

      if (adherentResult) {
        adherentId = adherentResult.id as string;

        // Auto-create individual contract if adherent exists but has no active contract
        const existingContract = await db
          .prepare("SELECT id FROM contracts WHERE adherent_id = ? AND status = 'active' LIMIT 1")
          .bind(adherentId)
          .first<{ id: string }>();

        if (!existingContract) {
          try {
            const activeGroupContract = await db
              .prepare(
                `SELECT id, insurer_id, effective_date, annual_renewal_date, annual_global_limit
                 FROM group_contracts
                 WHERE company_id = ? AND status = 'active' AND deleted_at IS NULL
                 ORDER BY created_at DESC LIMIT 1`
              )
              .bind(companyId)
              .first<{ id: string; insurer_id: string; effective_date: string; annual_renewal_date: string | null; annual_global_limit: number | null }>();

            if (activeGroupContract) {
              const indContractId = generateId();
              let indEndDate = activeGroupContract.annual_renewal_date;
              if (!indEndDate) {
                const d = new Date(activeGroupContract.effective_date);
                d.setFullYear(d.getFullYear() + 1);
                indEndDate = d.toISOString().split('T')[0]!;
              }
              await db
                .prepare(
                  `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, created_at, updated_at, group_contract_id)
                   VALUES (?, ?, ?, ?, 'corporate', ?, ?, 0, ?, '{}', 'active', datetime('now'), datetime('now'), ?)`
                )
                .bind(
                  indContractId,
                  activeGroupContract.insurer_id,
                  adherentId,
                  `${bulletin.adherent_matricule}-IND`,
                  activeGroupContract.effective_date,
                  indEndDate,
                  activeGroupContract.annual_global_limit ? activeGroupContract.annual_global_limit * 1000 : null,
                  activeGroupContract.id
                )
                .run();
              console.log('[IMPORT] Auto-created individual contract for existing adherent:', adherentId, '→ group:', activeGroupContract.id);
              const plafondsCount = await initializePlafondsForAdherent(db, adherentId, activeGroupContract.id, activeGroupContract.annual_global_limit);
              console.log('[IMPORT] Initialized', plafondsCount, 'plafonds for existing adherent:', adherentId);
            }
          } catch (contractErr) {
            console.error('[IMPORT] Failed to auto-create contract for existing adherent:', contractErr instanceof Error ? contractErr.message : contractErr);
          }
        }
      } else {
        // Auto-create adherent so the import is never blocked
        const newAdherentId = generateId();
        const firstName = bulletin.adherent_first_name || '';
        const lastName = bulletin.adherent_last_name || bulletin.adherent_first_name || 'Inconnu';
        try {
          await db
            .prepare(`
              INSERT INTO adherents (id, matricule, first_name, last_name, national_id_encrypted, date_of_birth, company_id, is_active, dossier_complet, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, '1900-01-01', ?, 1, 0, datetime('now'), datetime('now'))
            `)
            .bind(
              newAdherentId,
              bulletin.adherent_matricule,
              firstName,
              lastName,
              `IMPORT_${bulletin.adherent_matricule}`,
              companyId
            )
            .run();
        } catch {
          // Fallback: minimal INSERT for tenants missing dossier_complet column
          await db
            .prepare(`
              INSERT INTO adherents (id, matricule, first_name, last_name, national_id_encrypted, date_of_birth, company_id, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, '1900-01-01', ?, 1, datetime('now'), datetime('now'))
            `)
            .bind(
              newAdherentId,
              bulletin.adherent_matricule,
              firstName,
              lastName,
              `IMPORT_${bulletin.adherent_matricule}`,
              companyId
            )
            .run();
        }
        adherentId = newAdherentId;
        adherentAutoCreated = true;

        // Auto-create individual contract linked to active group contract for this company
        try {
          const activeGroupContract = await db
            .prepare(
              `SELECT id, insurer_id, effective_date, annual_renewal_date, annual_global_limit
               FROM group_contracts
               WHERE company_id = ? AND status = 'active' AND deleted_at IS NULL
               ORDER BY created_at DESC LIMIT 1`
            )
            .bind(companyId)
            .first<{ id: string; insurer_id: string; effective_date: string; annual_renewal_date: string | null; annual_global_limit: number | null }>();

          if (activeGroupContract) {
            const indContractId = generateId();
            // Compute end_date: use annual_renewal_date, or default to effective_date + 1 year
            let indEndDate = activeGroupContract.annual_renewal_date;
            if (!indEndDate) {
              const d = new Date(activeGroupContract.effective_date);
              d.setFullYear(d.getFullYear() + 1);
              indEndDate = d.toISOString().split('T')[0]!;
            }
            await db
              .prepare(
                `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, status, created_at, updated_at, group_contract_id)
                 VALUES (?, ?, ?, ?, 'corporate', ?, ?, 0, ?, '{}', 'active', datetime('now'), datetime('now'), ?)`
              )
              .bind(
                indContractId,
                activeGroupContract.insurer_id,
                newAdherentId,
                `${bulletin.adherent_matricule}-IND`,
                activeGroupContract.effective_date,
                indEndDate,
                activeGroupContract.annual_global_limit ? activeGroupContract.annual_global_limit * 1000 : null,
                activeGroupContract.id
              )
              .run();
            console.log('[IMPORT] Auto-created individual contract for new adherent:', newAdherentId, '→ group:', activeGroupContract.id);
            const plafondsCount = await initializePlafondsForAdherent(db, newAdherentId, activeGroupContract.id, activeGroupContract.annual_global_limit);
            console.log('[IMPORT] Initialized', plafondsCount, 'plafonds for new adherent:', newAdherentId);
          }
        } catch (contractErr) {
          console.error('[IMPORT] Failed to auto-create contract for adherent:', contractErr instanceof Error ? contractErr.message : contractErr);
        }
      }

      // Insert bulletin
      await db
        .prepare(`
          INSERT INTO bulletins_soins (
            id, bulletin_number, bulletin_date, adherent_id, adherent_matricule,
            adherent_first_name, adherent_last_name, adherent_national_id, adherent_address,
            beneficiary_name, beneficiary_relationship,
            provider_name, provider_specialty, care_type, care_description,
            total_amount, scan_url, batch_id, company_id, status, created_by,
            submission_date, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, NULL, ?, NULL, ?, ?, 'in_batch', ?, datetime('now'), datetime('now'), datetime('now'))
        `)
        .bind(
          bulletinId,
          bulletinNumber,
          bulletin.bulletin_date,
          adherentId,
          bulletin.adherent_matricule,
          bulletin.adherent_first_name,
          bulletin.adherent_last_name,
          bulletin.actes[0]?.nom_prof_sant || null,
          bulletin.care_type,
          totalAmount,
          batchId,
          companyId,
          user.id
        )
        .run();

      // Insert actes (simple insert — reimbursement deferred to validation)
      const acteStmts = bulletin.actes.map((acte) => {
        const acteId = generateId();
        return db
          .prepare(
            `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, care_type, taux_remboursement, montant_rembourse, remboursement_brut, plafond_depasse, acte_ref_id, ref_prof_sant, nom_prof_sant, cod_msgr, lib_msgr, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, (SELECT id FROM actes_referentiel WHERE code = ? AND is_active = 1), ?, ?, ?, ?, datetime('now'))`
          )
          .bind(
            acteId,
            bulletinId,
            acte.code?.trim() || null,
            acte.label,
            acte.amount,
            acte.care_type || 'consultation',
            acte.code?.trim() || null,
            acte.ref_prof_sant?.trim() || null,
            acte.nom_prof_sant?.trim() || null,
            acte.cod_msgr?.trim() || null,
            acte.lib_msgr?.trim() || null
          );
      });

      if (acteStmts.length > 0) {
        await db.batch(acteStmts);
      }

      results.push({
        id: bulletinId,
        bulletin_number: bulletinNumber,
        adherent_matricule: bulletin.adherent_matricule,
        adherent_name: `${bulletin.adherent_first_name} ${bulletin.adherent_last_name}`.trim(),
        status: 'in_batch',
        adherent_auto_created: adherentAutoCreated,
      });
      totalImported++;
    }

    return c.json(
      {
        success: true,
        data: {
          batch_id: batchId,
          batch_name: batchName,
          total_imported: totalImported,
          skipped,
          bulletins: results,
        },
      },
      201
    );
  } catch (error) {
    console.error('Error importing lot:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: error instanceof Error ? error.message : "Erreur lors de l'import du lot",
        },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/:id/validate - Validate a bulletin and record reimbursement
 */
bulletinsAgent.post('/:id/validate', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  const body = await c.req.json();
  const parsed = validateBulletinSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join(', '),
        },
      },
      400
    );
  }

  const { reimbursed_amount, notes } = parsed.data;

  try {
    // Fetch bulletin — all insurer roles and admins can validate any bulletin in their tenant
    const bulletin = await db
      .prepare('SELECT id, status, adherent_id, reimbursed_amount, bulletin_number, care_type, bulletin_date FROM bulletins_soins WHERE id = ?')
      .bind(bulletinId)
      .first<{
        id: string;
        status: string;
        adherent_id: string | null;
        reimbursed_amount: number | null;
        bulletin_number: string;
        care_type: string | null;
        bulletin_date: string | null;
      }>();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    // Only draft, in_batch, or processing bulletins can be validated
    const validStatuses = ['draft', 'in_batch', 'processing'];
    if (!validStatuses.includes(bulletin.status)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'BULLETIN_ALREADY_VALIDATED',
            message: 'Ce bulletin a déjà été validé ou est dans un statut final',
          },
        },
        409
      );
    }

    const now = new Date().toISOString();

    // Update bulletin status and reimbursement
    await db
      .prepare(`
      UPDATE bulletins_soins
      SET status = 'approved',
          reimbursed_amount = ?,
          validated_at = ?,
          validated_by = ?,
          approved_date = ?,
          approved_amount = ?,
          updated_at = ?
      WHERE id = ?
    `)
      .bind(reimbursed_amount, now, user.id, now, reimbursed_amount, now, bulletinId)
      .run();

    // Update adherent plafond_consomme (adjust delta if reimbursement changed)
    if (bulletin.adherent_id) {
      const previousAmount = bulletin.reimbursed_amount || 0;
      const delta = reimbursed_amount - previousAmount;
      if (delta !== 0) {
        await db
          .prepare(
            'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
          )
          .bind(delta, bulletin.adherent_id)
          .run();
      }
    }

    // Audit log
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'bulletin_validated', 'bulletins_soins', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        bulletinId,
        JSON.stringify({
          reimbursed_amount,
          notes: notes || null,
          previous_status: bulletin.status,
        }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    const response: ValidateBulletinResponse = {
      id: bulletinId,
      status: 'approved',
      reimbursed_amount,
      validated_at: now,
      validated_by: user.id,
    };

    // Fire-and-forget: notify adherent (in-app + push + realtime)
    if (bulletin.adherent_id) {
      const bulletinNumber = bulletin.bulletin_number;
      const careType = bulletin.care_type || 'soin';
      const formatAmt = (v: number) => v.toFixed(3);
      const notifBody = `Votre bulletin ${bulletinNumber} (${careType}) a été approuvé. Montant remboursé : ${formatAmt(reimbursed_amount)} TND.`;
      const notifTitle = `Bulletin ${bulletinNumber} approuve`;

      c.executionCtx.waitUntil(
        (async () => {
          try {
            const adherent = await db
              .prepare('SELECT email FROM adherents WHERE id = ?')
              .bind(bulletin.adherent_id)
              .first<{ email: string }>();
            if (!adherent?.email) return;

            // Find user account by email
            let userId: string | null = null;
            const tenantUser = await db
              .prepare('SELECT id FROM users WHERE email = ? AND is_active = 1')
              .bind(adherent.email)
              .first<{ id: string }>();
            if (tenantUser) userId = tenantUser.id;
            if (!userId) {
              const platformUser = await c.env.DB.prepare(
                'SELECT id FROM users WHERE email = ? AND is_active = 1'
              )
                .bind(adherent.email)
                .first<{ id: string }>();
              if (platformUser) userId = platformUser.id;
            }
            if (!userId) return;

            const notifId = generateId();

            // 1. In-app notification — tenant DB
            await db
              .prepare(`
              INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
              VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_APPROUVEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
            `)
              .bind(notifId, userId, notifTitle, notifBody, bulletinId, now)
              .run();

            // Also write to platform DB for mobile
            if (db !== c.env.DB) {
              await c.env.DB.prepare(`
                INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
                VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_APPROUVEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
              `)
                .bind(notifId, userId, notifTitle, notifBody, bulletinId, now)
                .run()
                .catch(() => {});
            }

            // 2. Push notification
            const pushService = new PushNotificationService(c.env);
            await pushService
              .sendSanteNotification(userId, 'SANTE_DEMANDE_APPROUVEE', {
                demandeId: bulletinId,
                numeroDemande: bulletinNumber,
                typeSoin: careType,
                dateSoin: bulletin.bulletin_date || '',
                montantRembourse: String(reimbursed_amount),
              })
              .catch(() => {});

            // 3. Realtime WebSocket
            if (c.env.NOTIFICATION_HUB) {
              const realtimeService = new RealtimeNotificationsService(c);
              await realtimeService
                .sendToUser(userId, {
                  id: notifId,
                  type: 'SANTE_DEMANDE_APPROUVEE',
                  title: notifTitle,
                  message: notifBody,
                  createdAt: now,
                  read: false,
                  data: {
                    demandeId: bulletinId,
                    numeroDemande: bulletinNumber,
                    statut: 'approved',
                    typeSoin: careType,
                    montantRembourse: reimbursed_amount,
                  },
                })
                .catch(() => {});
            }
          } catch (err) {
            console.error('Notification failed:', err);
          }
        })()
      );
    }

    return c.json({ success: true, data: response });
  } catch (error) {
    console.error('Error validating bulletin:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la validation', details: errMsg },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/:id/reject - Reject a bulletin
 */
bulletinsAgent.post('/:id/reject', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  let notes = '';
  try {
    const body = await c.req.json();
    notes = body.notes || '';
  } catch {
    // no body is fine
  }

  try {
    // All insurer roles and admins can reject any bulletin in their tenant
    const bulletin = await db
      .prepare('SELECT id, status FROM bulletins_soins WHERE id = ?')
      .bind(bulletinId)
      .first<{ id: string; status: string }>();

    if (!bulletin) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' } },
        404
      );
    }

    const validStatuses = ['draft', 'in_batch', 'processing'];
    if (!validStatuses.includes(bulletin.status)) {
      return c.json(
        {
          success: false,
          error: { code: 'BULLETIN_ALREADY_PROCESSED', message: 'Ce bulletin a déjà été traité' },
        },
        409
      );
    }

    const now = new Date().toISOString();
    await db
      .prepare(`
        UPDATE bulletins_soins
        SET status = 'rejected',
            rejection_reason = ?,
            validated_at = ?,
            validated_by = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(notes, now, user.id, now, bulletinId)
      .run();

    return c.json({
      success: true,
      data: { id: bulletinId, status: 'rejected', notes },
    });
  } catch (error) {
    console.error('Error rejecting bulletin:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return c.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Erreur lors du rejet', details: errMsg } },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/:id/upload-scan - Upload a scan for a bulletin
 */
bulletinsAgent.post('/:id/upload-scan', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  try {
    // Verify bulletin ownership
    const bulletin = await db
      .prepare('SELECT id FROM bulletins_soins WHERE id = ? AND created_by = ?')
      .bind(bulletinId, user.id)
      .first();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    // Parse multipart form data
    const formData = await c.req.parseBody();
    const file = formData['scan'] as File | undefined;

    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Fichier scan requis' },
        },
        400
      );
    }

    // Validate MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Type de fichier non supporte. Formats acceptes : JPEG, PNG, PDF',
          },
        },
        400
      );
    }

    // Validate file size (10 MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json(
        {
          success: false,
          error: { code: 'FILE_TOO_LARGE', message: 'Le fichier ne doit pas depasser 10 Mo' },
        },
        400
      );
    }

    // Upload to R2
    const r2Key = `bulletins/${bulletinId}/${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    await storage.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: user.id, bulletinId },
    });

    const scanUrl = `https://dhamen-files.r2.cloudflarestorage.com/${r2Key}`;

    // Update bulletin with scan info
    await db
      .prepare(`
      UPDATE bulletins_soins
      SET scan_url = ?, scan_filename = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(scanUrl, file.name, bulletinId)
      .run();

    // Audit log
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'scan_uploaded', 'bulletins_soins', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        bulletinId,
        JSON.stringify({ filename: file.name, size: file.size, mime_type: file.type }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    return c.json({
      success: true,
      data: { scan_url: scanUrl, scan_filename: file.name },
    });
  } catch (error) {
    console.error('Error uploading scan:', error);
    return c.json(
      {
        success: false,
        error: { code: 'STORAGE_ERROR', message: "Erreur lors de l'upload du scan" },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent/:id/scan - Download the scan attached to a bulletin
 */
bulletinsAgent.get('/:id/scan', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  try {
    const query = user.role === 'INSURER_ADMIN' || user.role === 'ADMIN'
      ? db.prepare('SELECT scan_url, scan_filename FROM bulletins_soins WHERE id = ?').bind(bulletinId)
      : db.prepare('SELECT scan_url, scan_filename FROM bulletins_soins WHERE id = ? AND created_by = ?').bind(bulletinId, user.id);
    const bulletin = await query.first<{ scan_url: string | null; scan_filename: string | null }>();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    if (!bulletin.scan_url) {
      return c.json(
        {
          success: false,
          error: { code: 'SCAN_NOT_FOUND', message: 'Aucun scan attache a ce bulletin' },
        },
        404
      );
    }

    // Extract R2 key from URL
    const R2_URL_PREFIX = 'https://dhamen-files.r2.cloudflarestorage.com/';
    const r2Key = bulletin.scan_url.startsWith(R2_URL_PREFIX)
      ? bulletin.scan_url.slice(R2_URL_PREFIX.length)
      : bulletin.scan_url;

    const object = await storage.get(r2Key);

    if (!object) {
      return c.json(
        {
          success: false,
          error: { code: 'STORAGE_ERROR', message: 'Fichier introuvable dans le stockage' },
        },
        500
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `inline; filename="${bulletin.scan_filename || 'scan'}"`);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error downloading scan:', error);
    return c.json(
      {
        success: false,
        error: { code: 'STORAGE_ERROR', message: 'Erreur lors du chargement du scan' },
      },
      500
    );
  }
});

export { bulletinsAgent };
