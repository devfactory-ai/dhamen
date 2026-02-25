import type { Claim, ClaimFilters, ClaimItem, ClaimStatus, ClaimType } from '@dhamen/shared';

interface ClaimRow {
  id: string;
  type: string;
  contract_id: string;
  provider_id: string;
  adherent_id: string;
  insurer_id: string;
  total_amount: number;
  covered_amount: number;
  copay_amount: number;
  fraud_score: number;
  fraud_flags_json: string;
  status: string;
  reconciliation_id: string | null;
  bareme_version: string | null;
  notes: string | null;
  created_at: string;
  validated_at: string | null;
  updated_at: string;
}

interface ClaimItemRow {
  id: string;
  claim_id: string;
  code: string;
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  covered_amount: number;
  copay_amount: number;
  reimbursement_rate: number | null;
  is_generic: number;
  rule_applied: string | null;
  created_at: string;
}

function rowToClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    type: row.type as ClaimType,
    contractId: row.contract_id,
    providerId: row.provider_id,
    adherentId: row.adherent_id,
    insurerId: row.insurer_id,
    totalAmount: row.total_amount,
    coveredAmount: row.covered_amount,
    copayAmount: row.copay_amount,
    fraudScore: row.fraud_score,
    fraudFlagsJson: JSON.parse(row.fraud_flags_json || '[]'),
    status: row.status as ClaimStatus,
    reconciliationId: row.reconciliation_id,
    baremeVersion: row.bareme_version,
    notes: row.notes,
    createdAt: row.created_at,
    validatedAt: row.validated_at,
    updatedAt: row.updated_at,
  };
}

function rowToClaimItem(row: ClaimItemRow): ClaimItem {
  return {
    id: row.id,
    claimId: row.claim_id,
    code: row.code,
    label: row.label,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
    coveredAmount: row.covered_amount,
    copayAmount: row.copay_amount,
    reimbursementRate: row.reimbursement_rate,
    isGeneric: row.is_generic === 1,
    ruleApplied: row.rule_applied,
    createdAt: row.created_at,
  };
}

export async function findClaimById(db: D1Database, id: string): Promise<Claim | null> {
  const result = await db.prepare('SELECT * FROM claims WHERE id = ?').bind(id).first<ClaimRow>();
  return result ? rowToClaim(result) : null;
}

