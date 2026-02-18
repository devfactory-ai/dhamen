import type { AuditLog, AuditLogCreate } from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  changes_json: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

function rowToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    changesJson: row.changes_json ? (JSON.parse(row.changes_json) as Record<string, unknown>) : null,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

export async function createAuditLog(
  db: D1Database,
  id: string,
  data: AuditLogCreate
): Promise<AuditLog> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.userId ?? null,
      data.action,
      data.entityType,
      data.entityId,
      data.changes ? JSON.stringify(data.changes) : null,
      data.ipAddress ?? null,
      data.userAgent ?? null,
      now
    )
    .run();

  return {
    id,
    userId: data.userId ?? null,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    changesJson: data.changes ?? null,
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
    createdAt: now,
  };
}

export async function listAuditLogs(
  db: D1Database,
  options: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: AuditLog[]; total: number }> {
  const { userId, entityType, entityId, action, dateFrom, dateTo, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (userId) {
    whereClause += ' AND user_id = ?';
    params.push(userId);
  }
  if (entityType) {
    whereClause += ' AND entity_type = ?';
    params.push(entityType);
  }
  if (entityId) {
    whereClause += ' AND entity_id = ?';
    params.push(entityId);
  }
  if (action) {
    whereClause += ' AND action = ?';
    params.push(action);
  }
  if (dateFrom) {
    whereClause += ' AND created_at >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND created_at <= ?';
    params.push(dateTo);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<AuditLogRow>();

  return {
    data: results.map(rowToAuditLog),
    total: countResult?.count ?? 0,
  };
}

export async function findAuditLogsByEntity(
  db: D1Database,
  entityType: string,
  entityId: string
): Promise<AuditLog[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC'
    )
    .bind(entityType, entityId)
    .all<AuditLogRow>();

  return results.map(rowToAuditLog);
}
