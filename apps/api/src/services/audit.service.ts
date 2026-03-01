/**
 * Advanced Audit Service
 *
 * Provides comprehensive audit logging, search, and compliance reporting
 */

import type { Bindings } from '../types';

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName?: string;
  userRole: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
  insurerId?: string;
  providerId?: string;
  result: 'success' | 'failure';
  errorMessage?: string;
  duration?: number; // milliseconds
  changes?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
}

export type AuditAction =
  // Authentication
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_COMPLETE'
  | 'MFA_ENABLE'
  | 'MFA_DISABLE'
  | 'MFA_VERIFY'
  | 'SESSION_CREATE'
  | 'SESSION_REVOKE'
  // CRUD Operations
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'PERMANENT_DELETE'
  // Business Operations
  | 'CLAIM_SUBMIT'
  | 'CLAIM_APPROVE'
  | 'CLAIM_REJECT'
  | 'CLAIM_REVIEW'
  | 'ELIGIBILITY_CHECK'
  | 'TARIFICATION_CALCULATE'
  | 'FRAUD_FLAG'
  | 'FRAUD_CLEAR'
  | 'BORDEREAU_GENERATE'
  | 'BORDEREAU_VALIDATE'
  | 'BORDEREAU_SEND'
  | 'PAYMENT_INITIATE'
  | 'PAYMENT_CONFIRM'
  | 'RECONCILIATION_RUN'
  // Document Operations
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_DOWNLOAD'
  | 'DOCUMENT_DELETE'
  | 'DOCUMENT_SHARE'
  // Data Operations
  | 'EXPORT_DATA'
  | 'IMPORT_DATA'
  | 'REPORT_GENERATE'
  // Admin Operations
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'USER_ACTIVATE'
  | 'USER_DEACTIVATE'
  | 'ROLE_ASSIGN'
  | 'PERMISSION_GRANT'
  | 'PERMISSION_REVOKE'
  | 'CONFIG_CHANGE'
  | 'SYSTEM_MAINTENANCE';

export type EntityType =
  | 'user'
  | 'adherent'
  | 'provider'
  | 'insurer'
  | 'contract'
  | 'claim'
  | 'bordereau'
  | 'payment'
  | 'document'
  | 'config'
  | 'session'
  | 'system';

export interface AuditSearchParams {
  userId?: string;
  action?: AuditAction | AuditAction[];
  entityType?: EntityType | EntityType[];
  entityId?: string;
  insurerId?: string;
  providerId?: string;
  result?: 'success' | 'failure';
  startDate?: string;
  endDate?: string;
  ipAddress?: string;
  searchText?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'action' | 'userId' | 'entityType';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditStats {
  totalEntries: number;
  byAction: { action: string; count: number }[];
  byEntityType: { entityType: string; count: number }[];
  byUser: { userId: string; userName: string; count: number }[];
  byResult: { result: string; count: number }[];
  byDay: { date: string; count: number }[];
  avgDuration: number;
  errorRate: number;
}

export interface ComplianceReport {
  period: { start: string; end: string };
  summary: {
    totalEvents: number;
    loginAttempts: number;
    failedLogins: number;
    dataAccesses: number;
    dataModifications: number;
    sensitiveOperations: number;
    privilegedActions: number;
  };
  accessPatterns: {
    peakHours: { hour: number; count: number }[];
    unusualActivity: {
      userId: string;
      userName: string;
      reason: string;
      count: number;
    }[];
  };
  dataChanges: {
    creations: number;
    updates: number;
    deletions: number;
    byEntityType: { entityType: string; count: number }[];
  };
  securityEvents: {
    failedLogins: { userId: string; count: number; lastAttempt: string }[];
    privilegedOperations: { action: string; userId: string; count: number }[];
    sensitiveDataAccess: { userId: string; entityType: string; count: number }[];
  };
  generatedAt: string;
}

export class AuditService {
  constructor(private env: Bindings) {}

