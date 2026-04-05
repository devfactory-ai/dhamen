import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, RotateCcw, Eye, Trash2, ArrowDown, ArrowUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  scan_uploaded: 'Scanné',
  paper_received: 'Reçu',
  paper_incomplete: 'Incomplet',
  paper_complete: 'Complet',
  processing: 'En traitement',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  reimbursed: 'Remboursé',
  pending_payment: 'En paiement',
  submitted: 'Soumis',
  in_batch: 'Dans un lot',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  scan_uploaded: 'bg-blue-100 text-blue-700',
  paper_received: 'bg-blue-100 text-blue-700',
  processing: 'bg-amber-100 text-amber-700',
  paper_complete: 'bg-amber-100 text-amber-700',
  paper_incomplete: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  reimbursed: 'bg-purple-100 text-purple-700',
  pending_payment: 'bg-orange-100 text-orange-700',
  in_batch: 'bg-indigo-100 text-indigo-700',
};

const CARE_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consultation',
  pharmacy: 'Pharmacie',
  laboratory: 'Laboratoire',
  optical: 'Optique',
  dental: 'Dentaire',
  hospitalization: 'Hospitalisation',
  radiology: 'Radiologie',
  physiotherapy: 'Kinésithérapie',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tous', color: null },
  { value: 'draft', label: 'Brouillon', color: 'bg-gray-400' },
  { value: 'submitted', label: 'Soumis', color: 'bg-blue-500' },
  { value: 'processing', label: 'En traitement', color: 'bg-amber-500' },
  { value: 'approved', label: 'Approuvé', color: 'bg-emerald-500' },
  { value: 'rejected', label: 'Rejeté', color: 'bg-red-400' },
  { value: 'reimbursed', label: 'Remboursé', color: 'bg-purple-500' },
  { value: 'in_batch', label: 'Dans un lot', color: 'bg-indigo-500' },
  { value: 'pending_payment', label: 'En paiement', color: 'bg-orange-400' },
];

