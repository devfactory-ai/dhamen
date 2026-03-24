/**
 * Group Contracts Routes
 *
 * CRUD + OCR analysis for group insurance contracts (contrat d'assurance groupe).
 * Models real Tunisian group contracts with 18 guarantee categories.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import pako from 'pako';
import { z } from 'zod';
import { getDb } from '../lib/db';
import { created, notFound, paginated, success, validationError, error as errorResponse } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CARE_TYPES = [
  'consultation', 'pharmacy', 'laboratory', 'optical', 'refractive_surgery',
  'medical_acts', 'transport', 'surgery', 'orthopedics', 'hospitalization',
  'maternity', 'ivg', 'dental', 'orthodontics', 'circumcision',
  'sanatorium', 'thermal_cure', 'funeral',
] as const;

const PLAN_CATEGORIES = ['basic', 'standard', 'premium', 'vip'] as const;
const CONTRACT_STATUSES = ['draft', 'active', 'suspended', 'expired', 'cancelled'] as const;

const groupContractCreateSchema = z.object({
  contractNumber: z.string().min(1, 'Numéro de contrat requis'),
  companyId: z.string().min(1, 'Entreprise requise'),
  insurerId: z.string().min(1, 'Assureur requis'),
  companyAddress: z.string().optional(),
  matriculeFiscale: z.string().optional(),
  intermediaryName: z.string().optional(),
  intermediaryCode: z.string().optional(),
  effectiveDate: z.string().min(1, 'Date d\'effet requise'),
  annualRenewalDate: z.string().optional(),
  endDate: z.string().optional(),
  riskIllness: z.boolean().default(true),
  riskDisability: z.boolean().default(false),
  riskDeath: z.boolean().default(false),
  annualGlobalLimit: z.number().optional(),
  carenceDays: z.number().int().default(0),
  coversSpouse: z.boolean().default(true),
  coversChildren: z.boolean().default(true),
  childrenMaxAge: z.number().int().default(20),
  childrenStudentMaxAge: z.number().int().default(28),
  coversDisabledChildren: z.boolean().default(true),
  coversRetirees: z.boolean().default(false),
  documentUrl: z.string().optional(),
  documentId: z.string().optional(),
  planCategory: z.enum(PLAN_CATEGORIES).default('standard'),
  status: z.enum(CONTRACT_STATUSES).default('draft'),
  notes: z.string().optional(),
  guarantees: z.array(z.object({
    guaranteeNumber: z.number().int().min(1).max(18),
    careType: z.enum(CARE_TYPES),
    label: z.string().min(1),
    reimbursementRate: z.number().min(0).max(1).optional(),
    isFixedAmount: z.boolean().default(false),
    annualLimit: z.number().optional(),
    perEventLimit: z.number().optional(),
    dailyLimit: z.number().optional(),
    maxDays: z.number().int().optional(),
    letterKeysJson: z.string().optional(),
    subLimitsJson: z.string().optional(),
    conditionsText: z.string().optional(),
    requiresPrescription: z.boolean().default(false),
    requiresCnamComplement: z.boolean().default(false),
    renewalPeriodMonths: z.number().int().optional(),
    ageLimit: z.number().int().optional(),
    waitingPeriodDays: z.number().int().default(0),
    exclusionsText: z.string().optional(),
  })).optional(),
});

const groupContractUpdateSchema = groupContractCreateSchema.partial().omit({ companyId: true, insurerId: true });

const groupContractFiltersSchema = z.object({
  companyId: z.string().optional(),
  insurerId: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  planCategory: z.enum(PLAN_CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const groupContracts = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
groupContracts.use('*', authMiddleware());

// ---------------------------------------------------------------------------
// GET / — List group contracts with filters + pagination
// ---------------------------------------------------------------------------
groupContracts.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', groupContractFiltersSchema),
  async (c) => {
    const { companyId, insurerId, status, planCategory, page, limit } = c.req.valid('query');
    const user = c.get('user');
    const db = getDb(c);

    // Insurer users can only see their own contracts
    let effectiveInsurerId = insurerId;
    if (user?.insurerId && (user.role === 'INSURER_ADMIN' || user.role === 'INSURER_AGENT')) {
      effectiveInsurerId = user.insurerId;
    }

    const conditions: string[] = ['gc.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (effectiveInsurerId) {
      conditions.push('gc.insurer_id = ?');
      params.push(effectiveInsurerId);
    }
    if (companyId) {
      conditions.push('gc.company_id = ?');
      params.push(companyId);
    }
    if (status) {
      conditions.push('gc.status = ?');
      params.push(status);
    }
    if (planCategory) {
      conditions.push('gc.plan_category = ?');
      params.push(planCategory);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM group_contracts gc ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const offset = (page - 1) * limit;
    const rows = await db
      .prepare(
        `SELECT gc.*, co.name as company_name, ins.name as insurer_name
         FROM group_contracts gc
         LEFT JOIN companies co ON gc.company_id = co.id
         LEFT JOIN insurers ins ON gc.insurer_id = ins.id
         ${whereClause}
         ORDER BY gc.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    return paginated(c, rows.results ?? [], {
      page,
      limit,
      total,
    });
  }
);

// ---------------------------------------------------------------------------
// GET /:id — Get a group contract with its guarantees
// ---------------------------------------------------------------------------
groupContracts.get(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c);

    const contract = await db
      .prepare(
        `SELECT gc.*, co.name as company_name, ins.name as insurer_name
         FROM group_contracts gc
         LEFT JOIN companies co ON gc.company_id = co.id
         LEFT JOIN insurers ins ON gc.insurer_id = ins.id
         WHERE gc.id = ? AND gc.deleted_at IS NULL`
      )
      .bind(id)
      .first();

    if (!contract) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    // Access control for insurer roles
    if (
      user?.insurerId &&
      (user.role === 'INSURER_ADMIN' || user.role === 'INSURER_AGENT') &&
      contract.insurer_id !== user.insurerId
    ) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    // Fetch guarantees
    const guarantees = await db
      .prepare(
        `SELECT * FROM contract_guarantees
         WHERE group_contract_id = ? AND is_active = 1
         ORDER BY guarantee_number ASC`
      )
      .bind(id)
      .all();

    return success(c, {
      ...contract,
      guarantees: guarantees.results ?? [],
    });
  }
);

// ---------------------------------------------------------------------------
// POST / — Create a group contract (with optional guarantees)
// ---------------------------------------------------------------------------
groupContracts.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', groupContractCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Force insurer ID for insurer users
    let effectiveInsurerId = data.insurerId;
    if (user?.insurerId && user.role === 'INSURER_ADMIN') {
      effectiveInsurerId = user.insurerId;
    }

    // Check for duplicate contract number
    const existing = await db
      .prepare('SELECT id FROM group_contracts WHERE contract_number = ?')
      .bind(data.contractNumber)
      .first();
    if (existing) {
      return errorResponse(c, 'DUPLICATE_CONTRACT', 'Un contrat avec ce numéro existe déjà', 409);
    }

    const contractId = generateId();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO group_contracts (
          id, contract_number, company_id, insurer_id,
          company_address, matricule_fiscale,
          intermediary_name, intermediary_code,
          effective_date, annual_renewal_date, end_date,
          risk_illness, risk_disability, risk_death,
          annual_global_limit, carence_days,
          covers_spouse, covers_children, children_max_age,
          children_student_max_age, covers_disabled_children, covers_retirees,
          document_url, document_id,
          plan_category, status, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        contractId,
        data.contractNumber,
        data.companyId,
        effectiveInsurerId,
        data.companyAddress ?? null,
        data.matriculeFiscale ?? null,
        data.intermediaryName ?? null,
        data.intermediaryCode ?? null,
        data.effectiveDate,
        data.annualRenewalDate ?? null,
        data.endDate ?? null,
        data.riskIllness ? 1 : 0,
        data.riskDisability ? 1 : 0,
        data.riskDeath ? 1 : 0,
        data.annualGlobalLimit ?? null,
        data.carenceDays,
        data.coversSpouse ? 1 : 0,
        data.coversChildren ? 1 : 0,
        data.childrenMaxAge,
        data.childrenStudentMaxAge,
        data.coversDisabledChildren ? 1 : 0,
        data.coversRetirees ? 1 : 0,
        data.documentUrl ?? null,
        data.documentId ?? null,
        data.planCategory,
        data.status,
        data.notes ?? null,
        now,
        now
      )
      .run();

    // Insert guarantees if provided
    if (data.guarantees && data.guarantees.length > 0) {
      for (const g of data.guarantees) {
        const guaranteeId = generateId();
        await db
          .prepare(
            `INSERT INTO contract_guarantees (
              id, group_contract_id, guarantee_number, care_type, label,
              reimbursement_rate, is_fixed_amount,
              annual_limit, per_event_limit, daily_limit, max_days,
              letter_keys_json, sub_limits_json,
              conditions_text, requires_prescription, requires_cnam_complement,
              renewal_period_months, age_limit, waiting_period_days,
              exclusions_text, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
          )
          .bind(
            guaranteeId,
            contractId,
            g.guaranteeNumber,
            g.careType,
            g.label,
            g.reimbursementRate ?? null,
            g.isFixedAmount ? 1 : 0,
            g.annualLimit ?? null,
            g.perEventLimit ?? null,
            g.dailyLimit ?? null,
            g.maxDays ?? null,
            g.letterKeysJson ?? null,
            g.subLimitsJson ?? null,
            g.conditionsText ?? null,
            g.requiresPrescription ? 1 : 0,
            g.requiresCnamComplement ? 1 : 0,
            g.renewalPeriodMonths ?? null,
            g.ageLimit ?? null,
            g.waitingPeriodDays,
            g.exclusionsText ?? null,
            now,
            now
          )
          .run();
      }
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'group_contract.create',
      entityType: 'group_contract',
      entityId: contractId,
      changes: {
        contractNumber: data.contractNumber,
        companyId: data.companyId,
        insurerId: effectiveInsurerId,
        guaranteesCount: data.guarantees?.length ?? 0,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    // Return the created contract with guarantees
    const result = await db
      .prepare('SELECT * FROM group_contracts WHERE id = ?')
      .bind(contractId)
      .first();

    const guarantees = await db
      .prepare('SELECT * FROM contract_guarantees WHERE group_contract_id = ? ORDER BY guarantee_number')
      .bind(contractId)
      .all();

    return created(c, { ...result, guarantees: guarantees.results ?? [] });
  }
);

// ---------------------------------------------------------------------------
// PUT /:id — Update a group contract
// ---------------------------------------------------------------------------
groupContracts.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', groupContractUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Check existence & access
    const existing = await db
      .prepare('SELECT * FROM group_contracts WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!existing) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    if (
      user?.insurerId &&
      user.role === 'INSURER_ADMIN' &&
      existing.insurer_id !== user.insurerId
    ) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    // Build dynamic UPDATE
    const sets: string[] = [];
    const values: unknown[] = [];

    const fieldMap: Record<string, string> = {
      contractNumber: 'contract_number',
      intermediaryName: 'intermediary_name',
      intermediaryCode: 'intermediary_code',
      effectiveDate: 'effective_date',
      annualRenewalDate: 'annual_renewal_date',
      endDate: 'end_date',
      annualGlobalLimit: 'annual_global_limit',
      carenceDays: 'carence_days',
      childrenMaxAge: 'children_max_age',
      childrenStudentMaxAge: 'children_student_max_age',
      documentUrl: 'document_url',
      documentId: 'document_id',
      planCategory: 'plan_category',
      status: 'status',
      notes: 'notes',
    };

    const boolFieldMap: Record<string, string> = {
      riskIllness: 'risk_illness',
      riskDisability: 'risk_disability',
      riskDeath: 'risk_death',
      coversSpouse: 'covers_spouse',
      coversChildren: 'covers_children',
      coversDisabledChildren: 'covers_disabled_children',
      coversRetirees: 'covers_retirees',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if ((data as Record<string, unknown>)[jsKey] !== undefined) {
        sets.push(`${dbCol} = ?`);
        values.push((data as Record<string, unknown>)[jsKey]);
      }
    }

    for (const [jsKey, dbCol] of Object.entries(boolFieldMap)) {
      if ((data as Record<string, unknown>)[jsKey] !== undefined) {
        sets.push(`${dbCol} = ?`);
        values.push((data as Record<string, unknown>)[jsKey] ? 1 : 0);
      }
    }

    if (sets.length === 0 && !data.guarantees) {
      return success(c, existing);
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      await db
        .prepare(`UPDATE group_contracts SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    }

    // Update guarantees if provided (replace all)
    if (data.guarantees) {
      // Deactivate existing guarantees
      await db
        .prepare('UPDATE contract_guarantees SET is_active = 0 WHERE group_contract_id = ?')
        .bind(id)
        .run();

      const now = new Date().toISOString();
      for (const g of data.guarantees) {
        const guaranteeId = generateId();
        await db
          .prepare(
            `INSERT INTO contract_guarantees (
              id, group_contract_id, guarantee_number, care_type, label,
              reimbursement_rate, is_fixed_amount,
              annual_limit, per_event_limit, daily_limit, max_days,
              letter_keys_json, sub_limits_json,
              conditions_text, requires_prescription, requires_cnam_complement,
              renewal_period_months, age_limit, waiting_period_days,
              exclusions_text, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
          )
          .bind(
            guaranteeId,
            id,
            g.guaranteeNumber,
            g.careType,
            g.label,
            g.reimbursementRate ?? null,
            g.isFixedAmount ? 1 : 0,
            g.annualLimit ?? null,
            g.perEventLimit ?? null,
            g.dailyLimit ?? null,
            g.maxDays ?? null,
            g.letterKeysJson ?? null,
            g.subLimitsJson ?? null,
            g.conditionsText ?? null,
            g.requiresPrescription ? 1 : 0,
            g.requiresCnamComplement ? 1 : 0,
            g.renewalPeriodMonths ?? null,
            g.ageLimit ?? null,
            g.waitingPeriodDays,
            g.exclusionsText ?? null,
            now,
            now
          )
          .run();
      }
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'group_contract.update',
      entityType: 'group_contract',
      entityId: id,
      changes: data as Record<string, unknown>,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    // Return updated contract
    const updated = await db
      .prepare('SELECT * FROM group_contracts WHERE id = ?')
      .bind(id)
      .first();

    const guarantees = await db
      .prepare('SELECT * FROM contract_guarantees WHERE group_contract_id = ? AND is_active = 1 ORDER BY guarantee_number')
      .bind(id)
      .all();

    return success(c, { ...updated, guarantees: guarantees.results ?? [] });
  }
);

// ---------------------------------------------------------------------------
// GET /:id/guarantees — Get guarantees for a group contract
// ---------------------------------------------------------------------------
groupContracts.get(
  '/:id/guarantees',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c);

    // Check contract exists and access
    const contract = await db
      .prepare('SELECT id, insurer_id FROM group_contracts WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!contract) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    if (
      user?.insurerId &&
      (user.role === 'INSURER_ADMIN' || user.role === 'INSURER_AGENT') &&
      contract.insurer_id !== user.insurerId
    ) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    const guarantees = await db
      .prepare(
        `SELECT * FROM contract_guarantees
         WHERE group_contract_id = ? AND is_active = 1
         ORDER BY guarantee_number ASC`
      )
      .bind(id)
      .all();

    return success(c, guarantees.results ?? []);
  }
);

// ---------------------------------------------------------------------------
// POST /analyse-pdf — Upload contract PDF/images & extract data via Gemini AI
// ---------------------------------------------------------------------------

// Keep for potential future use with vision model for image-only uploads
function _buildContractExtractionPrompt(pageNumber: number, totalPages: number): string {
  return `Analyse cette image (page ${pageNumber}/${totalPages}) d'un contrat d'assurance groupe santé tunisien.

Extrais TOUTES les informations visibles dans cette page au format JSON. Selon le contenu de la page, extrais:

## Si c'est la page d'en-tête du contrat:
{
  "pageType": "header",
  "contractNumber": "numéro complet du contrat (ex: N°2026 701 000 08)",
  "companyName": "raison sociale du souscripteur",
  "companyAddress": "adresse du souscripteur",
  "matriculeFiscale": "matricule fiscale",
  "insurerName": "nom de la compagnie d'assurance (ex: BH ASSURANCE, GAT, STAR, COMAR, AMI)",
  "intermediaryName": "nom de l'intermédiaire/courtier",
  "intermediaryCode": "code intermédiaire (ex: 111)",
  "effectiveDate": "date d'effet au format YYYY-MM-DD",
  "annualRenewalDate": "échéance annuelle au format MM-DD",
  "risks": {
    "illness": true,
    "disability": true/false,
    "death": true/false
  }
}

## Si c'est la page des dispositions spéciales / bénéficiaires:
{
  "pageType": "beneficiaries",
  "coversSpouse": true/false,
  "coversChildren": true/false,
  "childrenMaxAge": nombre (souvent 20),
  "childrenStudentMaxAge": nombre (souvent 28),
  "coversDisabledChildren": true/false,
  "coversRetirees": true/false,
  "effectifAssurable": "description de l'effectif"
}

## Si c'est le TABLEAU DES PRESTATIONS (le plus important):
{
  "pageType": "guarantees",
  "annualGlobalLimit": nombre en DT (ex: 6000 pour "6000 DT par prestataire et par an"),
  "guarantees": [
    {
      "guaranteeNumber": numéro de 1 à 18,
      "careType": "TYPE (voir mapping ci-dessous)",
      "label": "libellé exact tel qu'écrit dans le tableau",
      "reimbursementRate": taux entre 0 et 1 (ex: 0.80 pour 80%, 0.90 pour 90%, 1.0 pour 100%),
      "isFixedAmount": true si forfait fixe (pas de pourcentage),
      "annualLimit": plafond annuel en DT (nombre, ex: 1000 pour "1000,000 DT/an"),
      "perEventLimit": plafond par acte/événement en DT,
      "dailyLimit": plafond journalier en DT (pour hospitalisation, sanatorium),
      "maxDays": nombre max de jours (pour séjours),
      "letterKeys": {
        "C1": valeur en DT de la lettre-clé C1 (consultation généraliste),
        "C2": valeur C2 (consultation spécialiste),
        "C3": valeur C3 (consultation professeur/agrégé),
        "V1": valeur V1 (visite généraliste),
        "V2": valeur V2 (visite spécialiste),
        "V3": valeur V3 (visite professeur),
        "B": valeur lettre B (biologie/analyses),
        "P": valeur lettre P (anatomo-cytologie),
        "Z": valeur lettre Z (radiologie),
        "E": valeur lettre E (échographie),
        "K": valeur lettre K (actes chirurgicaux),
        "KC": valeur lettre KC (chirurgie),
        "AM": valeur des auxiliaires médicaux,
        "AMM": valeur AMM (injection insuline)
      },
      "subLimits": {
        "monture": plafond monture en DT,
        "verres_normaux": plafond verres normaux,
        "verres_doubles_foyers": plafond verres doubles foyers,
        "lentilles": plafond lentilles,
        "hopital": plafond journalier hôpital,
        "clinique": plafond journalier clinique,
        "salle_operation": plafond salle opération,
        "anesthesie": plafond anesthésie,
        "medicaments_chirurgie": plafond médicaments chirurgie,
        "hopital_accouchement": forfait accouchement hôpital,
        "clinique_accouchement": forfait accouchement clinique,
        "maladies_ordinaires": plafond maladies ordinaires,
        "maladies_chroniques": plafond maladies chroniques
      },
      "conditionsText": "conditions et remarques visibles dans la colonne de droite",
      "requiresPrescription": true si "sur prescription médicale" ou "sur ordonnance",
      "requiresCnamComplement": true si "en complément de la CNAM" ou "après prise en charge CNAM",
      "renewalPeriodMonths": période de renouvellement en mois (ex: 24 pour "tous les 2 ans"),
      "ageLimit": limite d'âge si mentionnée (ex: 20 pour orthodontie < 20 ans),
      "exclusionsText": "exclusions mentionnées"
    }
  ]
}

## Mapping des rubriques vers careType:
1. SOINS MEDICAUX / CONSULTATIONS ET VISITES → "consultation"
2. FRAIS PHARMACEUTIQUES → "pharmacy"
3. ANALYSES ET TRAVAUX DE LABORATOIRE → "laboratory"
4. OPTIQUE → "optical"
5. CHIRURGIE REFRACTIVE (laser) → "refractive_surgery"
6. ACTES MEDICAUX COURANTS / RADIOLOGIE / TRAITEMENTS SPECIAUX → "medical_acts"
7. TRANSPORT DU MALADE → "transport"
8. FRAIS CHIRURGICAUX → "surgery"
9. ORTHOPEDIE / PROTHESES → "orthopedics"
10. HOSPITALISATION → "hospitalization"
11. ACCOUCHEMENT → "maternity"
12. INTERRUPTION INVOLONTAIRE DE GROSSESSE (IVG) → "ivg"
13. SOINS ET PROTHESES DENTAIRES → "dental"
14. SOINS ORTHODONTIQUES → "orthodontics"
15. CIRCONCISION → "circumcision"
16. SANATORIUM / PREVENTORIUM → "sanatorium"
17. CURES THERMALES → "thermal_cure"
18. FRAIS FUNERAIRES → "funeral"

## Règles d'extraction des montants tunisiens:
- "45,000 DT" ou "45,000DT" → 45 (en Dinars tunisiens)
- "1000,000 Dinars" → 1000
- "Maximum=300,000 Dinars/acte" → perEventLimit: 300
- "100% des frais engagés" → reimbursementRate: 1.0
- "90% des frais engagés" → reimbursementRate: 0.9
- "80%" → reimbursementRate: 0.8
- "Forfait par enfant =200,000 Dinars" → isFixedAmount: true, perEventLimit: 200
- "B =0.320DT" → letterKeys.B: 0.32
- "Maximum/an/prestataire" → annualLimit
- Inclure UNIQUEMENT les lettres-clés et sous-limites qui sont VISIBLES sur cette page.
- Si une valeur n'est pas visible, ne l'inclure PAS dans le JSON (ne pas mettre null).

IMPORTANT: Retourne UNIQUEMENT le JSON, sans aucun texte explicatif avant ou après.`;
}

/**
 * Fusionne les données extraites de plusieurs pages en un objet unique.
 */
