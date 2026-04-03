import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { ROLE_LABELS, type Role } from '@dhamen/shared';

interface RoleGuardProps {
  roles: Role[];
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * RoleGuard — restricts route access to specific roles.
 * If the user's role is not in the allowed list, redirects to dashboard.
 * Use this ONLY for admin-only pages (Rôles & Permissions, Audit logs).
 */
export function RoleGuard({ roles, children, redirectTo = '/dashboard' }: RoleGuardProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role as Role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

interface PermissionGuardProps {
  resource: string;
  action?: string;
  children: React.ReactNode;
}

/**
 * PermissionGuard — restricts route access based on dynamic permissions from DB.
 * Uses the 3-layer permission system: role matrix → individual overrides → server scope.
 * ADMIN always passes. Shows AccessDenied page instead of redirecting.
 */
export function PermissionGuard({ resource, action = 'read', children }: PermissionGuardProps) {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ADMIN always has full access
  if (user.role === 'ADMIN') {
    return <>{children}</>;
  }

  if (hasPermission(resource, action)) {
    return <>{children}</>;
  }

  const roleLabel = ROLE_LABELS[user.role as Role] || user.role;

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-5xl mb-4">&#128274;</span>
      <h2 className="text-xl font-semibold text-gray-900">Accès non autorisé</h2>
      <p className="mt-2 text-sm text-gray-500">
        Le rôle &laquo;&nbsp;{roleLabel}&nbsp;&raquo; n&apos;a pas le droit d&apos;accéder à cette page.
      </p>
      <p className="mt-1 text-xs text-gray-400">
        Contactez votre administrateur pour obtenir l&apos;accès.
      </p>
      <button
        type="button"
        onClick={() => window.history.back()}
        className="mt-6 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        &larr; Retour
      </button>
    </div>
  );
}
