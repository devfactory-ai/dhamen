import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Download, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
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
import { ROLE_LABELS } from '@dhamen/shared';
import type { Role, UserPublic } from '@dhamen/shared';
import { useToast } from '@/stores/toast';

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
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserPublic | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  // Close role dropdown on outside click
  useEffect(() => {
    if (!roleDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [roleDropdownOpen]);

  const { data, isLoading } = useUsers(page, 20, search || undefined, roleFilter || undefined);
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

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteUser.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      selectedIds.delete(deleteConfirm.id);
      setSelectedIds(new Set(selectedIds));
      toast({ title: 'Utilisateur supprimé avec succès', variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    try {
      const result = await bulkDelete.mutateAsync(Array.from(selectedIds));
      toast({ title: `${result?.deleted ?? selectedIds.size} utilisateur(s) supprimé(s)`, variant: 'success' });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
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
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={users.length > 0 && selectedIds.size === users.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      render: (user: UserPublic) => (
        <input
          type="checkbox"
          checked={selectedIds.has(user.id)}
          onChange={(e) => { e.stopPropagation(); toggleSelect(user.id); }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    },
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
      key: 'phone',
      header: 'Téléphone',
      render: (user: UserPublic) => (
        <span className="text-sm text-gray-600">{user.phone || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (user: UserPublic) => (
        <Badge variant={user.isActive ? 'success' : 'destructive'}>
          {user.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (user: UserPublic) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => navigate(`/users/${user.id}/edit`)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-700"
            onClick={() => setDeleteConfirm(user)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  // Role filter options
  const roleOptions: { value: string; label: string }[] = [
    { value: '', label: 'Tous les rôles' },
    ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Utilisateurs"
          description="Gérer les utilisateurs de la plateforme"
        />
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
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
          <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => navigate("/users/new")}>
            <Plus className="w-4 h-4" /> Nouvel utilisateur
          </Button>
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
          <div className="relative shrink-0 sm:w-64 w-full" ref={roleDropdownRef}>
            <button
              type="button"
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="flex items-center gap-2 w-full sm:w-auto px-4 py-3 bg-[#f3f4f5] rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Rôle
              </span>
              <span className="text-sm font-medium text-gray-900">
                {roleFilter ? ROLE_LABELS[roleFilter as Role] : "Tous"}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 ml-auto sm:ml-1 transition-transform ${roleDropdownOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="m19 9-7 7-7-7"
                />
              </svg>
            </button>
            {roleDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-full sm:w-64 max-h-72 overflow-y-auto py-1 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 z-50">
                {roleOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setRoleFilter(opt.value);
                      setRoleDropdownOpen(false);
                      setPage(1);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${roleFilter === opt.value ? "text-blue-600 font-semibold bg-blue-50/50" : "text-gray-700"}`}
                  >
                    {opt.label}
                    {roleFilter === opt.value && (
                      <svg
                        className="w-4 h-4 ml-auto text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results count */}
      {(search || roleFilter) && !isLoading && (
        <p className="text-sm text-gray-500">
          {data?.total ?? 0} résultat(s)
          {search && (
            <>
              {" "}
              pour "<strong>{search}</strong>"
            </>
          )}
          {roleFilter && (
            <>
              {" "}
              — rôle: <strong>{ROLE_LABELS[roleFilter as Role]}</strong>
            </>
          )}
        </p>
      )}

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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'utilisateur{" "}
              <strong>
                {deleteConfirm?.firstName} {deleteConfirm?.lastName}
              </strong>{" "}
              ? Cette action désactivera son compte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={bulkDeleteConfirm}
        onOpenChange={() => setBulkDeleteConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression multiple</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <strong>{selectedIds.size}</strong> utilisateur(s) ? Leurs comptes
              seront désactivés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending
                ? "Suppression..."
                : `Supprimer (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default UsersPage;
