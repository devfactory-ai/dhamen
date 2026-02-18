import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  getPermissions,
  canAccessRoute,
  canManageClaims,
  canManageReconciliations,
  RESOURCES,
  ACTIONS,
} from './permissions';
import type { Role } from './types/user';

describe('RBAC Permissions', () => {
  describe('hasPermission', () => {
    describe('ADMIN role', () => {
      const role: Role = 'ADMIN';

      it('should have full access to users', () => {
        expect(hasPermission(role, 'users', 'create')).toBe(true);
        expect(hasPermission(role, 'users', 'read')).toBe(true);
        expect(hasPermission(role, 'users', 'update')).toBe(true);
        expect(hasPermission(role, 'users', 'delete')).toBe(true);
        expect(hasPermission(role, 'users', 'list')).toBe(true);
      });

      it('should have full access to claims including approve/reject', () => {
        expect(hasPermission(role, 'claims', 'create')).toBe(true);
        expect(hasPermission(role, 'claims', 'approve')).toBe(true);
        expect(hasPermission(role, 'claims', 'reject')).toBe(true);
      });

      it('should be able to read audit logs', () => {
        expect(hasPermission(role, 'audit_logs', 'read')).toBe(true);
        expect(hasPermission(role, 'audit_logs', 'list')).toBe(true);
        expect(hasPermission(role, 'audit_logs', 'delete')).toBe(false);
      });
    });

    describe('PHARMACIST role', () => {
      const role: Role = 'PHARMACIST';

      it('should only read adherents', () => {
        expect(hasPermission(role, 'adherents', 'read')).toBe(true);
        expect(hasPermission(role, 'adherents', 'create')).toBe(false);
        expect(hasPermission(role, 'adherents', 'update')).toBe(false);
        expect(hasPermission(role, 'adherents', 'delete')).toBe(false);
      });

      it('should create and read claims', () => {
        expect(hasPermission(role, 'claims', 'create')).toBe(true);
        expect(hasPermission(role, 'claims', 'read')).toBe(true);
        expect(hasPermission(role, 'claims', 'list')).toBe(true);
      });

      it('should NOT approve/reject claims', () => {
        expect(hasPermission(role, 'claims', 'approve')).toBe(false);
        expect(hasPermission(role, 'claims', 'reject')).toBe(false);
      });

      it('should NOT access users', () => {
        expect(hasPermission(role, 'users', 'read')).toBe(false);
        expect(hasPermission(role, 'users', 'list')).toBe(false);
      });

      it('should NOT access reconciliations', () => {
        expect(hasPermission(role, 'reconciliations', 'read')).toBe(false);
        expect(hasPermission(role, 'reconciliations', 'create')).toBe(false);
      });
    });

    describe('INSURER_AGENT role', () => {
      const role: Role = 'INSURER_AGENT';

      it('should approve/reject claims', () => {
        expect(hasPermission(role, 'claims', 'approve')).toBe(true);
        expect(hasPermission(role, 'claims', 'reject')).toBe(true);
      });

      it('should NOT delete claims', () => {
        expect(hasPermission(role, 'claims', 'delete')).toBe(false);
      });

      it('should read but not modify reconciliations', () => {
        expect(hasPermission(role, 'reconciliations', 'read')).toBe(true);
        expect(hasPermission(role, 'reconciliations', 'list')).toBe(true);
        expect(hasPermission(role, 'reconciliations', 'create')).toBe(false);
      });

      it('should NOT access users', () => {
        expect(hasPermission(role, 'users', 'read')).toBe(false);
      });
    });

    describe('DOCTOR role', () => {
      const role: Role = 'DOCTOR';

      it('should have same permissions as pharmacist for claims', () => {
        expect(hasPermission(role, 'claims', 'create')).toBe(true);
        expect(hasPermission(role, 'claims', 'read')).toBe(true);
        expect(hasPermission(role, 'claims', 'approve')).toBe(false);
      });

      it('should only read contracts', () => {
        expect(hasPermission(role, 'contracts', 'read')).toBe(true);
        expect(hasPermission(role, 'contracts', 'create')).toBe(false);
      });
    });
  });

  describe('getPermissions', () => {
    it('should return all permissions for a role', () => {
      const adminPerms = getPermissions('ADMIN');

      expect(adminPerms.users).toContain('create');
      expect(adminPerms.users).toContain('delete');
      expect(adminPerms.claims).toContain('approve');
    });

    it('should return limited permissions for provider roles', () => {
      const pharmacistPerms = getPermissions('PHARMACIST');

      expect(pharmacistPerms.users).toBeUndefined();
      expect(pharmacistPerms.claims).toBeDefined();
      expect(pharmacistPerms.claims).not.toContain('approve');
    });

    it('should return empty object for invalid role', () => {
      const perms = getPermissions('INVALID_ROLE' as Role);
      expect(perms).toEqual({});
    });
  });

  describe('canAccessRoute', () => {
    it('should allow GET for roles with read permission', () => {
      expect(canAccessRoute('PHARMACIST', 'adherents', 'GET')).toBe(true);
      expect(canAccessRoute('PHARMACIST', 'users', 'GET')).toBe(false);
    });

    it('should allow POST for roles with create permission', () => {
      expect(canAccessRoute('PHARMACIST', 'claims', 'POST')).toBe(true);
      expect(canAccessRoute('PHARMACIST', 'adherents', 'POST')).toBe(false);
    });

    it('should allow PUT/PATCH for roles with update permission', () => {
      expect(canAccessRoute('ADMIN', 'users', 'PUT')).toBe(true);
      expect(canAccessRoute('ADMIN', 'users', 'PATCH')).toBe(true);
      expect(canAccessRoute('PHARMACIST', 'users', 'PUT')).toBe(false);
    });

    it('should allow DELETE for roles with delete permission', () => {
      expect(canAccessRoute('ADMIN', 'users', 'DELETE')).toBe(true);
      expect(canAccessRoute('INSURER_ADMIN', 'users', 'DELETE')).toBe(false);
    });

    it('should return false for unknown HTTP methods', () => {
      expect(canAccessRoute('ADMIN', 'users', 'OPTIONS')).toBe(false);
    });
  });

  describe('canManageClaims', () => {
    it('should return true for roles that can approve/reject', () => {
      expect(canManageClaims('ADMIN')).toBe(true);
      expect(canManageClaims('INSURER_ADMIN')).toBe(true);
      expect(canManageClaims('INSURER_AGENT')).toBe(true);
    });

    it('should return false for provider roles', () => {
      expect(canManageClaims('PHARMACIST')).toBe(false);
      expect(canManageClaims('DOCTOR')).toBe(false);
      expect(canManageClaims('LAB_MANAGER')).toBe(false);
      expect(canManageClaims('CLINIC_ADMIN')).toBe(false);
    });
  });

  describe('canManageReconciliations', () => {
    it('should return true for roles that can create reconciliations', () => {
      expect(canManageReconciliations('ADMIN')).toBe(true);
      expect(canManageReconciliations('INSURER_ADMIN')).toBe(true);
    });

    it('should return false for roles without create permission', () => {
      expect(canManageReconciliations('INSURER_AGENT')).toBe(false);
      expect(canManageReconciliations('PHARMACIST')).toBe(false);
    });
  });

  describe('Constants', () => {
    it('RESOURCES should include all entity types', () => {
      expect(RESOURCES).toContain('users');
      expect(RESOURCES).toContain('providers');
      expect(RESOURCES).toContain('adherents');
      expect(RESOURCES).toContain('insurers');
      expect(RESOURCES).toContain('contracts');
      expect(RESOURCES).toContain('claims');
      expect(RESOURCES).toContain('reconciliations');
      expect(RESOURCES).toContain('conventions');
      expect(RESOURCES).toContain('audit_logs');
    });

    it('ACTIONS should include CRUD and business actions', () => {
      expect(ACTIONS).toContain('create');
      expect(ACTIONS).toContain('read');
      expect(ACTIONS).toContain('update');
      expect(ACTIONS).toContain('delete');
      expect(ACTIONS).toContain('list');
      expect(ACTIONS).toContain('approve');
      expect(ACTIONS).toContain('reject');
    });
  });
});
