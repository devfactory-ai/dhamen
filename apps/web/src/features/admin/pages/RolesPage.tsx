import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Shield, ChevronRight, Lock, Check, X, Users } from 'lucide-react';
import { useRoles, useRolePermissions } from '../hooks/useRoles';

// Group resources by module for cleaner display
const RESOURCE_MODULES: Record<string, string[]> = {
  'Utilisateurs & Accès': ['users'],
  'Assurance': ['adherents', 'contracts', 'insurers', 'companies', 'claims', 'reconciliations', 'conventions'],
  'Bulletins & Soins': ['bulletins_soins'],
  'SoinFlow': ['sante_demandes', 'sante_documents', 'sante_garanties', 'sante_praticiens', 'sante_actes', 'sante_paiements'],
  'Audit': ['audit_logs'],
  'Praticiens': ['providers'],
};

export default function RolesPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const { data: rolesData, isLoading } = useRoles();
  const { data: permissionsData, isLoading: permissionsLoading } = useRolePermissions(selectedRoleId);

  const roles = rolesData?.roles ?? [];
  const totalUsers = roles.reduce((sum, r) => sum + (r.userCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rôles & Permissions"
        description={`${roles.length} rôles configurés — ${totalUsers} utilisateurs actifs`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel: roles list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">
                Rôles ({roles.length})
              </h3>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[calc(100vh-240px)] overflow-y-auto">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-gray-50 ${
                      selectedRoleId === role.id
                        ? 'bg-blue-50 border-l-3 border-l-blue-600'
                        : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {role.label}
                        </span>
                        {role.isProtected && (
                          <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {role.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                          <Users className="h-3 w-3" />
                          {role.userCount ?? 0} utilisateur{(role.userCount ?? 0) !== 1 ? 's' : ''}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {role.permissionsSummary.resources} ressources
                        </Badge>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: permission matrix grouped by module */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {!selectedRoleId ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Shield className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">Sélectionnez un rôle</p>
                <p className="text-xs mt-1">
                  Cliquez sur un rôle pour voir ses permissions
                </p>
              </div>
            ) : permissionsLoading ? (
              <div className="p-6">
                <div className="h-8 w-48 animate-pulse rounded bg-gray-100 mb-4" />
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
                  ))}
                </div>
              </div>
            ) : permissionsData ? (
              <>
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">
                      Permissions — {permissionsData.role.label}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {permissionsData.role.description}
                    </p>
                  </div>
                  {permissionsData.role.isProtected && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      Protégé
                    </Badge>
                  )}
                </div>
                <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
                  {Object.entries(RESOURCE_MODULES).map(([moduleName, resourceIds]) => {
                    // Only show module if at least one resource has permissions
                    const moduleResources = resourceIds
                      .map((id) => ({
                        id,
                        label: permissionsData.resources.find((r) => r.id === id)?.label ?? id,
                      }))
                      .filter((r) => permissionsData.permissions[r.id]);

                    // Check if any resource in this module has at least one permission
                    const hasAnyPerm = moduleResources.some((r) => {
                      const perms = permissionsData.permissions[r.id];
                      return perms && Object.values(perms).some(Boolean);
                    });

                    return (
                      <div key={moduleName}>
                        <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-gray-200 ${hasAnyPerm ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'}`}>
                          {moduleName}
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                              <th className="text-left px-3 py-1.5 font-medium text-gray-500 sticky left-0 bg-gray-50/50 min-w-[140px]">
                                Ressource
                              </th>
                              {permissionsData.actions.map((action) => (
                                <th
                                  key={action.id}
                                  className="px-1.5 py-1.5 font-medium text-gray-500 text-center min-w-[60px]"
                                >
                                  {action.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {resourceIds.map((resourceId) => {
                              const resource = permissionsData.resources.find((r) => r.id === resourceId);
                              if (!resource) return null;
                              const resourcePerms = permissionsData.permissions[resourceId];
                              const rowHasPerm = resourcePerms
                                ? Object.values(resourcePerms).some(Boolean)
                                : false;

                              return (
                                <tr
                                  key={resourceId}
                                  className={rowHasPerm ? 'bg-white' : 'bg-gray-50/30'}
                                >
                                  <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-inherit">
                                    {resource.label}
                                  </td>
                                  {permissionsData.actions.map((action) => {
                                    const allowed = resourcePerms?.[action.id] ?? false;
                                    return (
                                      <td key={action.id} className="px-1.5 py-2 text-center">
                                        {allowed ? (
                                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-600">
                                            <Check className="h-3 w-3" />
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-gray-200">
                                            <X className="h-3 w-3" />
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
