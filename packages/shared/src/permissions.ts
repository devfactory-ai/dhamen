import type { Role } from './types/user';

/**
 * Available resources in the system
 */
export const RESOURCES = [
  'users',
  'providers',
  'adherents',
  'insurers',
  'contracts',
  'claims',
  'reconciliations',
  'conventions',
  'audit_logs',
  // SoinFlow resources
  'sante_demandes',
  'sante_documents',
  'sante_garanties',
  'sante_praticiens',
  'sante_actes',
  'sante_paiements',
] as const;

export type Resource = (typeof RESOURCES)[number];

/**
 * Available actions on resources
 */
export const ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
  'list',
  'approve',
  'reject',
  // SoinFlow actions
  'validate',
  'upload',
  'download',
  'initiate',
  'process',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Permission matrix: role -> resource -> allowed actions
 */
export const PERMISSIONS: Record<Role, Partial<Record<Resource, Action[]>>> = {
  ADMIN: {
    users: ['create', 'read', 'update', 'delete', 'list'],
    providers: ['create', 'read', 'update', 'delete', 'list'],
    adherents: ['create', 'read', 'update', 'delete', 'list'],
    insurers: ['create', 'read', 'update', 'delete', 'list'],
    contracts: ['create', 'read', 'update', 'delete', 'list'],
    claims: ['create', 'read', 'update', 'delete', 'list', 'approve', 'reject'],
    reconciliations: ['create', 'read', 'update', 'delete', 'list'],
    conventions: ['create', 'read', 'update', 'delete', 'list'],
    audit_logs: ['read', 'list'],
  },

  INSURER_ADMIN: {
    users: ['create', 'read', 'update', 'list'],
    providers: ['read', 'list'],
    adherents: ['create', 'read', 'update', 'list'],
    insurers: ['read', 'update'],
    contracts: ['create', 'read', 'update', 'list'],
    claims: ['read', 'update', 'list', 'approve', 'reject'],
    reconciliations: ['create', 'read', 'list'],
    conventions: ['create', 'read', 'update', 'list'],
    audit_logs: ['read', 'list'],
  },

  INSURER_AGENT: {
    providers: ['read', 'list'],
    adherents: ['create', 'read', 'update', 'list'],
    contracts: ['create', 'read', 'update', 'list'],
    claims: ['read', 'list', 'approve', 'reject'],
    reconciliations: ['read', 'list'],
    conventions: ['read', 'list'],
  },

  PHARMACIST: {
    adherents: ['read'],
    contracts: ['read'],
    claims: ['create', 'read', 'list'],
  },

  DOCTOR: {
    adherents: ['read'],
    contracts: ['read'],
    claims: ['create', 'read', 'list'],
  },

  LAB_MANAGER: {
    adherents: ['read'],
    contracts: ['read'],
    claims: ['create', 'read', 'list'],
  },

  CLINIC_ADMIN: {
    adherents: ['read'],
    contracts: ['read'],
    claims: ['create', 'read', 'list'],
  },

  /**
   * ADHERENT role - Mobile app users (insured members)
   * Can only view their own data
   */
  ADHERENT: {
    adherents: ['read'], // Only own profile
    contracts: ['read'], // Only own contracts
    claims: ['read', 'list'], // Only own claims
    // SoinFlow: adhérents peuvent soumettre et voir leurs demandes
    sante_demandes: ['create', 'read', 'list'],
    sante_documents: ['upload', 'read'],
  },

  /**
   * SOIN_GESTIONNAIRE role - SoinFlow supervisors
   * Full control over SoinFlow operations, validation, reports
   */
  SOIN_GESTIONNAIRE: {
    adherents: ['read', 'list'],
    sante_demandes: ['create', 'read', 'update', 'delete', 'list', 'validate'],
    sante_documents: ['create', 'read', 'update', 'delete', 'list', 'upload', 'download'],
    sante_garanties: ['create', 'read', 'update', 'delete', 'list'],
    sante_praticiens: ['create', 'read', 'update', 'delete', 'list'],
    sante_actes: ['create', 'read', 'update', 'delete', 'list', 'validate'],
    sante_paiements: ['create', 'read', 'update', 'list', 'initiate'],
    audit_logs: ['read', 'list'],
  },

  /**
   * SOIN_AGENT role - SoinFlow daily operations
   * Process claims, data entry, read access
   */
  SOIN_AGENT: {
    adherents: ['read', 'list'],
    sante_demandes: ['read', 'list', 'create', 'update'],
    sante_documents: ['read', 'upload'],
    sante_garanties: ['read', 'list'],
    sante_praticiens: ['read', 'list'],
    sante_actes: ['read', 'list'],
    sante_paiements: ['read', 'list', 'process'],
  },

  /**
   * PRATICIEN role - Healthcare practitioners
   * Submit digital acts, verify eligibility, view own submissions
   */
  PRATICIEN: {
    adherents: ['read'], // Only linked to their care
    sante_demandes: ['create', 'read'], // Own submissions only
    sante_documents: ['upload'], // Own documents only
    sante_garanties: ['read'], // Check coverage
    sante_actes: ['create', 'read', 'list'], // Own acts only
    sante_paiements: ['read'], // Own payments only
  },
};

/**
 * Check if a role has permission to perform an action on a resource
 */
export function hasPermission(role: Role, resource: Resource, action: Action): boolean {
  const rolePermissions = PERMISSIONS[role];
  if (!rolePermissions) {
    return false;
  }

  const resourceActions = rolePermissions[resource];
  if (!resourceActions) {
    return false;
  }

  return resourceActions.includes(action);
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: Role): Partial<Record<Resource, Action[]>> {
  return PERMISSIONS[role] || {};
}

/**
 * Check if a role can access a specific route pattern
 */
export function canAccessRoute(role: Role, resource: Resource, method: string): boolean {
  const methodToAction: Record<string, Action> = {
    GET: 'read',
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };

  const action = methodToAction[method.toUpperCase()];
  if (!action) {
    return false;
  }

  // For GET requests, check both 'read' and 'list'
  if (method.toUpperCase() === 'GET') {
    return hasPermission(role, resource, 'read') || hasPermission(role, resource, 'list');
  }

  return hasPermission(role, resource, action);
}

/**
 * Roles that can approve/reject claims
 */
export function canManageClaims(role: Role): boolean {
  return hasPermission(role, 'claims', 'approve') || hasPermission(role, 'claims', 'reject');
}

/**
 * Roles that can manage reconciliations
 */
export function canManageReconciliations(role: Role): boolean {
  return hasPermission(role, 'reconciliations', 'create');
}
