import { useState } from 'react';
import { X, Plus, Trash2, ShieldCheck, ShieldX, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, RESOURCES, ACTIONS } from '@dhamen/shared';
import type { Role } from '@dhamen/shared';
import {
  useUserPermissions,
  useAddPermissionOverride,
  useRemovePermissionOverride,
  type PermissionOverride,
} from '../hooks/useUsers';
import { useToast } from '@/stores/toast';

interface PermissionsDrawerProps {
  userId: string | null;
  onClose: () => void;
}

const RESOURCE_LABELS: Record<string, string> = {
  users: 'Utilisateurs',
  providers: 'Prestataires',
  adherents: 'Adhérents',
  insurers: 'Assureurs',
  contracts: 'Contrats',
  claims: 'PEC / Sinistres',
  reconciliations: 'Réconciliations',
  conventions: 'Conventionnements',
  audit_logs: 'Logs d\'audit',
  companies: 'Entreprises',
  bulletins_soins: 'Bulletins de soins',
  sante_demandes: 'Demandes santé',
  sante_documents: 'Documents santé',
  sante_garanties: 'Garanties santé',
  sante_praticiens: 'Praticiens',
  sante_actes: 'Actes santé',
  sante_paiements: 'Paiements santé',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Créer',
  read: 'Lire',
  update: 'Modifier',
  delete: 'Supprimer',
  list: 'Lister',
  approve: 'Approuver',
  reject: 'Rejeter',
  validate: 'Valider',
  upload: 'Upload',
  download: 'Download',
  initiate: 'Initier',
  process: 'Traiter',
};

