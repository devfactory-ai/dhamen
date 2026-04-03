import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Shield, ChevronRight, Lock, Check, X, Users, Plus, Pencil, Save, Trash2 } from 'lucide-react';
import { useRoles, useRolePermissions, useUpdatePermissions, useCreateRole, useDeleteRole } from '../hooks/useRoles';
import { HIDDEN_ROLES } from '@dhamen/shared';
import { useToast } from '@/stores/toast';
import { usePermissions } from '@/hooks/usePermissions';

// Group resources by module for cleaner display
const RESOURCE_MODULES: Record<string, { color: string; resources: string[]; comingSoon?: boolean }> = {
  'Prises en charge': { color: 'bg-indigo-50 text-indigo-700', resources: ['claims', 'reconciliations', 'conventions'] },
  'Bulletins de soins': { color: 'bg-emerald-50 text-emerald-700', resources: ['bulletins_soins'] },
  'SoinFlow — Application Mobile': { color: 'bg-violet-50 text-violet-700', resources: ['sante_demandes', 'sante_documents', 'sante_garanties', 'sante_actes', 'sante_paiements'], comingSoon: true },
  'Audit': { color: 'bg-amber-50 text-amber-700', resources: ['audit_logs'] },
  'Praticiens': { color: 'bg-rose-50 text-rose-700', resources: ['sante_praticiens', 'providers'] },
  'Utilisateurs & Accès': { color: 'bg-sky-50 text-sky-700', resources: ['users'] },
  'Assurance': { color: 'bg-blue-50 text-blue-700', resources: ['adherents', 'contracts', 'insurers', 'companies'] },
};

