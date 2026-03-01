/**
 * Multi-Tenant Middleware
 *
 * Provides data isolation between insurers (tenants)
 */
import { Context, MiddlewareHandler } from 'hono';
import type { Bindings, Variables } from '../types';

export interface TenantContext {
  tenantId: string;
  tenantType: 'insurer' | 'platform';
  tenantName: string;
  tenantConfig: TenantConfig;
}

export interface TenantConfig {
  allowedCareTypes: string[];
  maxClaimAmount: number;
  autoApproveThreshold: number;
  fraudScoreThreshold: number;
  bordereauCycle: 'daily' | 'weekly' | 'monthly';
  notificationChannels: string[];
  customFields?: Record<string, unknown>;
  branding?: {
    logo?: string;
    primaryColor?: string;
    companyName?: string;
  };
}

/**
 * Tenant isolation middleware
 * Extracts tenant context from user and applies data filters
 */
export const tenantMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables & { tenant: TenantContext };
}> = async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      401
    );
  }

  // Platform admins have access to all tenants
  if (user.role === 'ADMIN') {
    const tenantId = c.req.header('X-Tenant-ID');

    if (tenantId) {
      // Admin is impersonating a tenant
      const tenant = await getTenantById(c, tenantId);
      if (tenant) {
        c.set('tenant', tenant);
      }
    } else {
      // Platform-level access
      c.set('tenant', {
        tenantId: 'platform',
        tenantType: 'platform',
        tenantName: 'Dhamen Platform',
        tenantConfig: getDefaultConfig(),
      });
    }
  } else if (user.insurerId) {
    // Insurer users are bound to their insurer
    const tenant = await getTenantById(c, user.insurerId);

    if (!tenant) {
      return c.json(
        {
          success: false,
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not configured' },
        },
        403
      );
    }

    c.set('tenant', tenant);
  } else if (user.providerId) {
    // Provider users - they work with multiple insurers
    // But their data is still scoped to their provider
    c.set('tenant', {
      tenantId: user.providerId,
      tenantType: 'platform', // Providers see data from all insurers
      tenantName: 'Provider',
      tenantConfig: getDefaultConfig(),
    });
  } else {
    // Adherents - their tenant is determined by their contract's insurer
    c.set('tenant', {
      tenantId: 'adherent',
      tenantType: 'platform',
      tenantName: 'Adherent',
      tenantConfig: getDefaultConfig(),
    });
  }

  return next();
};

/**
 * Get tenant by ID
 */
async function getTenantById(
  c: Context<{ Bindings: Bindings; Variables: Variables & { tenant: TenantContext } }>,
  tenantId: string
): Promise<TenantContext | null> {
  try {
    const insurer = await c.env.DB.prepare(
      `SELECT id, name, config FROM insurers WHERE id = ? AND deleted_at IS NULL`
    )
      .bind(tenantId)
      .first<{ id: string; name: string; config: string | null }>();

    if (!insurer) {
      return null;
    }

    const config: TenantConfig = insurer.config
      ? JSON.parse(insurer.config)
      : getDefaultConfig();

    return {
      tenantId: insurer.id,
      tenantType: 'insurer',
      tenantName: insurer.name,
      tenantConfig: config,
    };
  } catch (error) {
    console.error('Error fetching tenant:', error);
    return null;
  }
}

/**
 * Get default tenant configuration
 */
function getDefaultConfig(): TenantConfig {
  return {
    allowedCareTypes: [
      'pharmacie',
      'consultation',
      'hospitalisation',
      'optique',
      'dentaire',
      'laboratoire',
      'kinesitherapie',
      'autre',
    ],
    maxClaimAmount: 100000000, // 100,000 TND
    autoApproveThreshold: 500000, // 500 TND
    fraudScoreThreshold: 70,
    bordereauCycle: 'weekly',
    notificationChannels: ['email', 'sms', 'push', 'in_app'],
  };
}

/**
 * Apply tenant filter to SQL queries
 */
