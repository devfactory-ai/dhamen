import { useState, useCallback, useEffect } from 'react';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';
import {
  Search,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  CreditCard,
  Loader2,
  RotateCcw,
  TrendingUp,
  Trash2,
  Filter,
  FileText,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import {
  useHistoryList,
  useHistoryStats,
  exportHistoryCSV,
} from '@/hooks/use-bulletin-history';
import type { HistoryBulletin, HistoryFilters } from '@/hooks/use-bulletin-history';
import { getAccessToken } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { usePermissions } from '@/hooks/usePermissions';

const careTypeLabels: Record<string, string> = {
  consultation: 'Consultation',
  pharmacie: 'Pharmacie',
  hospital: 'Hospitalisation',
  lab: 'Laboratoire',
  radio: 'Radiologie',
  optique: 'Optique',
  dentaire: 'Dentaire',
};

const statusConfig: Record<string, { label: string; variant: string; icon: typeof CheckCircle }> = {
  approved: { label: 'Approuvé', variant: 'default', icon: CheckCircle },
  reimbursed: { label: 'Remboursé', variant: 'success', icon: CreditCard },
  rejected: { label: 'Rejeté', variant: 'destructive', icon: XCircle },
};

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '0.000 TND';
  return `${(amount / 1000).toFixed(3)} TND`;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return date;
  }
}

