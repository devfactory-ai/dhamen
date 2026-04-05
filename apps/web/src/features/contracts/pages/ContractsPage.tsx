import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Trash2, ArrowDown, ArrowUp, Users, ShieldCheck, TrendingUp } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { DataTable } from '@/components/ui/data-table';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toCSV, downloadCSV, formatDateExport, formatAmountExport, type ExportColumn } from '@/lib/export-utils';
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
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';

interface Contract {
  id: string;
  insurerId: string;
  insurerName: string;
  contractNumber: string;
  name: string;
  type: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE';
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
  coveragePharmacy: number;
  coverageConsultation: number;
  coverageLab: number;
  coverageHospitalization: number;
  annualCeiling: number;
  adhérentCount: number;
  createdAt: string;
}

const CONTRACT_TYPES = {
  INDIVIDUAL: { label: 'Individuel', color: 'bg-blue-100 text-blue-800' },
  GROUP: { label: 'Groupe', color: 'bg-green-100 text-green-800' },
  CORPORATE: { label: 'Entreprise', color: 'bg-purple-100 text-purple-800' },
};

const CONTRACT_STATUS = {
  ACTIVE: { label: 'Actif', variant: 'success' as const },
  SUSPENDED: { label: 'Suspendu', variant: 'warning' as const },
  EXPIRED: { label: 'Expiré', variant: 'secondary' as const },
  CANCELLED: { label: 'Annulé', variant: 'destructive' as const },
};

const STATUS_OPTIONS = [
  { value: 'all' as const, label: 'Tous', color: null },
  { value: 'ACTIVE' as const, label: 'Actif', color: 'bg-emerald-500' },
  { value: 'SUSPENDED' as const, label: 'Suspendu', color: 'bg-amber-400' },
  { value: 'EXPIRED' as const, label: 'Expiré', color: 'bg-gray-400' },
  { value: 'CANCELLED' as const, label: 'Annulé', color: 'bg-red-400' },
];