export default function RolesPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPermissions, setEditedPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRoleDuplicateFrom, setNewRoleDuplicateFrom] = useState('');

  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('users', 'create');
  const canUpdate = hasPermission('users', 'update');
  const canDelete = hasPermission('users', 'delete');
  const { data: rolesData, isLoading } = useRoles();
  const { data: permissionsData, isLoading: permissionsLoading } = useRolePermissions(selectedRoleId);
  const updatePermissions = useUpdatePermissions();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();

  const roles = (rolesData?.roles ?? []).filter((r) => !HIDDEN_ROLES.includes(r.id as never));
  const totalUsers = roles.reduce((sum, r) => sum + (r.userCount ?? 0), 0);

  const handleStartEdit = useCallback(() => {
    if (!permissionsData) return;
    // Clone current permissions as starting point
    const clone: Record<string, Record<string, boolean>> = {};
    for (const [resource, actions] of Object.entries(permissionsData.permissions)) {
      clone[resource] = { ...actions };
    }
    setEditedPermissions(clone);
    setIsEditing(true);
  }, [permissionsData]);

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedPermissions({});
  };

  const handleTogglePermission = (resource: string, action: string) => {
    setEditedPermissions((prev) => ({
      ...prev,
      [resource]: {
        ...prev[resource],
        [action]: !(prev[resource]?.[action] ?? false),
      },
    }));
  };

  const isProtectedRole = permissionsData?.role.isProtected ?? false;

  const handleSave = async () => {
    if (!selectedRoleId || !permissionsData) return;

    if (isProtectedRole && !confirmPassword.trim()) {
      setPasswordError('Mot de passe requis');
      return;
    }

    // Build diff: only send changed permissions
    const changes: { resource: string; action: string; is_granted: boolean }[] = [];
    for (const [resource, actions] of Object.entries(editedPermissions)) {
      for (const [action, granted] of Object.entries(actions)) {
        const original = permissionsData.permissions[resource]?.[action] ?? false;
        if (granted !== original) {
          changes.push({ resource, action, is_granted: granted });
        }
      }
    }

    if (changes.length === 0) {
      toast({ title: 'Aucune modification détectée', variant: 'default' });
      setIsEditing(false);
      setShowSaveConfirm(false);
      setConfirmPassword('');
      setPasswordError('');
      return;
    }

    try {
      await updatePermissions.mutateAsync({ roleId: selectedRoleId, permissions: changes, password: isProtectedRole ? confirmPassword : undefined });
      toast({ title: `${changes.length} permission(s) modifiée(s)`, variant: 'success' });
      setIsEditing(false);
      setEditedPermissions({});
      setShowSaveConfirm(false);
      setConfirmPassword('');
      setPasswordError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      if (message.toLowerCase().includes('mot de passe') || message.toLowerCase().includes('password')) {
        setPasswordError('Mot de passe incorrect');
      } else {
        toast({ title: message, variant: 'destructive' });
      }
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !newRoleDescription.trim()) {
      toast({ title: 'Nom et description requis', variant: 'destructive' });
      return;
    }

    try {
      const result = await createRole.mutateAsync({
        name: newRoleName.trim(),
        description: newRoleDescription.trim(),
        duplicateFromId: newRoleDuplicateFrom || undefined,
      });
      toast({ title: `Rôle "${newRoleName}" créé`, variant: 'success' });
      setShowNewRoleModal(false);
      setNewRoleName('');
      setNewRoleDescription('');
      setNewRoleDuplicateFrom('');
      if (result?.id) {
        setSelectedRoleId(result.id);
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Erreur lors de la création', variant: 'destructive' });
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRoleId) return;
    try {
      await deleteRole.mutateAsync(selectedRoleId);
      toast({ title: 'Rôle supprimé avec succès', variant: 'success' });
      setSelectedRoleId(null);
      setShowDeleteConfirm(false);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Erreur lors de la suppression', variant: 'destructive' });
      setShowDeleteConfirm(false);
    }
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // Get the permissions to display (edited or original)
  const displayPermissions = isEditing ? editedPermissions : permissionsData?.permissions;

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
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                Rôles ({roles.length})
              </h3>
              {canCreate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowNewRoleModal(true)}
                >
                  <Plus className="h-3 w-3" />
                  Nouveau rôle
                </Button>
              )}
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
                    onClick={() => {
                      setSelectedRoleId(role.id);
                      setIsEditing(false);
                      setEditedPermissions({});
                    }}
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
            ) : permissionsData && displayPermissions ? (
              <>
                {/* Header with role info and edit button */}
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">
                      Permissions — {permissionsData.role.label}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {permissionsData.role.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {permissionsData.role.isProtected && !isEditing && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Protégé
                      </Badge>
                    )}
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={handleCancelEdit}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => isProtectedRole ? setShowSaveConfirm(true) : handleSave()}
                          disabled={updatePermissions.isPending}
                        >
                          <Save className="h-3 w-3" />
                          {updatePermissions.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
                        </Button>
                      </>
                    ) : (
                      <>
                        {canDelete && !permissionsData.role.isProtected && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setShowDeleteConfirm(true)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Supprimer
                          </Button>
                        )}
                        {canUpdate && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={handleStartEdit}
                          >
                            <Pencil className="h-3 w-3" />
                            Modifier
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Protected role banner */}
                {permissionsData.role.isProtected && (
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <p className="text-xs text-amber-700 font-medium">
                      Ce rôle est protégé — la confirmation par mot de passe sera requise pour sauvegarder
                    </p>
                  </div>
                )}

                {/* Permissions matrix */}
                <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
                  {Object.entries(RESOURCE_MODULES).map(([moduleName, moduleConfig]) => {
                    const { color, resources: resourceIds } = moduleConfig;

                    const hasAnyPerm = resourceIds.some((rId) => {
                      const perms = displayPermissions[rId];
                      return perms && Object.values(perms).some(Boolean);
                    });

                    // Module "bientôt disponible"
                    if (moduleConfig.comingSoon) {
                      return (
                        <div key={moduleName}>
                          <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-gray-200 ${color}`}>
                            {moduleName}
                          </div>
                          <div className="px-4 py-4 bg-violet-50/50 border-b border-violet-100 flex items-center gap-3">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-violet-100">
                              <Lock className="h-4 w-4 text-violet-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-violet-700">
                                Bientôt disponible
                              </p>
                              <p className="text-xs text-violet-500">
                                Cette fonctionnalité sera disponible prochainement pour la gestion de l'application mobile et des actes digitaux.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={moduleName}>
                        <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-gray-200 ${hasAnyPerm ? color : 'bg-gray-50 text-gray-400'}`}>
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
                              const resourcePerms = displayPermissions[resourceId];
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

                                    if (isEditing) {
                                      return (
                                        <td key={action.id} className="px-1.5 py-2 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleTogglePermission(resourceId, action.id)}
                                            className={`inline-flex items-center justify-center h-5 w-5 rounded-full transition-colors cursor-pointer ${
                                              allowed
                                                ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                                                : 'bg-gray-100 text-gray-300 hover:bg-gray-200 hover:text-gray-500'
                                            }`}
                                          >
                                            {allowed ? (
                                              <Check className="h-3 w-3" />
                                            ) : (
                                              <X className="h-3 w-3" />
                                            )}
                                          </button>
                                        </td>
                                      );
                                    }

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

      {/* Save Confirmation Dialog with Password */}
      <AlertDialog open={showSaveConfirm} onOpenChange={(open) => {
        setShowSaveConfirm(open);
        if (!open) { setConfirmPassword(''); setPasswordError(''); }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              Confirmer les modifications
            </AlertDialogTitle>
            <AlertDialogDescription>
              Pour sauvegarder les modifications de permissions du rôle{' '}
              <strong>{permissionsData?.role.label}</strong>, veuillez confirmer
              votre identité en saisissant votre mot de passe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Saisissez votre mot de passe"
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-red-600">{passwordError}</p>
              )}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmPassword(''); setPasswordError(''); }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleSave(); }}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={updatePermissions.isPending || !confirmPassword.trim()}
            >
              {updatePermissions.isPending ? 'Vérification...' : 'Confirmer et sauvegarder'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Role Modal */}
      <AlertDialog open={showNewRoleModal} onOpenChange={setShowNewRoleModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nouveau rôle</AlertDialogTitle>
            <AlertDialogDescription>
              Créer un nouveau rôle personnalisé avec ses permissions
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="roleName">Nom du rôle *</Label>
              <Input
                id="roleName"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Ex: Responsable pharmacie"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleDescription">Description *</Label>
              <Input
                id="roleDescription"
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                placeholder="Description du rôle"
              />
            </div>
            <div className="space-y-2">
              <Label>Dupliquer depuis</Label>
              <Select
                value={newRoleDuplicateFrom}
                onValueChange={setNewRoleDuplicateFrom}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun (permissions vides)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setNewRoleName('');
              setNewRoleDescription('');
              setNewRoleDuplicateFrom('');
            }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateRole}
              disabled={createRole.isPending || !newRoleName.trim() || !newRoleDescription.trim()}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {createRole.isPending ? 'Création...' : 'Créer le rôle'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Role Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le rôle</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le rôle <strong>{selectedRole?.label}</strong> ?
              {(selectedRole?.userCount ?? 0) > 0 && (
                <span className="block mt-2 text-red-600 font-medium">
                  Attention : {selectedRole?.userCount} utilisateur(s) sont encore assignés à ce rôle.
                  Vous devez les réassigner avant de pouvoir le supprimer.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              disabled={deleteRole.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteRole.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
