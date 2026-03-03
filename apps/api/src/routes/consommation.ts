import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const consommation = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
consommation.use('*', authMiddleware());

/** Care type labels in French */
const CARE_LABELS: Record<string, string> = {
  pharmacy: 'Pharmacie',
  consultation: 'Consultation',
  lab: 'Laboratoire',
  hospitalization: 'Hospitalisation',
  dental: 'Dentaire',
  optical: 'Optique',
  maternity: 'Maternité',
  pharmacie: 'Pharmacie',
  laboratoire: 'Laboratoire',
  dentaire: 'Dentaire',
  optique: 'Optique',
};

/** Map French type_soin to coverage_json keys */
const TYPE_SOIN_TO_COVERAGE: Record<string, string> = {
  pharmacie: 'pharmacy',
  consultation: 'consultation',
  laboratoire: 'lab',
  hospitalisation: 'hospitalization',
  dentaire: 'dental',
  optique: 'optical',
};

/**
 * Find adherent by user email (adherents are linked by matching email)
 */
async function findAdherentByEmail(db: ReturnType<typeof getDb>, email: string) {
  return db.prepare(
    `SELECT a.id, a.first_name, a.last_name, a.matricule, a.ayants_droit_json,
            c.id as contract_id, c.contract_number, c.start_date, c.end_date,
            c.annual_limit, c.coverage_json,
            i.name as insurer_name
     FROM adherents a
     LEFT JOIN contracts c ON c.adherent_id = a.id AND UPPER(c.status) = 'ACTIVE'
     LEFT JOIN insurers i ON c.insurer_id = i.id
     WHERE a.email = ? AND a.deleted_at IS NULL`
  ).bind(email).first();
}

/**
 * GET /consommation/me - Get current adherent's consumption summary
 */
consommation.get('/me', async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const year = parseInt(c.req.query('year') || new Date().getFullYear().toString());

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  const adherentInfo = await findAdherentByEmail(db, user.email);

  if (!adherentInfo) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  const adherentId = String(adherentInfo.id);
  const contractId = adherentInfo.contract_id ? String(adherentInfo.contract_id) : null;

  if (!contractId) {
    return c.json({
      success: false,
      error: { code: 'NO_CONTRACT', message: 'Aucun contrat actif trouvé' },
    }, 404);
  }

  // Parse coverage from contract's coverage_json
  let coverageConfig: Record<string, {
    enabled?: boolean;
    reimbursementRate?: number;
    annualLimit?: number;
  }> = {};
  try {
    coverageConfig = JSON.parse(String(adherentInfo.coverage_json) || '{}');
  } catch {
    coverageConfig = {};
  }

  // Get actual consumption from sante_demandes for this year
  const consumptionResult = await db.prepare(`
    SELECT
      sd.type_soin,
      COUNT(*) as claim_count,
      COALESCE(SUM(sd.montant_rembourse), 0) as total_reimbursed,
      MAX(sd.date_soin) as last_claim_date
    FROM sante_demandes sd
    WHERE sd.adherent_id = ?
      AND sd.statut IN ('approuvee', 'en_paiement', 'payee')
      AND strftime('%Y', sd.date_soin) = ?
    GROUP BY sd.type_soin
  `).bind(adherentId, String(year)).all();

  // Build consumption map by type_soin
  const consumptionMap: Record<string, {
    claims: number;
    consumed: number;
    lastDate: string | null;
  }> = {};
  for (const row of consumptionResult.results) {
    const coverageKey = TYPE_SOIN_TO_COVERAGE[String(row.type_soin)] || String(row.type_soin);
    consumptionMap[coverageKey] = {
      claims: Number(row.claim_count),
      consumed: Number(row.total_reimbursed),
      lastDate: row.last_claim_date ? String(row.last_claim_date) : null,
    };
  }

  // Build coverage summary from contract config + actual consumption
  const coverage = [];
  for (const [careType, config] of Object.entries(coverageConfig)) {
    if (!config.enabled) continue;

    const annualLimit = (config.annualLimit || 0) / 1000; // Convert millimes to TND
    const reimbursementRate = (config.reimbursementRate || 0) * 100;
    const consumption = consumptionMap[careType];
    const totalConsumed = consumption ? consumption.consumed / 1000 : 0; // Convert millimes to TND
    const remaining = Math.max(0, annualLimit - totalConsumed);
    const percentageUsed = annualLimit > 0 ? Math.min(100, (totalConsumed / annualLimit) * 100) : 0;

    coverage.push({
      care_type: careType,
      care_label: CARE_LABELS[careType] || careType,
      annual_limit: annualLimit,
      per_event_limit: null,
      reimbursement_rate: reimbursementRate,
      total_consumed: totalConsumed,
      total_claims: consumption?.claims || 0,
      remaining,
      percentage_used: Math.round(percentageUsed * 10) / 10,
      by_beneficiary: [{
        beneficiary_id: null,
        beneficiary_name: `${adherentInfo.first_name} ${adherentInfo.last_name}`,
        consumed: totalConsumed,
        claims: consumption?.claims || 0,
        last_claim_date: consumption?.lastDate || null,
      }],
    });
  }

  // Calculate totals
  const totals = {
    total_annual_limit: coverage.reduce((sum, c) => sum + c.annual_limit, 0),
    total_consumed: coverage.reduce((sum, c) => sum + c.total_consumed, 0),
    total_remaining: coverage.reduce((sum, c) => sum + c.remaining, 0),
    total_claims: coverage.reduce((sum, c) => sum + c.total_claims, 0),
  };

  // Parse ayants droit
  let ayantsDroit: Array<{ nom: string; prenom: string; lien: string }> = [];
  try {
    ayantsDroit = JSON.parse(String(adherentInfo.ayants_droit_json) || '[]');
  } catch {
    ayantsDroit = [];
  }

  return c.json({
    success: true,
    data: {
      adherent: {
        id: adherentId,
        matricule: adherentInfo.matricule,
        name: `${adherentInfo.first_name} ${adherentInfo.last_name}`,
      },
      contract: {
        id: contractId,
        policy_number: adherentInfo.contract_number,
        insurer_name: adherentInfo.insurer_name,
        start_date: adherentInfo.start_date,
        end_date: adherentInfo.end_date,
      },
      year,
      beneficiaries: [
        {
          id: null,
          name: `${adherentInfo.first_name} ${adherentInfo.last_name}`,
          relationship: 'Assuré principal',
        },
        ...ayantsDroit.map((ad) => ({
          id: null,
          name: `${ad.prenom} ${ad.nom}`,
          relationship: ad.lien,
        })),
      ],
      coverage,
      totals,
    },
  });
});