function mergeExtractedPages(pages: Array<Record<string, unknown>>): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    contractNumber: null,
    companyName: null,
    companyAddress: null,
    matriculeFiscale: null,
    insurerName: null,
    intermediaryName: null,
    intermediaryCode: null,
    effectiveDate: null,
    annualRenewalDate: null,
    riskIllness: true,
    riskDisability: false,
    riskDeath: false,
    coversSpouse: true,
    coversChildren: true,
    childrenMaxAge: 20,
    childrenStudentMaxAge: 28,
    coversDisabledChildren: true,
    coversRetirees: false,
    annualGlobalLimit: null,
    planCategory: 'standard',
    guarantees: [] as Record<string, unknown>[],
  };

  for (const page of pages) {
    const pageType = page.pageType as string;

    if (pageType === 'header') {
      if (page.contractNumber) merged.contractNumber = page.contractNumber;
      if (page.companyName) merged.companyName = page.companyName;
      if (page.companyAddress) merged.companyAddress = page.companyAddress;
      if (page.matriculeFiscale) merged.matriculeFiscale = page.matriculeFiscale;
      if (page.insurerName) merged.insurerName = page.insurerName;
      if (page.intermediaryName) merged.intermediaryName = page.intermediaryName;
      if (page.intermediaryCode) merged.intermediaryCode = page.intermediaryCode;
      if (page.effectiveDate) merged.effectiveDate = page.effectiveDate;
      if (page.annualRenewalDate) merged.annualRenewalDate = page.annualRenewalDate;
      const risks = page.risks as Record<string, boolean> | undefined;
      if (risks) {
        if (risks.illness !== undefined) merged.riskIllness = risks.illness;
        if (risks.disability !== undefined) merged.riskDisability = risks.disability;
        if (risks.death !== undefined) merged.riskDeath = risks.death;
      }
    }

    if (pageType === 'beneficiaries') {
      if (page.coversSpouse !== undefined) merged.coversSpouse = page.coversSpouse;
      if (page.coversChildren !== undefined) merged.coversChildren = page.coversChildren;
      if (page.childrenMaxAge) merged.childrenMaxAge = page.childrenMaxAge;
      if (page.childrenStudentMaxAge) merged.childrenStudentMaxAge = page.childrenStudentMaxAge;
      if (page.coversDisabledChildren !== undefined) merged.coversDisabledChildren = page.coversDisabledChildren;
      if (page.coversRetirees !== undefined) merged.coversRetirees = page.coversRetirees;
    }

    if (pageType === 'guarantees') {
      if (page.annualGlobalLimit) merged.annualGlobalLimit = page.annualGlobalLimit;
      const pageGuarantees = page.guarantees as Record<string, unknown>[] | undefined;
      if (Array.isArray(pageGuarantees)) {
        (merged.guarantees as Record<string, unknown>[]).push(...pageGuarantees);
      }
    }
  }

  // Dédupliquer les garanties par guaranteeNumber
  const guaranteesMap = new Map<number, Record<string, unknown>>();
  for (const g of merged.guarantees as Record<string, unknown>[]) {
    const num = Number(g.guaranteeNumber);
    if (num > 0) {
      const existing = guaranteesMap.get(num);
      if (existing) {
        // Merge: keep non-null values
        for (const [key, val] of Object.entries(g)) {
          if (val !== null && val !== undefined) {
            existing[key] = val;
          }
        }
      } else {
        guaranteesMap.set(num, { ...g });
      }
    }
  }
  merged.guarantees = Array.from(guaranteesMap.values()).sort(
    (a, b) => Number(a.guaranteeNumber) - Number(b.guaranteeNumber)
  );

  return merged;
}