export function applyTenantFilter(
  baseQuery: string,
  tenant: TenantContext,
  tableAlias?: string
): string {
  if (tenant.tenantType === 'platform') {
    return baseQuery;
  }

  const alias = tableAlias ? `${tableAlias}.` : '';

  // Add insurer_id filter
  if (baseQuery.toLowerCase().includes('where')) {
    return baseQuery.replace(
      /where/i,
      `WHERE ${alias}insurer_id = '${tenant.tenantId}' AND`
    );
  } else if (baseQuery.toLowerCase().includes('order by')) {
    return baseQuery.replace(
      /order by/i,
      `WHERE ${alias}insurer_id = '${tenant.tenantId}' ORDER BY`
    );
  } else if (baseQuery.toLowerCase().includes('limit')) {
    return baseQuery.replace(
      /limit/i,
      `WHERE ${alias}insurer_id = '${tenant.tenantId}' LIMIT`
    );
  } else {
    return `${baseQuery} WHERE ${alias}insurer_id = '${tenant.tenantId}'`;
  }
}

/**
 * Validate operation against tenant config
 */
export function validateTenantOperation(
  tenant: TenantContext,
  operation: {
    careType?: string;
    amount?: number;
    channel?: string;
  }
): { valid: boolean; error?: string } {
  const { tenantConfig } = tenant;

  // Check care type
  if (operation.careType && !tenantConfig.allowedCareTypes.includes(operation.careType)) {
    return {
      valid: false,
      error: `Type de soin '${operation.careType}' non autorisé pour ce tenant`,
    };
  }

  // Check amount
  if (operation.amount && operation.amount > tenantConfig.maxClaimAmount) {
    return {
      valid: false,
      error: `Montant dépasse le maximum autorisé (${tenantConfig.maxClaimAmount / 1000} TND)`,
    };
  }

  // Check notification channel
  if (operation.channel && !tenantConfig.notificationChannels.includes(operation.channel)) {
    return {
      valid: false,
      error: `Canal de notification '${operation.channel}' non configuré`,
    };
  }

  return { valid: true };
}

/**
 * Check if claim should be auto-approved based on tenant config
 */
export function shouldAutoApprove(
  tenant: TenantContext,
  claimAmount: number,
  fraudScore: number
): boolean {
  const { tenantConfig } = tenant;

  return (
    claimAmount <= tenantConfig.autoApproveThreshold &&
    fraudScore < tenantConfig.fraudScoreThreshold
  );
}

/**
 * Require specific tenant type
 */
export const requireTenantType = (
  ...allowedTypes: TenantContext['tenantType'][]
): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables & { tenant: TenantContext };
}> => {
  return async (c, next) => {
    const tenant = c.get('tenant');

    if (!tenant) {
      return c.json(
        {
          success: false,
          error: { code: 'TENANT_REQUIRED', message: 'Tenant context required' },
        },
        403
      );
    }

    if (!allowedTypes.includes(tenant.tenantType)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'TENANT_TYPE_NOT_ALLOWED',
            message: `Operation not allowed for tenant type '${tenant.tenantType}'`,
          },
        },
        403
      );
    }

    return next();
  };
};

/**
 * Tenant-scoped database queries helper
 */
export class TenantScopedQueries {
  constructor(
    private db: D1Database,
    private tenant: TenantContext
  ) {}