export async function findClaimsByFilters(
  db: D1Database,
  filters: ClaimFilters,
  page = 1,
  limit = 20
): Promise<{ claims: Claim[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.providerId) {
    conditions.push('provider_id = ?');
    params.push(filters.providerId);
  }
  if (filters.adherentId) {
    conditions.push('adherent_id = ?');
    params.push(filters.adherentId);
  }
  if (filters.insurerId) {
    conditions.push('insurer_id = ?');
    params.push(filters.insurerId);
  }
  if (filters.dateFrom) {
    conditions.push('created_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push('created_at <= ?');
    params.push(filters.dateTo);
  }
  if (filters.minFraudScore !== undefined) {
    conditions.push('fraud_score >= ?');
    params.push(filters.minFraudScore);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM claims ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const total = countResult?.count ?? 0;
  const offset = (page - 1) * limit;

  const result = await db
    .prepare(`SELECT * FROM claims ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<ClaimRow>();

  return {
    claims: result.results.map(rowToClaim),
    total,
  };
}

export async function findClaimsByProvider(
  db: D1Database,
  providerId: string,
  page = 1,
  limit = 20
): Promise<{ claims: Claim[]; total: number }> {
  return findClaimsByFilters(db, { providerId }, page, limit);
}

export async function findClaimsByInsurer(
  db: D1Database,
  insurerId: string,
  page = 1,
  limit = 20
): Promise<{ claims: Claim[]; total: number }> {
  return findClaimsByFilters(db, { insurerId }, page, limit);
}

export async function findClaimItems(db: D1Database, claimId: string): Promise<ClaimItem[]> {
  const result = await db
    .prepare('SELECT * FROM claim_items WHERE claim_id = ?')
    .bind(claimId)
    .all<ClaimItemRow>();
  return result.results.map(rowToClaimItem);
}

export async function createClaim(
  db: D1Database,
  data: {
    id: string;
    type: ClaimType;
    contractId: string;
    providerId: string;
    adherentId: string;
    insurerId: string;
    totalAmount: number;
    coveredAmount: number;
    copayAmount: number;
    fraudScore?: number;
    fraudFlagsJson?: string;
    status?: ClaimStatus;
    baremeVersion?: string;
    notes?: string;
  }
): Promise<Claim> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id,
        total_amount, covered_amount, copay_amount, fraud_score, fraud_flags_json,
        status, bareme_version, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.id,
      data.type,
      data.contractId,
      data.providerId,
      data.adherentId,
      data.insurerId,
      data.totalAmount,
      data.coveredAmount,
      data.copayAmount,
      data.fraudScore ?? 0,
      data.fraudFlagsJson ?? '[]',
      data.status ?? 'pending',
      data.baremeVersion ?? null,
      data.notes ?? null,
      now,
      now
    )
    .run();

  const claim = await findClaimById(db, data.id);
  if (!claim) {
    throw new Error('Failed to create claim');
  }
  return claim;
}

export async function createClaimItem(
  db: D1Database,
  data: {
    id: string;
    claimId: string;
    code: string;
    label: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    coveredAmount: number;
    copayAmount: number;
    reimbursementRate?: number;
    isGeneric?: boolean;
    ruleApplied?: string;
  }
): Promise<ClaimItem> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price,
        line_total, covered_amount, copay_amount, reimbursement_rate, is_generic,
        rule_applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.id,
      data.claimId,
      data.code,
      data.label,
      data.quantity,
      data.unitPrice,
      data.lineTotal,
      data.coveredAmount,
      data.copayAmount,
      data.reimbursementRate ?? null,
      data.isGeneric ? 1 : 0,
      data.ruleApplied ?? null,
      now
    )
    .run();

  const result = await db
    .prepare('SELECT * FROM claim_items WHERE id = ?')
    .bind(data.id)
    .first<ClaimItemRow>();

  if (!result) {
    throw new Error('Failed to create claim item');
  }
  return rowToClaimItem(result);
}

export async function updateClaimStatus(
  db: D1Database,
  id: string,
  status: ClaimStatus,
  notes?: string
): Promise<Claim | null> {
  const now = new Date().toISOString();
  const validatedAt = ['approved', 'rejected', 'blocked'].includes(status) ? now : null;

  let query = 'UPDATE claims SET status = ?, updated_at = ?';
  const params: unknown[] = [status, now];

  if (validatedAt) {
    query += ', validated_at = ?';
    params.push(validatedAt);
  }
  if (notes !== undefined) {
    query += ', notes = ?';
    params.push(notes);
  }

  query += ' WHERE id = ?';
  params.push(id);

  await db
    .prepare(query)
    .bind(...params)
    .run();
  return findClaimById(db, id);
}

export async function getClaimsStats(
  db: D1Database,
  insurerId?: string
): Promise<{
  totalClaims: number;
  pendingClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  totalAmount: number;
  coveredAmount: number;
}> {
  const whereClause = insurerId ? 'WHERE insurer_id = ?' : '';
  const params = insurerId ? [insurerId] : [];

  const result = await db
    .prepare(
      `SELECT
        COUNT(*) as total_claims,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_claims,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_claims,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_claims,
        SUM(total_amount) as total_amount,
        SUM(covered_amount) as covered_amount
       FROM claims ${whereClause}`
    )
    .bind(...params)
    .first<{
      total_claims: number;
      pending_claims: number;
      approved_claims: number;
      rejected_claims: number;
      total_amount: number;
      covered_amount: number;
    }>();

  return {
    totalClaims: result?.total_claims ?? 0,
    pendingClaims: result?.pending_claims ?? 0,
    approvedClaims: result?.approved_claims ?? 0,
    rejectedClaims: result?.rejected_claims ?? 0,
    totalAmount: result?.total_amount ?? 0,
    coveredAmount: result?.covered_amount ?? 0,
  };
}
