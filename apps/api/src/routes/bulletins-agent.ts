import { z } from 'zod';
import { findActeRefByCode, findActeRefByCodeWithCoefficient, listActesGroupesParFamille, listActesReferentiel } from '@dhamen/db';
// findActeRefByCode kept for acte_ref_id-based lookups in batch resolution
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
  CalculBatchContext,
} from '../services/remboursement.service';
import type { Bindings, Variables } from '../types';
import { unzipSync } from 'fflate';
import { processOcrBulletin } from '../queue/bulletin-validation.queue';

const bulletinsAgent = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
bulletinsAgent.use('*', authMiddleware());

// ---------------------------------------------------------------------------
// Mapping care_type → famille_acte_id for plafond initialization
// ---------------------------------------------------------------------------
const CARE_TYPE_TO_FAMILLE: Record<string, string> = {
  consultation_visite: 'fa-001',
  actes_courants: 'fa-009',
  pharmacie: 'fa-003',
  laboratoire: 'fa-004',
  orthopedie: 'fa-005',
  optique: 'fa-006',
  hospitalisation: 'fa-007',
  chirurgie: 'fa-010',
  dentaire: 'fa-011',
  accouchement: 'fa-012',
  cures_thermales: 'fa-013',
  frais_funeraires: 'fa-014',
  circoncision: 'fa-015',
  transport: 'fa-016',
  chirurgie_refractive: 'fa-006', // linked to optique family
  sanatorium: 'fa-013',
  interruption_grossesse: 'fa-012',
};