  /**
   * Log an audit entry
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<string> {
    const id = this.generateId();
    const timestamp = new Date().toISOString();

    await this.env.DB.prepare(
      `INSERT INTO audit_logs (
        id, timestamp, user_id, user_name, user_role, action,
        entity_type, entity_id, entity_name, details, ip_address,
        user_agent, request_id, session_id, insurer_id, provider_id,
        result, error_message, duration, changes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        timestamp,
        entry.userId,
        entry.userName || null,
        entry.userRole,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.entityName || null,
        JSON.stringify(entry.details),
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.requestId || null,
        entry.sessionId || null,
        entry.insurerId || null,
        entry.providerId || null,
        entry.result,
        entry.errorMessage || null,
        entry.duration || null,
        entry.changes ? JSON.stringify(entry.changes) : null
      )
      .run();

    // Also cache recent critical events for quick alerting
    if (this.isCriticalEvent(entry.action)) {
      await this.cacheRecentCriticalEvent(id, timestamp, entry);
    }

    return id;
  }

  /**
   * Log with automatic change detection
   */
  async logWithChanges(
    entry: Omit<AuditEntry, 'id' | 'timestamp' | 'changes'>,
    oldData: Record<string, unknown> | null,
    newData: Record<string, unknown>
  ): Promise<string> {
    const changes = this.detectChanges(oldData, newData);
    return this.log({ ...entry, changes });
  }

  /**
   * Search audit logs
   */
  async search(params: AuditSearchParams): Promise<{
    entries: AuditEntry[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.userId) {
      conditions.push('user_id = ?');
      bindings.push(params.userId);
    }

    if (params.action) {
      if (Array.isArray(params.action)) {
        conditions.push(`action IN (${params.action.map(() => '?').join(',')})`);
        bindings.push(...params.action);
      } else {
        conditions.push('action = ?');
        bindings.push(params.action);
      }
    }

    if (params.entityType) {
      if (Array.isArray(params.entityType)) {
        conditions.push(`entity_type IN (${params.entityType.map(() => '?').join(',')})`);
        bindings.push(...params.entityType);
      } else {
        conditions.push('entity_type = ?');
        bindings.push(params.entityType);
      }
    }

    if (params.entityId) {
      conditions.push('entity_id = ?');
      bindings.push(params.entityId);
    }

    if (params.insurerId) {
      conditions.push('insurer_id = ?');
      bindings.push(params.insurerId);
    }

    if (params.providerId) {
      conditions.push('provider_id = ?');
      bindings.push(params.providerId);
    }

    if (params.result) {
      conditions.push('result = ?');
      bindings.push(params.result);
    }

    if (params.startDate) {
      conditions.push('timestamp >= ?');
      bindings.push(params.startDate);
    }

    if (params.endDate) {
      conditions.push('timestamp <= ?');
      bindings.push(params.endDate);
    }

    if (params.ipAddress) {
      conditions.push('ip_address = ?');
      bindings.push(params.ipAddress);
    }

    if (params.searchText) {
      conditions.push(
        '(entity_name LIKE ? OR user_name LIKE ? OR details LIKE ?)'
      );
      const searchPattern = `%${params.searchText}%`;
      bindings.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`
    )
      .bind(...bindings)
      .first<{ count: number }>();

    // Get paginated results
    const sortBy = params.sortBy || 'timestamp';
    const sortOrder = params.sortOrder || 'desc';
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const { results } = await this.env.DB.prepare(
      `SELECT * FROM audit_logs ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all();

    const entries = (results || []).map(this.mapToAuditEntry);
    const total = countResult?.count || 0;

    return {
      entries,
      total,
      hasMore: offset + entries.length < total,
    };
  }

  /**
   * Get audit entry by ID
   */
  async getById(id: string): Promise<AuditEntry | null> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM audit_logs WHERE id = ?'
    )
      .bind(id)
      .first();

    return result ? this.mapToAuditEntry(result) : null;
  }

  /**
   * Get audit trail for an entity
   */
  async getEntityAuditTrail(
    entityType: EntityType,
    entityId: string,
    limit: number = 100
  ): Promise<AuditEntry[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT * FROM audit_logs
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    )
      .bind(entityType, entityId, limit)
      .all();

