import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const consommation = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
consommation.use('*', authMiddleware());

interface CoverageLimit {
  id: string;
  care_type: string;
  care_label: string;
  annual_limit: number;
  per_event_limit: number | null;
  reimbursement_rate: number;
}

interface ConsumptionRecord {
  care_type: string;
  beneficiary_id: string | null;
  beneficiary_name: string;
  total_consumed: number;
  total_claims: number;
  last_claim_date: string | null;
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

  // Get adherent and contract info
  const adherentInfo = await db.prepare(`
    SELECT
      a.id as adherent_id,
      a.matricule,
      u.first_name,
      u.last_name,
      c.id as contract_id,
      c.policy_number,
      c.start_date,
      c.end_date,
      i.name as insurer_name
    FROM adherents a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE a.user_id = ?
  `).bind(user.id).first();

  if (!adherentInfo) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  const contractId = (adherentInfo as Record<string, unknown>).contract_id as string;
  const adherentId = (adherentInfo as Record<string, unknown>).adherent_id as string;

  if (!contractId) {
    return c.json({
      success: false,
      error: { code: 'NO_CONTRACT', message: 'Aucun contrat actif trouvé' },
    }, 404);
  }

  // Get coverage limits for this contract
  const limitsResult = await db.prepare(`
    SELECT id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate
    FROM contract_coverage_limits
    WHERE contract_id = ?
    ORDER BY care_type
  `).bind(contractId).all<CoverageLimit>();

  // Get consumption for adherent and beneficiaries
  const consumptionResult = await db.prepare(`
    SELECT care_type, beneficiary_id, beneficiary_name, total_consumed, total_claims, last_claim_date
    FROM beneficiary_consumption
    WHERE contract_id = ? AND year = ?
    ORDER BY beneficiary_id NULLS FIRST, care_type
  `).bind(contractId, year).all<ConsumptionRecord>();

  // Get beneficiaries list
  const beneficiaries = await db.prepare(`
    SELECT id, first_name, last_name, relationship, birth_date
    FROM adherent_beneficiaries
    WHERE adherent_id = ?
  `).bind(adherentId).all();

  // Build consumption summary by care type
  const coverageSummary: Record<string, {
    care_type: string;
    care_label: string;
    annual_limit: number;
    per_event_limit: number | null;
    reimbursement_rate: number;
    total_consumed: number;
    total_claims: number;
    remaining: number;
    percentage_used: number;
    by_beneficiary: Array<{
      beneficiary_id: string | null;
      beneficiary_name: string;
      consumed: number;
      claims: number;
      last_claim_date: string | null;
    }>;
  }> = {};

  // Initialize from limits
  for (const limit of limitsResult.results) {
    coverageSummary[limit.care_type] = {
      care_type: limit.care_type,
      care_label: limit.care_label,
      annual_limit: limit.annual_limit,
      per_event_limit: limit.per_event_limit,
      reimbursement_rate: limit.reimbursement_rate,
      total_consumed: 0,
      total_claims: 0,
      remaining: limit.annual_limit,
      percentage_used: 0,
      by_beneficiary: [],
    };
  }

  // Add consumption data
  for (const record of consumptionResult.results) {
    const summary = coverageSummary[record.care_type];
    if (summary) {
      summary.total_consumed += record.total_consumed;
      summary.total_claims += record.total_claims;
      summary.by_beneficiary.push({
        beneficiary_id: record.beneficiary_id,
        beneficiary_name: record.beneficiary_name,
        consumed: record.total_consumed,
        claims: record.total_claims,
        last_claim_date: record.last_claim_date,
      });
    }
  }

  // Calculate remaining and percentage
  for (const key of Object.keys(coverageSummary)) {
    const summary = coverageSummary[key];
    if (!summary) continue;
    summary.remaining = Math.max(0, summary.annual_limit - summary.total_consumed);
    summary.percentage_used = Math.min(100, (summary.total_consumed / summary.annual_limit) * 100);
  }

  // Calculate totals
  const totals = {
    total_annual_limit: 0,
    total_consumed: 0,
    total_remaining: 0,
    total_claims: 0,
  };

  for (const summary of Object.values(coverageSummary)) {
    totals.total_annual_limit += summary.annual_limit;
    totals.total_consumed += summary.total_consumed;
    totals.total_remaining += summary.remaining;
    totals.total_claims += summary.total_claims;
  }

