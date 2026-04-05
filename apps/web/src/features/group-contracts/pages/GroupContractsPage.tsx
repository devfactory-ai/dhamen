import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Building2, Shield, Eye, Pencil, User, Trash2, Users, Link2 } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { cn } from '@/lib/utils';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { apiClient } from '@/lib/api-client';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useToast } from '@/stores/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
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

interface GroupContract {
  id: string;
  contract_number: string;
  contract_type: 'group' | 'individual';
  company_id: string;
  company_name: string;
  adherent_id: string | null;
  insurer_name: string | null;
  intermediary: string | null;
  effective_date: string;
  expiry_date: string | null;
  global_ceiling: number | null;
  covered_risks: string | null;
  category: string | null;
  status: string;
  guarantees_count: number;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'default' }> = {
  active: { label: 'Actif', variant: 'success' },
  draft: { label: 'Brouillon', variant: 'secondary' },
  expired: { label: 'Expire', variant: 'destructive' },
  suspended: { label: 'Suspendu', variant: 'default' },
};

export function GroupContractsPage() {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('contracts', 'create');
  const canDelete = hasPermission('contracts', 'delete');
  const canUpdate = hasPermission('contracts', 'update');
  const canRead = hasPermission('contracts', 'read');

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isHR = user?.role === 'HR';
  const { selectedCompany } = useAgentContext();
  const isIndividualMode = !isHR && selectedCompany?.id === '__INDIVIDUAL__';
  const typeFilter = isIndividualMode ? 'individual' : 'all';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'expired' | 'suspended'>('all');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [deleteTarget, setDeleteTarget] = useState<GroupContract | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const response = await apiClient.delete(`/group-contracts/${contractId}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-contracts'] });
      toast.success('Contrat supprimé avec succès');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erreur lors de la suppression');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const errors: string[] = [];
      for (const id of ids) {
        try {
          const response = await apiClient.delete(`/group-contracts/${id}`);
          if (!response.success) errors.push(id);
        } catch {
          errors.push(id);
        }
      }
      if (errors.length > 0) {
        throw new Error(`${errors.length} contrat(s) n'ont pas pu être supprimés`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-contracts'] });
      setSelectedIds(new Set());
      toast.success('Contrats supprimés avec succès');
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ['group-contracts'] });
      setSelectedIds(new Set());
      toast.error(err.message || 'Erreur lors de la suppression groupée');
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['group-contracts', statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '500' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('contractType', typeFilter);
      const response = await apiClient.get<GroupContract[]>(
        `/group-contracts?${params.toString()}`
      );
      if (!response.success) throw new Error(response.error?.message);
      const raw = response as unknown as { data: GroupContract[]; meta?: { total: number } };
      return { contracts: Array.isArray(raw.data) ? raw.data : [], total: raw.meta?.total || 0 };
    },
  });

  const allContracts = data?.contracts || [];
  const activeCount = allContracts.filter((c) => c.status === 'active').length;
  const groupCount = allContracts.filter((c) => (c.contract_type || 'group') === 'group').length;
  const individualCount = allContracts.filter((c) => c.contract_type === 'individual').length;

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return allContracts;
    const q = search.toLowerCase();
    return allContracts.filter(c =>
      c.contract_number?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      (c.insurer_name || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q)
    );
  }, [allContracts, search]);

  // Pagination
  const paginatedContracts = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedContracts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedContracts.map((c) => c.id)));
    }
  };

  const contractColumns = [
    ...(canDelete ? [{
      key: 'select',
      header: paginatedContracts.length > 0 ? (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={selectedIds.size === paginatedContracts.length}
          onChange={toggleSelectAll}
        />
      ) : null,
      render: (contract: GroupContract) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={selectedIds.has(contract.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            e.stopPropagation();
            toggleSelect(contract.id);
          }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      ),
    }] : []),
    {
      key: 'contract_number',
      header: 'Contrat',
      render: (contract: GroupContract) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{contract.contract_number}</p>
            <p className="text-[11px] text-gray-400">{contract.category || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'company_name',
      header: 'Société / Adhérent',
      render: (contract: GroupContract) => (
        <div className="flex items-center gap-2">
          {contract.contract_type === 'individual' ? (
            <>
              <User className="h-4 w-4 text-indigo-400" />
              <div>
                <span className="text-sm text-gray-700">{contract.company_name || '—'}</span>
                <span className="ml-2 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                  Individuel
                </span>
              </div>
            </>
          ) : (
            <>
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-700">{contract.company_name}</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'insurer_name',
      header: 'Assureur',
      render: (contract: GroupContract) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-700">{contract.insurer_name || '—'}</span>
        </div>
      ),
    },
    {
      key: 'effective_date',
      header: 'Date effet',
      render: (contract: GroupContract) => (
        <span className="text-sm text-gray-700">
          {contract.effective_date ? new Date(contract.effective_date).toLocaleDateString('fr-TN') : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      className: 'text-center',
      render: (contract: GroupContract) => {
        const s = STATUS_LABELS[contract.status] || { label: contract.status, variant: 'secondary' as const };
        return (
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
            contract.status === 'active' ? 'bg-green-50 text-green-700' :
            contract.status === 'draft' ? 'bg-gray-100 text-gray-600' :
            contract.status === 'expired' ? 'bg-red-50 text-red-700' :
            contract.status === 'suspended' ? 'bg-amber-50 text-amber-700' :
            'bg-gray-100 text-gray-600'
          )}>
            {s.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (contract: GroupContract) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => navigate(`/group-contracts/${contract.id}`)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Voir"
          >
            <Eye className="h-4 w-4" />
          </button>
          {canUpdate && (
            <button
              type="button"
              onClick={() => navigate(`/group-contracts/${contract.id}/edit`)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="Modifier"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setDeleteTarget(contract)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const statusFilterLabel = statusFilter === 'all' ? 'Tous' :
    statusFilter === 'active' ? 'Actifs' :
    statusFilter === 'draft' ? 'Brouillons' :
    statusFilter === 'expired' ? 'Expirés' : 'Suspendus';

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Acces refuse</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FloatingHelp
        title="Aide - Contrats groupe"
        subtitle="Gestion des contrats d'assurance groupe et individuels"
        tips={[
          {
            icon: <Users className="h-4 w-4 text-blue-500" />,
            title: "Groupe vs Individuel",
            desc: "Un contrat groupe est souscrit par une entreprise pour ses salariés. Un contrat individuel est souscrit directement par un adhérent sans entreprise.",
          },
          {
            icon: <Link2 className="h-4 w-4 text-green-500" />,
            title: "Lien avec les entreprises",
            desc: "Chaque contrat groupe est rattaché à une entreprise. Les garanties, plafonds et barèmes sont définis au niveau du contrat et appliqués à tous les adhérents.",
          },
          {
            icon: <Shield className="h-4 w-4 text-purple-500" />,
            title: "Garanties associées",
            desc: "Un contrat peut avoir plusieurs garanties (pharmacie, consultation, hospitalisation) avec des taux de remboursement et plafonds distincts.",
          },
        ]}
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isHR
              ? `Contrats de ${user?.companyName || 'votre entreprise'}`
              : isIndividualMode ? 'Contrats Individuels' : 'Contrats'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isHR
              ? 'Consultez les contrats d\'assurance de votre entreprise'
              : isIndividualMode ? 'Gérer les contrats d\'assurance individuels' : 'Gérer les contrats d\'assurance groupe et individuels'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Supprimer ({selectedIds.size})
            </Button>
          )}
          {canCreate && (
            <Button
              className="gap-2 bg-slate-900 hover:bg-[#19355d]"
              onClick={() => navigate(isIndividualMode ? "/group-contracts/new?type=individual" : "/group-contracts/new")}
            >
              <Plus className="h-4 w-4" />
              {isIndividualMode ? 'Nouveau contrat individuel' : 'Nouveau contrat groupe'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {data?.total || 0}
            </p>
            <p className="text-xs text-gray-500">Total contrats</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50">
            <Shield className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
            <p className="text-xs text-gray-500">Contrats actifs</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50">
            <Building2 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{groupCount}</p>
            <p className="text-xs text-gray-500">Contrats groupe</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50">
            <User className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{individualCount}</p>
            <p className="text-xs text-gray-500">Contrats individuels</p>
          </div>
        </div>
      </div>

      {/* Filters bar — same style as AgentAdherentsPage */}
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        <div className="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          {/* Search */}
          <div className="relative flex-1 min-w-0 sm:min-w-[280px]">
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
              placeholder="Rechercher par numéro, société, assureur..."
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
                onClick={() => setSearch("")}
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

          {/* Statut dropdown */}
          <FilterDropdown
            label="Statut"
            value={statusFilterLabel}
            open={statusDropdownOpen}
            onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
            onClose={() => setStatusDropdownOpen(false)}
          >
            {[
              { value: "all" as const, label: "Tous", color: null },
              { value: "active" as const, label: "Actifs", color: "bg-emerald-500" },
              { value: "draft" as const, label: "Brouillons", color: "bg-gray-400" },
              { value: "expired" as const, label: "Expirés", color: "bg-red-400" },
              { value: "suspended" as const, label: "Suspendus", color: "bg-amber-400" },
            ].map((opt) => (
              <FilterOption
                key={opt.value}
                selected={statusFilter === opt.value}
                onClick={() => { setStatusFilter(opt.value); setStatusDropdownOpen(false); setPage(1); }}
                color={opt.color ?? undefined}
              >
                {opt.label}
              </FilterOption>
            ))}
          </FilterDropdown>
          {/* Mode indicator */}
          {isIndividualMode && (
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4 ml-2">
              <span className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white">
                Individuel
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <DataTable
        columns={contractColumns}
        data={paginatedContracts}
        isLoading={isLoading}
        onRowClick={(contract) => navigate(`/group-contracts/${contract.id}`)}
        emptyMessage={
          search
            ? "Aucun contrat trouvé pour cette recherche"
            : "Aucun contrat groupe trouvé"
        }
        searchTerm={search || undefined}
        onClearSearch={() => setSearch("")}
        emptyStateType="contracts"
        pagination={{
          page,
          limit: pageSize,
          total: filtered.length,
          onPageChange: setPage,
        }}
      />
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le contrat</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le contrat <strong>{deleteTarget?.contract_number}</strong> ? Les contrats individuels et garanties associés seront également désactivés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {selectedIds.size} contrat(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{selectedIds.size}</strong> contrat(s) sélectionné(s) ? Les garanties associées seront également désactivées. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkDeleteMutation.mutate(Array.from(selectedIds));
                setBulkDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer ({selectedIds.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default GroupContractsPage;