export function PermissionsDrawer({ userId, onClose }: PermissionsDrawerProps) {
  const { data, isLoading } = useUserPermissions(userId);
  const addOverride = useAddPermissionOverride();
  const removeOverride = useRemovePermissionOverride();
  const { toast } = useToast();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newOverride, setNewOverride] = useState({
    resource: '',
    action: '',
    isGranted: true,
    reason: '',
    expiresAt: '',
  });

  if (!userId) return null;

  const handleAdd = async () => {
    if (!newOverride.resource || !newOverride.action || newOverride.reason.length < 10) {
      toast({ title: 'Veuillez remplir tous les champs (raison >= 10 caractères)', variant: 'destructive' });
      return;
    }

    try {
      await addOverride.mutateAsync({
        userId,
        data: {
          resource: newOverride.resource,
          action: newOverride.action,
          isGranted: newOverride.isGranted,
          reason: newOverride.reason,
          expiresAt: newOverride.expiresAt || null,
        },
      });
      toast({ title: 'Surcharge ajoutée', variant: 'success' });
      setShowAddForm(false);
      setNewOverride({ resource: '', action: '', isGranted: true, reason: '', expiresAt: '' });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Erreur', variant: 'destructive' });
    }
  };

  const handleRemove = async (override: PermissionOverride) => {
    try {
      await removeOverride.mutateAsync({ userId, permId: override.id });
      toast({ title: 'Surcharge supprimée', variant: 'success' });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Erreur', variant: 'destructive' });
    }
  };

  // Get actions available for selected resource based on role permissions
  const availableActions = newOverride.resource && data
    ? ACTIONS.filter((a) => {
        // Show all actions, not just those in role permissions
        return true;
      })
    : [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 !mt-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Permissions individuelles
            </h2>
            {data && (
              <p className="text-sm text-gray-500 mt-0.5">
                {data.user.firstName} {data.user.lastName} —{' '}
                <Badge variant="outline" className="text-xs">
                  {ROLE_LABELS[data.user.role as Role] || data.user.role}
                </Badge>
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : data ? (
            <>
              {/* Active overrides */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Surcharges actives ({data.overrides.length}/20)
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setShowAddForm(!showAddForm)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter
                  </Button>
                </div>

                {/* Add form */}
                {showAddForm && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Ressource</label>
                        <select
                          value={newOverride.resource}
                          onChange={(e) => setNewOverride({ ...newOverride, resource: e.target.value, action: '' })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Choisir...</option>
                          {RESOURCES.map((r) => (
                            <option key={r} value={r}>
                              {RESOURCE_LABELS[r] || r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
                        <select
                          value={newOverride.action}
                          onChange={(e) => setNewOverride({ ...newOverride, action: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={!newOverride.resource}
                        >
                          <option value="">Choisir...</option>
                          {availableActions.map((a) => (
                            <option key={a} value={a}>
                              {ACTION_LABELS[a] || a}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="isGranted"
                          checked={newOverride.isGranted}
                          onChange={() => setNewOverride({ ...newOverride, isGranted: true })}
                          className="text-green-600"
                        />
                        <ShieldCheck className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-700">Accorder</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="isGranted"
                          checked={!newOverride.isGranted}
                          onChange={() => setNewOverride({ ...newOverride, isGranted: false })}
                          className="text-red-600"
                        />
                        <ShieldX className="w-4 h-4 text-red-600" />
                        <span className="text-sm text-red-700">Révoquer</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Raison (min 10 caractères)
                      </label>
                      <textarea
                        value={newOverride.reason}
                        onChange={(e) => setNewOverride({ ...newOverride, reason: e.target.value })}
                        placeholder="Justification de la surcharge..."
                        rows={2}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Expiration (optionnel)
                      </label>
                      <input
                        type="date"
                        value={newOverride.expiresAt}
                        onChange={(e) => setNewOverride({ ...newOverride, expiresAt: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowAddForm(false);
                          setNewOverride({ resource: '', action: '', isGranted: true, reason: '', expiresAt: '' });
                        }}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAdd}
                        disabled={addOverride.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {addOverride.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : null}
                        Ajouter
                      </Button>
                    </div>
                  </div>
                )}

                {/* Overrides list */}
                {data.overrides.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                    <p className="text-sm text-gray-500">
                      Aucune surcharge individuelle
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Les permissions du rôle s'appliquent par défaut
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.overrides.map((override) => {
                      const isExpired = override.expiresAt && new Date(override.expiresAt) < new Date();
                      return (
                        <div
                          key={override.id}
                          className={`rounded-lg border p-3 ${
                            isExpired
                              ? 'border-gray-200 bg-gray-50 opacity-60'
                              : override.isGranted
                                ? 'border-green-200 bg-green-50/50'
                                : 'border-red-200 bg-red-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {override.isGranted ? (
                                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                              ) : (
                                <ShieldX className="w-4 h-4 text-red-600 shrink-0" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {RESOURCE_LABELS[override.resource] || override.resource}
                                  {' / '}
                                  {ACTION_LABELS[override.action] || override.action}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{override.reason}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 shrink-0"
                              onClick={() => handleRemove(override)}
                              disabled={removeOverride.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                            <span>Par {override.grantedByName}</span>
                            {override.expiresAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {isExpired ? 'Expiré' : `Expire le ${new Date(override.expiresAt).toLocaleDateString('fr-FR')}`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Role permissions matrix (read-only) */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Permissions du rôle ({ROLE_LABELS[data.user.role as Role] || data.user.role})
                </h3>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Ressource</th>
                        <th className="text-center px-2 py-2 font-medium text-gray-600">Actions autorisées</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RESOURCES.map((resource) => {
                        const perms = data.rolePermissions[resource];
                        if (!perms) return null;
                        const grantedActions = Object.entries(perms)
                          .filter(([, v]) => v)
                          .map(([k]) => k);
                        if (grantedActions.length === 0) return null;
                        return (
                          <tr key={resource} className="border-b last:border-0">
                            <td className="px-3 py-2 font-medium text-gray-700">
                              {RESOURCE_LABELS[resource] || resource}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1">
                                {grantedActions.map((action) => (
                                  <Badge
                                    key={action}
                                    variant="outline"
                                    className="text-[10px] bg-gray-100"
                                  >
                                    {ACTION_LABELS[action] || action}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
