import React, { useState, useCallback, useEffect } from 'react';
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
  Archive,
  Loader2,
  RotateCcw,
  TrendingUp,
  Trash2,
  Filter,
  FileText,
  AlertTriangle,
  BarChart3,
  Stethoscope,
  Pill,
  FlaskConical,
  Glasses,
  Building2,
  Heart,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import {
  useHistoryList,
  useHistoryStats,
  exportHistoryCSV,
} from '@/hooks/use-bulletin-history';
import type { HistoryBulletin, HistoryFilters, HistoryActeSummary } from '@/hooks/use-bulletin-history';
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

const careTypeIcons: Record<string, React.ReactNode> = {
  consultation: <Stethoscope className="h-4 w-4 text-blue-500" />,
  pharmacie: <Pill className="h-4 w-4 text-emerald-500" />,
  pharmacy: <Pill className="h-4 w-4 text-emerald-500" />,
  hospital: <Building2 className="h-4 w-4 text-purple-500" />,
  lab: <FlaskConical className="h-4 w-4 text-amber-500" />,
  laboratory: <FlaskConical className="h-4 w-4 text-amber-500" />,
  radio: <BarChart3 className="h-4 w-4 text-indigo-500" />,
  radiology: <BarChart3 className="h-4 w-4 text-indigo-500" />,
  optique: <Glasses className="h-4 w-4 text-cyan-500" />,
  optical: <Glasses className="h-4 w-4 text-cyan-500" />,
  dentaire: <Heart className="h-4 w-4 text-rose-500" />,
  dental: <Heart className="h-4 w-4 text-rose-500" />,
};

