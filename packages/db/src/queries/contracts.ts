import type {
  Contract,
  ContractCreate,
  ContractStatus,
  ContractUpdate,
  CoverageConfig,
  PlanType,
} from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface ContractRow {
  id: string;
  insurer_id: string;
  adherent_id: string;
  contract_number: string;
  plan_type: PlanType;
  start_date: string;
  end_date: string;
  carence_days: number;
  annual_limit: number | null;
  coverage_json: string;
  exclusions_json: string;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
}

function rowToContract(row: ContractRow): Contract {
  return {
    id: row.id,
    insurerId: row.insurer_id,
    adherentId: row.adherent_id,
    contractNumber: row.contract_number,
    planType: row.plan_type,
    startDate: row.start_date,
    endDate: row.end_date,
    carenceDays: row.carence_days,
    annualLimit: row.annual_limit,
    coverageJson: JSON.parse(row.coverage_json) as CoverageConfig,
    exclusionsJson: JSON.parse(row.exclusions_json) as string[],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findContractById(db: D1Database, id: string): Promise<Contract | null> {
  const row = await db
    .prepare('SELECT * FROM contracts WHERE id = ?')
    .bind(id)
    .first<ContractRow>();

  return row ? rowToContract(row) : null;
}

export async function findActiveContractByAdherent(
  db: D1Database,
  adherentId: string,
  date: string = new Date().toISOString().split('T')[0] ?? ''
): Promise<Contract | null> {
  const row = await db
    .prepare(
      `SELECT * FROM contracts
       WHERE adherent_id = ?
       AND status = 'active'
       AND start_date <= ?
       AND end_date >= ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(adherentId, date, date)
    .first<ContractRow>();

  return row ? rowToContract(row) : null;
}

export async function listContracts(
  db: D1Database,
  options: {
    insurerId?: string;
    adherentId?: string;
    status?: ContractStatus;
    planType?: PlanType;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: Contract[]; total: number }> {
  const { insurerId, adherentId, status, planType, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (insurerId) {
    whereClause += ' AND insurer_id = ?';
    params.push(insurerId);
  }
  if (adherentId) {
    whereClause += ' AND adherent_id = ?';
    params.push(adherentId);
  }
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  if (planType) {
    whereClause += ' AND plan_type = ?';
    params.push(planType);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM contracts WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM contracts WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<ContractRow>();

  return {
    data: results.map(rowToContract),
    total: countResult?.count ?? 0,
  };
}

export async function createContract(
  db: D1Database,
  id: string,
  data: ContractCreate
): Promise<Contract> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, exclusions_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .bind(
      id,
      data.insurerId,
      data.adherentId,
      data.contractNumber,
      data.planType,
      data.startDate,
      data.endDate,
      data.carenceDays ?? 0,
      data.annualLimit ?? null,
      JSON.stringify(data.coverage),
      JSON.stringify(data.exclusions ?? []),
      now,
      now
    )
    .run();

  const contract = await findContractById(db, id);
  if (!contract) {
    throw new Error('Failed to create contract');
  }
  return contract;
}

export async function updateContract(
  db: D1Database,
  id: string,
  data: ContractUpdate
): Promise<Contract | null> {
  const existing = await findContractById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.planType !== undefined) {
    updates.push('plan_type = ?');
    params.push(data.planType);
  }
  if (data.endDate !== undefined) {
    updates.push('end_date = ?');
    params.push(data.endDate);
  }
  if (data.annualLimit !== undefined) {
    updates.push('annual_limit = ?');
    params.push(data.annualLimit);
  }
  if (data.coverage !== undefined) {
    const newCoverage = { ...existing.coverageJson, ...data.coverage };
    updates.push('coverage_json = ?');
    params.push(JSON.stringify(newCoverage));
  }
  if (data.exclusions !== undefined) {
    updates.push('exclusions_json = ?');
    params.push(JSON.stringify(data.exclusions));
  }
  if (data.status !== undefined) {
    updates.push('status = ?');
    params.push(data.status);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await db
    .prepare(`UPDATE contracts SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findContractById(db, id);
}