const CARE_TYPE_OPTIONS = [
  { value: '', label: 'Tous' },
  ...Object.entries(CARE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

interface BulletinRow {
  id: string;
  bulletinNumber: string;
  adherentName: string;
  adherentFirstName: string;
  adherentLastName: string;
  beneficiaryName: string;
  status: string;
  careDate: string;
  totalAmount: number;
  reimbursedAmount: number;
  agentName: string;
  careType: string;
}

interface BulletinsResponse {
  data: BulletinRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

const avatarColors = [
  'bg-blue-600',
  'bg-purple-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `${amount.toFixed(3)} TND`;
}

export function BulletinsGlobauxPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const canRead = hasPermission('bulletins_soins', 'read');
  const canExport = hasPermission('bulletins_soins', 'list');
  const canDelete = hasPermission('bulletins_soins', 'delete');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [careType, setCareType] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteBulletinId, setDeleteBulletinId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [careTypeDropdownOpen, setCareTypeDropdownOpen] = useState(false);

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  if (search) queryParams.set('search', search);
  if (status) queryParams.set('status', status);
  if (dateFrom) queryParams.set('dateFrom', dateFrom);
  if (dateTo) queryParams.set('dateTo', dateTo);
  if (careType) queryParams.set('careType', careType);
  queryParams.set('sortBy', 'care_date');
  queryParams.set('sortOrder', sortOrder);

  const invalidateAllBulletinQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['bulletins-validation'] });
    queryClient.invalidateQueries({ queryKey: ['bulletins-validation-stats'] });
    queryClient.invalidateQueries({ queryKey: ['bulletins-history'] });
    queryClient.invalidateQueries({ queryKey: ['bulletins-payments'] });
    queryClient.invalidateQueries({ queryKey: ['bulletins-payment-stats'] });
    queryClient.invalidateQueries({ queryKey: ['recent-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['hr-recent-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['adhérent-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['adhérent-bulletins-stats'] });
    queryClient.invalidateQueries({ queryKey: ['batch-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['agent-batches'] });
  };

  const { data, isLoading } = useQuery<BulletinsResponse>({
    queryKey: ['admin-bulletins', page, search, status, dateFrom, dateTo, careType, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get<BulletinsResponse>(
        `/bulletins-soins/admin/all?${queryParams.toString()}`
      );
      if (!res.success) throw new Error(res.error?.message || 'Erreur de chargement');
      return res.data!;
    },
  });

  const bulletins: BulletinRow[] = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === bulletins.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bulletins.map((b) => b.id)));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<{ id: string; deleted: boolean }>(
        `/bulletins-soins/admin/${id}`
      );
      if (!response.success) throw new Error(response.error?.message || 'Erreur lors de la suppression');
      return response.data;
    },
    onSuccess: () => {
      invalidateAllBulletinQueries();
      setDeleteBulletinId(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ deleted: number }>(
        '/bulletins-soins/admin/bulk-delete',
        { ids }
      );
      if (!response.success) throw new Error(response.error?.message || 'Erreur lors de la suppression');
      return response.data;
    },
    onSuccess: () => {
      invalidateAllBulletinQueries();
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    },
  });

  const hasFilters = search || status || dateFrom || dateTo || careType;

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setCareType('');
    setPage(1);
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const exportParams = new URLSearchParams();
      if (search) exportParams.set('search', search);
      if (status) exportParams.set('status', status);
      if (dateFrom) exportParams.set('dateFrom', dateFrom);
      if (dateTo) exportParams.set('dateTo', dateTo);
      if (careType) exportParams.set('careType', careType);

      const res = await apiClient.get<Blob>(
        `/bulletins-soins/admin/export?${exportParams.toString()}`,
        { responseType: 'blob' }
      );

      const blob = res instanceof Blob ? res : new Blob([JSON.stringify(res)], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulletins-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Export error handled silently
    } finally {
      setIsExporting(false);
    }
  };

  const columns = [
    ...(canDelete ? [{
      key: 'select',
      header: bulletins.length > 0 ? (
        <input
          type="checkbox"
          checked={selectedIds.size === bulletins.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ) : null,
      render: (row: BulletinRow) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); toggleSelect(row.id); }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    }] : []),
    {
      key: 'bulletinNumber',
      header: 'N° Bulletin',
      render: (row: BulletinRow) => (
        <span className="text-blue-600 font-medium text-sm">{row.bulletinNumber || '—'}</span>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (row: BulletinRow) => {
        const firstName = row.adherentFirstName ?? '';
        const lastName = row.adherentLastName ?? '';
        const fullName = row.adherentName || `${firstName} ${lastName}`.trim();
        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(fullName)}`}
            >
              {getInitials(firstName || fullName.split(' ')[0] || '', lastName || fullName.split(' ')[1] || '')}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{fullName || '—'}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'beneficiary',
      header: 'Bénéficiaire',
      render: (row: BulletinRow) => (
        <span className="text-sm text-gray-700">{row.beneficiaryName || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: BulletinRow) => (
        <Badge
          variant="outline"
          className={STATUS_BADGE_COLORS[row.status] || 'bg-gray-100 text-gray-700'}
        >
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      key: 'careDate',
      header: (
        <button
          onClick={() => { setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); setPage(1); }}
          className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
        >
          Date soins
          {sortOrder === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </button>
      ),
      render: (row: BulletinRow) => (
        <span className="text-sm text-gray-600">{formatDate(row.careDate)}</span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Montant facturé',
      render: (row: BulletinRow) => (
        <span className="text-sm font-medium text-gray-900">{formatAmount(row.totalAmount)}</span>
      ),
    },
    {
      key: 'reimbursedAmount',
      header: 'Montant remboursé',
      render: (row: BulletinRow) => (
        <span className="text-sm font-medium text-emerald-700">{formatAmount(row.reimbursedAmount)}</span>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (row: BulletinRow) => (
        <span className="text-sm text-gray-600">{row.agentName || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: BulletinRow) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/admin/bulletins/${row.id}`)}
            title="Voir le détail"
          >
            <Eye className="w-4 h-4" />
          </Button>
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteBulletinId(row.id)}
              title="Supprimer"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
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
          <p className="text-lg font-medium text-gray-900">Accès refusé</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter les bulletins de soins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulletins de soins</h1>
          <p className="mt-1 text-sm text-gray-500">Vue globale de tous les bulletins de soins</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleteMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer ({selectedIds.size})
            </Button>
          )}
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
          )}
          {canExport && (
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Export...' : 'Exporter CSV'}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2">
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
                placeholder="Rechercher par nom, matricule, numéro..."
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
              value={STATUS_OPTIONS.find(o => o.value === status)?.label || 'Tous'}
              open={statusDropdownOpen}
              onToggle={() => { setStatusDropdownOpen(!statusDropdownOpen); setCareTypeDropdownOpen(false); }}
              onClose={() => setStatusDropdownOpen(false)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <FilterOption
                  key={opt.value}
                  selected={status === opt.value}
                  onClick={() => { setStatus(opt.value); setStatusDropdownOpen(false); setPage(1); }}
                  color={opt.color ?? undefined}
                >
                  {opt.label}
                </FilterOption>
              ))}
            </FilterDropdown>

            {/* Care type dropdown */}
            <FilterDropdown
              label="Type"
              value={CARE_TYPE_OPTIONS.find(o => o.value === careType)?.label || 'Tous'}
              open={careTypeDropdownOpen}
              onToggle={() => { setCareTypeDropdownOpen(!careTypeDropdownOpen); setStatusDropdownOpen(false); }}
              onClose={() => setCareTypeDropdownOpen(false)}
              menuWidth="w-52"
            >
              {CARE_TYPE_OPTIONS.map((opt) => (
                <FilterOption
                  key={opt.value}
                  selected={careType === opt.value}
                  onClick={() => { setCareType(opt.value); setCareTypeDropdownOpen(false); setPage(1); }}
                >
                  {opt.label}
                </FilterOption>
              ))}
            </FilterDropdown>
          </div>

          {/* Date filters row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 shrink-0">Du</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-11 px-3 rounded-xl bg-[#f3f4f5] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 shrink-0">Au</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-11 px-3 rounded-xl bg-[#f3f4f5] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={bulletins}
          isLoading={isLoading}
          emptyMessage="Aucun bulletin de soins trouvé"
          pagination={
            data?.meta
              ? {
                  page,
                  limit: 20,
                  total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      </div>

      {/* Single delete confirmation */}
      {deleteBulletinId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 !mt-0">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Confirmer la suppression</h3>
            <p className="mt-2 text-sm text-gray-600">
              Êtes-vous sûr de vouloir supprimer ce bulletin ? Cette action est irréversible.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteBulletinId(null)}
                disabled={deleteMutation.isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteBulletinId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 !mt-0">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Suppression en masse</h3>
            <p className="mt-2 text-sm text-gray-600">
              Êtes-vous sûr de vouloir supprimer <strong>{selectedIds.size}</strong> bulletin(s) ? Cette action est irréversible.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleteMutation.isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BulletinsGlobauxPage;
