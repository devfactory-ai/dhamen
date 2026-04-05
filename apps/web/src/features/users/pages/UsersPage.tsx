import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Download, Pencil, UserX, Trash2, Building2, Shield } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toCSV, downloadCSV, type ExportColumn } from '@/lib/export-utils';
import { apiClient } from '@/lib/api-client';
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
import { useUsers, useDeleteUser, useBulkDeleteUsers } from '../hooks/useUsers';
import { PermissionsDrawer } from '../components/PermissionsDrawer';
import { ROLE_LABELS, VISIBLE_ROLE_LABELS } from '@dhamen/shared';
import type { Role, UserPublic } from '@dhamen/shared';
import { useToast } from '@/stores/toast';
import { usePermissions } from '@/hooks/usePermissions';

const ROLE_BADGE_COLORS: Partial<Record<Role, string>> = {
  ADMIN: 'bg-red-100 text-red-700 border-red-200',
  INSURER_ADMIN: 'bg-blue-100 text-blue-700 border-blue-200',
  INSURER_AGENT: 'bg-sky-100 text-sky-700 border-sky-200',
  PHARMACIST: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DOCTOR: 'bg-purple-100 text-purple-700 border-purple-200',
  HR: 'bg-amber-100 text-amber-700 border-amber-200',
};