  /**
   * Get claims for tenant
   */
  async getClaims(params: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ claims: unknown[]; total: number }> {
    const conditions: string[] = [];
    const bindParams: unknown[] = [];

    if (this.tenant.tenantType === 'insurer') {
      conditions.push('c.insurer_id = ?');
      bindParams.push(this.tenant.tenantId);
    }

    if (params.status) {
      conditions.push('sd.statut = ?');
      bindParams.push(params.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM sante_demandes sd
         JOIN contracts c ON sd.contract_id = c.id
         ${whereClause}`
      )
      .bind(...bindParams)
      .first<{ count: number }>();

    const { results } = await this.db
      .prepare(
        `SELECT sd.*, c.insurer_id
         FROM sante_demandes sd
         JOIN contracts c ON sd.contract_id = c.id
         ${whereClause}
         ORDER BY sd.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...bindParams, params.limit || 20, params.offset || 0)
      .all();

    return {
      claims: results || [],
      total: countResult?.count || 0,
    };
  }

  /**
   * Get adherents for tenant
   */
  async getAdherents(params: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ adherents: unknown[]; total: number }> {
    const conditions: string[] = ['a.deleted_at IS NULL'];
    const bindParams: unknown[] = [];

    if (this.tenant.tenantType === 'insurer') {
      conditions.push('c.insurer_id = ?');
      bindParams.push(this.tenant.tenantId);
    }

    if (params.search) {
      conditions.push('(a.first_name LIKE ? OR a.last_name LIKE ? OR a.matricule LIKE ?)');
      const searchPattern = `%${params.search}%`;
      bindParams.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM adherents a
         JOIN contracts c ON a.contract_id = c.id
         ${whereClause}`
      )
      .bind(...bindParams)
      .first<{ count: number }>();

    const { results } = await this.db
      .prepare(
        `SELECT a.*, c.insurer_id
         FROM adherents a
         JOIN contracts c ON a.contract_id = c.id
         ${whereClause}
         ORDER BY a.last_name, a.first_name
         LIMIT ? OFFSET ?`
      )
      .bind(...bindParams, params.limit || 20, params.offset || 0)
      .all();

    return {
      adherents: results || [],
      total: countResult?.count || 0,
    };
  }

  /**
   * Get providers for tenant
   */
  async getProviders(params: {
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ providers: unknown[]; total: number }> {
    const conditions: string[] = ['p.deleted_at IS NULL'];
    const bindParams: unknown[] = [];

    if (this.tenant.tenantType === 'insurer') {
      // Get only conventioned providers for this insurer
      conditions.push(`EXISTS (
        SELECT 1 FROM provider_conventions pc
        WHERE pc.provider_id = p.id AND pc.insurer_id = ? AND pc.status = 'ACTIVE'
      )`);
      bindParams.push(this.tenant.tenantId);
    }

    if (params.type) {
      conditions.push('p.type = ?');
      bindParams.push(params.type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM providers p ${whereClause}`)
      .bind(...bindParams)
      .first<{ count: number }>();

    const { results } = await this.db
      .prepare(
        `SELECT p.* FROM providers p ${whereClause}
         ORDER BY p.name
         LIMIT ? OFFSET ?`
      )
      .bind(...bindParams, params.limit || 20, params.offset || 0)
      .all();

    return {
      providers: results || [],
      total: countResult?.count || 0,
    };
  }

  /**
   * Get statistics for tenant
   */
  async getStats(): Promise<{
    totalClaims: number;
    totalAmount: number;
    pendingClaims: number;
    approvedClaims: number;
    rejectedClaims: number;
    activeAdherents: number;
    activeProviders: number;
  }> {
    const insurerCondition =
      this.tenant.tenantType === 'insurer'
        ? `AND c.insurer_id = '${this.tenant.tenantId}'`
        : '';

    const stats = await this.db
      .prepare(
        `SELECT
          COUNT(*) as total_claims,
          COALESCE(SUM(sd.montant_demande), 0) as total_amount,
          SUM(CASE WHEN sd.statut IN ('soumise', 'en_examen') THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN sd.statut = 'approuvee' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as rejected
        FROM sante_demandes sd
        JOIN contracts c ON sd.contract_id = c.id
        WHERE 1=1 ${insurerCondition}`
      )
      .first<{
        total_claims: number;
        total_amount: number;
        pending: number;
        approved: number;
        rejected: number;
      }>();

    const adherentsCount = await this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM adherents a
         JOIN contracts c ON a.contract_id = c.id
         WHERE a.deleted_at IS NULL AND a.est_actif = 1 ${insurerCondition}`
      )
      .first<{ count: number }>();

    const providersCount = await this.db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) as count
         FROM providers p
         ${
           this.tenant.tenantType === 'insurer'
             ? `JOIN provider_conventions pc ON p.id = pc.provider_id
                WHERE pc.insurer_id = '${this.tenant.tenantId}' AND pc.status = 'ACTIVE'`
             : 'WHERE p.deleted_at IS NULL'
         }`
      )
      .first<{ count: number }>();

    return {
      totalClaims: stats?.total_claims || 0,
      totalAmount: stats?.total_amount || 0,
      pendingClaims: stats?.pending || 0,
      approvedClaims: stats?.approved || 0,
      rejectedClaims: stats?.rejected || 0,
      activeAdherents: adherentsCount?.count || 0,
      activeProviders: providersCount?.count || 0,
    };
  }
}