    return (results || []).map(this.mapToAuditEntry);
  }

  /**
   * Get user activity log
   */
  async getUserActivity(
    userId: string,
    days: number = 30,
    limit: number = 100
  ): Promise<AuditEntry[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { results } = await this.env.DB.prepare(
      `SELECT * FROM audit_logs
       WHERE user_id = ? AND timestamp >= ?
       ORDER BY timestamp DESC
       LIMIT ?`
    )
      .bind(userId, startDate, limit)
      .all();

    return (results || []).map(this.mapToAuditEntry);
  }

  /**
   * Get audit statistics
   */
  async getStats(
    insurerId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<AuditStats> {
    const dateFilter = this.buildDateFilter(startDate, endDate);
    const insurerFilter = insurerId ? `AND insurer_id = '${insurerId}'` : '';

    // Total entries
    const totalResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM audit_logs WHERE 1=1 ${dateFilter} ${insurerFilter}`
    ).first<{ count: number }>();

    // By action
    const { results: byAction } = await this.env.DB.prepare(
      `SELECT action, COUNT(*) as count FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}
       GROUP BY action ORDER BY count DESC LIMIT 20`
    ).all<{ action: string; count: number }>();

    // By entity type
    const { results: byEntityType } = await this.env.DB.prepare(
      `SELECT entity_type as entityType, COUNT(*) as count FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}
       GROUP BY entity_type ORDER BY count DESC`
    ).all<{ entityType: string; count: number }>();

    // By user (top 10)
    const { results: byUser } = await this.env.DB.prepare(
      `SELECT user_id as userId, COALESCE(user_name, user_id) as userName, COUNT(*) as count
       FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}
       GROUP BY user_id ORDER BY count DESC LIMIT 10`
    ).all<{ userId: string; userName: string; count: number }>();

    // By result
    const { results: byResult } = await this.env.DB.prepare(
      `SELECT result, COUNT(*) as count FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}
       GROUP BY result`
    ).all<{ result: string; count: number }>();

    // By day (last 30 days)
    const { results: byDay } = await this.env.DB.prepare(
      `SELECT date(timestamp) as date, COUNT(*) as count FROM audit_logs
       WHERE timestamp >= date('now', '-30 days') ${insurerFilter}
       GROUP BY date(timestamp) ORDER BY date ASC`
    ).all<{ date: string; count: number }>();

    // Average duration and error rate
    const performanceStats = await this.env.DB.prepare(
      `SELECT
         AVG(CASE WHEN duration IS NOT NULL THEN duration ELSE NULL END) as avg_duration,
         CAST(SUM(CASE WHEN result = 'failure' THEN 1 ELSE 0 END) AS REAL) /
           CAST(COUNT(*) AS REAL) * 100 as error_rate
       FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}`
    ).first<{ avg_duration: number; error_rate: number }>();

    return {
      totalEntries: totalResult?.count || 0,
      byAction: byAction || [],
      byEntityType: byEntityType || [],
      byUser: byUser || [],
      byResult: byResult || [],
      byDay: byDay || [],
      avgDuration: performanceStats?.avg_duration || 0,
      errorRate: performanceStats?.error_rate || 0,
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: string,
    endDate: string,
    insurerId?: string
  ): Promise<ComplianceReport> {
    const dateFilter = `AND timestamp >= '${startDate}' AND timestamp <= '${endDate}'`;
    const insurerFilter = insurerId ? `AND insurer_id = '${insurerId}'` : '';

    // Summary counts
    const summary = await this.env.DB.prepare(
      `SELECT
         COUNT(*) as total_events,
         SUM(CASE WHEN action IN ('LOGIN', 'LOGIN_FAILED') THEN 1 ELSE 0 END) as login_attempts,
         SUM(CASE WHEN action = 'LOGIN_FAILED' THEN 1 ELSE 0 END) as failed_logins,
         SUM(CASE WHEN action = 'READ' THEN 1 ELSE 0 END) as data_accesses,
         SUM(CASE WHEN action IN ('CREATE', 'UPDATE', 'DELETE') THEN 1 ELSE 0 END) as data_modifications,
         SUM(CASE WHEN action IN ('DOCUMENT_DOWNLOAD', 'EXPORT_DATA') THEN 1 ELSE 0 END) as sensitive_operations,
         SUM(CASE WHEN action IN ('USER_CREATE', 'USER_DELETE', 'ROLE_ASSIGN', 'PERMISSION_GRANT', 'CONFIG_CHANGE') THEN 1 ELSE 0 END) as privileged_actions
       FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}`
    ).first<{
      total_events: number;
      login_attempts: number;
      failed_logins: number;
      data_accesses: number;
      data_modifications: number;
      sensitive_operations: number;
      privileged_actions: number;
    }>();

    // Peak hours
    const { results: peakHours } = await this.env.DB.prepare(
      `SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count
       FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}
       GROUP BY hour ORDER BY hour`
    ).all<{ hour: number; count: number }>();

    // Unusual activity (users with significantly more actions than average)
    const { results: unusualActivity } = await this.env.DB.prepare(
      `WITH user_counts AS (
         SELECT user_id, COALESCE(user_name, user_id) as user_name, COUNT(*) as count
         FROM audit_logs
         WHERE 1=1 ${dateFilter} ${insurerFilter}
         GROUP BY user_id
       ),
       avg_count AS (SELECT AVG(count) as avg FROM user_counts)
       SELECT user_id as userId, user_name as userName, count, 'High activity' as reason
       FROM user_counts, avg_count
       WHERE count > avg * 3
       ORDER BY count DESC LIMIT 10`
    ).all<{ userId: string; userName: string; count: number; reason: string }>();

    // Data changes by entity type
    const { results: changesByEntity } = await this.env.DB.prepare(
      `SELECT entity_type as entityType, COUNT(*) as count
       FROM audit_logs
       WHERE action IN ('CREATE', 'UPDATE', 'DELETE') ${dateFilter} ${insurerFilter}
       GROUP BY entity_type ORDER BY count DESC`
    ).all<{ entityType: string; count: number }>();

    const dataChanges = await this.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN action = 'CREATE' THEN 1 ELSE 0 END) as creations,
         SUM(CASE WHEN action = 'UPDATE' THEN 1 ELSE 0 END) as updates,
         SUM(CASE WHEN action = 'DELETE' THEN 1 ELSE 0 END) as deletions
       FROM audit_logs
       WHERE 1=1 ${dateFilter} ${insurerFilter}`
    ).first<{ creations: number; updates: number; deletions: number }>();

    // Failed logins by user
    const { results: failedLogins } = await this.env.DB.prepare(
      `SELECT user_id as userId, COUNT(*) as count, MAX(timestamp) as lastAttempt
       FROM audit_logs
       WHERE action = 'LOGIN_FAILED' ${dateFilter} ${insurerFilter}
       GROUP BY user_id
       HAVING count >= 3
       ORDER BY count DESC LIMIT 20`
    ).all<{ userId: string; count: number; lastAttempt: string }>();

    // Privileged operations
    const { results: privilegedOps } = await this.env.DB.prepare(
      `SELECT action, user_id as userId, COUNT(*) as count
       FROM audit_logs
       WHERE action IN ('USER_CREATE', 'USER_DELETE', 'ROLE_ASSIGN', 'PERMISSION_GRANT', 'CONFIG_CHANGE')
         ${dateFilter} ${insurerFilter}
       GROUP BY action, user_id
       ORDER BY count DESC LIMIT 20`
    ).all<{ action: string; userId: string; count: number }>();

    // Sensitive data access
    const { results: sensitiveAccess } = await this.env.DB.prepare(
      `SELECT user_id as userId, entity_type as entityType, COUNT(*) as count
       FROM audit_logs
       WHERE action IN ('READ', 'DOCUMENT_DOWNLOAD', 'EXPORT_DATA')
         AND entity_type IN ('adherent', 'claim', 'payment')
         ${dateFilter} ${insurerFilter}
       GROUP BY user_id, entity_type
       ORDER BY count DESC LIMIT 20`
    ).all<{ userId: string; entityType: string; count: number }>();

    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalEvents: summary?.total_events || 0,
        loginAttempts: summary?.login_attempts || 0,
        failedLogins: summary?.failed_logins || 0,
        dataAccesses: summary?.data_accesses || 0,
        dataModifications: summary?.data_modifications || 0,
        sensitiveOperations: summary?.sensitive_operations || 0,
        privilegedActions: summary?.privileged_actions || 0,
      },
      accessPatterns: {
        peakHours: peakHours || [],
        unusualActivity: unusualActivity || [],
      },
      dataChanges: {
        creations: dataChanges?.creations || 0,
        updates: dataChanges?.updates || 0,
        deletions: dataChanges?.deletions || 0,
        byEntityType: changesByEntity || [],
      },
      securityEvents: {
        failedLogins: failedLogins || [],
        privilegedOperations: privilegedOps || [],
        sensitiveDataAccess: sensitiveAccess || [],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Export audit logs
   */
  async export(
    params: AuditSearchParams,
    format: 'json' | 'csv' = 'json'
  ): Promise<{ data: string; contentType: string; filename: string }> {
    // Get all matching entries (up to limit)
    const { entries } = await this.search({ ...params, limit: 10000 });

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `audit-logs-${dateStr}`;

    if (format === 'csv') {
      const headers = [
        'id',
        'timestamp',
        'userId',
        'userName',
        'userRole',
        'action',
        'entityType',
        'entityId',
        'entityName',
        'result',
        'ipAddress',
        'duration',
      ];

      const rows = entries.map((e) =>
        [
          e.id,
          e.timestamp,
          e.userId,
          e.userName || '',
          e.userRole,
          e.action,
          e.entityType,
          e.entityId,
          e.entityName || '',
          e.result,
          e.ipAddress || '',
          e.duration?.toString() || '',
        ].map((v) => `"${v}"`).join(',')
      );

      return {
        data: [headers.join(','), ...rows].join('\n'),
        contentType: 'text/csv',
        filename: `${filename}.csv`,
      };
    }

    return {
      data: JSON.stringify(entries, null, 2),
      contentType: 'application/json',
      filename: `${filename}.json`,
    };
  }

  /**
   * Clean up old audit logs (for GDPR compliance)
   */
  async cleanupOldLogs(retentionDays: number = 365): Promise<{ deleted: number }> {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Archive to R2 before deleting (optional)
    const { results } = await this.env.DB.prepare(
      `SELECT * FROM audit_logs WHERE timestamp < ? LIMIT 10000`
    )
      .bind(cutoffDate)
      .all();

    if (results && results.length > 0) {
      // Archive to R2
      const archiveKey = `audit-archives/${cutoffDate.split('T')[0]}-${Date.now()}.json`;
      await this.env.STORAGE.put(archiveKey, JSON.stringify(results));
    }

    // Delete old entries
    const deleteResult = await this.env.DB.prepare(
      `DELETE FROM audit_logs WHERE timestamp < ?`
    )
      .bind(cutoffDate)
      .run();

    return { deleted: deleteResult.meta.changes || 0 };
  }

  // Private helper methods

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `aud_${timestamp}${random}`;
  }

  private isCriticalEvent(action: AuditAction): boolean {
    return [
      'LOGIN_FAILED',
      'PASSWORD_CHANGE',
      'USER_DELETE',
      'PERMISSION_GRANT',
      'CONFIG_CHANGE',
      'FRAUD_FLAG',
      'PERMANENT_DELETE',
    ].includes(action);
  }

  private async cacheRecentCriticalEvent(
    id: string,
    timestamp: string,
    entry: Omit<AuditEntry, 'id' | 'timestamp'>
  ): Promise<void> {
    const key = `audit:critical:${id}`;
    const value = JSON.stringify({ id, timestamp, ...entry });
    await this.env.CACHE.put(key, value, { expirationTtl: 86400 }); // 24 hours
  }

  private detectChanges(
    oldData: Record<string, unknown> | null,
    newData: Record<string, unknown>
  ): { field: string; oldValue: unknown; newValue: unknown }[] {
    if (!oldData) {
      return Object.entries(newData).map(([field, newValue]) => ({
        field,
        oldValue: null,
        newValue,
      }));
    }

    const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    for (const field of allKeys) {
      const oldValue = oldData[field];
      const newValue = newData[field];

      // Skip internal fields
      if (field.startsWith('_') || field === 'updated_at') continue;

      // Compare values
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ field, oldValue, newValue });
      }
    }

    return changes;
  }

  private buildDateFilter(startDate?: string, endDate?: string): string {
    const conditions: string[] = [];

    if (startDate) {
      conditions.push(`timestamp >= '${startDate}'`);
    }

    if (endDate) {
      conditions.push(`timestamp <= '${endDate}'`);
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  }

  private mapToAuditEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      timestamp: row.timestamp as string,
      userId: row.user_id as string,
      userName: (row.user_name as string) || undefined,
      userRole: row.user_role as string,
      action: row.action as AuditAction,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id as string,
      entityName: (row.entity_name as string) || undefined,
      details: row.details ? JSON.parse(row.details as string) : {},
      ipAddress: (row.ip_address as string) || undefined,
      userAgent: (row.user_agent as string) || undefined,
      requestId: (row.request_id as string) || undefined,
      sessionId: (row.session_id as string) || undefined,
      insurerId: (row.insurer_id as string) || undefined,
      providerId: (row.provider_id as string) || undefined,
      result: row.result as 'success' | 'failure',
      errorMessage: (row.error_message as string) || undefined,
      duration: (row.duration as number) || undefined,
      changes: row.changes ? JSON.parse(row.changes as string) : undefined,
    };
  }
}