export function UsersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<UserPublic | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [permissionsUserId, setPermissionsUserId] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('users', 'create');
  const canUpdate = hasPermission('users', 'update');
  const canDelete = hasPermission('users', 'delete');
  const canRead = hasPermission('users', 'read');

  const { data, isLoading } = useUsers(page, 20, search || undefined, roleFilter || undefined, statusFilter || undefined);
  const deleteUser = useDeleteUser();
  const bulkDelete = useBulkDeleteUsers();

  const users: UserPublic[] = data?.users ?? [];

  // --- Selection helpers ---
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map((u) => u.id)));
    }
  };

  const exportColumns: ExportColumn<UserPublic>[] = [
    { key: 'email', header: 'Email' },
    { key: 'firstName', header: 'Prénom' },
    { key: 'lastName', header: 'Nom' },
    { key: 'role', header: 'Role', format: (v) => ROLE_LABELS[v as keyof typeof ROLE_LABELS] || String(v) },
    { key: 'companyName', header: 'Entreprise' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'isActive', header: 'Actif', format: (v) => v ? 'Oui' : 'Non' },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<{ data: UserPublic[]; meta: { total: number } }>('/users?limit=10000');
      if (!response.success) throw new Error(response.error?.message);

      const allData = response.data?.data || [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'utilisateurs');
      toast({ title: `${allData.length} utilisateurs exportés`, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de l\'export', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deleteConfirm) return;
    const isHardDelete = !deleteConfirm.isActive;
    try {
      await deleteUser.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      selectedIds.delete(deleteConfirm.id);
      setSelectedIds(new Set(selectedIds));
      toast({ title: isHardDelete ? 'Compte supprimé avec succès' : 'Compte désactivé avec succès', variant: 'success' });
    } catch {
      toast({ title: isHardDelete ? 'Erreur lors de la suppression' : 'Erreur lors de la désactivation', variant: 'destructive' });
    }
  };

  const handleBulkDeactivate = async () => {
    try {
      const result = await bulkDelete.mutateAsync(Array.from(selectedIds));
      const msg = result?.hardDeleted
        ? `${result.hardDeleted} supprimé(s), ${result.deactivated} désactivé(s)`
        : `${result?.deleted ?? selectedIds.size} compte(s) désactivé(s)`;
      toast({ title: msg, variant: 'success' });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch {
      toast({ title: 'Erreur lors de l\'operation', variant: 'destructive' });
    }
  };

  // --- Avatar helpers ---
  const avatarColors = ['bg-blue-600', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
  function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  }
  function getInitials(first: string, last: string) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  const columns = [
    ...(canDelete ? [{
      key: 'select',
      header: users.length > 0 ? (
        <input
          type="checkbox"
          checked={selectedIds.size === users.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ) : null,
      render: (user: UserPublic) => (
        <input
          type="checkbox"
          checked={selectedIds.has(user.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); toggleSelect(user.id); }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    }] : []),
    {
      key: 'name',
      header: 'Utilisateur',
      render: (user: UserPublic) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(user.firstName + user.lastName)}`}>
            {getInitials(user.firstName, user.lastName)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (user: UserPublic) => (
        <Badge
          variant="outline"
          className={ROLE_BADGE_COLORS[user.role] || 'bg-gray-100 text-gray-700 border-gray-200'}
        >
          {ROLE_LABELS[user.role] || user.role}
        </Badge>
      ),
    },
    {
      key: 'entreprise',
      header: 'Entreprise',
      render: (user: UserPublic) => (
        user.companyName ? (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-700">{user.companyName}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (user: UserPublic) => (
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-400'}`} />
          <span className={`text-sm font-medium ${user.isActive ? 'text-green-700' : 'text-red-600'}`}>
            {user.isActive ? 'Actif' : 'Désactivé'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (user: UserPublic) => (
        <div className="flex gap-1">
          {canUpdate && (
            <Button size="sm" variant="ghost" onClick={() => navigate(`/users/${user.id}/edit`)}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-indigo-500 hover:text-indigo-700"
            onClick={() => setPermissionsUserId(user.id)}
            title="Permissions individuelles"
          >
            <Shield className="w-4 h-4" />
          </Button>
          {canDelete && user.isActive && (
            <Button
              size="sm"
              variant="ghost"
              className="text-orange-500 hover:text-orange-700"
              onClick={() => setDeleteConfirm(user)}
              title="Désactiver le compte"
            >
              <UserX className="w-4 h-4" />
            </Button>
          )}
          {canDelete && !user.isActive && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500 hover:text-red-700"
              onClick={() => setDeleteConfirm(user)}
              title="Supprimer l'utilisateur"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Role filter options
  const roleOptions: { value: string; label: string }[] = [
    { value: '', label: 'Tous les rôles' },
    ...Object.entries(VISIBLE_ROLE_LABELS).map(([value, label]) => ({ value, label })),
  ];

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Accès refusé</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Utilisateurs"
          description="Gérer les utilisateurs de la plateforme"
        />
        <div className="flex flex-wrap items-center gap-2">
          {canDelete && selectedIds.size > 0 && (() => {
            const selectedUsers = users.filter((u) => selectedIds.has(u.id));
            const allInactive = selectedUsers.every((u) => !u.isActive);
            const someActive = selectedUsers.some((u) => u.isActive);
            return (
              <>
                {someActive && (
                  <Button
                    variant="outline"
                    className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => setBulkDeleteConfirm(true)}
                    disabled={bulkDelete.isPending}
                  >
                    <UserX className="w-4 h-4" />
                    Désactiver ({selectedIds.size})
                  </Button>
                )}
                {allInactive && (
                  <Button
                    variant="outline"
                    className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setBulkDeleteConfirm(true)}
                    disabled={bulkDelete.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer ({selectedIds.size})
                  </Button>
                )}
              </>
            );
          })()}
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Export..." : "Exporter"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/users/import")}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          {canCreate && (
            <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => navigate("/users/new")}>
              <Plus className="w-4 h-4" /> Nouvel utilisateur
            </Button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg
                className="w-[18px] h-[18px] text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Rechercher par nom, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Role dropdown */}
          <FilterDropdown
            label="Rôle"
            value={roleFilter ? ROLE_LABELS[roleFilter as Role] : "Tous"}
            open={roleDropdownOpen}
            onToggle={() => setRoleDropdownOpen(!roleDropdownOpen)}
            onClose={() => setRoleDropdownOpen(false)}
            menuWidth="w-64"
          >
            {roleOptions.map((opt) => (
              <FilterOption
                key={opt.value}
                selected={roleFilter === opt.value}
                onClick={() => { setRoleFilter(opt.value); setRoleDropdownOpen(false); setPage(1); }}
              >
                {opt.label}
              </FilterOption>
            ))}
          </FilterDropdown>

          {/* Status dropdown */}
          <FilterDropdown
            label="Statut"
            value={statusFilter === 'true' ? 'Actif' : statusFilter === 'false' ? 'Désactivé' : 'Tous'}
            open={statusDropdownOpen}
            onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
            onClose={() => setStatusDropdownOpen(false)}
          >
            {[
              { value: '', label: 'Tous', color: undefined },
              { value: 'true', label: 'Actif', color: 'bg-green-500' },
              { value: 'false', label: 'Désactivé', color: 'bg-red-400' },
            ].map((opt) => (
              <FilterOption
                key={opt.value}
                selected={statusFilter === opt.value}
                onClick={() => { setStatusFilter(opt.value); setStatusDropdownOpen(false); setPage(1); }}
                color={opt.color}
              >
                {opt.label}
              </FilterOption>
            ))}
          </FilterDropdown>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={users}
          isLoading={isLoading}
          emptyMessage="Aucun utilisateur trouvé"
          pagination={
            data
              ? {
                  page,
                  limit: 20,
                  total: data.total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      </div>

      {/* Delete / Deactivate Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.isActive ? 'Désactiver le compte' : 'Supprimer le compte'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.isActive ? (
                <>
                  Êtes-vous sûr de vouloir désactiver le compte de{" "}
                  <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong>{" "}
                  ? L'utilisateur ne pourra plus se connecter.
                </>
              ) : (
                <>
                  Êtes-vous sûr de vouloir supprimer définitivement le compte de{" "}
                  <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong>{" "}
                  ? Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className={deleteConfirm?.isActive ? "bg-orange-600 text-white hover:bg-orange-700" : "bg-red-600 text-white hover:bg-red-700"}
            >
              {deleteUser.isPending
                ? (deleteConfirm?.isActive ? "Désactivation..." : "Suppression...")
                : (deleteConfirm?.isActive ? "Désactiver" : "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete / Deactivate Dialog */}
      <AlertDialog
        open={bulkDeleteConfirm}
        onOpenChange={() => setBulkDeleteConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                const sel = users.filter((u) => selectedIds.has(u.id));
                const allInactive = sel.every((u) => !u.isActive);
                return allInactive ? 'Suppression multiple' : 'Désactivation multiple';
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const sel = users.filter((u) => selectedIds.has(u.id));
                const allInactive = sel.every((u) => !u.isActive);
                return allInactive
                  ? <>Êtes-vous sûr de vouloir supprimer définitivement <strong>{selectedIds.size}</strong> compte(s) ? Cette action est irréversible.</>
                  : <>Êtes-vous sûr de vouloir désactiver <strong>{selectedIds.size}</strong> compte(s) ? Ces utilisateurs ne pourront plus se connecter.</>;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeactivate}
              className={(() => {
                const sel = users.filter((u) => selectedIds.has(u.id));
                const allInactive = sel.every((u) => !u.isActive);
                return allInactive ? "bg-red-600 text-white hover:bg-red-700" : "bg-orange-600 text-white hover:bg-orange-700";
              })()}
            >
              {(() => {
                const sel = users.filter((u) => selectedIds.has(u.id));
                const allInactive = sel.every((u) => !u.isActive);
                if (bulkDelete.isPending) return allInactive ? "Suppression..." : "Désactivation...";
                return allInactive ? `Supprimer (${selectedIds.size})` : `Désactiver (${selectedIds.size})`;
              })()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permissions Drawer */}
      {permissionsUserId && (
        <PermissionsDrawer
          userId={permissionsUserId}
          onClose={() => setPermissionsUserId(null)}
        />
      )}
    </div>
  );
}

export default UsersPage;