/**
 * Prompt Gemini pour l'analyse complète d'un contrat d'assurance groupe tunisien.
 * Gemini supporte nativement les PDFs et images — pas besoin d'extraction de texte.
 */
const GEMINI_CONTRACT_PROMPT = `Tu es un expert en assurance santé groupe en Tunisie. Tu travailles pour la plateforme Dhamen de tiers payant.

Analyse ce document de contrat d'assurance groupe multirisques tunisien. Ce document contient PLUSIEURS SECTIONS IMPORTANTES:

## SECTION 1 — EN-TÊTE DU CONTRAT (PREMIÈRE PAGE)
La PREMIERE PAGE contient TOUJOURS les informations suivantes dans un cadre ou en-tête:
- Le TITRE "CONTRAT D'ASSURANCE GROUPE MULTIRISQUES"
- Le NUMERO DU CONTRAT: "N°2026 701 000 08" ou similaire — C'EST OBLIGATOIRE À EXTRAIRE
- "CONDITIONS PARTICULIERES"
- "Intermédiaire: Bureaux Direct" et "Code: 111" — le courtier et son code
- SOUSCRIPTEUR: la raison sociale de l'entreprise (ex: "Société De Promotion De Logements Sociaux")
- ADRESSE: l'adresse complète (ex: "Rue Mohieddine ElKlibi El Manar 2, Tunis 2092")
- MATRICULE FISCALE: le numéro fiscal (ex: "0002788H")
- EFFET DU CONTRAT: la date d'effet (ex: "LE 1er JANVIER 2026")
- ECHEANCE ANNUELLE: la date d'échéance (ex: "LE 1er JANVIER DE CHAQUE ANNEE")

## SECTION 2 — ARTICLES ET DISPOSITIONS
- ARTICLE PREMIER: mentionne l'assureur (ex: "BH ASSURANCE") et le souscripteur
- ARTICLE 2 - RISQUES GARANTIS: liste des risques (maladie, incapacité, décès)
- ARTICLE 6 - DISPOSITIONS SPECIALES: prestataires assurés, bénéficiaires, âges limites

## SECTION 3 — TABLEAU DES PRESTATIONS
Le tableau avec les 18 rubriques de garantie et leurs barèmes détaillés.
Le bas du tableau contient: "MAXIMUM DES PRESTATIONS: X,000 DINARS PAR PRESTATAIRE ET PAR AN"

EXTRAIS ABSOLUMENT TOUTES CES INFORMATIONS. Ne mets null QUE si l'information est réellement ABSENTE du document.

Retourne UNIQUEMENT du JSON valide (pas de texte avant/après, pas de bloc markdown \`\`\`):

{
  "contractNumber": "numéro EXACT tel qu'il apparaît (ex: '2026 701 000 08'). REGARDE le titre en haut de la première page après 'N°'",
  "companyName": "raison sociale du SOUSCRIPTEUR. REGARDE après 'SOUSCRIPTEUR:' sur la première page",
  "companyAddress": "adresse COMPLETE. REGARDE après 'ADRESSE:' sur la première page",
  "matriculeFiscale": "REGARDE après 'MATRICULE FISCALE:' sur la première page (ex: '0002788H')",
  "insurerName": "nom de l'ASSUREUR mentionné dans l'Article Premier ou la signature (ex: 'BH ASSURANCE'). REGARDE aussi 'P/ BH ASSURANCE' en bas",
  "intermediaryName": "REGARDE 'Intermédiaire:' dans le cadre d'en-tête (ex: 'Bureaux Direct')",
  "intermediaryCode": "REGARDE 'Code:' à côté de l'intermédiaire (ex: '111')",
  "effectiveDate": "date d'effet au format YYYY-MM-DD. REGARDE 'EFFET DU CONTRAT:'. '1er JANVIER 2026' → '2026-01-01'",
  "annualRenewalDate": "REGARDE 'ECHEANCE ANNUELLE:'. '1er JANVIER DE CHAQUE ANNEE' → même année que effectiveDate mais année suivante, format YYYY-MM-DD",
  "riskIllness": true,
  "riskDisability": "REGARDE Article 2. 'Risques Incapacité/Invalidité' → true",
  "riskDeath": "REGARDE Article 2. 'Risque Décès' → true",
  "annualGlobalLimit": "nombre en DT. REGARDE 'MAXIMUM DES PRESTATIONS' en bas du tableau. '6000,000 DINARS' → 6000",
  "coversSpouse": "REGARDE Article 6. 'leurs conjoints' → true",
  "coversChildren": "REGARDE Article 6. 'enfants à charge' → true",
  "childrenMaxAge": "REGARDE Article 6. 'enfants âgés de moins de X ans' → nombre",
  "childrenStudentMaxAge": "REGARDE Article 6. 'enfants âgés de 20 à X ans scolarisés' → nombre",
  "coversDisabledChildren": "REGARDE Article 6. 'enfants handicapés sans limite d'âge' → true/false",
  "coversRetirees": "REGARDE Article 6. 'personnel retraité' → true/false",
  "planCategory": "standard",
  "guarantees": [
    {
      "guaranteeNumber": 1,
      "careType": "consultation",
      "label": "libellé exact de la rubrique",
      "reimbursementRate": taux entre 0 et 1 (0.80 pour 80%, 0.90 pour 90%, 1.0 pour 100%) ou null si forfait,
      "isFixedAmount": true si c'est un forfait fixe (pas de pourcentage),
      "annualLimit": plafond annuel en DT ou null,
      "perEventLimit": plafond par acte/événement en DT ou null,
      "dailyLimit": plafond journalier en DT (hospitalisation) ou null,
      "maxDays": nombre max de jours ou null,
      "letterKeys": {"C1": 45.0, "C2": 55.0, ...} — UNIQUEMENT les lettres-clés visibles pour cette rubrique,
      "subLimits": {"monture": 300, "verres_normaux": 200, ...} — sous-plafonds spécifiques,
      "conditionsText": "conditions et remarques extraites",
      "requiresPrescription": true si "sur prescription médicale" ou "sur ordonnance",
      "requiresCnamComplement": true si "en complément de la CNAM" ou "après prise en charge CNAM",
      "renewalPeriodMonths": période de renouvellement en mois (24 pour "tous les 2 ans") ou null,
      "ageLimit": limite d'âge ou null (ex: 20 pour orthodontie < 20 ans),
      "exclusionsText": "exclusions mentionnées" ou null
    }
  ]
}

## MAPPING OBLIGATOIRE des rubriques vers careType:
1. SOINS MEDICAUX / CONSULTATIONS ET VISITES → "consultation"
2. FRAIS PHARMACEUTIQUES → "pharmacy"
3. ANALYSES ET TRAVAUX DE LABORATOIRE → "laboratory"
4. OPTIQUE (lunettes, verres, montures, lentilles) → "optical"
5. CHIRURGIE REFRACTIVE / LASER → "refractive_surgery"
6. ACTES MEDICAUX COURANTS / RADIOLOGIE / ELECTRORADIOLOGIE / TRAITEMENTS SPECIAUX / AUXILIAIRES MEDICAUX → "medical_acts"
7. TRANSPORT DU MALADE → "transport"
8. FRAIS CHIRURGICAUX (KC, salle opération, anesthésie) → "surgery"
9. ORTHOPEDIE / PROTHESES (non dentaires) → "orthopedics"
10. HOSPITALISATION (hôpital + clinique) → "hospitalization"
11. ACCOUCHEMENT / MATERNITE → "maternity"
12. INTERRUPTION INVOLONTAIRE DE GROSSESSE → "ivg"
13. SOINS ET PROTHESES DENTAIRES (y compris détartrage) → "dental"
14. SOINS ORTHODONTIQUES → "orthodontics"
15. CIRCONCISION → "circumcision"
16. SANATORIUM / PREVENTORIUM → "sanatorium"
17. CURES THERMALES → "thermal_cure"
18. FRAIS FUNERAIRES → "funeral"

## LETTRES-CLÉS tunisiennes à extraire du tableau:
- C1 = consultation généraliste, C2 = spécialiste, C3 = professeur agrégé
- V1 = visite généraliste, V2 = visite spécialiste, V3 = visite professeur
- B = analyses biologiques (valeur unitaire de la lettre B)
- P = anatomo-cytologie/pathologie
- Z = radiologie (valeur de la lettre Z)
- E = échographie
- K ou KC = actes chirurgicaux (valeur du KC)
- AM = auxiliaires médicaux
- AMM = injection insuline

## SOUS-LIMITES à extraire (clés à utiliser dans subLimits):
- Pour PHARMACIE: "maladies_ordinaires", "maladies_chroniques", "sterilite"
- Pour OPTIQUE: "monture", "verres_normaux", "verres_doubles_foyers", "lentilles"
- Pour CHIRURGIE: "salle_operation", "anesthesie", "medicaments_chirurgie", "kc_valeur"
- Pour HOSPITALISATION: "hopital_jour", "clinique_jour"
- Pour ACCOUCHEMENT: "hopital_simple", "clinique_simple", "clinique_plafond_cnam"
- Pour ACTES MEDICAUX: "radio_z", "echo_e", "irm_plafond", "scanner_plafond", "endoscopie", "am_valeur", "amm_valeur"

## RÈGLES DE CONVERSION DES MONTANTS TUNISIENS:
- "45,000 DT" ou "45,000DT" → 45 (en Dinars tunisiens, diviser par 1000 les millimes)
- "1000,000 Dinars/an/prestataire" → annualLimit: 1000
- "1500,000 Dinars" → 1500
- "Maximum=300,000 Dinars/acte" → perEventLimit: 300
- "B =0,320DT" ou "B =0.320DT" → letterKeys.B = 0.32
- "KC=10,000 DT" → subLimits.kc_valeur = 10 ET letterKeys.KC = 10
- "90% des frais engagés" → reimbursementRate: 0.9
- "100% des frais engagés" → reimbursementRate: 1.0
- "80%" → reimbursementRate: 0.8
- "Forfait par enfant =200,000 Dinars" → isFixedAmount: true, perEventLimit: 200

IMPORTANT:
- Extrais TOUTES les garanties du tableau des prestations (il y en a généralement entre 15 et 18)
- Sois PRECIS sur les montants — ne confonds pas millimes et dinars
- Les lettres-clés ne concernent que certaines rubriques, ne les invente pas
- Si une information n'est pas dans le document, mets null (pas de valeur inventée)
- Retourne UNIQUEMENT le JSON, aucun texte explicatif`;