const statusConfig: Record<string, { label: string; variant: string; icon: typeof CheckCircle }> = {
  approved: { label: 'Approuvé', variant: 'default', icon: CheckCircle },
  reimbursed: { label: 'Remboursé', variant: 'success', icon: CreditCard },
  rejected: { label: 'Rejeté', variant: 'destructive', icon: XCircle },
  non_remboursable: { label: 'Non remboursable', variant: 'warning', icon: XCircle },
  archived: { label: 'Archivé', variant: 'secondary', icon: Archive },
};

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '0.000 TND';
  return `${(amount).toFixed(3)} TND`;
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
      header: 'Bulletin',
      render: (row: HistoryBulletin) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {row.adherentFirstName} {row.adherentLastName}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{row.bulletinNumber}</span>
            <span className="mx-1">·</span>
            {formatDate(row.bulletinDate)}
          </p>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (row: HistoryBulletin) => (
        <div>
          {row.adherentMatricule && (
            <p className="text-xs text-muted-foreground font-mono">{row.adherentMatricule}</p>
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
      key: 'actes',
      header: 'Actes / Médicaments',
      render: (row: HistoryBulletin) => {
        const actes = row.actes || [];
        if (actes.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        const maxVisible = 3;
        const visible = actes.slice(0, maxVisible);
        const remaining = actes.length - maxVisible;
        return (
          <div className="space-y-0.5 max-w-[250px]">
            {visible.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 text-xs">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="truncate" title={a.label}>
                  {a.code ? `${a.code} — ` : ''}{a.label}
                </span>
                <span className="shrink-0 text-muted-foreground ml-auto">
                  {formatAmount(a.amount)}
                </span>
              </div>
            ))}
            {remaining > 0 && (
              <span className="text-xs text-muted-foreground">+{remaining} autre{remaining > 1 ? 's' : ''}</span>
            )}
          </div>
        );
      },
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
      key: 'taux',
      header: 'Taux',
      render: (row: HistoryBulletin) => {
        if (!row.totalAmount || row.totalAmount <= 0) return <span className="text-xs text-muted-foreground">—</span>;
        const taux = Math.round(((row.reimbursedAmount || 0) / row.totalAmount) * 100);
        return (
          <span className={`text-xs font-semibold ${taux >= 80 ? 'text-green-600' : taux >= 50 ? 'text-amber-600' : taux > 0 ? 'text-orange-600' : 'text-red-500'}`}>
            {taux}%
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: HistoryBulletin) => {
        const config = statusConfig[row.status] ?? statusConfig.approved!;
        const Icon = config.icon;
        return (
          <Badge variant={config.variant as 'default' | 'destructive' | 'secondary'} className="gap-1">
            <Icon className="h-3 w-3" />
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
    <div>
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
      {/* Synthèse globale — Décompte de remboursement */}
      {stats && (
        <div className="space-y-4">
          {/* Row 1: KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total déclaré</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAmount(stats.totalDeclared)}</div>
                <p className="text-xs text-muted-foreground">{stats.totalBulletins} bulletin(s)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total remboursé</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatAmount(stats.totalReimbursed)}</div>
                <p className="text-xs text-muted-foreground">
                  Taux moyen : {stats.totalDeclared > 0 ? Math.round((stats.totalReimbursed / stats.totalDeclared) * 100) : 0}%
                </p>
              </CardContent>
            </Card>
            {/* <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approuvés</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.byStatus.approved || 0}</div>
                <p className="text-xs text-muted-foreground">en attente de paiement</p>
              </CardContent>
            </Card> */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Remboursés</CardTitle>
                <CreditCard className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.byStatus.reimbursed || 0}</div>
                <p className="text-xs text-muted-foreground">paiement effectué</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rejetés / Non remb.</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{(stats.byStatus.rejected || 0) + (stats.byStatus.non_remboursable || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.byStatus.rejected || 0} rejeté(s) · {stats.byStatus.non_remboursable || 0} non remb.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Répartition par type de soins — style décompte BH Assurance */}
          {stats.byCareType && stats.byCareType.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Heart className="h-4 w-4 text-rose-500" />
                  Répartition par type de soins
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {stats.byCareType
                    .sort((a, b) => b.totalReimbursed - a.totalReimbursed)
                    .map((ct) => {
                      const label = careTypeLabels[ct.careType] || ct.careType;
                      const icon = careTypeIcons[ct.careType];
                      const tauxRemb = ct.totalDeclared > 0 ? Math.round((ct.totalReimbursed / ct.totalDeclared) * 100) : 0;
                      const pctOfTotal = stats.totalReimbursed > 0 ? Math.round((ct.totalReimbursed / stats.totalReimbursed) * 100) : 0;
                      return (
                        <div key={ct.careType} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {icon}
                              <span className="text-sm font-medium">{label}</span>
                            </div>
                            <Badge variant="secondary" className="text-xs">{ct.count}</Badge>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-lg font-bold text-green-700">{formatAmount(ct.totalReimbursed)}</span>
                            <span className="text-xs text-muted-foreground">sur {formatAmount(ct.totalDeclared)}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Taux remb. : {tauxRemb}%</span>
                              <span>{pctOfTotal}% du total</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-green-500 transition-all"
                                style={{ width: `${Math.min(100, tauxRemb)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
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
                  {/* <FilterOption selected={filters.status === 'approved'} onClick={() => { updateFilter('status', 'approved'); setStatusDropdownOpen(false); }}>
                    Approuvé
                  </FilterOption> */}
                  <FilterOption selected={filters.status === 'reimbursed'} onClick={() => { updateFilter('status', 'reimbursed'); setStatusDropdownOpen(false); }}>
                    Remboursé
                  </FilterOption>
                  <FilterOption selected={filters.status === 'rejected'} onClick={() => { updateFilter('status', 'rejected'); setStatusDropdownOpen(false); }}>
                    Rejeté
                  </FilterOption>
                  <FilterOption selected={filters.status === 'non_remboursable'} onClick={() => { updateFilter('status', 'non_remboursable'); setStatusDropdownOpen(false); }}>
                    Non remboursable
                  </FilterOption>
                  <FilterOption selected={filters.status === 'archived'} onClick={() => { updateFilter('status', 'archived'); setStatusDropdownOpen(false); }}>
                    Archivé
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