export default function BulletinsHistoryPage() {
  const { hasPermission } = usePermissions();
  const canDelete = hasPermission('bulletins_soins', 'delete');

  const token = getAccessToken();
  const navigate = useNavigate();
  const { selectedCompany } = useAgentContext();
  const [filters, setFilters] = useState<HistoryFilters>({
    page: 1,
    limit: 20,
    sortBy: 'bulletin_date',
    sortOrder: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [careTypeDropdownOpen, setCareTypeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();

  const isIndividualMode = selectedCompany?.id === '__INDIVIDUAL__';

  // Include companyId in filters when a company is selected
  const activeFilters: HistoryFilters = {
    ...filters,
    companyId: selectedCompany?.id,
    contractType: isIndividualMode ? 'individual' : undefined,
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ deleted: number }>('/bulletins-soins/agent/bulk-delete', { ids });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bulletins-history'] });
      toast.success(`${data?.deleted || 0} bulletin(s) supprimé(s)`);
      setSelectedIds([]);
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur lors de la suppression'),
  });

  const { data: historyData, isLoading } = useHistoryList(activeFilters);
  const { data: stats } = useHistoryStats(activeFilters.dateFrom, activeFilters.dateTo, activeFilters.companyId);

  const updateFilter = useCallback((key: keyof HistoryFilters, value: string | number | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ page: 1, limit: 20, sortBy: 'bulletin_date', sortOrder: 'desc' });
    setSearchInput('');
  }, []);

  const handleSearch = useCallback(() => {
    updateFilter('search', searchInput || undefined);
  }, [searchInput, updateFilter]);

  const handleExport = useCallback(async () => {
    if (!token) return;
    setExporting(true);
    try {
      await exportHistoryCSV(activeFilters, token);
      toast.success('Export CSV téléchargé');
    } catch {
      toast.error('Erreur lors de l\'export CSV');
    } finally {
      setExporting(false);
    }
  }, [filters, token]);

  // Debounce search input → auto-trigger search after 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sync debounced search into filters
  useEffect(() => {
    setFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
  }, [debouncedSearch]);

  // Reset all state when company changes
  useEffect(() => {
    setSelectedIds([]);
    setFilters({ page: 1, limit: 20, sortBy: 'bulletin_date', sortOrder: 'desc' });
    setSearchInput('');
    setDebouncedSearch('');
  }, [selectedCompany?.id]);

  const currentPageIds = (historyData?.data || []).map((b) => b.id);
  const allPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = currentPageIds.some((id) => selectedIds.includes(id));

  const handleToggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...currentPageIds])]);
    }
  };

  const historyItems = historyData?.data || [];
  const columns = [
    ...(canDelete && historyItems.length > 1 ? [{
      key: 'checkbox',
      header: (
        <input
          type="checkbox"
          checked={allPageSelected}
          ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
          onChange={handleToggleSelectAll}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
      ),
      className: 'w-10',
      render: (row: HistoryBulletin) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.id)}
          onChange={() => setSelectedIds(prev => prev.includes(row.id) ? prev.filter(x => x !== row.id) : [...prev, row.id])}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
      ),
    }] : []),
    {
      key: 'bulletinNumber',
      header: 'Numéro',
      render: (row: HistoryBulletin) => (
        <span className="font-mono text-sm">{row.bulletinNumber}</span>
      ),
    },
    {
      key: 'bulletinDate',
      header: 'Date',
      render: (row: HistoryBulletin) => (
        <span className="text-sm">{formatDate(row.bulletinDate)}</span>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (row: HistoryBulletin) => (
        <div>
          <p className="text-sm font-medium">{row.adherentFirstName} {row.adherentLastName}</p>
          {row.adherentMatricule && (
            <p className="text-xs text-muted-foreground">{row.adherentMatricule}</p>
          )}
        </div>
      ),
    },
    {
      key: 'careType',
      header: 'Type',
      render: (row: HistoryBulletin) => (
        <span className="text-sm">{careTypeLabels[row.careType] || row.careType}</span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Déclaré',
      render: (row: HistoryBulletin) => (
        <span className="text-sm text-right font-medium">{formatAmount(row.totalAmount)}</span>
      ),
    },
    {
      key: 'reimbursedAmount',
      header: 'Remboursé',
      render: (row: HistoryBulletin) => (
        <span className={`text-sm text-right font-medium ${row.reimbursedAmount && row.reimbursedAmount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
          {formatAmount(row.reimbursedAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: HistoryBulletin) => {
        const config = statusConfig[row.status] || statusConfig.approved;
        return (
          <Badge variant={config.variant as 'default' | 'destructive' | 'secondary'} className="gap-1">
            <config.icon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (row: HistoryBulletin) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/bulletins/history/${row.id}`)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <FloatingHelp
        title="Aide - Historique des bulletins"
        subtitle="Suivi et consultation des bulletins traités"
        tips={[
          {
            icon: <CheckCircle className="h-4 w-4 text-green-500" />,
            title: "Statuts des bulletins",
            desc: "Approuvé = validé en attente de paiement, Remboursé = paiement effectué, Rejeté = non conforme aux garanties du contrat.",
          },
          {
            icon: <Filter className="h-4 w-4 text-blue-500" />,
            title: "Filtrage avancé",
            desc: "Combinez les filtres par date, type de soin et statut pour retrouver rapidement un bulletin. La recherche porte aussi sur le matricule.",
          },
          {
            icon: <FileText className="h-4 w-4 text-purple-500" />,
            title: "Export pour rapprochement",
            desc: "Exportez l'historique en CSV pour le rapprochement comptable avec les bordereaux de l'assureur. Tous les filtres actifs sont appliqués.",
          },
        ]}
      />
      <PageHeader
        title={selectedCompany ? `Historique — ${selectedCompany.name}` : 'Historique des bulletins de soins'}
        description="Consultez l'historique des actions et le suivi des bulletins de soins"
      />

      <>
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total remboursé</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatAmount(stats.totalReimbursed)}</div>
              <p className="text-xs text-muted-foreground">sur {formatAmount(stats.totalDeclared)} déclaré</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bulletins approuvés</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byStatus.approved || 0}</div>
              <p className="text-xs text-muted-foreground">en attente de paiement</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bulletins remboursés</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byStatus.reimbursed || 0}</div>
              <p className="text-xs text-muted-foreground">paiement effectué</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bulletins rejetés</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.byStatus.rejected || 0}</div>
              <p className="text-xs text-muted-foreground">non remboursés</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2">
              <Label>Recherche</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Nom, matricule, numero..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="outline" size="icon" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Date debut</Label>
              <Input
                type="date"
                className="mt-1"
                max={new Date().toISOString().split('T')[0]}
                value={filters.dateFrom || ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
              />
            </div>
            <div>
              <Label>Date fin</Label>
              <Input
                type="date"
                className="mt-1"
                max={new Date().toISOString().split('T')[0]}
                value={filters.dateTo || ''}
                onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
              />
            </div>
            <div>
              <Label>Type de soin</Label>
              <div className="mt-1">
                <FilterDropdown
                  label="Type"
                  value={filters.careType ? careTypeLabels[filters.careType] || filters.careType : 'Tous'}
                  open={careTypeDropdownOpen}
                  onToggle={() => setCareTypeDropdownOpen(!careTypeDropdownOpen)}
                  onClose={() => setCareTypeDropdownOpen(false)}
                  menuWidth="w-48"
                >
                  <FilterOption selected={!filters.careType} onClick={() => { updateFilter('careType', undefined); setCareTypeDropdownOpen(false); }}>
                    Tous
                  </FilterOption>
                  {Object.entries(careTypeLabels).map(([key, label]) => (
                    <FilterOption key={key} selected={filters.careType === key} onClick={() => { updateFilter('careType', key); setCareTypeDropdownOpen(false); }}>
                      {label}
                    </FilterOption>
                  ))}
                </FilterDropdown>
              </div>
            </div>
            <div>
              <Label>Statut</Label>
              <div className="mt-1">
                <FilterDropdown
                  label="Statut"
                  value={filters.status ? (statusConfig[filters.status]?.label || filters.status) : 'Tous'}
                  open={statusDropdownOpen}
                  onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  onClose={() => setStatusDropdownOpen(false)}
                  menuWidth="w-48"
                >
                  <FilterOption selected={!filters.status} onClick={() => { updateFilter('status', undefined); setStatusDropdownOpen(false); }}>
                    Tous
                  </FilterOption>
                  <FilterOption selected={filters.status === 'approved'} onClick={() => { updateFilter('status', 'approved'); setStatusDropdownOpen(false); }}>
                    Approuvé
                  </FilterOption>
                  <FilterOption selected={filters.status === 'reimbursed'} onClick={() => { updateFilter('status', 'reimbursed'); setStatusDropdownOpen(false); }}>
                    Remboursé
                  </FilterOption>
                  <FilterOption selected={filters.status === 'rejected'} onClick={() => { updateFilter('status', 'rejected'); setStatusDropdownOpen(false); }}>
                    Rejeté
                  </FilterOption>
                </FilterDropdown>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || !historyData?.meta?.total}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Exporter CSV
            </Button>
            {canDelete && selectedIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer ({selectedIds.length})
              </Button>
            )}
          </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <DataTable
        data={historyData?.data || []}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="Aucun bulletin dans l'historique"
        pagination={historyData?.meta ? {
          page: historyData.meta.page,
          limit: historyData.meta.limit ?? filters.limit,
          total: historyData.meta.total,
          onPageChange: (p) => setFilters((prev) => ({ ...prev, page: p })),
        } : undefined}
      />
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de supprimer {selectedIds.length} bulletin(s) de soins.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                bulkDeleteMutation.mutate(selectedIds);
                setShowDeleteDialog(false);
              }}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    </div>
  );
}