/**
 * Décompresse un buffer avec Deflate via l'API Web DecompressionStream.
 * Compatible Cloudflare Workers (pas besoin de zlib Node.js).
 */
function inflateBuffer(compressed: Uint8Array): Uint8Array {
  // Use pako for Workers-compatible deflate decompression
  // Try zlib-wrapped inflate first, then raw inflate
  try {
    return pako.inflate(compressed);
  } catch {
    return pako.inflateRaw(compressed);
  }
}

/**
 * Extrait les chaînes de texte depuis un contenu PDF décompressé.
 */
function extractTextFromContent(content: string): string[] {
  const parts: string[] = [];
  const strRegex = /\(([^)]*)\)/g;
  let strMatch: RegExpExecArray | null;
  while ((strMatch = strRegex.exec(content)) !== null) {
    const text = (strMatch[1] ?? '')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (text.trim().length > 0) {
      parts.push(text);
    }
  }
  return parts;
}

/**
 * Recherche un motif d'octets dans un buffer.
 * Retourne l'index de la première occurrence ou -1.
 */
function findBytes(haystack: Uint8Array, needle: Uint8Array, startFrom = 0): number {
  for (let i = startFrom; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

/**
 * Extracteur de texte brut depuis un PDF.
 * Fonctionne en environnement Cloudflare Workers.
 * Travaille directement avec les octets bruts pour éviter la corruption
 * lors de la conversion texte ↔ binaire.
 */
async function extractRawTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const textParts: string[] = [];

  const streamMarker = new TextEncoder().encode('stream');
  const endstreamMarker = new TextEncoder().encode('endstream');
  const flateDecodeMarker = new TextEncoder().encode('FlateDecode');

  let searchPos = 0;
  let decompressedCount = 0;
  let failedCount = 0;

  while (searchPos < bytes.length) {
    // Trouver "stream"
    const streamStart = findBytes(bytes, streamMarker, searchPos);
    if (streamStart === -1) break;

    // Avancer après "stream\r\n" ou "stream\n"
    let dataStart = streamStart + streamMarker.length;
    if (dataStart < bytes.length && bytes[dataStart] === 0x0D) dataStart++; // \r
    if (dataStart < bytes.length && bytes[dataStart] === 0x0A) dataStart++; // \n

    // Trouver "endstream"
    const endstreamPos = findBytes(bytes, endstreamMarker, dataStart);
    if (endstreamPos === -1) break;

    // Les données du stream sont entre dataStart et endstreamPos
    // Vérifier si FlateDecode apparaît dans les 300 octets avant "stream"
    const lookbackStart = Math.max(0, streamStart - 300);
    const lookback = bytes.slice(lookbackStart, streamStart);
    const isCompressed = findBytes(lookback, flateDecodeMarker) !== -1;

    // Extraire les données brutes du stream (en retirant \r\n avant endstream)
    let dataEnd = endstreamPos;
    while (dataEnd > dataStart && (bytes[dataEnd - 1] === 0x0A || bytes[dataEnd - 1] === 0x0D)) {
      dataEnd--;
    }
    const streamData = bytes.slice(dataStart, dataEnd);

    if (isCompressed && streamData.length > 0) {
      try {
        const decompressed = inflateBuffer(streamData);
        const text = new TextDecoder('latin1').decode(decompressed);
        const parts = extractTextFromContent(text);
        textParts.push(...parts);
        if (parts.length > 0) decompressedCount++;
      } catch {
        failedCount++;
      }
    } else if (streamData.length > 0) {
      const text = new TextDecoder('latin1').decode(streamData);
      textParts.push(...extractTextFromContent(text));
    }

    searchPos = endstreamPos + endstreamMarker.length;
  }

  console.log(`PDF extraction: ${decompressedCount} decompressed with text, ${failedCount} failed`);
  return textParts.join(' ');
}

/**
 * Convertit un mot en pattern regex tolérant les espaces entre caractères.
 * Ex: "SOUSCRIPTEUR" → "S\\s*O\\s*U\\s*S\\s*C\\s*R\\s*I\\s*P\\s*T\\s*E\\s*U\\s*R"
 * Nécessaire car les PDF utilisent souvent du positionnement caractère par caractère.
 */
function spaced(word: string): string {
  return word.split('').join('\\s*');
}

/**
 * Normalise le texte extrait du PDF en supprimant les marqueurs fr-FR
 * et en nettoyant les espaces excessifs.
 */
function normalizePdfText(text: string): string {
  return text
    .replace(/fr-FR/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nettoie une valeur extraite en reconstituant les mots fragmentés par le PDF.
 * Le PDF utilise du positionnement caractère par caractère, résultant en
 * "S oc iét é D e P r om otion" au lieu de "Société De Promotion".
 * Stratégie: coller les fragments courts (1-3 chars) au fragment suivant.
 */
function cleanExtractedValue(val: string): string {
  const cleaned = val
    .replace(/fr-FR/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Reconstituer les mots: coller les fragments courts entre eux
  const tokens = cleaned.split(' ');
  const words: string[] = [];
  let current = '';

  for (const token of tokens) {
    if (current.length === 0) {
      current = token;
    } else if (current.length <= 3 || token.length <= 2) {
      // Fragment court → coller au mot en cours
      current += token;
    } else {
      // Fragment long → nouveau mot
      words.push(current);
      current = token;
    }
  }
  if (current.length > 0) words.push(current);

  return words.join(' ');
}

/**
 * Extraction par regex directe des champs d'en-tête du contrat.
 * Fonctionne même sans Gemini — utilise le texte brut extrait du PDF.
 * Les regex utilisent spaced() pour tolérer les espaces inter-caractères
 * typiques des PDF avec positionnement individuel des glyphes.
 */
function extractHeaderFromText(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const normalized = normalizePdfText(text);

  // Numéro de contrat: cherche "N°" suivi du numéro (chiffres potentiellement espacés)
  const contractNumRegex = new RegExp(`N[°o]\\s*([0-9][0-9\\s]+[0-9])`, 'i');
  const contractNumMatch = normalized.match(contractNumRegex);
  if (contractNumMatch) result.contractNumber = (contractNumMatch[1] ?? '').replace(/\s/g, '');

  // Souscripteur — mot-clé avec espaces tolérées
  const souscRegex = new RegExp(`${spaced('SOUSCRIPTEUR')}\\s*:?\\s*(.+?)(?=${spaced('ADRESSE')}|${spaced('MATRICULE')}|$)`, 'is');
  const souscripteurMatch = normalized.match(souscRegex);
  if (souscripteurMatch) {
    result.companyName = cleanExtractedValue(souscripteurMatch[1] ?? '').replace(/^:\s*/, '');
  }

  // Adresse
  const adresseRegex = new RegExp(`${spaced('ADRESSE')}\\s*:?\\s*(.+?)(?=${spaced('MATRICULE')}|${spaced('EFFET')}|$)`, 'is');
  const adresseMatch = normalized.match(adresseRegex);
  if (adresseMatch) {
    result.companyAddress = cleanExtractedValue(adresseMatch[1] ?? '').replace(/^:\s*/, '');
  }

  // Matricule fiscale — stop at EFFET or end
  const matriculeRegex = new RegExp(`${spaced('MATRICULE')}\\s*${spaced('FISCAL')}[E\\s]*:?\\s*([A-Z0-9][A-Z0-9\\s]*[A-Z0-9])(?=\\s*${spaced('EFFET')}|\\s*$)`, 'i');
  const matriculeMatch = normalized.match(matriculeRegex);
  if (matriculeMatch) result.matriculeFiscale = (matriculeMatch[1] ?? '').replace(/\s/g, '').trim();

  // Intermédiaire
  const intermRegex = new RegExp(`${spaced('Interm')}[ée\\s]*${spaced('diaire')}\\s*:?\\s*(.+?)(?=${spaced('Code')}|$)`, 'i');
  const intermMatch = normalized.match(intermRegex);
  if (intermMatch) {
    result.intermediaryName = cleanExtractedValue(intermMatch[1] ?? '').replace(/^:\s*/, '');
  }

  // Code intermédiaire — stop before section numbers (e.g., "3 . 2")
  const codeRegex = new RegExp(`${spaced('Code')}\\s*:?\\s*([0-9][0-9\\s]{0,20})(?=\\s*\\d\\s*\\.\\s*\\d|\\s*${spaced('RISQ')}|\\s*$)`, 'i');
  const codeMatch = normalized.match(codeRegex);
  if (codeMatch) result.intermediaryCode = (codeMatch[1] ?? '').replace(/\s/g, '').trim();

  // Effet du contrat — cherche une date avec mois en français (mots potentiellement espacés)
  const monthNames = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];
  const monthPattern = monthNames.map(m => spaced(m)).join('|');
  const effetRegex = new RegExp(
    `${spaced('EFFET')}\\s*(?:${spaced('DU')}\\s*${spaced('CONTRAT')})?\\s*:?\\s*(?:${spaced('LE')}\\s*)?` +
    `(\\d[\\d\\s]*)\\s*(?:er|[èe]me)?\\s*(${monthPattern})\\s*(\\d[\\d\\s]*)`,
    'i'
  );
  const effetMatch = normalized.match(effetRegex);
  if (effetMatch) {
    const months: Record<string, string> = {
      'JANVIER': '01', 'FEVRIER': '02', 'MARS': '03', 'AVRIL': '04',
      'MAI': '05', 'JUIN': '06', 'JUILLET': '07', 'AOUT': '08',
      'SEPTEMBRE': '09', 'OCTOBRE': '10', 'NOVEMBRE': '11', 'DECEMBRE': '12',
    };
    const day = (effetMatch[1] ?? '1').replace(/\s/g, '').padStart(2, '0');
    const monthText = (effetMatch[2] ?? '').replace(/\s/g, '').toUpperCase();
    const month = months[monthText] ?? '01';
    const year = (effetMatch[3] ?? '2026').replace(/\s/g, '');
    result.effectiveDate = `${year}-${month}-${day}`;
  }

  // Échéance annuelle
  const echeanceRegex = new RegExp(
    `${spaced('ECHEANCE')}\\s*${spaced('ANNUELLE')}\\s*:?\\s*(?:${spaced('LE')}\\s*)?` +
    `(\\d[\\d\\s]*)\\s*(?:er|[èe]me)?\\s*(${monthPattern})`,
    'i'
  );
  const echeanceMatch = normalized.match(echeanceRegex);
  if (echeanceMatch) {
    const months: Record<string, string> = {
      'JANVIER': '01', 'FEVRIER': '02', 'MARS': '03', 'AVRIL': '04',
      'MAI': '05', 'JUIN': '06', 'JUILLET': '07', 'AOUT': '08',
      'SEPTEMBRE': '09', 'OCTOBRE': '10', 'NOVEMBRE': '11', 'DECEMBRE': '12',
    };
    const day = (echeanceMatch[1] ?? '1').replace(/\s/g, '').padStart(2, '0');
    const monthText = (echeanceMatch[2] ?? '').replace(/\s/g, '').toUpperCase();
    const month = months[monthText] ?? '01';
    const effYear = typeof result.effectiveDate === 'string' ? result.effectiveDate.substring(0, 4) : '2026';
    const nextYear = String(Number(effYear) + 1);
    result.annualRenewalDate = `${nextYear}-${month}-${day}`;
  }

  // Assureur — noms connus avec espaces tolérées
  const insurerPatterns = [
    `${spaced('BH')}\\s*${spaced('ASSURANCE')}`,
    `${spaced('GAT')}\\s*${spaced('Assurance')}s?`,
    `${spaced('STAR')}\\s*(?:${spaced('Assurance')}s?)?`,
    `${spaced('COMAR')}`,
    `${spaced('AMI')}\\s*${spaced('Assurance')}s?`,
    `${spaced('CARTE')}\\s*${spaced('Assurance')}s?`,
    `${spaced('LLOYD')}`,
    `${spaced('MAGHREBIA')}`,
    `${spaced('ASTREE')}`,
  ];
  const assureurRegex = new RegExp(`(${insurerPatterns.join('|')})`, 'i');
  const assureurMatch = normalized.match(assureurRegex);
  if (assureurMatch) result.insurerName = cleanExtractedValue(assureurMatch[0]);

  // Risques garantis — tolérer espaces dans les mots-clés
  const maladie = new RegExp(spaced('maladie'), 'i');
  const incapacite = new RegExp(`${spaced('incapacit')}|${spaced('invalidit')}`, 'i');
  const deces = new RegExp(`${spaced('d')}[ée\\s]*${spaced('c')}[èe\\s]*s`, 'i');
  result.riskIllness = maladie.test(normalized);
  result.riskDisability = incapacite.test(normalized);
  result.riskDeath = deces.test(normalized);

  // Bénéficiaires
  result.coversSpouse = new RegExp(spaced('conjoint'), 'i').test(normalized);
  result.coversChildren = new RegExp(spaced('enfant'), 'i').test(normalized);
  result.coversRetirees = new RegExp(spaced('retrait'), 'i').test(normalized);
  result.coversDisabledChildren = new RegExp(spaced('handicap'), 'i').test(normalized);

  // Ages
  const ageMaxRegex = new RegExp(`${spaced('enfant')}s?\\s*[âa\\s]*g[ée\\s]*s?\\s*${spaced('de')}\\s*${spaced('moins')}\\s*${spaced('de')}\\s*(\\d+)\\s*${spaced('ans')}`, 'i');
  const ageMaxMatch = normalized.match(ageMaxRegex);
  if (ageMaxMatch) result.childrenMaxAge = Number(ageMaxMatch[1]);

  const ageStudentRegex = new RegExp(`20\\s*[àa]\\s*(\\d+)\\s*${spaced('ans')}|(?:(\\d+)\\s*${spaced('ans')}\\s*(?:\\(inclus\\))?\\s*${spaced('scolaris')})`, 'i');
  const ageStudentMatch = normalized.match(ageStudentRegex);
  if (ageStudentMatch) result.childrenStudentMaxAge = Number(ageStudentMatch[1] ?? ageStudentMatch[2]);

  // Maximum global
  const maxRegex = new RegExp(`${spaced('MAXIMUM')}\\s*(?:${spaced('DES')}\\s*${spaced('PRESTATIONS')})?\\s*:?\\s*(\\d[\\d\\s.,]*)\\s*(?:${spaced('DINARS')}|${spaced('DT')})`, 'i');
  const maxMatch = normalized.match(maxRegex);
  if (maxMatch) {
    const num = (maxMatch[1] ?? '').replace(/[\s.,]/g, '');
    result.annualGlobalLimit = Number(num);
  }

  return result;
}

type GeminiResult = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

/**
 * Appelle Gemini avec un prompt donné et retourne le JSON parsé.
 */
async function callGemini(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  prompt: string,
  maxOutputTokens = 8192,
): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini API error (${response.status}):`, errorText);
    return { data: null, error: `Gemini API erreur ${response.status}: ${errorText.slice(0, 200)}` };
  }

  const result = await response.json() as GeminiResult;
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { data: null, error: 'Réponse Gemini vide' };
  }

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { data: null, error: 'Pas de JSON dans la réponse Gemini' };
  }

  try {
    return { data: JSON.parse(jsonMatch[0]) };
  } catch {
    return { data: null, error: 'JSON invalide dans la réponse Gemini' };
  }
}

/**
 * Analyse un contrat PDF en 2 étapes:
 * 1. Extraction regex du texte brut pour les infos d'en-tête (instantané, sans API)
 * 2. Gemini pour le tableau des garanties (API, le modèle lite excelle sur les tableaux)
 * Les résultats sont fusionnés.
 */
async function analyseWithGemini(
  apiKey: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  _fileName: string
): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  const uint8Array = new Uint8Array(fileBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]!);
  }
  const base64Data = btoa(binary);

  // Étape 1: Extraction regex directe des infos d'en-tête depuis le texte brut du PDF
  // (le modèle lite ne peut pas lire le texte des en-têtes PDF, seulement les tableaux)
  let rawText = '';
  let headerData: Record<string, unknown> = {};
  try {
    rawText = await extractRawTextFromPdf(fileBuffer);
    headerData = extractHeaderFromText(rawText);
    console.log('PDF text extraction - raw text length:', rawText.length);
    console.log('PDF text extraction - raw text sample:', rawText.substring(0, 500));
    console.log('PDF text extraction - header fields found:', JSON.stringify(
      Object.fromEntries(Object.entries(headerData).filter(([, v]) => v != null && v !== false))
    ));
  } catch (extractError) {
    console.error('PDF text extraction failed:', extractError);
  }

  // Étape 2: Gemini pour les garanties du tableau (le modèle lite est excellent pour ça)
  const guaranteesResult = await callGemini(apiKey, base64Data, mimeType, GEMINI_CONTRACT_PROMPT, 8192);

  const errors: string[] = [];
  if (guaranteesResult.error) errors.push(`Garanties: ${guaranteesResult.error}`);

  const guaranteesData = guaranteesResult.data || {};

  // Merge: header regex data + Gemini guarantees data
  // Header regex overrides Gemini for contract fields (more reliable for text)
  // Gemini data fills gaps for fields not found by regex
  const merged: Record<string, unknown> = {
    ...guaranteesData,
  };

  // Apply header data — only override if we found a real value (not null/undefined/false)
  for (const [key, value] of Object.entries(headerData)) {
    if (value != null && value !== '' && value !== false) {
      merged[key] = value;
    }
  }

  // Always keep guarantees from Gemini
  merged.guarantees = guaranteesData.guarantees || [];

  if (Object.keys(headerData).length === 0 && !guaranteesResult.data) {
    return { data: null, error: errors.join('; ') };
  }

  return { data: merged, error: errors.length > 0 ? errors.join('; ') : undefined };
}

// Debug endpoint to test PDF text extraction (temporary)
groupContracts.post(
  '/debug-pdf-extract',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    try {
      const body = await c.req.parseBody({ all: true });
      const fileField = body['files'];
      const file = fileField instanceof File ? fileField : Array.isArray(fileField) ? fileField[0] : null;
      if (!file || !(file instanceof File)) {
        return c.json({ error: 'No file' }, 400);
      }
      const buffer = await file.arrayBuffer();
      const rawText = await extractRawTextFromPdf(buffer);
      const headerData = extractHeaderFromText(rawText);
      return c.json({
        rawTextLength: rawText.length,
        rawTextSample: rawText.substring(0, 500),
        headerData,
      });
    } catch (e) {
      return c.json({ error: String(e), stack: (e as Error)?.stack?.substring(0, 500) }, 500);
    }
  }
);

groupContracts.post(
  '/analyse-pdf',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const user = c.get('user');

    try {
      const geminiApiKey = c.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return errorResponse(c, 'CONFIG_ERROR', 'Clé API Gemini non configurée', 500);
      }

      const body = await c.req.parseBody({ all: true });

      // Collect all uploaded files from "file" and "files" fields
      const uploadedFilesList: File[] = [];
      const filesField = body['files'];
      if (Array.isArray(filesField)) {
        for (const f of filesField) {
          if (f instanceof File) uploadedFilesList.push(f);
        }
      } else if (filesField instanceof File) {
        uploadedFilesList.push(filesField);
      }
      const singleFile = body['file'];
      if (singleFile instanceof File) {
        uploadedFilesList.push(singleFile);
      }

      if (uploadedFilesList.length === 0) {
        return errorResponse(c, 'VALIDATION_ERROR', 'Fichier requis (PDF ou images du contrat)', 400);
      }

      // Validate file types (PDF + images supported by Gemini)
      for (const f of uploadedFilesList) {
        const isPdf = f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf');
        const isImage = f.type.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i);
        if (!isPdf && !isImage) {
          return errorResponse(c, 'VALIDATION_ERROR', `Format non supporté: ${f.name}. Utilisez un PDF ou des images.`, 400);
        }
      }

      // Upload all files to R2
      const storage = c.env.STORAGE;
      const documentId = generateId();
      const r2Files: Array<{ name: string; r2Key: string; size: number }> = [];

      for (const f of uploadedFilesList) {
        const r2Key = `contracts/${documentId}/${f.name.replace(/\s+/g, '_')}`;
        const buffer = await f.arrayBuffer();
        await storage.put(r2Key, buffer, {
          httpMetadata: { contentType: f.type || 'application/octet-stream' },
        });
        r2Files.push({ name: f.name, r2Key, size: f.size });
      }

      // Analyse each file with Gemini
      const pageResults: Array<Record<string, unknown>> = [];
      const errors: string[] = [];

      for (const f of uploadedFilesList) {
        const buffer = await f.arrayBuffer();
        const mimeType = f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

        const result = await analyseWithGemini(geminiApiKey, buffer, mimeType, f.name);

        if (result.data) {
          pageResults.push(result.data);
        }
        if (result.error) {
          errors.push(result.error);
        }
      }

      // Merge results (in case multiple files were uploaded)
      let extractedData: Record<string, unknown> | null = null;
      if (pageResults.length === 1) {
        // Single file — contains both header and guarantees data
        // Use directly without mergeExtractedPages to preserve all fields
        const single = pageResults[0]!;
        extractedData = {
          contractNumber: single.contractNumber ?? null,
          companyName: single.companyName ?? null,
          companyAddress: single.companyAddress ?? null,
          matriculeFiscale: single.matriculeFiscale ?? null,
          insurerName: single.insurerName ?? null,
          intermediaryName: single.intermediaryName ?? null,
          intermediaryCode: single.intermediaryCode ?? null,
          effectiveDate: single.effectiveDate ?? null,
          annualRenewalDate: single.annualRenewalDate ?? null,
          riskIllness: single.riskIllness ?? true,
          riskDisability: single.riskDisability ?? false,
          riskDeath: single.riskDeath ?? false,
          coversSpouse: single.coversSpouse ?? true,
          coversChildren: single.coversChildren ?? true,
          childrenMaxAge: single.childrenMaxAge ?? 20,
          childrenStudentMaxAge: single.childrenStudentMaxAge ?? 28,
          coversDisabledChildren: single.coversDisabledChildren ?? true,
          coversRetirees: single.coversRetirees ?? false,
          annualGlobalLimit: single.annualGlobalLimit ?? null,
          planCategory: single.planCategory ?? 'standard',
          guarantees: Array.isArray(single.guarantees) ? single.guarantees : [],
        };
      } else if (pageResults.length > 1) {
        extractedData = mergeExtractedPages(pageResults);
      }

      // Calculate confidence
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (extractedData) {
        const guarantees = extractedData.guarantees as Record<string, unknown>[];
        const hasContract = !!extractedData.contractNumber;
        const hasCompany = !!extractedData.companyName;

        if (hasContract && hasCompany && guarantees.length >= 10) {
          confidence = 'high';
        } else if ((hasContract || hasCompany) && guarantees.length > 0) {
          confidence = 'medium';
        }
      }

      // Audit log
      await logAudit(getDb(c), {
        userId: user?.sub,
        action: 'group_contract.analyse_pdf',
        entityType: 'group_contract',
        entityId: documentId,
        changes: {
          filesCount: uploadedFilesList.length,
          fileNames: uploadedFilesList.map(f => f.name),
          totalSize: uploadedFilesList.reduce((sum, f) => sum + f.size, 0),
          engine: 'gemini-3.1-flash-lite-preview',
          guaranteesExtracted: extractedData ? (extractedData.guarantees as unknown[]).length : 0,
          confidence,
          errors: errors.length > 0 ? errors : undefined,
        },
        ipAddress: c.req.header('CF-Connecting-IP'),
        userAgent: c.req.header('User-Agent'),
      });

      return success(c, {
        documentId,
        uploadedFiles: r2Files,
        extractedData,
        totalFiles: uploadedFilesList.length,
        confidence,
        engine: 'gemini-3.1-flash-lite-preview',
        errors: errors.length > 0 ? errors : undefined,
        message: extractedData
          ? `Extraction réussie: ${(extractedData.guarantees as unknown[]).length} garanties extraites. Veuillez vérifier et corriger si nécessaire.`
          : 'L\'extraction automatique n\'a pas pu aboutir. Veuillez saisir les données manuellement.',
      });
    } catch (err) {
      console.error('Contract analysis error:', err);
      return errorResponse(c, 'OCR_ERROR', 'Erreur lors de l\'analyse du contrat', 500);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /:id/apply-to-adherents — Apply group contract to company adherents
// ---------------------------------------------------------------------------
groupContracts.post(
  '/:id/apply-to-adherents',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c);

    // Fetch group contract
    const groupContract = await db
      .prepare('SELECT * FROM group_contracts WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<Record<string, unknown>>();

    if (!groupContract) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    if (
      user?.insurerId &&
      user.role === 'INSURER_ADMIN' &&
      groupContract.insurer_id !== user.insurerId
    ) {
      return notFound(c, 'Contrat groupe non trouvé');
    }

    if (groupContract.status !== 'active') {
      return errorResponse(c, 'CONTRACT_NOT_ACTIVE', 'Le contrat groupe doit être actif pour être appliqué', 400);
    }

    // Get all active adherents for the company
    const adherents = await db
      .prepare(
        `SELECT id, first_name, last_name FROM adherents
         WHERE company_id = ? AND status = 'active' AND deleted_at IS NULL`
      )
      .bind(groupContract.company_id)
      .all<{ id: string; first_name: string; last_name: string }>();

    const adherentList = adherents.results ?? [];

    if (adherentList.length === 0) {
      return errorResponse(c, 'NO_ADHERENTS', 'Aucun adhérent actif trouvé pour cette entreprise', 400);
    }

    // Fetch guarantees for building coverage JSON
    const guarantees = await db
      .prepare(
        'SELECT * FROM contract_guarantees WHERE group_contract_id = ? AND is_active = 1'
      )
      .bind(id)
      .all();

    const guaranteeList = guarantees.results ?? [];

    // Build coverage JSON from group contract guarantees
    const coverage: Record<string, unknown> = {};
    for (const g of guaranteeList) {
      const gt = g as Record<string, unknown>;
      coverage[gt.care_type as string] = {
        enabled: true,
        reimbursementRate: gt.reimbursement_rate ? Number(gt.reimbursement_rate) * 100 : null,
        annualLimit: gt.annual_limit,
        perEventLimit: gt.per_event_limit,
      };
    }

    // Create individual contracts for each adherent
    let createdCount = 0;
    let skippedCount = 0;
    const now = new Date().toISOString();

    for (const adherent of adherentList) {
      // Check if adherent already has an active contract from this group
      const existingContract = await db
        .prepare(
          `SELECT id FROM contracts
           WHERE adherent_id = ? AND insurer_id = ? AND status = 'active'
           AND group_contract_id = ?`
        )
        .bind(adherent.id, groupContract.insurer_id, id)
        .first();

      if (existingContract) {
        skippedCount++;
        continue;
      }

      const contractId = generateId();
      const contractNumber = `${groupContract.contract_number}-${contractId.slice(-6).toUpperCase()}`;

      // Use end_date from group contract, fallback to 1 year from effective_date
      const endDate = groupContract.end_date
        ?? groupContract.annual_renewal_date
        ?? new Date(new Date(groupContract.effective_date as string).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      await db
        .prepare(
          `INSERT INTO contracts (
            id, contract_number, adherent_id, insurer_id,
            plan_type, status, coverage_json,
            start_date, end_date,
            group_contract_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          contractId,
          contractNumber,
          adherent.id,
          groupContract.insurer_id,
          groupContract.plan_category ?? 'corporate',
          JSON.stringify(coverage),
          groupContract.effective_date,
          endDate,
          id,
          now,
          now
        )
        .run();

      createdCount++;
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'group_contract.apply_to_adherents',
      entityType: 'group_contract',
      entityId: id,
      changes: {
        companyId: groupContract.company_id,
        totalAdherents: adherentList.length,
        contractsCreated: createdCount,
        contractsSkipped: skippedCount,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      groupContractId: id,
      totalAdherents: adherentList.length,
      contractsCreated: createdCount,
      contractsSkipped: skippedCount,
      message: `${createdCount} contrats individuels créés, ${skippedCount} adhérents déjà couverts.`,
    });
  }
);

export { groupContracts };