export function ContractsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED'>('all');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Contract | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('contracts', 'create');
  const canUpdate = hasPermission('contracts', 'update');
  const canDelete = hasPermission('contracts', 'delete');
  const canRead = hasPermission('contracts', 'read');


  const exportColumns: ExportColumn<Contract>[] = [
    { key: 'contractNumber', header: 'N° Contrat' },
    { key: 'name', header: 'Nom' },
    { key: 'insurerName', header: 'Assureur' },
    { key: 'type', header: 'Type', format: (v) => CONTRACT_TYPES[v as keyof typeof CONTRACT_TYPES]?.label || String(v) },
    { key: 'status', header: 'Statut', format: (v) => CONTRACT_STATUS[v as keyof typeof CONTRACT_STATUS]?.label || String(v) },
    { key: 'startDate', header: 'Debut', format: (v) => formatDateExport(v as string) },
    { key: 'endDate', header: 'Fin', format: (v) => formatDateExport(v as string) },
    { key: 'adhérentCount', header: 'Adhérents' },
    { key: 'coveragePharmacy', header: 'Couverture Pharmacie %' },
    { key: 'coverageConsultation', header: 'Couverture Consultation %' },
    { key: 'coverageLab', header: 'Couverture Labo %' },
    { key: 'coverageHospitalization', header: 'Couverture Hospitalisation %' },
    { key: 'annualCeiling', header: 'Plafond Annuel (TND)', format: (v) => formatAmountExport(v as number) },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<{ contracts: Contract[]; total: number }>('/contracts?limit=10000');
      if (!response.success) throw new Error(response.error?.message);

      const allData = response.data?.contracts || [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'contrats');
      toast.success(`${allData.length} contrats exportés`);
    } catch {
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', page, sortOrder],
    queryFn: async () => {
      const response = await apiClient.get<{ contracts: Contract[]; total: number }>('/contracts', {
        params: { page, limit: 20, sortBy: 'start_date', sortOrder },
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/contracts/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setDeleteConfirm(null);
      toast.success('Contrat supprimé avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });

  const filteredContracts = useMemo(() => {
    const all = data?.contracts || [];
    return all.filter((contract) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          contract.name?.toLowerCase().includes(q) ||
          contract.contractNumber?.toLowerCase().includes(q) ||
          contract.insurerName?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (statusFilter !== 'all' && contract.status !== statusFilter) return false;
      return true;
    });
  }, [data?.contracts, search, statusFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContracts.length && filteredContracts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContracts.map((c) => c.id)));
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const response = await apiClient.delete(`/contracts/${id}`);
        if (!response.success) throw new Error(response.error?.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setBulkDeleteConfirm(false);
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} contrat(s) supprimé(s) avec succès`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la suppression groupée');
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const columns = [
    ...(canDelete
      ? [
          {
            key: 'select',
            header: filteredContracts.length > 0 ? (
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={selectedIds.size === filteredContracts.length}
                onChange={() => toggleSelectAll()}
              />
            ) : null,
            render: (row: Contract) => (
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={selectedIds.has(row.id)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  e.stopPropagation();
                  toggleSelect(row.id);
                }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
            ),
          },
        ]
      : []),
    {
      key: 'contract',
      header: 'Contrat',
      render: (contract: Contract) => (
        <div>
          <p className="font-medium">{contract.name}</p>
          <p className='text-muted-foreground text-sm'>N° {contract.contractNumber}</p>
        </div>
      ),
    },
    {
      key: 'insurer',
      header: 'Assureur',
      render: (contract: Contract) => (
        <span className="text-sm text-gray-700">{contract.insurerName}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (contract: Contract) => {
        const typeInfo = CONTRACT_TYPES[contract.type];
        return (
          <span className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        );
      },
    },
    {
      key: 'validity',
      header: (
        <button
          onClick={() => { setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); setPage(1); }}
          className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
        >
          Validité
          {sortOrder === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </button>
      ),
      render: (contract: Contract) => (
        <div className="text-sm">
          <p>{formatDate(contract.startDate)}</p>
          <p className="text-muted-foreground">au {formatDate(contract.endDate)}</p>
        </div>
      ),
    },
    {
      key: 'adhérents',
      header: 'Adhérents',
      render: (contract: Contract) => (
        <span className="font-medium">{contract.adhérentCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (contract: Contract) => {
        const statusInfo = CONTRACT_STATUS[contract.status];
        return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (contract: Contract) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/contracts/${contract.id}`)}>
            Détails
          </Button>
          {canUpdate && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/contracts/${contract.id}/edit`)}>
              Modifier
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteConfirm(contract)}
            >
              Supprimer
            </Button>
          )}
        </div>
      ),
    },
  ];

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
        title="Aide - Contrats"
        subtitle="Comprendre la gestion des contrats d'assurance"
        tips={[
          {
            icon: <Users className="h-4 w-4 text-blue-500" />,
            title: "Individuel vs Groupe",
            desc: "Un contrat individuel couvre un seul adhérent. Un contrat groupe est lié à une entreprise et couvre ses salariés et ayants droit.",
          },
          {
            icon: <ShieldCheck className="h-4 w-4 text-green-500" />,
            title: "Statuts des contrats",
            desc: "Actif = en vigueur, Suspendu = temporairement gelé (impayés), Expiré = date de fin dépassée, Annulé = résilié définitivement.",
          },
          {
            icon: <TrendingUp className="h-4 w-4 text-purple-500" />,
            title: "Plafonds annuels",
            desc: "Chaque contrat a un plafond annuel en TND. Une fois atteint, les remboursements sont suspendus jusqu'au renouvellement.",
          },
        ]}
      />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contrats</h1>
          <p className="mt-1 text-sm text-gray-500">Gérer les contrats d'assurance santé</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter'}
          </Button>
          {canCreate && (
            <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => navigate('/contracts/new')}>
              <Plus className="w-4 h-4" /> Nouveau contrat
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Rechercher par nom, numéro, assureur..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Status dropdown */}
          <FilterDropdown
            label="Statut"
            value={STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || 'Tous'}
            open={statusDropdownOpen}
            onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
            onClose={() => setStatusDropdownOpen(false)}
          >
            {STATUS_OPTIONS.map((opt) => (
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
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filteredContracts}
          isLoading={isLoading}
          emptyMessage="Aucun contrat trouvé"
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le contrat{' '}
              <strong>{deleteConfirm?.name}</strong> ?
              Cette action est irréversible et affectera tous les adhérents associés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={() => setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression groupée</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer{' '}
              <strong>{selectedIds.size} contrat(s)</strong> ?
              Cette action est irréversible et affectera tous les adhérents associés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate([...selectedIds])}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ContractsPage;