// Default acte codes for care_types when no code is provided or code is not found (e.g., medication code_amm)
const CARE_TYPE_DEFAULT_CODE: Record<string, string> = {
  pharmacie: 'PH1', pharmacy: 'PH1',
  laboratoire: 'AN', laboratory: 'AN', lab: 'AN',
  optique: 'OPT', optical: 'OPT',
  chirurgie: 'KC', surgery: 'KC',
  dentaire: 'DC', dental: 'DC',
  actes_courants: 'AM', medical_acts: 'AM',
  hospitalisation: 'CL', hospitalization: 'CL', hospital: 'CL',
  hospitalisation_hopital: 'HP',
  accouchement: 'ACC', maternity: 'ACC',
  orthodontie: 'ODF', orthodontics: 'ODF',
  orthopedie: 'ORP', orthopedics: 'ORP',
  circoncision: 'CIR', circumcision: 'CIR',
  transport: 'TR',
  frais_funeraires: 'FF', funeral: 'FF',
  cures_thermales: 'CT', thermal_cure: 'CT',
  chirurgie_refractive: 'LASER', refractive_surgery: 'LASER',
  interruption_grossesse: 'IG',
  sanatorium: 'HP',
  consultation: 'C1',
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
    // Per-famille plafonds from guarantees (individual per member)
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

    // Global plafond — individual per member (principal AND ayants droit each get their own)
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
  { keywords: ['dentaire', 'dent', 'dentist', 'soin dentaire'], code: 'DC', label: 'Soins Dentaires' },
  { keywords: ['prothese dentaire', 'prothèse dentaire', 'couronne', 'bridge', 'implant'], code: 'DP', label: 'Prothèses Dentaires' },
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
// File hash duplicate check (pre-OCR, saves Gemini tokens)
// ---------------------------------------------------------------------------

/**
 * GET /bulletins-soins/agent/check-file-hash?hash=<sha256> - Check if a file was already analysed
 * Hash is computed client-side in the browser (no file upload needed = fast).
 * Should be called BEFORE sending to OCR to avoid wasting tokens.
 */
bulletinsAgent.get('/check-file-hash', async (c) => {
  const fileHash = c.req.query('hash')?.trim();
  if (!fileHash || fileHash.length !== 64) {
    return c.json({ success: true, data: { isDuplicate: false } });
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  // Check legacy file_hash, combined_hash, and new bulletin_files table
  const existing = await db
    .prepare(
      `SELECT id, bulletin_number, status, bulletin_date, adherent_first_name, adherent_last_name,
              care_type, total_amount, reimbursed_amount, created_at
       FROM bulletins_soins
       WHERE (file_hash = ? OR combined_hash = ?) AND status NOT IN ('deleted')
       UNION
       SELECT bs.id, bs.bulletin_number, bs.status, bs.bulletin_date, bs.adherent_first_name, bs.adherent_last_name,
              bs.care_type, bs.total_amount, bs.reimbursed_amount, bs.created_at
       FROM bulletin_files bf JOIN bulletins_soins bs ON bs.id = bf.bulletin_id
       WHERE bf.file_hash = ? AND bs.status NOT IN ('deleted')
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(fileHash, fileHash, fileHash)
    .first<{
      id: string; bulletin_number: string; status: string; bulletin_date: string;
      adherent_first_name: string; adherent_last_name: string;
      care_type: string; total_amount: number | null; reimbursed_amount: number | null;
      created_at: string;
    }>();

  if (existing) {
    return c.json({
      success: true,
      data: {
        isDuplicate: true,
        bulletin: {
          id: existing.id,
          bulletinNumber: existing.bulletin_number,
          status: existing.status,
          date: existing.bulletin_date,
          adherent: `${existing.adherent_first_name || ''} ${existing.adherent_last_name || ''}`.trim(),
          careType: existing.care_type,
          totalAmount: existing.total_amount,
          reimbursedAmount: existing.reimbursed_amount,
          createdAt: existing.created_at,
        },
      },
    });
  }

  return c.json({ success: true, data: { isDuplicate: false } });
});

/**
 * POST /bulletins-soins/agent/check-file-duplicate - Multi-level duplicate detection
 * Accepts JSON with pre-computed hashes (no file upload = fast).
 * Three detection levels:
 *   FILE_DUPLICATE   — an individual file hash already exists in bulletin_files or file_hash
 *   BULLETIN_EXACT   — combined_hash matches an existing bulletin exactly
 *   BULLETIN_OVERLAP — some files overlap with another bulletin's files
 */
bulletinsAgent.post('/check-file-duplicate', async (c) => {
  const user = c.get('user') as { id: string; role: string; insurerId?: string };
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  try {
    const body = await c.req.json<{
      fileHashes: { index: number; name: string; hash: string }[];
      combinedHash: string;
    }>();

    const { fileHashes, combinedHash } = body;

    if (!fileHashes || fileHashes.length === 0 || !combinedHash) {
      return c.json({ success: true, data: { duplicates: [], level: null } });
    }

    const db = c.get('tenantDb') ?? c.env.DB;
    const allIndividualHashes = fileHashes.map(f => f.hash);

    // --- Level 1: BULLETIN_EXACT — combined_hash matches exactly ---
    const exactMatch = await db
      .prepare(
        `SELECT id, bulletin_number, status, bulletin_date, adherent_first_name, adherent_last_name,
                care_type, total_amount, reimbursed_amount, created_at
         FROM bulletins_soins
         WHERE combined_hash = ? AND status NOT IN ('deleted')
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(combinedHash)
      .first<{
        id: string; bulletin_number: string; status: string; bulletin_date: string;
        adherent_first_name: string; adherent_last_name: string;
        care_type: string; total_amount: number | null; reimbursed_amount: number | null;
        created_at: string;
      }>();

    if (exactMatch) {
      return c.json({
        success: true,
        data: {
          level: 'BULLETIN_EXACT',
          isDuplicate: true,
          duplicates: [{
            level: 'BULLETIN_EXACT',
            bulletin: {
              id: exactMatch.id,
              bulletinNumber: exactMatch.bulletin_number,
              status: exactMatch.status,
              date: exactMatch.bulletin_date,
              adherent: `${exactMatch.adherent_first_name || ''} ${exactMatch.adherent_last_name || ''}`.trim(),
              careType: exactMatch.care_type,
              totalAmount: exactMatch.total_amount,
              reimbursedAmount: exactMatch.reimbursed_amount,
              createdAt: exactMatch.created_at,
            },
          }],
          files: fileHashes.map(f => ({
            ...f,
            isDuplicate: true,
            level: 'BULLETIN_EXACT' as const,
            bulletin: {
              id: exactMatch.id,
              bulletinNumber: exactMatch.bulletin_number,
              status: exactMatch.status,
              date: exactMatch.bulletin_date,
              adherent: `${exactMatch.adherent_first_name || ''} ${exactMatch.adherent_last_name || ''}`.trim(),
              careType: exactMatch.care_type,
              totalAmount: exactMatch.total_amount,
              reimbursedAmount: exactMatch.reimbursed_amount,
              createdAt: exactMatch.created_at,
            },
          })),
        },
      });
    }

    // --- Level 2: FILE_DUPLICATE — check individual file hashes ---
    // Check both bulletin_files table (new) and legacy file_hash column
    const allHashes = new Set([...allIndividualHashes, combinedHash]);
    const placeholders = [...allHashes].map(() => '?').join(',');

    // Query new bulletin_files table + legacy file_hash in parallel
    const [bfResults, legacyResults] = await Promise.all([
      db.prepare(
        `SELECT bf.file_hash, bf.bulletin_id, bs.bulletin_number, bs.status, bs.bulletin_date,
                bs.adherent_first_name, bs.adherent_last_name, bs.care_type,
                bs.total_amount, bs.reimbursed_amount, bs.created_at
         FROM bulletin_files bf
         JOIN bulletins_soins bs ON bs.id = bf.bulletin_id
         WHERE bf.file_hash IN (${placeholders}) AND bs.status NOT IN ('deleted')
         ORDER BY bs.created_at DESC`
      ).bind(...allHashes).all<{
        file_hash: string; bulletin_id: string; bulletin_number: string; status: string;
        bulletin_date: string; adherent_first_name: string; adherent_last_name: string;
        care_type: string; total_amount: number | null; reimbursed_amount: number | null;
        created_at: string;
      }>().catch(() => ({ results: [] as any[] })),
      db.prepare(
        `SELECT id, bulletin_number, status, bulletin_date, adherent_first_name, adherent_last_name,
                care_type, total_amount, reimbursed_amount, file_hash, created_at
         FROM bulletins_soins
         WHERE file_hash IN (${placeholders}) AND status NOT IN ('deleted')
         ORDER BY created_at DESC`
      ).bind(...allHashes).all<{
        id: string; bulletin_number: string; status: string; bulletin_date: string;
        adherent_first_name: string; adherent_last_name: string;
        care_type: string; total_amount: number | null; reimbursed_amount: number | null;
        file_hash: string; created_at: string;
      }>(),
    ]);

    // Merge results: hash → bulletin info
    const hashToBulletin = new Map<string, {
      id: string; bulletinNumber: string; status: string; date: string;
      adherent: string; careType: string; totalAmount: number | null;
      reimbursedAmount: number | null; createdAt: string;
    }>();

    for (const r of (bfResults.results || [])) {
      if (!hashToBulletin.has(r.file_hash)) {
        hashToBulletin.set(r.file_hash, {
          id: r.bulletin_id, bulletinNumber: r.bulletin_number, status: r.status,
          date: r.bulletin_date,
          adherent: `${r.adherent_first_name || ''} ${r.adherent_last_name || ''}`.trim(),
          careType: r.care_type, totalAmount: r.total_amount,
          reimbursedAmount: r.reimbursed_amount, createdAt: r.created_at,
        });
      }
    }
    for (const r of (legacyResults.results || [])) {
      if (r.file_hash && !hashToBulletin.has(r.file_hash)) {
        hashToBulletin.set(r.file_hash, {
          id: r.id, bulletinNumber: r.bulletin_number, status: r.status,
          date: r.bulletin_date,
          adherent: `${r.adherent_first_name || ''} ${r.adherent_last_name || ''}`.trim(),
          careType: r.care_type, totalAmount: r.total_amount,
          reimbursedAmount: r.reimbursed_amount, createdAt: r.created_at,
        });
      }
    }

    // Build per-file response
    const filesResponse = fileHashes.map(f => {
      const match = hashToBulletin.get(f.hash);
      return {
        index: f.index,
        name: f.name,
        hash: f.hash,
        isDuplicate: !!match,
        level: match ? 'FILE_DUPLICATE' as const : null,
        bulletin: match || null,
      };
    });

    const duplicateFiles = filesResponse.filter(f => f.isDuplicate);
    const allDuplicate = duplicateFiles.length === fileHashes.length;
    const someDuplicate = duplicateFiles.length > 0;

    // Determine highest level
    const level = allDuplicate ? 'BULLETIN_OVERLAP' : someDuplicate ? 'FILE_DUPLICATE' : null;

    return c.json({
      success: true,
      data: {
        level,
        isDuplicate: someDuplicate,
        duplicates: duplicateFiles.map(f => ({ level: 'FILE_DUPLICATE', bulletin: f.bulletin })),
        files: filesResponse,
      },
    });
  } catch (error) {
    console.error('[check-file-duplicate] Error:', error);
    return c.json({ success: true, data: { isDuplicate: false, level: null, duplicates: [], files: [] } });
  }
});

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
    const forceReanalyse = c.req.query('force') === 'true';

    // --- File hash deduplication: check BEFORE calling OCR to save tokens ---
    const fileList: File[] = [];
    if (Array.isArray(files)) {
      for (const f of files) { if (f instanceof File) fileList.push(f); }
    } else if (files instanceof File) {
      fileList.push(files);
    }

    // Compute SHA-256 hash — single file = direct hash, multiple = hash each, sort, combine
    let fileHash: string | null = null;
    if (fileList.length === 1) {
      const buf = await fileList[0]!.arrayBuffer();
      const h = await crypto.subtle.digest('SHA-256', buf);
      fileHash = Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
    } else if (fileList.length > 1) {
      const perFileHashes: string[] = [];
      for (const f of fileList) {
        const buf = await f.arrayBuffer();
        const h = await crypto.subtle.digest('SHA-256', buf);
        perFileHashes.push(Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''));
      }
      perFileHashes.sort();
      const combined = new TextEncoder().encode(perFileHashes.join(''));
      const finalHash = await crypto.subtle.digest('SHA-256', combined);
      fileHash = Array.from(new Uint8Array(finalHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Check if this exact file was already analysed (legacy file_hash + new combined_hash + bulletin_files)
    const db = c.get('tenantDb') ?? c.env.DB;
    if (fileHash && !forceReanalyse) {
      const existing = await db
        .prepare(
          `SELECT id, bulletin_number, status, bulletin_date, adherent_first_name, adherent_last_name,
                  care_type, total_amount, reimbursed_amount, created_at
           FROM bulletins_soins
           WHERE (file_hash = ? OR combined_hash = ?) AND status NOT IN ('deleted')
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(fileHash, fileHash)
        .first<{
          id: string; bulletin_number: string; status: string; bulletin_date: string;
          adherent_first_name: string; adherent_last_name: string;
          care_type: string; total_amount: number | null; reimbursed_amount: number | null;
          created_at: string;
        }>();

      if (existing) {
        console.log(`[analyse-bulletin] Duplicate file detected (hash=${fileHash.slice(0, 12)}…), bulletin=${existing.id}`);
        return c.json({
          success: true,
          data: {
            _file_already_analysed: {
              message: `Ce document a déjà été analysé et enregistré comme bulletin N° ${existing.bulletin_number}.`,
              bulletinId: existing.id,
              bulletinNumber: existing.bulletin_number,
              status: existing.status,
              date: existing.bulletin_date,
              adherent: `${existing.adherent_first_name || ''} ${existing.adherent_last_name || ''}`.trim(),
              careType: existing.care_type,
              totalAmount: existing.total_amount,
              reimbursedAmount: existing.reimbursed_amount,
              createdAt: existing.created_at,
              fileHash,
            },
          },
        });
      }
    }

    // Build proxy form for OCR service
    const proxyForm = new FormData();
    for (const file of fileList) {
      proxyForm.append('files', file);
    }

    let ocrRes: Response;
    console.log(`[analyse-bulletin] OCR_SERVICE binding available: ${!!c.env.OCR_SERVICE}`);
    if (c.env.OCR_SERVICE) {
      ocrRes = await c.env.OCR_SERVICE.fetch('https://ocr-service/analyse-bulletin', {
        method: 'POST',
        body: proxyForm,
      });
    } else {
      const ocrUrl = c.env.OCR_URL || "https://ocr-api-bh-assurance-staging.yassine-techini.workers.dev/analyse-bulletin";
      ocrRes = await fetch(ocrUrl, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: proxyForm,
      });
    }

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

    // Check for duplicate bulletin by numero_bulletin
    const numeroBulletin = parsed?.numero_bulletin
      || parsed?.infos_adherent?.numero_bulletin
      || null;

    if (numeroBulletin) {
      const companyId = c.req.query('companyId') || null;
      let duplicateQuery = `SELECT id, status, bulletin_date, adherent_first_name, adherent_last_name, reimbursed_amount
        FROM bulletins_soins WHERE bulletin_number = ? AND status NOT IN ('draft', 'in_batch')`;
      const duplicateParams: string[] = [String(numeroBulletin)];

      if (companyId) {
        duplicateQuery += ' AND company_id = ?';
        duplicateParams.push(companyId);
      }
      duplicateQuery += ' LIMIT 1';

      const existing = await db.prepare(duplicateQuery).bind(...duplicateParams)
        .first<{ id: string; status: string; bulletin_date: string; adherent_first_name: string; adherent_last_name: string; reimbursed_amount: number | null }>();

      if (existing) {
        parsed._duplicate_warning = {
          message: `Ce bulletin N° ${numeroBulletin} a déjà été traité (${existing.adherent_first_name} ${existing.adherent_last_name}, ${existing.bulletin_date}).`,
          existing_id: existing.id,
          existing_status: existing.status,
          existing_date: existing.bulletin_date,
          existing_reimbursed: existing.reimbursed_amount,
        };
      }
    }

    // Attach file hash to response so frontend can store it when creating the bulletin
    if (fileHash) {
      parsed._file_hash = fileHash;
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
      b.name as batch_name,
      (SELECT COUNT(*) FROM actes_bulletin ab WHERE ab.bulletin_id = bs.id) as actes_count,
      (SELECT COUNT(*) FROM actes_bulletin ab WHERE ab.bulletin_id = bs.id AND (ab.ref_prof_sant IS NULL OR ab.ref_prof_sant = '' OR LENGTH(ab.ref_prof_sant) < 7)) as mf_missing_count
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

// ---------------------------------------------------------------------------
// POST /analyse-bulk — Upload ZIP(s), decompress, store in R2, enqueue OCR
// Must be defined BEFORE /:id routes to avoid route conflicts
// ---------------------------------------------------------------------------

bulletinsAgent.post('/analyse-bulk', async (c) => {
  try {
    const user = c.get('user');
    const db = c.get('tenantDb') ?? c.env.DB;

    console.log('[analyse-bulk] Start');
    const formData = await c.req.formData();
    console.log('[analyse-bulk] FormData parsed');

    const companyIdBody = formData.get('companyId') as string | null;
    const batchIdBody = formData.get('batchId') as string | null;
    const effectiveCompanyId = companyIdBody || c.req.query('companyId') || '';
    const effectiveBatchId = batchIdBody || c.req.query('batchId') || null;

    if (!effectiveCompanyId) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'companyId requis' } }, 400);
    }

    const files = formData.getAll('files') as File[];
    if (!files.length) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Aucun fichier fourni' } }, 400);
    }

    // Parse optional folder grouping metadata: { "groupName": ["file1.jpg", "file2.jpg"], ... }
    // Allows folder imports to use the same queue-based processing as ZIP imports
    const fileGroupMapping = new Map<string, string>();
    const groupingRaw = formData.get('grouping') as string | null;
    if (groupingRaw) {
      try {
        const grouping = JSON.parse(groupingRaw) as Record<string, string[]>;
        for (const [groupName, fileNames] of Object.entries(grouping)) {
          for (const fn of fileNames) {
            fileGroupMapping.set(fn, groupName);
          }
        }
        console.log(`[analyse-bulk] Folder grouping: ${Object.keys(grouping).length} group(s) from metadata`);
      } catch { console.warn('[analyse-bulk] Invalid grouping JSON, ignoring'); }
    }

    console.log(`[analyse-bulk] ${files.length} file(s), first: ${files[0]?.name} (${files[0]?.size} bytes)`);

    const ocrJobId = generateId();
    const now = new Date().toISOString();
    const tenantCode = c.req.header('x-tenant-code') || '';
    const dbBinding = tenantCode ? `DB_${tenantCode.toUpperCase()}` : 'DB';

    // Group files into bulletins
    const bulletinGroups: Map<string, { bulletinId: string; files: { name: string; data: Uint8Array; type: string }[] }> = new Map();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
      pdf: 'application/pdf', tif: 'image/tiff', tiff: 'image/tiff',
    };

    for (const file of files) {
      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';

      if (isZip) {
        console.log(`[analyse-bulk] Decompressing ZIP: ${file.name}`);
        const arrayBuffer = await file.arrayBuffer();
        let entries: Record<string, Uint8Array>;
        try {
          entries = unzipSync(new Uint8Array(arrayBuffer));
        } catch (err) {
          return c.json({
            success: false,
            error: { code: 'ZIP_ERROR', message: `Erreur décompression ZIP "${file.name}": ${err instanceof Error ? err.message : 'inconnu'}` },
          }, 400);
        }

        console.log(`[analyse-bulk] ZIP decompressed: ${Object.keys(entries).length} entries`);

        // Collect all valid entries first
        const validEntries: { path: string; data: Uint8Array }[] = [];
        for (const [entryPath, entryData] of Object.entries(entries)) {
          if (entryPath.endsWith('/') || entryPath.startsWith('__MACOSX') || entryPath.startsWith('.')) continue;
          if (entryData.length === 0) continue;
          validEntries.push({ path: entryPath, data: entryData });
        }

        // Detect grouping level:
        // If all files share the same top-level folder, use the 2nd-level folder as group key
        // e.g. Bulletin/dossier1/page.jpg → group by "dossier1"
        // If files are in distinct top-level folders, group by top-level
        // e.g. dossier1/page.jpg, dossier2/page.jpg → group by "dossier1", "dossier2"
        const topLevelFolders = new Set<string>();
        for (const e of validEntries) {
          const parts = e.path.split('/').filter(Boolean);
          if (parts.length >= 2) topLevelFolders.add(parts[0]!);
        }
        // If there's only 1 top-level folder and files have 3+ depth, use 2nd level
        const useSecondLevel = topLevelFolders.size === 1 &&
          validEntries.some(e => e.path.split('/').filter(Boolean).length >= 3);

        console.log(`[analyse-bulk] ZIP grouping: ${topLevelFolders.size} top-level folder(s), useSecondLevel=${useSecondLevel}`);

        for (const { path: entryPath, data: entryData } of validEntries) {
          const parts = entryPath.split('/').filter(Boolean);

          let groupKey: string;
          if (useSecondLevel && parts.length >= 3) {
            // e.g. "RootFolder/dossier1/page.jpg" → group by "dossier1"
            groupKey = parts[1]!;
          } else if (parts.length >= 2) {
            groupKey = parts[useSecondLevel ? 1 : 0]!;
          } else {
            // Single files at root — each file is its own bulletin
            groupKey = `__file_${parts[0] || file.name}`;
          }

          if (!bulletinGroups.has(groupKey)) {
            bulletinGroups.set(groupKey, { bulletinId: generateId(), files: [] });
          }

          const fileName = parts[parts.length - 1]!;
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const type = mimeTypes[ext] || 'application/octet-stream';
          bulletinGroups.get(groupKey)!.files.push({ name: fileName, data: entryData, type });
        }
      } else {
        // Non-ZIP files: group by 'grouping' metadata if provided, else single group
        const data = new Uint8Array(await file.arrayBuffer());
        const groupKey = fileGroupMapping.get(file.name) || '__direct_files';
        if (!bulletinGroups.has(groupKey)) {
          bulletinGroups.set(groupKey, { bulletinId: generateId(), files: [] });
        }
        bulletinGroups.get(groupKey)!.files.push({ name: file.name, data, type: file.type });
      }
    }

    if (bulletinGroups.size === 0) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Aucun fichier exploitable trouvé' } }, 400);
    }

    console.log(`[analyse-bulk] ${bulletinGroups.size} bulletin group(s) detected`);

    // Create OCR job record
    const totalFiles = Array.from(bulletinGroups.values()).reduce((sum, g) => sum + g.files.length, 0);
    await db.prepare(
      `INSERT INTO bulletin_ocr_jobs (id, company_id, batch_id, status, total_files, total_bulletins_extracted, bulletins_ready, bulletins_pending, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'processing_ocr', ?, ?, 0, 0, ?, ?, ?)`
    ).bind(ocrJobId, effectiveCompanyId, effectiveBatchId, totalFiles, bulletinGroups.size, user.id, now, now).run();

    console.log(`[analyse-bulk] OCR job created: ${ocrJobId}`);

    // Upload ALL files to R2 in parallel (all bulletins at once)
    const allR2Uploads: Promise<{ bulletinId: string; r2Key: string }>[] = [];
    for (const [, group] of bulletinGroups) {
      for (const f of group.files) {
        const r2Key = `ocr-jobs/${ocrJobId}/${group.bulletinId}/${f.name}`;
        allR2Uploads.push(
          c.env.STORAGE.put(r2Key, f.data, { httpMetadata: { contentType: f.type } })
            .then(() => ({ bulletinId: group.bulletinId, r2Key }))
        );
      }
    }
    const uploadResults = await Promise.all(allR2Uploads);
    console.log(`[analyse-bulk] ${uploadResults.length} files uploaded to R2`);

    // Group R2 keys back by bulletinId and enqueue all in parallel
    const r2KeysByBulletin = new Map<string, string[]>();
    for (const { bulletinId, r2Key } of uploadResults) {
      if (!r2KeysByBulletin.has(bulletinId)) r2KeysByBulletin.set(bulletinId, []);
      r2KeysByBulletin.get(bulletinId)!.push(r2Key);
    }

    const bulletinIds: string[] = [];
    const ocrMessages: import('../queue/bulletin-validation.types').OcrAnalyseMessage[] = [];
    for (const [, group] of bulletinGroups) {
      const r2FileKeys = r2KeysByBulletin.get(group.bulletinId) || [];
      ocrMessages.push({
        type: 'OCR_ANALYSE_BULLETIN',
        bulletinId: group.bulletinId,
        dbBinding,
        userId: user.id,
        companyId: effectiveCompanyId,
        batchId: effectiveBatchId,
        ocrJobId,
        r2FileKeys,
      });
      bulletinIds.push(group.bulletinId);
    }

    // Use the already-resolved tenant DB reference directly (set by tenant middleware)
    // db is a D1Database reference that survives in closures
    const envSnapshot = c.env;

    // Create all bulletin shells NOW (before waitUntil) so they exist in DB immediately
    for (const msg of ocrMessages) {
      try {
        const shellNow = new Date().toISOString();
        await db.prepare(
            `INSERT OR IGNORE INTO bulletins_soins
             (id, adherent_id, bulletin_number, bulletin_date, submission_date,
              company_id, status, source,
              validation_status, ocr_job_id, created_by, created_at, updated_at)
             VALUES (?, '__OCR_PENDING__', ?, ?, ?, ?, 'draft', 'ocr_bulk', 'pending_ocr', ?, ?, ?, ?)`
          ).bind(msg.bulletinId, `OCR-${msg.bulletinId}`, shellNow, shellNow, effectiveCompanyId, ocrJobId, user.id, shellNow, shellNow).run();
        console.log(`[analyse-bulk] Shell created: ${msg.bulletinId}`);
        if (effectiveBatchId) {
          await db.prepare(
            'UPDATE bulletins_soins SET batch_id = ? WHERE id = ?'
          ).bind(effectiveBatchId, msg.bulletinId).run();
        }
      } catch (shellErr) {
        console.error(`[analyse-bulk] Shell creation error for ${msg.bulletinId}:`, shellErr instanceof Error ? shellErr.message : shellErr);
      }
    }

    // Process each bulletin OCR in parallel via waitUntil (non-blocking)
    c.executionCtx.waitUntil(
      (async () => {
        console.log(`[analyse-bulk/waitUntil] Starting OCR for ${ocrMessages.length} bulletins`);
        const results = await Promise.allSettled(
          ocrMessages.map(async (msg) => {
            try {
              console.log(`[analyse-bulk/waitUntil] OCR start: ${msg.bulletinId}`);
              await processOcrBulletin(envSnapshot, db, msg);
              console.log(`[analyse-bulk/waitUntil] OCR done: ${msg.bulletinId}`);
            } catch (err) {
              console.error(`[analyse-bulk/waitUntil] OCR error ${msg.bulletinId}:`, err instanceof Error ? err.message : err);
              const ts = new Date().toISOString();
              try {
                await db.prepare(
                  `UPDATE bulletins_soins SET validation_status = 'pending_correction',
                   validation_errors = ?, updated_at = ? WHERE id = ?`
                ).bind(JSON.stringify([{ field: 'ocr', code: 'OCR_FAILED', message: err instanceof Error ? err.message : 'Erreur OCR' }]), ts, msg.bulletinId).run();
                await db.prepare(
                  `UPDATE bulletin_ocr_jobs SET bulletins_pending = bulletins_pending + 1, updated_at = ? WHERE id = ?`
                ).bind(ts, ocrJobId).run();
              } catch (_e) { /* ignore */ }
            }
          })
        );

        // Mark job as completed
        const ts = new Date().toISOString();
        await db.prepare(
          `UPDATE bulletin_ocr_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`
        ).bind(ts, ts, ocrJobId).run();
        console.log(`[analyse-bulk/waitUntil] All ${ocrMessages.length} done (${results.filter(r => r.status === 'fulfilled').length} ok)`);
      })()
    );

    console.log(`[analyse-bulk] Done. ${bulletinIds.length} bulletins processing in background`);

    await logAudit(c, {
      action: 'BULK_OCR_UPLOAD',
      entityType: 'bulletin_ocr_job',
      entityId: ocrJobId,
      details: { totalFiles, totalBulletins: bulletinGroups.size, bulletinIds },
    });

    return c.json({
      success: true,
      data: { jobId: ocrJobId, totalFiles, totalExtracted: bulletinGroups.size, bulletinIds },
    });
  } catch (err) {
    console.error('[analyse-bulk] Error:', err);
    return c.json({
      success: false,
      error: { code: 'BULK_ANALYSIS_ERROR', message: err instanceof Error ? err.message : 'Erreur interne analyse en masse' },
    }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /ocr-jobs — List OCR jobs (before /ocr-jobs/:id to avoid route conflict)
// ---------------------------------------------------------------------------

bulletinsAgent.get('/ocr-jobs', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;
  const companyId = c.req.query('companyId');
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const binds: string[] = [];
  if (companyId) {
    whereClause += ' AND company_id = ?';
    binds.push(companyId);
  }

  const countRow = await db.prepare(
    `SELECT COUNT(*) as total FROM bulletin_ocr_jobs ${whereClause}`
  ).bind(...binds).first<{ total: number }>();
  const total = countRow?.total || 0;

  const { results } = await db.prepare(
    `SELECT * FROM bulletin_ocr_jobs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  return c.json({
    success: true,
    data: results || [],
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ---------------------------------------------------------------------------
// POST /ocr-jobs/:id/retry — Re-enqueue all bulletins for an OCR job
// ---------------------------------------------------------------------------

bulletinsAgent.post('/ocr-jobs/:id/retry', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;
  const user = c.get('user');
  const jobId = c.req.param('id');

  const job = await db.prepare(
    `SELECT * FROM bulletin_ocr_jobs WHERE id = ?`
  ).bind(jobId).first<Record<string, unknown>>();

  if (!job) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Job OCR introuvable' } }, 404);
  }

  const tenantCode = c.req.header('x-tenant-code') || '';
  const dbBinding = tenantCode ? `DB_${tenantCode.toUpperCase()}` : 'DB';
  const now = new Date().toISOString();

  // List R2 files for this job to rebuild bulletin groups
  const prefix = `ocr-jobs/${jobId}/`;
  const r2List = await c.env.STORAGE.list({ prefix });

  if (!r2List.objects.length) {
    return c.json({ success: false, error: { code: 'NO_FILES', message: 'Aucun fichier R2 trouvé pour ce job' } }, 404);
  }

  // Group R2 keys by bulletinId (second path segment)
  const bulletinGroups = new Map<string, string[]>();
  for (const obj of r2List.objects) {
    const parts = obj.key.replace(prefix, '').split('/');
    const bulletinId = parts[0]!;
    if (!bulletinGroups.has(bulletinId)) {
      bulletinGroups.set(bulletinId, []);
    }
    bulletinGroups.get(bulletinId)!.push(obj.key);
  }

  // Delete existing bulletin records for this job (clean slate)
  await db.batch([
    db.prepare('PRAGMA foreign_keys = OFF'),
    db.prepare(`DELETE FROM actes_bulletin WHERE bulletin_id IN (SELECT id FROM bulletins_soins WHERE ocr_job_id = ?)`).bind(jobId),
    db.prepare(`DELETE FROM bulletins_soins WHERE ocr_job_id = ?`).bind(jobId),
    db.prepare('PRAGMA foreign_keys = ON'),
  ]);

  // Reset job counters
  await db.prepare(
    `UPDATE bulletin_ocr_jobs SET status = 'processing_ocr', bulletins_ready = 0, bulletins_pending = 0,
     total_bulletins_extracted = ?, error_message = NULL, updated_at = ? WHERE id = ?`
  ).bind(bulletinGroups.size, now, jobId).run();

  // Build OCR messages
  const bulletinIds: string[] = [];
  const ocrMessages: import('../queue/bulletin-validation.types').OcrAnalyseMessage[] = [];
  for (const [bulletinId, r2FileKeys] of bulletinGroups) {
    ocrMessages.push({
      type: 'OCR_ANALYSE_BULLETIN',
      bulletinId,
      dbBinding,
      userId: user.id,
      companyId: String(job.company_id || ''),
      batchId: job.batch_id as string | null,
      ocrJobId: jobId,
      r2FileKeys,
    });
    bulletinIds.push(bulletinId);
  }

  // Process in background via waitUntil (parallel)
  c.executionCtx.waitUntil(
    (async () => {
      await Promise.allSettled(
        ocrMessages.map(async (msg) => {
          try {
            await processOcrBulletin(c.env, db, msg);
          } catch (err) {
            console.error(`[retry] OCR error for ${msg.bulletinId}:`, err);
            const ts = new Date().toISOString();
            try { await db.prepare(`UPDATE bulletin_ocr_jobs SET bulletins_pending = bulletins_pending + 1, updated_at = ? WHERE id = ?`).bind(ts, jobId).run(); } catch (_e) {}
          }
        })
      );
      const ts = new Date().toISOString();
      await db.prepare(`UPDATE bulletin_ocr_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`).bind(ts, ts, jobId).run();
    })()
  );

  logAudit(db, {
    userId: user.id,
    action: 'ocr_job.retry',
    entityType: 'ocr_job',
    entityId: jobId,
    changes: { totalBulletins: bulletinGroups.size, bulletinIds },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return c.json({
    success: true,
    data: { jobId, totalBulletins: bulletinGroups.size, bulletinIds },
  });
});

// ---------------------------------------------------------------------------
// GET /ocr-jobs/:id — Get OCR job status + bulletins
// ---------------------------------------------------------------------------

bulletinsAgent.get('/ocr-jobs/:id', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;
  const jobId = c.req.param('id');

  const job = await db.prepare(
    `SELECT * FROM bulletin_ocr_jobs WHERE id = ?`
  ).bind(jobId).first();

  if (!job) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Job OCR introuvable' } }, 404);
  }

  const { results: bulletins } = await db.prepare(
    `SELECT bs.id, bs.adherent_matricule, bs.adherent_first_name, bs.adherent_last_name,
            bs.bulletin_date, bs.bulletin_number, bs.beneficiary_name, bs.beneficiary_relationship,
            bs.status, bs.validation_status, bs.validation_errors, bs.validation_attempts,
            bs.total_amount, bs.company_id, bs.ocr_job_id, bs.created_at
     FROM bulletins_soins bs WHERE bs.ocr_job_id = ? ORDER BY bs.created_at ASC`
  ).bind(jobId).all();

  const bulletinsWithActes = await Promise.all(
    (bulletins || []).map(async (b: Record<string, unknown>) => {
      const { results: actes } = await db.prepare(
        `SELECT id, code, label, amount, ref_prof_sant, nom_prof_sant, care_type FROM actes_bulletin WHERE bulletin_id = ?`
      ).bind(b.id).all();
      return { ...b, actes: actes || [] };
    })
  );

  return c.json({ success: true, data: { job, bulletins: bulletinsWithActes } });
});

// ---------------------------------------------------------------------------
// GET /pending-corrections — List bulletins needing correction
// ---------------------------------------------------------------------------

bulletinsAgent.get('/pending-corrections', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;
  const companyId = c.req.query('companyId');
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  let whereClause = `WHERE bs.validation_status = 'pending_correction' AND bs.source = 'ocr_bulk'`;
  const binds: string[] = [];
  if (companyId) {
    whereClause += ' AND bs.company_id = ?';
    binds.push(companyId);
  }

  const countRow = await db.prepare(
    `SELECT COUNT(*) as total FROM bulletins_soins bs ${whereClause}`
  ).bind(...binds).first<{ total: number }>();
  const total = countRow?.total || 0;

  const { results } = await db.prepare(
    `SELECT bs.id, bs.adherent_matricule, bs.adherent_first_name, bs.adherent_last_name,
            bs.bulletin_date, bs.bulletin_number, bs.beneficiary_name, bs.beneficiary_relationship,
            bs.status, bs.validation_status, bs.validation_errors, bs.validation_attempts,
            bs.total_amount, bs.company_id, bs.ocr_job_id, bs.created_at
     FROM bulletins_soins bs ${whereClause} ORDER BY bs.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  const bulletinsWithActes = await Promise.all(
    (results || []).map(async (b: Record<string, unknown>) => {
      const { results: actes } = await db.prepare(
        `SELECT id, code, label, amount, ref_prof_sant, nom_prof_sant, care_type FROM actes_bulletin WHERE bulletin_id = ?`
      ).bind(b.id).all();
      return { ...b, actes: actes || [] };
    })
  );

  return c.json({
    success: true,
    data: bulletinsWithActes,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
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
    // ADMIN can view any bulletin; agents see only their own
    const bulletinQuery = user.role === 'ADMIN'
      ? db.prepare('SELECT bs.*, b.name as batch_name FROM bulletins_soins bs LEFT JOIN bulletin_batches b ON bs.batch_id = b.id WHERE bs.id = ?').bind(bulletinId)
      : db.prepare('SELECT bs.*, b.name as batch_name FROM bulletins_soins bs LEFT JOIN bulletin_batches b ON bs.batch_id = b.id WHERE bs.id = ? AND bs.created_by = ?').bind(bulletinId, user.id);
    const bulletin = await bulletinQuery.first();

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

    // Fetch beneficiary plafond (use beneficiary_id if present, else adherent_id)
    const detailBeneficiaryId = (bulletin.beneficiary_id as string | null) || (bulletin.adherent_id as string | null);
    let plafondGlobal: number | null = null;
    let plafondConsomme: number | null = null;
    if (detailBeneficiaryId) {
      const adh = await db
        .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
        .bind(detailBeneficiaryId)
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

    // Fetch sub_items for all actes in this bulletin
    const acteList = actes.results || [];
    const acteIdList = acteList.map((a: Record<string, unknown>) => a.id as string);
    let subItemsMap: Record<string, Array<{ id: string; label: string; code: string | null; cotation: string | null; amount: number }>> = {};
    if (acteIdList.length > 0) {
      const placeholders = acteIdList.map(() => '?').join(',');
      const { results: subItems } = await db
        .prepare(`SELECT id, acte_id, label, code, cotation, amount FROM acte_sub_items WHERE acte_id IN (${placeholders}) ORDER BY created_at`)
        .bind(...acteIdList)
        .all();
      for (const si of subItems) {
        const aid = si.acte_id as string;
        if (!subItemsMap[aid]) subItemsMap[aid] = [];
        subItemsMap[aid].push({ id: si.id as string, label: si.label as string, code: si.code as string | null, cotation: si.cotation as string | null, amount: si.amount as number });
      }
    }

    // Fetch attached files
    const { results: files } = await db.prepare(
      `SELECT id, file_index, file_name, mime_type, file_size, created_at
       FROM bulletin_files WHERE bulletin_id = ? ORDER BY file_index`
    ).bind(bulletinId).all();

    return c.json({
      success: true,
      data: {
        ...bulletin,
        actes: acteList.map((a: Record<string, unknown>) => ({
          ...a,
          sub_items: subItemsMap[a.id as string] || [],
        })),
        files: files || [],
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

    // Delete sub_items → actes → bulletin (respecting FK order)
    await db.batch([
      db.prepare('DELETE FROM acte_sub_items WHERE acte_id IN (SELECT id FROM actes_bulletin WHERE bulletin_id = ?)').bind(bulletinId),
      db.prepare('DELETE FROM actes_bulletin WHERE bulletin_id = ?').bind(bulletinId),
      db.prepare('DELETE FROM bulletins_soins WHERE id = ?').bind(bulletinId),
    ]);

    logAudit(db, {
      userId: user.id,
      action: 'bulletin.delete',
      entityType: 'bulletin',
      entityId: bulletinId,
      changes: { previous_status: bulletin.status },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

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
 * POST /bulletins-soins/agent/:id/submit - Submit bulletin to validation
 * Changes status from draft/in_batch to paper_complete so it appears in validation page
 */
bulletinsAgent.post('/:id/submit', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' } }, 403);
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // ADMIN can submit any bulletin; agents can only submit their own
    const bulletinQuery = user.role === 'ADMIN'
      ? db.prepare('SELECT id, status, created_by FROM bulletins_soins WHERE id = ?').bind(bulletinId)
      : db.prepare('SELECT id, status, created_by FROM bulletins_soins WHERE id = ? AND created_by = ?').bind(bulletinId, user.id);
    const bulletin = await bulletinQuery.first<{ id: string; status: string; created_by: string }>();

    if (!bulletin) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé' } }, 404);
    }

    if (!['draft', 'in_batch'].includes(bulletin.status)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Impossible de soumettre un bulletin en statut "${bulletin.status}"` } }, 400);
    }

    // Check if all actes have MF — incomplete bulletins cannot be validated
    const actesWithoutMf = await db
      .prepare(`SELECT COUNT(*) as cnt FROM actes_bulletin WHERE bulletin_id = ? AND (ref_prof_sant IS NULL OR ref_prof_sant = '' OR LENGTH(ref_prof_sant) < 7)`)
      .bind(bulletinId)
      .first<{ cnt: number }>();
    if (actesWithoutMf && actesWithoutMf.cnt > 0) {
      return c.json({ success: false, error: { code: 'MF_INCOMPLETE', message: `Impossible de valider : ${actesWithoutMf.cnt} acte(s) sans matricule fiscale praticien. Veuillez compléter le bulletin avant de le soumettre.` } }, 400);
    }

    const now = new Date().toISOString();
    await db
      .prepare('UPDATE bulletins_soins SET status = ?, submission_date = ?, updated_at = ? WHERE id = ?')
      .bind('paper_complete', now, now, bulletinId)
      .run();

    await logAudit(db, {
      userId: user.id,
      action: 'bulletin.submit_validation',
      entityType: 'bulletin',
      entityId: bulletinId,
      changes: { previous_status: bulletin.status, new_status: 'paper_complete' },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return c.json({ success: true, data: { id: bulletinId, status: 'paper_complete' } });
  } catch (error) {
    console.error('Error submitting bulletin:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: `Erreur: ${msg}` } }, 500);
  }
});

/**
 * POST /bulletins-soins/agent/bulk-submit - Submit multiple bulletins to validation
 */
bulletinsAgent.post('/bulk-submit', async (c) => {
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
    const now = new Date().toISOString();

    // Check for bulletins with incomplete MF — exclude them from submission
    const incompleteBulletins = await db
      .prepare(`SELECT DISTINCT ab.bulletin_id FROM actes_bulletin ab WHERE ab.bulletin_id IN (${placeholders}) AND (ab.ref_prof_sant IS NULL OR ab.ref_prof_sant = '' OR LENGTH(ab.ref_prof_sant) < 7)`)
      .bind(...ids)
      .all<{ bulletin_id: string }>();
    const incompleteBulletinIds = new Set((incompleteBulletins.results || []).map((r) => r.bulletin_id));
    const validIds = ids.filter((id) => !incompleteBulletinIds.has(id));

    if (validIds.length === 0 && incompleteBulletinIds.size > 0) {
      return c.json({ success: false, error: { code: 'MF_INCOMPLETE', message: `Aucun bulletin ne peut être soumis : ${incompleteBulletinIds.size} bulletin(s) ont des actes sans matricule fiscale praticien.` } }, 400);
    }

    const validPlaceholders = validIds.map(() => '?').join(',');

    // ADMIN can submit any bulletin; agents can only submit their own
    const result = validIds.length > 0
      ? (user.role === 'ADMIN'
        ? await db.prepare(`UPDATE bulletins_soins SET status = 'paper_complete', submission_date = ?, updated_at = ? WHERE id IN (${validPlaceholders}) AND status IN ('draft', 'in_batch')`).bind(now, now, ...validIds).run()
        : await db.prepare(`UPDATE bulletins_soins SET status = 'paper_complete', submission_date = ?, updated_at = ? WHERE id IN (${validPlaceholders}) AND created_by = ? AND status IN ('draft', 'in_batch')`).bind(now, now, ...validIds, user.id).run())
      : { meta: { changes: 0 } };

    const submitted = result.meta?.changes ?? validIds.length;

    await logAudit(db, {
      userId: user.id,
      action: 'bulletin.bulk_submit_validation',
      entityType: 'bulletin',
      entityId: ids.join(','),
      changes: { count: submitted },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    const skipped = incompleteBulletinIds.size;
    return c.json({ success: true, data: { submitted, skipped, skippedReason: skipped > 0 ? `${skipped} bulletin(s) ignoré(s) : matricule fiscale praticien manquante` : undefined } });
  } catch (error) {
    console.error('Error bulk submitting:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: `Erreur: ${msg}` } }, 500);
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

    // Delete sub_items → actes → bulletins (respecting FK order)
    const batchResults = await db.batch([
      db.prepare(`DELETE FROM acte_sub_items WHERE acte_id IN (SELECT id FROM actes_bulletin WHERE bulletin_id IN (${placeholders}))`).bind(...ids),
      db.prepare(`DELETE FROM actes_bulletin WHERE bulletin_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM bulletins_soins WHERE id IN (${placeholders}) AND status != 'exported'`).bind(...ids),
    ]);

    const deletedCount = batchResults[2]?.meta?.changes ?? ids.length;

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
    // Delete sub_items → actes → bulletins (respecting FK order)
    await db.batch([
      db.prepare(`DELETE FROM acte_sub_items WHERE acte_id IN (SELECT id FROM actes_bulletin WHERE bulletin_id IN (SELECT id FROM bulletins_soins WHERE batch_id IN (${placeholders}) AND status != 'exported'))`).bind(...ids),
      db.prepare(`DELETE FROM actes_bulletin WHERE bulletin_id IN (SELECT id FROM bulletins_soins WHERE batch_id IN (${placeholders}) AND status != 'exported')`)  .bind(...ids),
      db.prepare(`DELETE FROM bulletins_soins WHERE batch_id IN (${placeholders}) AND status != 'exported'`).bind(...ids),
    ]);

    // Delete batches only if they have no remaining bulletins (exported ones block FK)
    await db
      .prepare(`DELETE FROM bulletin_batches WHERE id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM bulletins_soins WHERE batch_id = bulletin_batches.id)`)
      .bind(...ids)
      .run();

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
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: `Erreur lors de la suppression: ${msg}` } }, 500);
  }
});

/**
 * POST /bulletins-soins/agent/estimate - Estimate reimbursement without creating a bulletin
 */

// Schemas de validation
const estimateActeSchema = z.object({
  code: z.string().optional(),
  amount: z.number().nonnegative('Le montant doit être positif ou nul'),
  care_type: z.string().optional(),
  nbr_cle: z.number().nonnegative().optional(),
  nombre_jours: z.number().int().positive().optional(),
});

const estimateBodySchema = z.object({
  adherent_matricule: z.string().min(1, 'Matricule requis'),
  bulletin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format YYYY-MM-DD)'),
  actes: z.array(estimateActeSchema),
  company_id: z.string().optional(),
  type_maladie: z.enum(['ordinaire', 'chronique']).optional(),
  beneficiary_id: z.string().optional(),
  beneficiary_relationship: z.enum(['self', 'spouse', 'child', 'parent']).optional(),
});

type EstimateReason =
  | 'OK'
  | 'MISSING_CODE'
  | 'ACTE_NOT_FOUND'
  | 'NO_ACTIVE_CONTRACT'
  | 'CEILING_EXHAUSTED'
  | 'CALCULATION_ERROR'
  | 'FALLBACK_RATE_USED';

interface EstimateDetail {
  code: string | null;
  amount: number;
  reimbursed: number;
  reason: EstimateReason;
  message?: string;
  type?: string;
  valeur?: number;
  taux?: number;
  plafonds?: unknown;
  breakdown?: unknown;
  _debug?: unknown;
}

bulletinsAgent.post('/estimate', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } },
      403,
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;

  // Validation Zod
  let body: z.infer<typeof estimateBodySchema>;
  try {
    const raw = await c.req.json();
    body = estimateBodySchema.parse(raw);
  } catch (err) {
    const issues = err instanceof z.ZodError
      ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
      : 'Payload invalide';
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: issues } },
      400,
    );
  }

  const {
    adherent_matricule,
    bulletin_date,
    actes,
    company_id,
    type_maladie = 'ordinaire',
    beneficiary_id,
    beneficiary_relationship,
  } = body;

  if (actes.length === 0) {
    return c.json({ success: true, data: { reimbursed_amount: 0, details: [] } });
  }

  try {
    // Find adherent — isolation inter-assureurs par contrat
    const cleanMatricule = adherent_matricule.replace(/\s+/g, '');
    let insurerFilter = '';
    let joinClause = '';
    const bindParams: unknown[] = [cleanMatricule];

    if (company_id && company_id !== '__INDIVIDUAL__') {
      joinClause = 'LEFT JOIN companies co ON a.company_id = co.id';
      insurerFilter = 'AND a.company_id = ?';
      bindParams.push(company_id);
    } else if (user.insurerId) {
      insurerFilter = `AND EXISTS (
        SELECT 1 FROM contracts c2
        LEFT JOIN companies co2 ON c2.company_id = co2.id
        WHERE c2.adherent_id = a.id
          AND c2.deleted_at IS NULL
          AND (co2.insurer_id = ? OR c2.insurer_id = ?)
      )`;
      bindParams.push(user.insurerId, user.insurerId);
    }

    const adherent = await db
      .prepare(
        `SELECT a.id FROM adherents a ${joinClause}
         WHERE REPLACE(a.matricule, ' ', '') = ?
           AND a.deleted_at IS NULL
           ${insurerFilter}`,
      )
      .bind(...bindParams)
      .first<{ id: string }>();

    if (!adherent) {
      return c.json({
        success: true,
        data: {
          reimbursed_amount: null,
          details: [],
          warning: 'Adhérent non trouvé ou non accessible',
        },
      });
    }

    // Recherche du contrat actif
    const contract = await db
      .prepare(
        `SELECT c.id FROM contracts c
         WHERE c.adherent_id = ?
           AND c.status = 'active'
           AND c.start_date <= ?
           AND c.end_date >= ?
         ORDER BY CASE WHEN c.group_contract_id IS NOT NULL THEN 0 ELSE 1 END,
                  c.created_at DESC
         LIMIT 1`,
      )
      .bind(adherent.id, bulletin_date, bulletin_date)
      .first<{ id: string }>();

    if (!contract) {
      const { results: allContracts } = await db
        .prepare(
          `SELECT c.id, c.contract_number, c.plan_type, c.status,
                  c.start_date, c.end_date
           FROM contracts c
           WHERE c.adherent_id = ?
           ORDER BY c.end_date DESC`,
        )
        .bind(adherent.id)
        .all<{
          id: string;
          contract_number: string;
          plan_type: string;
          status: string;
          start_date: string;
          end_date: string;
        }>();

      const details: EstimateDetail[] = actes.map((acte) => ({
        code: acte.code?.trim() || null,
        amount: acte.amount,
        reimbursed: 0,
        reason: 'NO_ACTIVE_CONTRACT' as const,
        message: `Aucun contrat actif à la date du ${bulletin_date}`,
      }));

      const hasContracts = allContracts && allContracts.length > 0;
      const warning = hasContracts
        ? `Aucun contrat actif à la date du ${bulletin_date} — ${allContracts.length} contrat(s) existant(s). Remboursement impossible sans contrat actif.`
        : "Cet adhérent n'a aucun contrat enregistré. Remboursement impossible.";

      return c.json({
        success: true,
        data: {
          reimbursed_amount: 0,
          details,
          warning,
          no_active_contract: true,
          contracts: allContracts || [],
        },
      });
    }

    // Resolve beneficiary for plafond lookups
    let estimateBeneficiaryId = adherent.id;
    if (beneficiary_id) {
      estimateBeneficiaryId = beneficiary_id;
    } else if (beneficiary_relationship && beneficiary_relationship !== 'self') {
      const codeType = beneficiary_relationship === 'spouse' ? 'C' : 'E';
      const resolvedBen = await db
        .prepare('SELECT id FROM adherents WHERE parent_adherent_id = ? AND code_type = ? AND deleted_at IS NULL ORDER BY rang_pres ASC LIMIT 1')
        .bind(adherent.id, codeType)
        .first<{ id: string }>();
      if (resolvedBen) estimateBeneficiaryId = resolvedBen.id;
    }

    // Boucle de calcul par acte (arithmétique en millimes entiers)
    const details: EstimateDetail[] = [];
    let totalMillimes = 0;
    const estimateBatchCtx: CalculBatchContext = {};

    for (const acte of actes) {
      let code = acte.code?.trim();

      const defaultCode = acte.care_type
        ? CARE_TYPE_DEFAULT_CODE[acte.care_type]
        : undefined;

      if (!code && defaultCode) code = defaultCode;

      if (!code) {
        details.push({
          code: null,
          amount: acte.amount,
          reimbursed: 0,
          reason: 'MISSING_CODE',
          message: 'Code acte manquant et care_type sans code par défaut',
        });
        continue;
      }

      let refResult = await findActeRefByCodeWithCoefficient(db, code);

      if (!refResult && defaultCode && code !== defaultCode) {
        refResult = await findActeRefByCodeWithCoefficient(db, defaultCode);
        if (refResult) code = defaultCode;
      }

      // If code looks like a care_type (e.g. CHIRURGIE_REFRACTIVE), resolve to default acte code
      if (!refResult) {
        const codeAsCaretype = code.toLowerCase();
        const fallbackCode = CARE_TYPE_DEFAULT_CODE[codeAsCaretype];
        if (fallbackCode && fallbackCode !== code) {
          refResult = await findActeRefByCodeWithCoefficient(db, fallbackCode);
          if (refResult) {
            if (!acte.care_type) acte.care_type = codeAsCaretype;
            code = fallbackCode;
          }
        }
      }

      if (!refResult) {
        details.push({
          code,
          amount: acte.amount,
          reimbursed: 0,
          reason: 'ACTE_NOT_FOUND',
          message: `Code acte "${code}" introuvable dans le référentiel`,
        });
        continue;
      }

      const ref = refResult.acte;

      try {
        const calcInput: CalculRemboursementInput = {
          adherentId: estimateBeneficiaryId,
          contractId: contract.id,
          acteRefId: ref.id,
          fraisEngages: acte.amount,
          dateSoin: bulletin_date,
          typeMaladie: type_maladie,
          nbrCle: acte.nbr_cle ?? refResult.parsedCoefficient ?? undefined,
          nombreJours: acte.nombre_jours,
          careType: acte.care_type || undefined,
        };

        const result = await calculerRemboursement(db, calcInput, estimateBatchCtx);

        const reimbursedMillimes = Math.floor(result.montantRembourse * 1000);
        totalMillimes += reimbursedMillimes;

        let reason: EstimateReason = 'OK';
        let message: string | undefined;
        if (reimbursedMillimes === 0) {
          if (result.plafondGlobalApplique) {
            reason = 'CEILING_EXHAUSTED';
            message = 'Plafond global atteint';
          } else if (result.plafondFamilleApplique) {
            reason = 'CEILING_EXHAUSTED';
            message = "Plafond de la famille d'actes atteint";
          }
        }

        details.push({
          code,
          amount: acte.amount,
          reimbursed: result.montantRembourse,
          reason,
          message,
          type: result.typeCalcul,
          valeur: result.valeurBareme,
          plafonds: {
            acte: {
              applied: result.plafondActeApplique,
              valeur: result.details.plafondActeValeur,
            },
            jour: {
              applied: result.plafondJourApplique,
              valeur: result.details.plafondJourValeur,
            },
            famille: { applied: result.plafondFamilleApplique },
            global: { applied: result.plafondGlobalApplique },
          },
          breakdown: {
            brut: result.details.montantBrut,
            apresJour: result.details.apresPlafondJour,
            apresActe: result.details.apresPlafondActe,
            apresFamille: result.details.apresPlafondFamille,
            apresGlobal: result.details.apresPlafondGlobal,
          },
          _debug: result._debug,
        });
      } catch (err) {
        console.error(`Error calculating acte ${code}:`, err);

        const taux = (ref as { taux_remboursement?: number }).taux_remboursement || 0;
        const reimbursedMillimes = Math.floor(acte.amount * taux * 1000);
        const reimbursed = reimbursedMillimes / 1000;
        totalMillimes += reimbursedMillimes;

        details.push({
          code,
          amount: acte.amount,
          taux,
          reimbursed,
          reason: 'FALLBACK_RATE_USED',
          message: 'Calcul principal en erreur, taux référentiel utilisé en secours',
          _debug: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    let total = totalMillimes / 1000;

    // Plafond adhérent — filet de sécurité uniquement si l'engine ne l'a pas déjà appliqué
    let plafondWarning: string | undefined;
    const engineAlreadyCappedGlobal = details.some(
      (d) => (d.plafonds as { global?: { applied?: boolean } } | undefined)?.global?.applied === true,
    );

    if (!engineAlreadyCappedGlobal && total > 0) {
      const adh = await db
        .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
        .bind(adherent.id)
        .first<{ plafond_global: number | null; plafond_consomme: number | null }>();

      if (adh?.plafond_global && adh.plafond_global > 0) {
        const plafondMillimes = adh.plafond_global;
        const consommeMillimes = adh.plafond_consomme || 0;
        const restantMillimes = Math.max(0, plafondMillimes - consommeMillimes);
        const restantDT = restantMillimes / 1000;

        if (totalMillimes > restantMillimes) {
          plafondWarning =
            `Plafond adhérent restant : ${restantDT.toFixed(3)} DT. ` +
            `Le remboursement a été réduit de ${total.toFixed(3)} à ${restantDT.toFixed(3)} DT.`;

          const ratio = restantMillimes / totalMillimes;
          let reallocatedMillimes = 0;
          for (let i = 0; i < details.length; i++) {
            const d = details[i];
            if (!d || d.reimbursed <= 0) continue;
            const originalMillimes = Math.floor(d.reimbursed * 1000);
            const isLast = i === details.length - 1;
            const reducedMillimes = isLast
              ? restantMillimes - reallocatedMillimes
              : Math.floor(originalMillimes * ratio);
            d.reimbursed = Math.max(0, reducedMillimes) / 1000;
            if (reducedMillimes < originalMillimes) {
              d.reason = 'CEILING_EXHAUSTED';
              d.message = `Réduit par plafond adhérent (ratio ${(ratio * 100).toFixed(1)}%)`;
            }
            reallocatedMillimes += Math.max(0, reducedMillimes);
          }
          total = restantDT;
        }
      }
    }

    return c.json({
      success: true,
      data: {
        reimbursed_amount: total,
        details,
        ...(plafondWarning ? { plafond_warning: plafondWarning } : {}),
      },
    });
  } catch (error) {
    console.error('Error estimating reimbursement:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'ESTIMATE_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Erreur inconnue lors du calcul',
        },
      },
      500,
    );
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
  console.log('[SAISIE] beneficiary data received:', { beneficiaryId, beneficiaryName, beneficiaryRelationship });
  const providerName = (formData['provider_name'] as string) || null;
  const providerSpecialty = (formData['provider_specialty'] as string) || null;
  // care_type is now per-acte; top-level is optional fallback
  const careTypeFallback = (formData['care_type'] as string) || null;
  const careDescription = (formData['care_description'] as string) || null;
  const adherentAddress = (formData['adherent_address'] as string) || null;
  const batchId = (formData['batch_id'] as string) || null;
  const companyId = (formData['company_id'] as string) || null;
  const userBulletinNumber = (formData['bulletin_number'] as string) || null;
  const frontendFileHash = (formData['file_hash'] as string) || null;

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

  // Check if any acte is missing MF — bulletin saved as draft but cannot be validated
  const mfIncomplete = (formData['mf_incomplete'] as string) === '1' ||
    actes.some((a) => !a.ref_prof_sant || a.ref_prof_sant.trim().length < 7);

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

  // Handle file upload (scan) + compute server-side file hash
  // Upload to R2 and hash in parallel per file to minimize CPU time
  let scanUrl: string | null = null;
  const storage = c.env.STORAGE;

  const scanKeys = Object.keys(formData).filter(k => k.startsWith('scan_') && formData[k] instanceof File).sort();
  const uploadPromises = scanKeys.map(async (key) => {
    const file = formData[key] as File;
    if (file.size > 0) {
      const arrayBuffer = await file.arrayBuffer();
      const r2Key = `bulletins/${bulletinId}/${key}_${file.name}`;
      // Upload and hash in parallel for each file
      const [, hashBuf] = await Promise.all([
        storage.put(r2Key, arrayBuffer, { httpMetadata: { contentType: file.type } }),
        crypto.subtle.digest('SHA-256', arrayBuffer),
      ]);
      const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      return { hash, r2Key, originalName: file.name, mimeType: file.type, fileSize: file.size };
    }
    return null;
  });
  const uploadResults = await Promise.all(uploadPromises);
  const uploadedFiles: { hash: string; r2Key: string; originalName: string; mimeType: string; fileSize: number }[] = [];
  const perFileHashes: string[] = [];
  for (const result of uploadResults) {
    if (result) {
      uploadedFiles.push(result);
      perFileHashes.push(result.hash);
      if (!scanUrl) {
        scanUrl = `https://dhamen-files.${c.env.ENVIRONMENT === 'production' ? '' : 'dev.'}r2.cloudflarestorage.com/${result.r2Key}`;
      }
    }
  }

  // Compute combined hash from per-file hashes
  let fileHash: string | null = frontendFileHash;
  let combinedHash: string | null = null;
  if (perFileHashes.length === 1) {
    fileHash = perFileHashes[0]!;
    combinedHash = fileHash;
  } else if (perFileHashes.length > 1) {
    const sorted = [...perFileHashes].sort();
    const combined = new TextEncoder().encode(sorted.join(''));
    const finalHash = await crypto.subtle.digest('SHA-256', combined);
    fileHash = Array.from(new Uint8Array(finalHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    combinedHash = fileHash;
  }

  // Server-side duplicate detection — check combined_hash, bulletin_files, and legacy file_hash
  if (fileHash) {
    const existingByHash = await db
      .prepare(
        `SELECT id, bulletin_number, status, total_amount, adherent_first_name, adherent_last_name
         FROM bulletins_soins
         WHERE (file_hash = ? OR combined_hash = ?) AND status NOT IN ('deleted')
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(fileHash, combinedHash || fileHash)
      .first<{ id: string; bulletin_number: string; status: string; total_amount: number | null; adherent_first_name: string; adherent_last_name: string }>();

    if (existingByHash) {
      return c.json({
        success: false,
        error: {
          code: 'DUPLICATE_FILE',
          message: `Ce fichier a déjà été enregistré comme bulletin N° ${existingByHash.bulletin_number} (${existingByHash.adherent_first_name || ''} ${existingByHash.adherent_last_name || ''}).`,
          existingBulletin: {
            id: existingByHash.id,
            bulletinNumber: existingByHash.bulletin_number,
            status: existingByHash.status,
            totalAmount: existingByHash.total_amount,
          },
        },
      }, 409);
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

    // Run all 3 adherent searches in parallel (matricule, CIN, name) — pick first match by priority
    const [byMatricule, byCIN, byName] = await Promise.all([
      // Step 1: Exact matricule match
      db
        .prepare(
          `SELECT ${adherentSelectCols} FROM adherents a ${joinClause} WHERE REPLACE(a.matricule, ' ', '') = ? AND a.deleted_at IS NULL ${insurerFilter}`
        )
        .bind(...(user.insurerId ? [cleanMatricule, user.insurerId] : [cleanMatricule]))
        .first(),
      // Step 2: National ID fallback
      adherentNationalId
        ? db
            .prepare(
              `SELECT ${adherentSelectCols} FROM adherents a ${joinClause} WHERE (a.national_id_encrypted LIKE ? OR a.national_id_hash = ?) AND a.deleted_at IS NULL ${insurerFilter}`
            )
            .bind(...(user.insurerId ? [`%${adherentNationalId}%`, adherentNationalId, user.insurerId] : [`%${adherentNationalId}%`, adherentNationalId]))
            .first()
        : Promise.resolve(null),
      // Step 3: Name fallback (case-insensitive)
      adherentFirstName && adherentLastName
        ? db
            .prepare(
              `SELECT ${adherentSelectCols} FROM adherents a ${joinClause} WHERE LOWER(a.first_name) = LOWER(?) AND LOWER(a.last_name) = LOWER(?) AND a.deleted_at IS NULL ${insurerFilter}`
            )
            .bind(...(user.insurerId ? [adherentFirstName, adherentLastName, user.insurerId] : [adherentFirstName, adherentLastName]))
            .first()
        : Promise.resolve(null),
    ]);
    // Priority: matricule > CIN > name
    adherentResult = (byMatricule || byCIN || byName) as Record<string, unknown> | null;

    let adherentAutoCreated = false;

    if (!adherentResult) {
      // Check for active group contract BEFORE creating adherent
      const isIndividualMode = companyId === '__INDIVIDUAL__';
      let adherentCompanyId: string | null = isIndividualMode ? null : companyId;
      if (!adherentCompanyId && !isIndividualMode && user.insurerId) {
        const company = await db
          .prepare('SELECT id FROM companies WHERE insurer_id = ? LIMIT 1')
          .bind(user.insurerId)
          .first<{ id: string }>();
        adherentCompanyId = company?.id || null;
      }

      // Find active group contract — required to auto-create adherent
      let activeGroupContract: { id: string; insurer_id: string; effective_date: string; annual_renewal_date: string | null; annual_global_limit: number | null } | null = null;

      if (adherentCompanyId) {
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

      // Block auto-creation if no active group contract exists
      if (!activeGroupContract) {
        return c.json({
          success: false,
          error: {
            code: 'NO_ACTIVE_CONTRACT',
            message: `Adhérent "${adherentMatricule}" non trouvé et aucun contrat groupe actif pour créer automatiquement un contrat individuel. Veuillez d'abord créer un contrat groupe actif ou enregistrer l'adhérent manuellement avec un contrat.`,
          },
        }, 400);
      }

      // Auto-create adherent with active group contract
      const newAdherentId = generateId();
      const firstName = adherentFirstName || '';
      const lastName = adherentLastName || adherentFirstName || 'Inconnu';

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

      // Auto-create individual contract linked to the active group contract
      try {
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
      // Parallel: update email/matricule + check existing contract
      const patchStmts: ReturnType<typeof db.prepare>[] = [];
      if (adherentEmail) {
        patchStmts.push(
          db.prepare('UPDATE adherents SET email = ? WHERE id = ? AND (email IS NULL OR email = ?)').bind(adherentEmail, adherentId, adherentEmail)
        );
      }
      if (adherentMatricule) {
        patchStmts.push(
          db.prepare('UPDATE adherents SET matricule = ? WHERE id = ? AND (matricule IS NULL OR matricule = "")').bind(adherentMatricule, adherentId)
        );
      }
      const [, existingContract] = await Promise.all([
        patchStmts.length > 0 ? db.batch(patchStmts) : Promise.resolve(),
        db
          .prepare("SELECT id FROM contracts WHERE adherent_id = ? AND status = 'active' LIMIT 1")
          .bind(adherentId)
          .first<{ id: string }>(),
      ]);

      if (!existingContract) {
        // Try to auto-create individual contract only if active group contract exists
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
          }
          // No group contract → no auto-creation of standalone contract (remboursement sera 0)
        } catch (contractErr) {
          console.error('[SAISIE] Failed to auto-create contract for existing adherent:', contractErr instanceof Error ? contractErr.message : contractErr);
        }
      }
    }

    // MF incomplete → always draft (cannot be validated until MF is filled)
    const status = mfIncomplete ? 'draft' : (batchId ? 'in_batch' : 'draft');

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

    // Phase 2: Parallel auto-registration for providers not found
    // First pass: identify which need registration and check license_no in parallel
    const registrationChecks = await Promise.all(
      actesMfData.map(async (mfData, i) => {
        const lookupResult = lookupResults[i]!;
        if (mfData.skip) return { action: 'skip' as const, id: null };
        if (lookupResult.found) return { action: 'found' as const, id: lookupResult.id };

        const licenseNo = `MF-${mfData.normalizedMf}`;
        const existingByLicense = await db
          .prepare('SELECT id, name FROM providers WHERE license_no = ? AND deleted_at IS NULL LIMIT 1')
          .bind(licenseNo)
          .first<{ id: string; name: string }>();
        if (existingByLicense) return { action: 'found' as const, id: existingByLicense.id };
        return { action: 'register' as const, id: null, licenseNo };
      })
    );

    // Second pass: register all missing providers in parallel
    const registrationResults = await Promise.allSettled(
      registrationChecks.map(async (check, i) => {
        if (check.action !== 'register') return check.id;

        const mfData = actesMfData[i]!;
        const acte = mfData.acte;
        const acteCareType = (acte.care_type || careType || 'consultation') as string;
        const provType = acteCareType === 'pharmacy' ? 'pharmacist' : acteCareType === 'lab' ? 'lab' : acteCareType === 'hospital' ? 'clinic' : 'doctor';
        const effectiveName = mfData.nomPraticien.length >= 2 ? mfData.nomPraticien : `Praticien MF ${mfData.normalizedMf}`;

        const newProviderId = generateId();
        const licenseNo = check.licenseNo!;

        await db
          .prepare(
            `INSERT INTO providers (id, type, name, license_no, mf_number, mf_verified, is_active, address, city, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, 1, 'À compléter', 'À compléter', datetime('now'), datetime('now'))`
          )
          .bind(newProviderId, provType, effectiveName, licenseNo, mfData.rawMf)
          .run();

        // Fire secondary inserts in parallel (non-blocking)
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
          db.prepare(
            `INSERT INTO sante_praticiens (id, provider_id, nom, specialite, type_praticien, est_conventionne, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, 1, datetime('now'), datetime('now'))`
          ).bind(santePraticienId, newProviderId, effectiveName, santeSpecialite, santeType).run(),
          db.prepare(
            `INSERT INTO practitioner_mf_verifications (id, provider_id, mf_number, verification_status, created_at, updated_at)
             VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))`
          ).bind(verificationId, newProviderId, mfData.rawMf).run(),
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
        newlyRegisteredProviders.push({ id: newProviderId, name: effectiveName, mfNumber: mfData.normalizedMf });
        return newProviderId;
      })
    );

    // Collect provider IDs from results
    for (let i = 0; i < registrationChecks.length; i++) {
      const check = registrationChecks[i]!;
      if (check.action === 'skip') { providerIds.push(null); continue; }
      if (check.action === 'found') { providerIds.push(check.id); continue; }
      const result = registrationResults[i]!;
      if (result.status === 'fulfilled') {
        providerIds.push(result.value);
      } else {
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error('[PROVIDER-LOOKUP] Auto-register failed:', errMsg);
        newlyRegisteredProviders.push({ id: 'ERROR', name: errMsg, mfNumber: actesMfData[i]!.normalizedMf });
        const retryProvider = await db
          .prepare('SELECT id, name FROM providers WHERE mf_number = ? AND deleted_at IS NULL LIMIT 1')
          .bind(actesMfData[i]!.normalizedMf)
          .first<{ id: string; name: string }>();
        providerIds.push(retryProvider?.id || null);
      }
    }

    // Use first provider for bulletin-level provider_id
    const bulletinProviderId = providerIds.find((id) => id !== null) || null;
    console.log('[SAISIE] providerIds resolved:', JSON.stringify(providerIds), '→ bulletinProviderId:', bulletinProviderId);

    // Fallback: derive provider_name from first acte's nom_prof_sant if not provided at bulletin level
    const effectiveProviderName = providerName || (actes.length > 0 && (actes[0] as Record<string, unknown>).nom_prof_sant) || null;

    // Resolve beneficiary_id: use form data, or lookup from adherent family if relationship provided
    let effectiveBeneficiaryId: string | null = null;
    if (beneficiaryRelationship && beneficiaryRelationship !== 'self' && adherentId) {
      if (beneficiaryId) {
        effectiveBeneficiaryId = beneficiaryId;
      } else {
        // Frontend didn't provide beneficiary_id — resolve from DB by relationship
        const codeType = beneficiaryRelationship === 'spouse' ? 'C' : 'E';
        const resolvedBen = await db
          .prepare('SELECT id FROM adherents WHERE parent_adherent_id = ? AND code_type = ? AND deleted_at IS NULL ORDER BY rang_pres ASC LIMIT 1')
          .bind(adherentId, codeType)
          .first<{ id: string }>();
        if (resolvedBen) {
          effectiveBeneficiaryId = resolvedBen.id;
        }
      }
    }
    console.log('[SAISIE] beneficiary resolved:', { effectiveBeneficiaryId, beneficiaryId, beneficiaryRelationship, adherentId });

    await db
      .prepare(`
      INSERT INTO bulletins_soins (
        id, bulletin_number, bulletin_date, adherent_id, adherent_matricule,
        adherent_first_name, adherent_last_name, adherent_national_id, adherent_address,
        beneficiary_id, beneficiary_name, beneficiary_relationship,
        provider_id, provider_name, provider_specialty, care_type, care_description,
        total_amount, scan_url, batch_id, company_id, status, created_by,
        file_hash, combined_hash, submission_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
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
        user.id,
        fileHash,
        combinedHash
      )
      .run();

    // Insert per-file hashes into bulletin_files for granular duplicate detection + R2 retrieval
    if (perFileHashes.length > 0) {
      const bfStatements = perFileHashes.map((hash, idx) => {
        const uploaded = uploadedFiles[idx];
        return db.prepare(
          `INSERT OR IGNORE INTO bulletin_files (id, bulletin_id, file_index, file_name, file_hash, r2_key, mime_type, file_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          generateId(),
          bulletinId,
          idx,
          uploaded?.originalName || (scanKeys[idx] ? (formData[scanKeys[idx]!] as File)?.name || null : null),
          hash,
          uploaded?.r2Key || null,
          uploaded?.mimeType || null,
          uploaded?.fileSize || null
        );
      });
      await db.batch(bfStatements);
    }

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
              let refResult = await findActeRefByCodeWithCoefficient(db, code);
              // Fallback: if code not found (e.g., medication code_amm), use default code for care_type
              if (!refResult) {
                const defaultCode = (acte.care_type || careType) ? CARE_TYPE_DEFAULT_CODE[acte.care_type || careType] : undefined;
                if (defaultCode && code !== defaultCode) {
                  refResult = await findActeRefByCodeWithCoefficient(db, defaultCode);
                }
              }
              if (refResult) {
                return { ref: refResult.acte as { id: string; taux_remboursement: number }, code, parsedCoefficient: refResult.parsedCoefficient };
              }
              return { ref: null, code, parsedCoefficient: null };
            }
            return { ref: null, code: '', parsedCoefficient: null };
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
      // Use beneficiary's own ID for plafond lookups (each family member has their own plafond)
      const plafondAdherentId = effectiveBeneficiaryId || adherentId;
      if (contractId && adherentId) {
        const baremeResults: CalculRemboursementResult[] = [];
        let totalRembourse = 0;
        // Shared context cache — avoids repeating group_contract_id, periode, plafond_global lookups per acte
        const batchCtx: CalculBatchContext = {};

        for (let i = 0; i < actes.length; i++) {
          const acte = actes[i]!;
          const acteRefInfo = acteRefs[i]!;

          if (acteRefInfo.ref) {
            try {
              const medMatch = medicationMatches[i];
              const calcInput: CalculRemboursementInput = {
                adherentId: plafondAdherentId,
                contractId,
                acteRefId: acteRefInfo.ref.id,
                fraisEngages: acte.amount,
                dateSoin: bulletinDate,
                typeMaladie: (careType === 'pharmacie_chronique' ? 'chronique' : 'ordinaire') as
                  | 'ordinaire'
                  | 'chronique',
                medicationFamilyId: medMatch?.medicationFamilyId ?? undefined,
                nbrCle: (acteRefInfo as { parsedCoefficient?: number | null }).parsedCoefficient ?? (acte as Record<string, unknown>).nbr_cle as number | undefined,
                nombreJours: (acte as Record<string, unknown>).nombre_jours as number | undefined,
                careType: (acte as Record<string, unknown>).care_type as string | undefined || careType || undefined,
              };
              const result = await calculerRemboursement(db, calcInput, batchCtx);
              baremeResults.push(result);
              totalRembourse += result.montantRembourse;
            } catch {
              // If bareme not found, use legacy calculation for this acte
              const fallbackAmt = Math.floor(acte.amount * (acteRefInfo.ref.taux_remboursement || 0) * 1000) / 1000;
              baremeResults.push({
                montantRembourse: fallbackAmt,
                typeCalcul: 'taux',
                valeurBareme: acteRefInfo.ref.taux_remboursement || 0,
                plafondActeApplique: false,
                plafondFamilleApplique: false,
                plafondGlobalApplique: false,
                details: {
                  montantBrut: fallbackAmt,
                  apresPlafondActe: fallbackAmt,
                  apresPlafondFamille: fallbackAmt,
                  apresPlafondGlobal: fallbackAmt,
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

        // Apply beneficiary global plafond cap (plafond in millimes, amounts in dinars)
        if (plafondAdherentId && reimbursedAmount > 0) {
          const adhPlafond = await db
            .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
            .bind(plafondAdherentId)
            .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
          if (adhPlafond?.plafond_global && adhPlafond.plafond_global > 0) {
            const restantDT = Math.max(0, (adhPlafond.plafond_global - (adhPlafond.plafond_consomme || 0)) / 1000);
            if (reimbursedAmount > restantDT) {
              const ratio = restantDT / reimbursedAmount;
              // Proportionally reduce each acte's reimbursement
              for (const br of baremeResults) {
                br.montantRembourse = Math.round(br.montantRembourse * ratio * 1000) / 1000;
                br.plafondGlobalApplique = true;
              }
              reimbursedAmount = restantDT;
              warnings.push(`Plafond global atteint : remboursement réduit à ${restantDT.toFixed(3)} DT.`);
            }
          }
        }

        // Insert actes with bareme-aware reimbursement data + medication fields
        const acteIds: string[] = [];
        const stmts = actes.map((acte, i) => {
          const acteId = generateId();
          acteIds.push(acteId);
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

        // Insert sub_items for each acte (medications, analyses, etc.)
        const subItemStmts: ReturnType<typeof db.prepare>[] = [];
        actes.forEach((acte, i) => {
          const subs = (acte as Record<string, unknown>).sub_items as Array<{ label: string; code?: string; cotation?: string; amount: number }> | undefined;
          if (subs && subs.length > 0) {
            for (const si of subs) {
              subItemStmts.push(
                db.prepare(
                  `INSERT INTO acte_sub_items (id, acte_id, label, code, cotation, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
                ).bind(generateId(), acteIds[i], si.label, si.code || null, si.cotation || null, si.amount)
              );
            }
          }
        });
        if (subItemStmts.length > 0) await db.batch(subItemStmts);

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
        // Use cached group_contract_id from batchCtx to avoid redundant lookups
        const cachedGroupId = batchCtx.baremeContractId || contractId;
        for (let i = 0; i < actes.length; i++) {
          const baremeResult = baremeResults[i]!;
          if (baremeResult.montantRembourse > 0 && familleIds[i] !== undefined) {
            await mettreAJourPlafonds(
              db, plafondAdherentId, contractId, annee,
              familleIds[i]!, baremeResult.montantRembourse * 1000, typeMaladie,
              cachedGroupId
            );
          }
        }

        // Batch: update bulletin reimbursed_amount + legacy adherent plafond_consomme
        const finalUpdates: ReturnType<typeof db.prepare>[] = [
          db.prepare('UPDATE bulletins_soins SET reimbursed_amount = ? WHERE id = ?').bind(reimbursedAmount, bulletinId),
        ];
        if (reimbursedAmount > 0) {
          finalUpdates.push(
            db.prepare('UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?').bind(Math.round(reimbursedAmount * 1000), plafondAdherentId)
          );
        }
        await db.batch(finalUpdates);
      } else {
        // No contract found — reimbursement is 0
        if (!contractId) {
          warnings.push('Aucun contrat actif trouvé pour cet adhérent. Remboursement impossible sans contrat actif.');
        }
        const actesInput: ActeInput[] = [];
        for (let i = 0; i < actes.length; i++) {
          const acte = actes[i]!;
          const acteRefInfo = acteRefs[i]!;
          actesInput.push({
            code: acteRefInfo.code || '',
            label: acte.label,
            montantActe: acte.amount,
            tauxRemboursement: contractId ? (acteRefInfo.ref?.taux_remboursement || 0) : 0,
          });
        }

        // Get adherent plafond
        // If plafond_global is NULL (e.g. individual mode, no contract), treat as unlimited
        // plafond_global and plafond_consomme are in millimes, convert to dinars (÷1000)
        let plafondRestant = contractId ? Number.MAX_SAFE_INTEGER : 0;
        if (contractId && plafondAdherentId) {
          const adh = await db
            .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
            .bind(plafondAdherentId)
            .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
          if (adh && adh.plafond_global) {
            plafondRestant = (adh.plafond_global - (adh.plafond_consomme || 0)) / 1000;
          }
        }

        // Calculate reimbursement (legacy — 0 when no contract)
        const calcul = calculateRemboursementBulletin(actesInput, plafondRestant);
        reimbursedAmount = calcul.totalRembourse;

        // Insert actes with reimbursement data + medication fields
        const acteIds2: string[] = [];
        const stmts = actes.map((acte, i) => {
          const acteId = generateId();
          acteIds2.push(acteId);
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

        // Insert sub_items for each acte (medications, analyses, etc.)
        const subItemStmts2: ReturnType<typeof db.prepare>[] = [];
        actes.forEach((acte, i) => {
          const subs = (acte as Record<string, unknown>).sub_items as Array<{ label: string; code?: string; cotation?: string; amount: number }> | undefined;
          if (subs && subs.length > 0) {
            for (const si of subs) {
              subItemStmts2.push(
                db.prepare(
                  `INSERT INTO acte_sub_items (id, acte_id, label, code, cotation, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
                ).bind(generateId(), acteIds2[i], si.label, si.code || null, si.cotation || null, si.amount)
              );
            }
          }
        });
        if (subItemStmts2.length > 0) await db.batch(subItemStmts2);

        // Batch: update bulletin reimbursed_amount + adherent plafond_consomme
        const finalUpdates2: ReturnType<typeof db.prepare>[] = [
          db.prepare('UPDATE bulletins_soins SET reimbursed_amount = ? WHERE id = ?').bind(reimbursedAmount, bulletinId),
        ];
        if (plafondAdherentId && reimbursedAmount > 0) {
          finalUpdates2.push(
            db.prepare('UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?').bind(Math.round(reimbursedAmount * 1000), plafondAdherentId)
          );
        }
        await db.batch(finalUpdates2);
      }
    }

    logAudit(db, {
      userId: user.id,
      action: 'bulletin.create',
      entityType: 'bulletin',
      entityId: bulletinId,
      changes: { bulletinNumber, adherentMatricule, actesCount: actes.length, totalAmount, reimbursedAmount, status, companyId, batchId, adherentAutoCreated },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

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
          mf_incomplete: mfIncomplete || undefined,
          warnings: [...warnings, ...(mfIncomplete ? ['Bulletin enregistré comme brouillon incomplet : matricule fiscale praticien manquante. Ce bulletin ne pourra pas être validé tant que la MF ne sera pas complétée.'] : [])].length > 0 ? [...warnings, ...(mfIncomplete ? ['Bulletin enregistré comme brouillon incomplet : matricule fiscale praticien manquante. Ce bulletin ne pourra pas être validé tant que la MF ne sera pas complétée.'] : [])] : undefined,
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

    logAudit(db, {
      userId: user.id,
      action: 'batch.create',
      entityType: 'batch',
      entityId: batchId,
      changes: { name, companyId },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

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
        // Check for active group contract BEFORE creating adherent
        const activeGroupContract = await db
          .prepare(
            `SELECT id, insurer_id, effective_date, annual_renewal_date, annual_global_limit
             FROM group_contracts
             WHERE company_id = ? AND status = 'active' AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`
          )
          .bind(companyId)
          .first<{ id: string; insurer_id: string; effective_date: string; annual_renewal_date: string | null; annual_global_limit: number | null }>();

        if (!activeGroupContract) {
          // Skip this bulletin — no active contract means we cannot register this adherent
          skipped++;
          results.push({
            id: bulletinId,
            bulletin_number: bulletinNumber,
            adherent_matricule: bulletin.adherent_matricule,
            status: 'skipped',
            skipped: true,
            reason: `Adhérent non trouvé et aucun contrat groupe actif pour créer automatiquement un contrat.`,
          });
          continue;
        }

        // Auto-create adherent with active group contract
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

        // Auto-create individual contract linked to the active group contract
        try {
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

    logAudit(db, {
      userId: user.id,
      action: 'bulletin.import',
      entityType: 'batch',
      entityId: batchId,
      changes: { batchName, companyId, totalImported, skipped, totalBulletins: bulletins.length },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

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
      .prepare('SELECT id, status, adherent_id, beneficiary_id, reimbursed_amount, bulletin_number, care_type, bulletin_date FROM bulletins_soins WHERE id = ?')
      .bind(bulletinId)
      .first<{
        id: string;
        status: string;
        adherent_id: string | null;
        beneficiary_id: string | null;
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

    // Cap reimbursed_amount to beneficiary's remaining plafond (millimes ÷ 1000 → dinars)
    const plafondBeneficiaryId = bulletin.beneficiary_id || bulletin.adherent_id;
    let finalReimbursedAmount = reimbursed_amount;
    if (plafondBeneficiaryId && reimbursed_amount > 0) {
      const adhP = await db
        .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
        .bind(plafondBeneficiaryId)
        .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
      if (adhP?.plafond_global && adhP.plafond_global > 0) {
        const previousAmount = bulletin.reimbursed_amount || 0;
        const restantDT = Math.max(0, (adhP.plafond_global - (adhP.plafond_consomme || 0)) / 1000 + previousAmount);
        if (finalReimbursedAmount > restantDT) {
          finalReimbursedAmount = Math.max(0, restantDT);
        }
      }
    }

    // Determine status: if reimbursement is 0 (plafond exhausted), mark as non_remboursable
    const finalStatus = finalReimbursedAmount <= 0 ? 'non_remboursable' : 'approved';

    // Update bulletin status and reimbursement
    await db
      .prepare(`
      UPDATE bulletins_soins
      SET status = ?,
          reimbursed_amount = ?,
          validated_at = ?,
          validated_by = ?,
          approved_date = ?,
          approved_amount = ?,
          updated_at = ?
      WHERE id = ?
    `)
      .bind(finalStatus, finalReimbursedAmount, now, user.id, now, finalReimbursedAmount, now, bulletinId)
      .run();

    // Update beneficiary plafond_consomme (adjust delta if reimbursement changed)
    // finalReimbursedAmount is in dinars, plafond_consomme is in millimes (×1000)
    if (plafondBeneficiaryId) {
      const previousAmount = bulletin.reimbursed_amount || 0;
      const delta = finalReimbursedAmount - previousAmount;
      if (delta !== 0) {
        await db
          .prepare(
            'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
          )
          .bind(Math.round(delta * 1000), plafondBeneficiaryId)
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
          reimbursed_amount: finalReimbursedAmount,
          notes: notes || null,
          previous_status: bulletin.status,
        }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    const response: ValidateBulletinResponse = {
      id: bulletinId,
      status: finalStatus,
      reimbursed_amount: finalReimbursedAmount,
      validated_at: now,
      validated_by: user.id,
    };

    // Fire-and-forget: notify adherent (in-app + push + realtime)
    if (bulletin.adherent_id) {
      const bulletinNumber = bulletin.bulletin_number;
      const careType = bulletin.care_type || 'soin';
      const formatAmt = (v: number) => v.toFixed(3);
      const notifBody = finalStatus === 'non_remboursable'
        ? `Votre bulletin ${bulletinNumber} (${careType}) n'est pas remboursable — plafond annuel atteint.`
        : `Votre bulletin ${bulletinNumber} (${careType}) a été approuvé. Montant remboursé : ${formatAmt(finalReimbursedAmount)} TND.`;
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

    logAudit(db, {
      userId: user.id,
      action: 'bulletin.reject',
      entityType: 'bulletin',
      entityId: bulletinId,
      changes: { previous_status: bulletin.status, notes },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

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
 * GET /bulletins-soins/agent/:id/files - List all files attached to a bulletin
 */
bulletinsAgent.get('/:id/files', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  const { results } = await db.prepare(
    `SELECT id, file_index, file_name, file_hash, r2_key, mime_type, file_size, created_at
     FROM bulletin_files WHERE bulletin_id = ? ORDER BY file_index`
  ).bind(bulletinId).all();

  // Fallback: if no bulletin_files rows but bulletin has scan_url, return that as a virtual file
  if (!results || results.length === 0) {
    const bulletin = await db.prepare(
      'SELECT scan_url, scan_filename FROM bulletins_soins WHERE id = ?'
    ).bind(bulletinId).first<{ scan_url: string | null; scan_filename: string | null }>();
    if (bulletin?.scan_url) {
      return c.json({
        success: true,
        data: [{
          id: 'legacy',
          file_index: 0,
          file_name: bulletin.scan_filename || 'scan',
          r2_key: null,
          mime_type: null,
          file_size: null,
          created_at: null,
          legacy_scan_url: true,
        }],
      });
    }
  }

  return c.json({ success: true, data: results || [] });
});

/**
 * GET /bulletins-soins/agent/:id/files/:fileId/download - Download a specific file from R2
 */
bulletinsAgent.get('/:id/files/:fileId/download', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  const bulletinId = c.req.param('id');
  const fileId = c.req.param('fileId');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  // Legacy fallback: fileId === 'legacy' → use scan_url from bulletins_soins
  if (fileId === 'legacy') {
    const bulletin = await db.prepare(
      'SELECT scan_url, scan_filename FROM bulletins_soins WHERE id = ?'
    ).bind(bulletinId).first<{ scan_url: string | null; scan_filename: string | null }>();
    if (!bulletin?.scan_url) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Scan introuvable' } }, 404);
    }
    const R2_PREFIX = 'https://dhamen-files.r2.cloudflarestorage.com/';
    const DEV_R2_PREFIX = 'https://dhamen-files.dev.r2.cloudflarestorage.com/';
    let r2Key = bulletin.scan_url;
    if (r2Key.startsWith(R2_PREFIX)) r2Key = r2Key.slice(R2_PREFIX.length);
    else if (r2Key.startsWith(DEV_R2_PREFIX)) r2Key = r2Key.slice(DEV_R2_PREFIX.length);
    const object = await storage.get(r2Key);
    if (!object) {
      return c.json({ success: false, error: { code: 'STORAGE_ERROR', message: 'Fichier introuvable dans le stockage' } }, 404);
    }
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `inline; filename="${bulletin.scan_filename || 'scan'}"`);
    return new Response(object.body, { headers });
  }

  const file = await db.prepare(
    'SELECT r2_key, file_name, mime_type FROM bulletin_files WHERE id = ? AND bulletin_id = ?'
  ).bind(fileId, bulletinId).first<{ r2_key: string | null; file_name: string | null; mime_type: string | null }>();

  if (!file || !file.r2_key) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fichier introuvable' } }, 404);
  }

  const object = await storage.get(file.r2_key);
  if (!object) {
    return c.json({ success: false, error: { code: 'STORAGE_ERROR', message: 'Fichier introuvable dans le stockage' } }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', file.mime_type || object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${file.file_name || 'scan'}"`);
  return new Response(object.body, { headers });
});

/**
 * DELETE /bulletins-soins/agent/:id/files/:fileId - Delete a specific file from R2 and DB
 */
bulletinsAgent.delete('/:id/files/:fileId', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  const bulletinId = c.req.param('id');
  const fileId = c.req.param('fileId');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  // Verify bulletin is editable
  const bulletin = await db.prepare(
    'SELECT status FROM bulletins_soins WHERE id = ?'
  ).bind(bulletinId).first<{ status: string }>();
  if (!bulletin || !['draft', 'in_batch'].includes(bulletin.status)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Bulletin non modifiable' } }, 400);
  }

  const file = await db.prepare(
    'SELECT id, r2_key, file_name FROM bulletin_files WHERE id = ? AND bulletin_id = ?'
  ).bind(fileId, bulletinId).first<{ id: string; r2_key: string | null; file_name: string | null }>();

  if (!file) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fichier introuvable' } }, 404);
  }

  // Delete from R2
  if (file.r2_key) {
    try { await storage.delete(file.r2_key); } catch { /* R2 key may already be gone */ }
  }

  // Delete from DB
  await db.prepare('DELETE FROM bulletin_files WHERE id = ?').bind(fileId).run();

  // If this was the scan_url file, clear it
  await db.prepare(
    `UPDATE bulletins_soins SET scan_url = NULL, scan_filename = NULL, updated_at = datetime('now')
     WHERE id = ? AND scan_url LIKE '%' || ?`
  ).bind(bulletinId, file.file_name || '___never_match___').run();

  return c.json({ success: true, data: { deleted: file.id } });
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

    // Compute file hash
    const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const fileHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Get next file_index
    const maxIdx = await db.prepare(
      'SELECT COALESCE(MAX(file_index), -1) as max_idx FROM bulletin_files WHERE bulletin_id = ?'
    ).bind(bulletinId).first<{ max_idx: number }>();
    const nextIndex = (maxIdx?.max_idx ?? -1) + 1;

    // Update bulletin scan_url (keep first file as legacy scan_url)
    const existingScan = await db.prepare(
      'SELECT scan_url FROM bulletins_soins WHERE id = ?'
    ).bind(bulletinId).first<{ scan_url: string | null }>();
    if (!existingScan?.scan_url) {
      await db.prepare(
        `UPDATE bulletins_soins SET scan_url = ?, scan_filename = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(scanUrl, file.name, bulletinId).run();
    }

    // Insert into bulletin_files
    const fileId = generateId();
    await db.prepare(
      `INSERT OR IGNORE INTO bulletin_files (id, bulletin_id, file_index, file_name, file_hash, r2_key, mime_type, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(fileId, bulletinId, nextIndex, file.name, fileHash, r2Key, file.type, file.size).run();

    // Audit log
    await db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
       VALUES (?, ?, 'scan_uploaded', 'bulletins_soins', ?, ?, ?, datetime('now'))`
    ).bind(
      generateId(), user.id, bulletinId,
      JSON.stringify({ filename: file.name, size: file.size, mime_type: file.type }),
      c.req.header('CF-Connecting-IP') || 'unknown'
    ).run();

    return c.json({
      success: true,
      data: { id: fileId, scan_url: scanUrl, scan_filename: file.name, r2_key: r2Key },
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

// ---------------------------------------------------------------------------
// Presigned R2 Upload — browser uploads directly to R2, bypassing Worker CPU
// ---------------------------------------------------------------------------

const PRESIGNED_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const PRESIGNED_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const PRESIGNED_EXPIRY_SECONDS = 600; // 10 minutes
const PRESIGNED_MAX_FILES = 10;

/**
 * GET /bulletins-soins/agent/:id/upload-url
 * Generates a presigned PUT URL for direct browser → R2 upload.
 * Query params: fileName, contentType, fileSize
 */
bulletinsAgent.get('/:id/upload-url', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  // Validate R2 credentials are configured
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CF_ACCOUNT_ID } = c.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !CF_ACCOUNT_ID) {
    // Fallback: credentials not configured, client should use legacy upload-scan
    return c.json({ success: false, error: { code: 'PRESIGN_UNAVAILABLE', message: 'Presigned uploads not configured' } }, 501);
  }

  const bulletinId = c.req.param('id');
  const fileName = c.req.query('fileName');
  const contentType = c.req.query('contentType');
  const fileSizeStr = c.req.query('fileSize');

  if (!fileName || !contentType || !fileSizeStr) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'fileName, contentType et fileSize sont requis' } }, 400);
  }

  // Validate content type
  if (!PRESIGNED_ALLOWED_TYPES.includes(contentType)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_FILE_TYPE', message: 'Type non supporte. Formats acceptes : JPEG, PNG, PDF' },
    }, 400);
  }

  // Validate file size
  const fileSize = Number.parseInt(fileSizeStr, 10);
  if (Number.isNaN(fileSize) || fileSize <= 0 || fileSize > PRESIGNED_MAX_SIZE) {
    return c.json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'Le fichier ne doit pas depasser 10 Mo' },
    }, 400);
  }

  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify bulletin exists and belongs to user
    const bulletin = await db
      .prepare('SELECT id FROM bulletins_soins WHERE id = ? AND created_by = ?')
      .bind(bulletinId, user.id)
      .first();

    if (!bulletin) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' } }, 404);
    }

    // Check max files limit
    const fileCount = await db.prepare(
      'SELECT COUNT(*) as cnt FROM bulletin_files WHERE bulletin_id = ?'
    ).bind(bulletinId).first<{ cnt: number }>();
    if (fileCount && fileCount.cnt >= PRESIGNED_MAX_FILES) {
      return c.json({
        success: false,
        error: { code: 'MAX_FILES_REACHED', message: `Maximum ${PRESIGNED_MAX_FILES} fichiers par bulletin` },
      }, 400);
    }

    // Generate R2 key (server-controlled, client cannot choose)
    const fileId = generateId();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key = `bulletins/${bulletinId}/${fileId}_${sanitizedName}`;

    // Determine R2 bucket name based on environment
    const bucketName = c.env.ENVIRONMENT === 'production'
      ? 'dhamen-files-production'
      : c.env.ENVIRONMENT === 'staging'
        ? 'dhamen-files-staging'
        : 'dhamen-files';

    // Dynamic import to avoid breaking the module if aws4fetch has issues
    const { AwsClient } = await import('aws4fetch');
    const r2Client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    });

    const r2Endpoint = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucketName}/${r2Key}`;
    const url = new URL(r2Endpoint);
    url.searchParams.set('X-Amz-Expires', String(PRESIGNED_EXPIRY_SECONDS));

    const signed = await r2Client.sign(
      new Request(url.toString(), {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
      }),
      { aws: { signQuery: true } }
    );

    return c.json({
      success: true,
      data: {
        uploadUrl: signed.url,
        r2Key,
        fileId,
        expiresIn: PRESIGNED_EXPIRY_SECONDS,
      },
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Erreur generation URL upload' } }, 500);
  }
});

/**
 * POST /bulletins-soins/agent/:id/confirm-upload
 * Confirms a presigned upload: verifies file in R2, computes hash, inserts into bulletin_files.
 * Body: { r2Key, fileId, fileName, contentType, fileSize }
 */
bulletinsAgent.post('/:id/confirm-upload', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  let body: { r2Key?: string; fileId?: string; fileName?: string; contentType?: string; fileSize?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Body JSON invalide' } }, 400);
  }

  const { r2Key, fileId, fileName, contentType, fileSize } = body;
  if (!r2Key || !fileId || !fileName || !contentType || !fileSize) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'r2Key, fileId, fileName, contentType et fileSize sont requis' },
    }, 400);
  }

  // Security: r2Key must match expected pattern for this bulletin
  const expectedPrefix = `bulletins/${bulletinId}/`;
  if (!r2Key.startsWith(expectedPrefix)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cle R2 invalide pour ce bulletin' } }, 403);
  }

  try {
    // Verify bulletin ownership
    const bulletin = await db
      .prepare('SELECT id, scan_url FROM bulletins_soins WHERE id = ? AND created_by = ?')
      .bind(bulletinId, user.id)
      .first<{ id: string; scan_url: string | null }>();

    if (!bulletin) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' } }, 404);
    }

    // Verify file exists in R2
    const r2Object = await storage.get(r2Key);
    if (!r2Object) {
      return c.json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'Fichier non trouve dans R2. Upload echoue ou URL expiree.' },
      }, 404);
    }

    // Compute SHA-256 hash from R2 object
    const arrayBuffer = await r2Object.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const fileHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Get next file_index
    const maxIdx = await db.prepare(
      'SELECT COALESCE(MAX(file_index), -1) as max_idx FROM bulletin_files WHERE bulletin_id = ?'
    ).bind(bulletinId).first<{ max_idx: number }>();
    const nextIndex = (maxIdx?.max_idx ?? -1) + 1;

    // Update bulletin scan_url if first file (legacy compat)
    if (!bulletin.scan_url) {
      const scanUrl = `https://dhamen-files.${c.env.ENVIRONMENT === 'production' ? '' : 'staging.'}r2.cloudflarestorage.com/${r2Key}`;
      await db.prepare(
        `UPDATE bulletins_soins SET scan_url = ?, scan_filename = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(scanUrl, fileName, bulletinId).run();
    }

    // Insert into bulletin_files
    await db.prepare(
      `INSERT OR IGNORE INTO bulletin_files (id, bulletin_id, file_index, file_name, file_hash, r2_key, mime_type, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(fileId, bulletinId, nextIndex, fileName, fileHash, r2Key, contentType, fileSize).run();

    // Audit log
    await db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
       VALUES (?, ?, 'scan_uploaded', 'bulletins_soins', ?, ?, ?, datetime('now'))`
    ).bind(
      generateId(), user.id, bulletinId,
      JSON.stringify({ filename: fileName, size: fileSize, mime_type: contentType, method: 'presigned' }),
      c.req.header('CF-Connecting-IP') || 'unknown'
    ).run();

    return c.json({
      success: true,
      data: { id: fileId, r2_key: r2Key, file_hash: fileHash },
    });
  } catch (error) {
    console.error('Error confirming upload:', error);
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Erreur confirmation upload' } }, 500);
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

// ---------------------------------------------------------------------------
// POST /:id/update — Full update of a draft bulletin (same format as /create)
// ---------------------------------------------------------------------------

bulletinsAgent.post('/:id/update', async (c) => {
  const user = c.get('user');
  const db = c.get('tenantDb') ?? c.env.DB;
  const bulletinId = c.req.param('id');
  const now = new Date().toISOString();

  // Verify bulletin exists and is editable (draft or in_batch only)
  const bulletin = await db.prepare(
    `SELECT id, status, company_id, batch_id, adherent_id, beneficiary_id, care_type FROM bulletins_soins WHERE id = ?`
  ).bind(bulletinId).first<{ id: string; status: string; company_id: string; batch_id: string | null; adherent_id: string | null; beneficiary_id: string | null; care_type: string | null }>();

  if (!bulletin) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Bulletin introuvable' } }, 404);
  }
  if (!['draft', 'in_batch'].includes(bulletin.status)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Impossible de modifier un bulletin en statut "${bulletin.status}"` } }, 400);
  }

  const formData = await c.req.parseBody();

  const bulletinNumber = (formData['bulletin_number'] as string) || null;
  const bulletinDate = formData['bulletin_date'] as string;
  const adherentMatricule = formData['adherent_matricule'] as string;
  const adherentFirstName = formData['adherent_first_name'] as string;
  const adherentLastName = formData['adherent_last_name'] as string;
  const adherentEmail = (formData['adherent_email'] as string) || null;
  const beneficiaryName = (formData['beneficiary_name'] as string) || null;
  const beneficiaryRelationship = (formData['beneficiary_relationship'] as string) || null;
  const updateBeneficiaryIdRaw = (formData['beneficiary_id'] as string) || null;
  const actesRaw = formData['actes'] as string;

  let actes: Array<{
    code: string; label: string; amount: number;
    ref_prof_sant: string; nom_prof_sant: string;
    provider_id?: string; care_type: string; care_description?: string;
  }> = [];
  try {
    actes = JSON.parse(actesRaw || '[]');
  } catch {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Format actes invalide' } }, 400);
  }

  // Resolve beneficiary_id for update (same logic as create)
  let updateResolvedBeneficiaryId: string | null = null;
  if (beneficiaryRelationship && beneficiaryRelationship !== 'self' && bulletin.adherent_id) {
    if (updateBeneficiaryIdRaw) {
      updateResolvedBeneficiaryId = updateBeneficiaryIdRaw;
    } else {
      const codeType = beneficiaryRelationship === 'spouse' ? 'C' : 'E';
      const resolvedBen = await db
        .prepare('SELECT id FROM adherents WHERE parent_adherent_id = ? AND code_type = ? AND deleted_at IS NULL ORDER BY rang_pres ASC LIMIT 1')
        .bind(bulletin.adherent_id, codeType)
        .first<{ id: string }>();
      if (resolvedBen) updateResolvedBeneficiaryId = resolvedBen.id;
    }
  }

  // Update bulletin fields
  await db.prepare(`
    UPDATE bulletins_soins SET
      bulletin_number = ?, bulletin_date = ?,
      adherent_matricule = ?, adherent_first_name = ?, adherent_last_name = ?,
      beneficiary_id = ?, beneficiary_name = ?, beneficiary_relationship = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    bulletinNumber, bulletinDate,
    adherentMatricule, adherentFirstName, adherentLastName,
    updateResolvedBeneficiaryId, beneficiaryName, beneficiaryRelationship,
    now, bulletinId
  ).run();

  // Replace all actes: delete existing (including sub_items), insert new
  await db.prepare('DELETE FROM acte_sub_items WHERE acte_id IN (SELECT id FROM actes_bulletin WHERE bulletin_id = ?)').bind(bulletinId).run();
  await db.prepare('DELETE FROM actes_bulletin WHERE bulletin_id = ?').bind(bulletinId).run();

  const generateId = () => {
    const ts = Date.now().toString(36).toUpperCase().padStart(10, '0');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `01${ts}${rand}`.substring(0, 26);
  };

  // Recalculate total
  const totalAmount = actes.reduce((sum, a) => sum + (a.amount || 0), 0);
  const careType = bulletin.care_type || 'consultation';
  const adherentId = bulletin.adherent_id;
  const updatePlafondId = updateResolvedBeneficiaryId || adherentId;
  const warnings: string[] = [];

  // Recalculate reimbursement based on active contract at bulletin date
  let reimbursedAmount: number | null = null;

  if (actes.length > 0 && adherentId) {
    // Find active contract at bulletin date
    let contractId: string | null = null;
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

    const isPharmacy = careType === 'pharmacy' || careType === 'pharmacie_chronique';

    // Resolve acte refs + medication matches in parallel
    const [acteRefs, medicationMatches] = await Promise.all([
      Promise.all(
        actes.map(async (acte) => {
          const code = acte.code?.trim();
          if (code) {
            let refResult = await findActeRefByCodeWithCoefficient(db, code);
            // Fallback: if code not found (e.g., medication code_amm), use default code for care_type
            if (!refResult) {
              const defaultCode = (acte.care_type || careType) ? CARE_TYPE_DEFAULT_CODE[acte.care_type || careType] : undefined;
              if (defaultCode && code !== defaultCode) {
                refResult = await findActeRefByCodeWithCoefficient(db, defaultCode);
              }
            }
            if (refResult) {
              return { ref: refResult.acte as { id: string; taux_remboursement: number }, code, parsedCoefficient: refResult.parsedCoefficient };
            }
            return { ref: null, code, parsedCoefficient: null };
          }
          return { ref: null, code: '', parsedCoefficient: null };
        })
      ),
      Promise.all(
        actes.map(async (acte) => {
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
          if (med) return { medicationId: med.id, medicationFamilyId: med.family_id, tauxApplique: med.reimbursement_rate };
          return { medicationId: null, medicationFamilyId: null, tauxApplique: null };
        })
      ),
    ]);

    if (contractId) {
      // Contract-aware calculation
      const baremeResults: CalculRemboursementResult[] = [];
      let totalRembourse = 0;
      const updateBatchCtx: CalculBatchContext = {};

      for (let i = 0; i < actes.length; i++) {
        const acte = actes[i]!;
        const acteRefInfo = acteRefs[i]!;
        if (acteRefInfo.ref) {
          try {
            const medMatch = medicationMatches[i];
            const calcInput: CalculRemboursementInput = {
              adherentId: updatePlafondId!,
              contractId,
              acteRefId: acteRefInfo.ref.id,
              fraisEngages: acte.amount,
              dateSoin: bulletinDate,
              typeMaladie: (careType === 'pharmacie_chronique' ? 'chronique' : 'ordinaire') as 'ordinaire' | 'chronique',
              medicationFamilyId: medMatch?.medicationFamilyId ?? undefined,
              nbrCle: (acteRefInfo as { parsedCoefficient?: number | null }).parsedCoefficient ?? (acte as Record<string, unknown>).nbr_cle as number | undefined,
              nombreJours: (acte as Record<string, unknown>).nombre_jours as number | undefined,
              careType: (acte as Record<string, unknown>).care_type as string | undefined || careType || undefined,
            };
            const result = await calculerRemboursement(db, calcInput, updateBatchCtx);
            baremeResults.push(result);
            totalRembourse += result.montantRembourse;
          } catch {
            const fbAmt = Math.floor(acte.amount * (acteRefInfo.ref.taux_remboursement || 0) * 1000) / 1000;
            baremeResults.push({
              montantRembourse: fbAmt,
              typeCalcul: 'taux', valeurBareme: acteRefInfo.ref.taux_remboursement || 0,
              plafondActeApplique: false, plafondFamilleApplique: false, plafondGlobalApplique: false,
              details: { montantBrut: fbAmt, apresPlafondActe: fbAmt, apresPlafondFamille: fbAmt, apresPlafondGlobal: fbAmt },
            });
            totalRembourse += baremeResults[baremeResults.length - 1]!.montantRembourse;
          }
        } else {
          baremeResults.push({
            montantRembourse: 0, typeCalcul: 'taux', valeurBareme: 0,
            plafondActeApplique: false, plafondFamilleApplique: false, plafondGlobalApplique: false,
            details: { montantBrut: 0, apresPlafondActe: 0, apresPlafondFamille: 0, apresPlafondGlobal: 0 },
          });
        }
      }

      reimbursedAmount = totalRembourse;

      // Apply beneficiary global plafond cap
      if (reimbursedAmount > 0 && updatePlafondId) {
        const adhPlafond = await db
          .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
          .bind(updatePlafondId)
          .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
        if (adhPlafond?.plafond_global && adhPlafond.plafond_global > 0) {
          const restantDT = Math.max(0, (adhPlafond.plafond_global - (adhPlafond.plafond_consomme || 0)) / 1000);
          if (reimbursedAmount > restantDT) {
            const ratio = restantDT / reimbursedAmount;
            for (const br of baremeResults) {
              br.montantRembourse = Math.round(br.montantRembourse * ratio * 1000) / 1000;
              br.plafondGlobalApplique = true;
            }
            reimbursedAmount = restantDT;
          }
        }
      }

      // Insert actes with reimbursement data
      const acteIds: string[] = [];
      const stmts = actes.map((acte, i) => {
        const acteId = generateId();
        acteIds.push(acteId);
        const baremeResult = baremeResults[i]!;
        const medMatch = medicationMatches[i];
        return db
          .prepare(
            `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, care_type, taux_remboursement, montant_rembourse, remboursement_brut, plafond_depasse, acte_ref_id, ref_prof_sant, nom_prof_sant, cod_msgr, lib_msgr, medication_id, medication_family_id, taux_applique, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM actes_referentiel WHERE code = ? AND is_active = 1), ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .bind(
            acteId, bulletinId,
            acte.code?.trim() || null, acte.label || '', acte.amount || 0,
            acte.care_type || careType,
            baremeResult.valeurBareme, baremeResult.montantRembourse,
            baremeResult.details.montantBrut,
            baremeResult.plafondActeApplique || baremeResult.plafondFamilleApplique || baremeResult.plafondGlobalApplique ? 1 : 0,
            acte.code?.trim() || null,
            acte.ref_prof_sant?.trim() || null, acte.nom_prof_sant?.trim() || null,
            null, null,
            medMatch?.medicationId || null, medMatch?.medicationFamilyId || null,
            medMatch?.tauxApplique || null
          );
      });
      await db.batch(stmts);

      // Insert sub_items
      const subItemStmts: ReturnType<typeof db.prepare>[] = [];
      actes.forEach((acte, i) => {
        const subs = (acte as Record<string, unknown>).sub_items as Array<{ label: string; code?: string; cotation?: string; amount: number }> | undefined;
        if (subs && subs.length > 0) {
          for (const si of subs) {
            subItemStmts.push(
              db.prepare(
                `INSERT INTO acte_sub_items (id, acte_id, label, code, cotation, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
              ).bind(generateId(), acteIds[i], si.label, si.code || null, si.cotation || null, si.amount)
            );
          }
        }
      });
      if (subItemStmts.length > 0) await db.batch(subItemStmts);
    } else {
      // No active contract at this date → reimbursement = 0
      reimbursedAmount = 0;
      warnings.push('Aucun contrat actif à la date du bulletin. Remboursement à 0.');

      // Insert actes without reimbursement
      const acteIds: string[] = [];
      for (const acte of actes) {
        const acteId = generateId();
        acteIds.push(acteId);
        await db.prepare(`
          INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, ref_prof_sant, nom_prof_sant, care_type, taux_remboursement, montant_rembourse, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
        `).bind(
          acteId, bulletinId,
          acte.code || '', acte.label || '', acte.amount || 0,
          acte.ref_prof_sant || '', acte.nom_prof_sant || '',
          acte.care_type || careType,
          now
        ).run();
      }

      // Insert sub_items
      const subItemStmts: ReturnType<typeof db.prepare>[] = [];
      actes.forEach((acte, i) => {
        const subs = (acte as Record<string, unknown>).sub_items as Array<{ label: string; code?: string; cotation?: string; amount: number }> | undefined;
        if (subs && subs.length > 0) {
          for (const si of subs) {
            subItemStmts.push(
              db.prepare(
                `INSERT INTO acte_sub_items (id, acte_id, label, code, cotation, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
              ).bind(generateId(), acteIds[i], si.label, si.code || null, si.cotation || null, si.amount)
            );
          }
        }
      });
      if (subItemStmts.length > 0) await db.batch(subItemStmts);
    }
  } else {
    // No actes or no adherent — insert actes without reimbursement
    for (const acte of actes) {
      const acteId = generateId();
      await db.prepare(`
        INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, ref_prof_sant, nom_prof_sant, care_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        acteId, bulletinId,
        acte.code || '', acte.label || '', acte.amount || 0,
        acte.ref_prof_sant || '', acte.nom_prof_sant || '',
        acte.care_type || 'consultation',
        now
      ).run();
    }
  }

  // Re-evaluate status: if all MF are now filled and bulletin has a batch, promote draft → in_batch
  const mfNowComplete = actes.every((a) => a.ref_prof_sant && a.ref_prof_sant.trim().length >= 7);
  let newStatus = bulletin.status;
  if (bulletin.status === 'draft' && mfNowComplete && bulletin.batch_id) {
    newStatus = 'in_batch';
  }

  // Update total_amount + reimbursed_amount + status
  await db.prepare('UPDATE bulletins_soins SET total_amount = ?, reimbursed_amount = ?, status = ?, updated_at = ? WHERE id = ?')
    .bind(totalAmount, reimbursedAmount, newStatus, now, bulletinId).run();

  await logAudit(db, {
    userId: user.id,
    action: 'BULLETIN_UPDATE',
    entityType: 'bulletin',
    entityId: bulletinId,
    changes: { adherentMatricule, actesCount: actes.length, totalAmount, reimbursedAmount, statusChanged: newStatus !== bulletin.status ? newStatus : undefined },
  });

  if (newStatus !== bulletin.status) {
    warnings.push(`Statut mis à jour : ${bulletin.status} → ${newStatus}`);
  }

  return c.json({ success: true, data: { id: bulletinId, status: newStatus, warnings: warnings.length > 0 ? warnings : undefined } });
});

// ---------------------------------------------------------------------------
// PUT /:id/correct — Correct a bulletin and re-enqueue for validation
// ---------------------------------------------------------------------------

bulletinsAgent.put('/:id/correct', async (c) => {
  const user = c.get('user');
  const db = c.get('tenantDb') ?? c.env.DB;
  const bulletinId = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();

  // Verify bulletin exists
  const bulletin = await db.prepare(
    `SELECT id, company_id, ocr_job_id FROM bulletins_soins WHERE id = ?`
  ).bind(bulletinId).first<{ id: string; company_id: string; ocr_job_id: string }>();

  if (!bulletin) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Bulletin introuvable' } }, 404);
  }

  // Update bulletin fields
  const updates: string[] = [];
  const updateBinds: unknown[] = [];
  const allowedFields = [
    'adherent_matricule', 'adherent_first_name', 'adherent_last_name',
    'bulletin_date', 'bulletin_number', 'beneficiary_name', 'beneficiary_relationship', 'company_id',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      updateBinds.push(body[field]);
    }
  }

  if (updates.length > 0) {
    updates.push('validation_status = ?', 'updated_at = ?');
    updateBinds.push('pending_validation', now, bulletinId);
    await db.prepare(
      `UPDATE bulletins_soins SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...updateBinds).run();
  }

  // Update actes if provided
  const actes = body.actes as Array<{ id: string; ref_prof_sant?: string; nom_prof_sant?: string; label?: string; amount?: number; code?: string; care_type?: string }> | undefined;
  if (actes && Array.isArray(actes)) {
    for (const acte of actes) {
      const acteUpdates: string[] = [];
      const acteBinds: unknown[] = [];
      if (acte.ref_prof_sant !== undefined) { acteUpdates.push('ref_prof_sant = ?'); acteBinds.push(acte.ref_prof_sant); }
      if (acte.nom_prof_sant !== undefined) { acteUpdates.push('nom_prof_sant = ?'); acteBinds.push(acte.nom_prof_sant); }
      if (acte.label !== undefined) { acteUpdates.push('label = ?'); acteBinds.push(acte.label); }
      if (acte.amount !== undefined) { acteUpdates.push('amount = ?'); acteBinds.push(acte.amount); }
      if (acte.code !== undefined) { acteUpdates.push('code = ?'); acteBinds.push(acte.code); }
      if (acte.care_type !== undefined) { acteUpdates.push('care_type = ?'); acteBinds.push(acte.care_type); }
      if (acteUpdates.length > 0) {
        acteUpdates.push('updated_at = ?');
        acteBinds.push(now, acte.id);
        await db.prepare(
          `UPDATE actes_bulletin SET ${acteUpdates.join(', ')} WHERE id = ? AND bulletin_id = ?`
        ).bind(...acteBinds, bulletinId).run();
      }
    }
  }

  // Re-enqueue for validation
  const tenantCode = c.req.header('x-tenant-code') || '';
  const dbBinding = tenantCode ? `DB_${tenantCode.toUpperCase()}` : 'DB';

  await c.env.BULLETIN_QUEUE.send({
    type: 'VALIDATE_BULLETIN',
    bulletinId,
    dbBinding,
    userId: user.id,
    companyId: bulletin.company_id,
    ocrJobId: bulletin.ocr_job_id,
  } satisfies import('../queue/bulletin-validation.types').BulletinValidationMessage);

  await logAudit(c, {
    action: 'BULLETIN_CORRECTION',
    entityType: 'bulletin',
    entityId: bulletinId,
    details: { corrections: Object.keys(body) },
  });

  return c.json({
    success: true,
    data: { id: bulletinId, validation_status: 'pending_validation' },
  });
});

export { bulletinsAgent };