  return c.json({
    success: true,
    data: {
      adherent: {
        id: (adherentInfo as Record<string, unknown>).adherent_id,
        matricule: (adherentInfo as Record<string, unknown>).matricule,
        name: `${(adherentInfo as Record<string, unknown>).first_name} ${(adherentInfo as Record<string, unknown>).last_name}`,
      },
      contract: {
        id: contractId,
        policy_number: (adherentInfo as Record<string, unknown>).policy_number,
        insurer_name: (adherentInfo as Record<string, unknown>).insurer_name,
        start_date: (adherentInfo as Record<string, unknown>).start_date,
        end_date: (adherentInfo as Record<string, unknown>).end_date,
      },
      year,
      beneficiaries: [
        {
          id: null,
          name: `${(adherentInfo as Record<string, unknown>).first_name} ${(adherentInfo as Record<string, unknown>).last_name}`,
          relationship: 'Assuré principal',
        },
        ...beneficiaries.results.map((b: Record<string, unknown>) => ({
          id: b.id,
          name: `${b.first_name} ${b.last_name}`,
          relationship: b.relationship,
          birth_date: b.birth_date,
        })),
      ],
      coverage: Object.values(coverageSummary),
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

  // Get adherent
  const adherent = await db.prepare(`
    SELECT a.id, u.first_name, u.last_name
    FROM adherents a
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ?
  `).bind(user.id).first<{ id: string; first_name: string; last_name: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Get contract
  const contract = await db.prepare(`
    SELECT id FROM contracts WHERE adherent_id = ? AND status = 'active'
  `).bind(adherent.id).first<{ id: string }>();

  if (!contract) {
    return c.json({
      success: false,
      error: { code: 'NO_CONTRACT', message: 'Aucun contrat actif' },
    }, 404);
  }

  // Get all beneficiaries with their consumption
  const beneficiaryConsumption = await db.prepare(`
    SELECT
      bc.beneficiary_id,
      bc.beneficiary_name,
      bc.care_type,
      ccl.care_label,
      ccl.annual_limit,
      ccl.reimbursement_rate,
      bc.total_consumed,
      bc.total_claims,
      bc.last_claim_date
    FROM beneficiary_consumption bc
    JOIN contract_coverage_limits ccl ON ccl.contract_id = bc.contract_id AND ccl.care_type = bc.care_type
    WHERE bc.contract_id = ? AND bc.year = ?
    ORDER BY bc.beneficiary_id NULLS FIRST, bc.care_type
  `).bind(contract.id, year).all();

  // Group by beneficiary
  const byBeneficiary: Record<string, {
    beneficiary_id: string | null;
    beneficiary_name: string;
    is_principal: boolean;
    total_consumed: number;
    total_claims: number;
    care_types: Array<{
      care_type: string;
      care_label: string;
      annual_limit: number;
      consumed: number;
      remaining: number;
      percentage: number;
      claims: number;
      last_claim_date: string | null;
    }>;
  }> = {};

  for (const row of beneficiaryConsumption.results as Array<Record<string, unknown>>) {
    const key = (row.beneficiary_id as string) || 'principal';

    if (!byBeneficiary[key]) {
      byBeneficiary[key] = {
        beneficiary_id: row.beneficiary_id as string | null,
        beneficiary_name: row.beneficiary_name as string,
        is_principal: !row.beneficiary_id,
        total_consumed: 0,
        total_claims: 0,
        care_types: [],
      };
    }

    const consumed = row.total_consumed as number;
    const limit = row.annual_limit as number;
    const remaining = Math.max(0, limit - consumed);

    byBeneficiary[key].total_consumed += consumed;
    byBeneficiary[key].total_claims += row.total_claims as number;
    byBeneficiary[key].care_types.push({
      care_type: row.care_type as string,
      care_label: row.care_label as string,
      annual_limit: limit,
      consumed,
      remaining,
      percentage: Math.min(100, (consumed / limit) * 100),
      claims: row.total_claims as number,
      last_claim_date: row.last_claim_date as string | null,
    });
  }

  return c.json({
    success: true,
    data: {
      year,
      beneficiaries: Object.values(byBeneficiary),
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

  // Get adherent
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE user_id = ?
  `).bind(user.id).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Get claims history
  let query = `
    SELECT
      strftime('%Y-%m', created_at) as month,
      care_type,
      SUM(amount) as total_amount,
      COUNT(*) as claims_count
    FROM claims
    WHERE adherent_id = ?
  `;
  const params: (string | number)[] = [adherent.id];

  if (careType) {
    query += ' AND care_type = ?';
    params.push(careType);
  }

  query += ` GROUP BY strftime('%Y-%m', created_at), care_type
             ORDER BY month DESC
             LIMIT 12`;

  const history = await db.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: history.results,
  });
});

export { consommation };