/**
 * GET /consommation/me/by-beneficiary - Get consumption grouped by beneficiary
 */
consommation.get('/me/by-beneficiary', async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const year = parseInt(c.req.query('year') || new Date().getFullYear().toString());

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  const adherent = await db.prepare(
    `SELECT a.id, a.first_name, a.last_name, c.id as contract_id, c.coverage_json
     FROM adherents a
     LEFT JOIN contracts c ON c.adherent_id = a.id AND UPPER(c.status) = 'ACTIVE'
     WHERE a.email = ? AND a.deleted_at IS NULL`
  ).bind(user.email).first();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  if (!adherent.contract_id) {
    return c.json({
      success: false,
      error: { code: 'NO_CONTRACT', message: 'Aucun contrat actif' },
    }, 404);
  }

  // Parse coverage limits
  let coverageConfig: Record<string, { annualLimit?: number; reimbursementRate?: number }> = {};
  try {
    coverageConfig = JSON.parse(String(adherent.coverage_json) || '{}');
  } catch {
    coverageConfig = {};
  }

  // Get consumption from sante_demandes
  const consumption = await db.prepare(`
    SELECT
      sd.type_soin,
      COUNT(*) as total_claims,
      COALESCE(SUM(sd.montant_rembourse), 0) as total_consumed,
      MAX(sd.date_soin) as last_claim_date
    FROM sante_demandes sd
    WHERE sd.adherent_id = ?
      AND sd.statut IN ('approuvee', 'en_paiement', 'payee')
      AND strftime('%Y', sd.date_soin) = ?
    GROUP BY sd.type_soin
  `).bind(String(adherent.id), String(year)).all();

  // Build principal beneficiary care types
  const careTypes = [];
  let totalConsumed = 0;
  let totalClaims = 0;

  for (const row of consumption.results) {
    const coverageKey = TYPE_SOIN_TO_COVERAGE[String(row.type_soin)] || String(row.type_soin);
    const config = coverageConfig[coverageKey];
    const limit = config ? (config.annualLimit || 0) / 1000 : 0;
    const consumed = Number(row.total_consumed) / 1000;
    const remaining = Math.max(0, limit - consumed);

    totalConsumed += consumed;
    totalClaims += Number(row.total_claims);

    careTypes.push({
      care_type: coverageKey,
      care_label: CARE_LABELS[coverageKey] || coverageKey,
      annual_limit: limit,
      consumed,
      remaining,
      percentage: limit > 0 ? Math.min(100, Math.round((consumed / limit) * 1000) / 10) : 0,
      claims: Number(row.total_claims),
      last_claim_date: row.last_claim_date ? String(row.last_claim_date) : null,
    });
  }

  return c.json({
    success: true,
    data: {
      year,
      beneficiaries: [{
        beneficiary_id: null,
        beneficiary_name: `${adherent.first_name} ${adherent.last_name}`,
        is_principal: true,
        total_consumed: totalConsumed,
        total_claims: totalClaims,
        care_types: careTypes,
      }],
    },
  });
});

/**
 * GET /consommation/me/history - Get consumption history over time
 */
consommation.get('/me/history', async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const careType = c.req.query('care_type');

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  const adherent = await db.prepare(
    'SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL'
  ).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Get claims history from sante_demandes
  let query = `
    SELECT
      strftime('%Y-%m', date_soin) as month,
      type_soin as care_type,
      COALESCE(SUM(montant_rembourse), 0) as total_amount,
      COUNT(*) as claims_count
    FROM sante_demandes
    WHERE adherent_id = ?
      AND statut IN ('approuvee', 'en_paiement', 'payee')
  `;
  const params: (string | number)[] = [adherent.id];

  if (careType) {
    const frenchType = Object.entries(TYPE_SOIN_TO_COVERAGE).find(([, v]) => v === careType)?.[0];
    query += ' AND type_soin = ?';
    params.push(frenchType || careType);
  }

  query += ` GROUP BY strftime('%Y-%m', date_soin), type_soin
             ORDER BY month DESC
             LIMIT 12`;

  const history = await db.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: history.results,
  });
});

export { consommation };
