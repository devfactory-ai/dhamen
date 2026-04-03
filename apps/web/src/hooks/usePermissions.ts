import { useCallback } from 'react';
import { getPermissions, type UserPermissions } from '@/lib/auth';
import { getUser } from '@/lib/auth';
import { hasPermission as staticHasPermission } from '@dhamen/shared';
import type { Role, Resource, Action } from '@dhamen/shared';

/**
 * Hook for resolving user permissions with 3-layer architecture:
 * 1. Role-based permissions (from PERMISSIONS matrix)
 * 2. Individual overrides (from user_permissions table)
 * 3. Data scope (handled server-side)
 *
 * Individual overrides take priority over role permissions.
 */
export function usePermissions() {
  const permissions = getPermissions();
  const user = getUser();

  const hasPermission = useCallback(
    (resource: string, action: string): boolean => {
      // If we have resolved permissions from the server, use them
      if (permissions) {
        // Check individual overrides first (highest priority)
        const override = permissions.overrides.find(
          (o) => o.resource === resource && o.action === action
        );
        if (override) {
          // Check expiration
          if (override.expiresAt && new Date(override.expiresAt) < new Date()) {
            // Expired override — fall through to role permission
          } else {
            return override.isGranted;
          }
        }

        // Fall back to role permission matrix
        const rolePerms = permissions.role[resource];
        if (rolePerms) {
          return rolePerms[action] === true;
        }
        return false;
      }

      // Fallback: use static role-based check if no server permissions
      if (user?.role) {
        return staticHasPermission(
          user.role as Role,
          resource as Resource,
          action as Action
        );
      }

      return false;
    },
    [permissions, user?.role]
  );

  const hasAnyPermission = useCallback(
    (resource: string, actions: string[]): boolean => {
      return actions.some((action) => hasPermission(resource, action));
    },
    [hasPermission]
  );

  const getOverrides = useCallback((): UserPermissions['overrides'] => {
    return permissions?.overrides ?? [];
  }, [permissions]);

  return {
    hasPermission,
    hasAnyPermission,
    getOverrides,
    permissions,
  };
}
