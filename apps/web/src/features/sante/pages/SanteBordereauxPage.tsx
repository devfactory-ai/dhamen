/**
 * Bordereaux management page
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
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
import {
  useBordereaux,
  useBordereauStats,
  useUpdateBordereauStatut,
  useBulkArchiveBordereaux,
  useBulkDeleteBordereaux,
  BORDEREAU_STATUTS_LABELS,
  BORDEREAU_STATUTS_COLORS,
  type Bordereau,
  type BordereauStatut,
} from '../hooks/useBordereaux';
import { useToast } from '@/stores/toast';
import { apiClient } from '@/lib/api-client';
import { FloatingHelp } from '@/components/ui/floating-help';
import { FileText, CheckCircle, Download, RefreshCw, Archive, Trash2 } from 'lucide-react';

export function SanteBordereauxPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{ statut?: BordereauStatut }>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useBordereaux(page, 20, { ...filters, search: search || undefined });
  const { data: stats } = useBordereauStats();
  const updateMutation = useUpdateBordereauStatut();
  const bulkArchiveMutation = useBulkArchiveBordereaux();
  const bulkDeleteMutation = useBulkDeleteBordereaux();

  const bordereaux = data?.data ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === bordereaux.length && bordereaux.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bordereaux.map((b) => b.id)));
    }
  };

  const handleBulkArchive = async () => {
    try {
      await bulkArchiveMutation.mutateAsync(Array.from(selectedIds));
      toast({ title: `${selectedIds.size} bordereau(x) archivé(s)`, variant: 'success' });
      setSelectedIds(new Set());
      setArchiveConfirm(false);
    } catch (error) {
      toast({
        title: "Erreur lors de l'archivage",
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const handleBulkDelete = async () => {
    try {
      await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
      toast({ title: `${selectedIds.size} bordereau(x) supprimé(s)`, variant: 'success' });
      setSelectedIds(new Set());
      setDeleteConfirm(false);
    } catch (error) {
      toast({
        title: 'Erreur lors de la suppression',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleStatusUpdate = async (id: string, newStatut: BordereauStatut) => {
    try {
      await updateMutation.mutateAsync({ id, data: { statut: newStatut } });
      toast({ title: `Bordereau ${BORDEREAU_STATUTS_LABELS[newStatut].toLowerCase()}`, variant: 'success' });
    } catch (error) {
      toast({
        title: 'Erreur lors de la mise à jour',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const getNextAction = (statut: BordereauStatut): BordereauStatut | null => {
    const transitions: Record<BordereauStatut, BordereauStatut | null> = {
      genere: 'valide',
      valide: 'envoye',
      envoye: 'paye',
      paye: null,
      annule: null,
      archive: null,
    };
    return transitions[statut];
  };

  const getActionLabel = (statut: BordereauStatut): string => {
    const labels: Record<BordereauStatut, string> = {
      genere: 'Valider',
      valide: 'Marquer envoyé',
      envoye: 'Marquer payé',
      paye: '',
      annule: '',
      archive: '',
    };
    return labels[statut];
  };

  const handleExport = (id: string, numeroBordereau: string, format: 'pdf' | 'csv' = 'csv') => {
    const token = localStorage.getItem('accessToken');
    const url = `${apiClient.getBaseUrl()}/sante/bordereaux/${id}/export?format=${format}`;
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Code': 'BH',
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Export échoué');
        if (format === 'pdf') {
          const html = await res.text();
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(html);
            win.document.close();
            win.onload = () => win.print();
          }
        } else {
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `bordereau-${numeroBordereau}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        }
      })
      .catch(() => {
        toast({ title: `Erreur lors de l'export ${format.toUpperCase()}`, variant: 'destructive' });
      });
  };

  const columns = [
    {
      key: 'select',
      header: bordereaux.length > 0 ? (
        <input
          type="checkbox"
          checked={selectedIds.size === bordereaux.length && bordereaux.length > 0}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ) : null,
      className: 'w-10',
      render: (b: Bordereau) => (
        <input
          type="checkbox"
          checked={selectedIds.has(b.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            e.stopPropagation();
            toggleSelect(b.id);
          }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    },
    {
      key: 'bordereau',
      header: 'Bordereau',
      render: (b: Bordereau) => (
        <div>
          <p className="font-medium">{b.numeroBordereau}</p>
          <p className="text-muted-foreground text-sm">{formatDate(b.dateGeneration)}</p>
        </div>
      ),
    },
    {
      key: 'periode',
      header: 'Période',
      render: (b: Bordereau) => (
        <span className="text-sm">
          {formatDate(b.periodeDebut)} - {formatDate(b.periodeFin)}
        </span>
      ),
    },
    {
      key: 'demandes',
      header: 'Bulletins',
      render: (b: Bordereau) => (
        <span className="font-medium">{b.nombreDemandes}</span>
      ),
    },
    {
      key: 'montant',
      header: 'Montant',
      render: (b: Bordereau) => (
        <span className="font-medium">{formatAmount(b.montantTotal)}</span>
      ),
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (b: Bordereau) => (
        <span className={`rounded-full px-2 py-1 text-xs ${BORDEREAU_STATUTS_COLORS[b.statut] ?? 'bg-gray-100 text-gray-800'}`}>
          {BORDEREAU_STATUTS_LABELS[b.statut] ?? b.statut}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (b: Bordereau) => {
        const nextAction = getNextAction(b.statut);
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/sante/bordereaux/${b.id}`)}>
              Détails
            </Button>
            {nextAction && (
              <Button size="sm" onClick={() => handleStatusUpdate(b.id, nextAction)}>
                {getActionLabel(b.statut)}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleExport(b.id, b.numeroBordereau, 'csv')}>
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport(b.id, b.numeroBordereau, 'pdf')}>
              PDF
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bordereaux"
        description="Regroupement des bulletins remboursés pour facturation assureur"
        action={
          <Button onClick={() => navigate('/sante/bordereaux/new')}>
            Générer bordereau
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats?.totalBordereaux ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Bulletins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats?.totalDemandes ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Montant total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats ? formatAmount(stats.montantTotal) : '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">À traiter</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-yellow-600">
              {(stats?.parStatut?.genere?.count ?? 0) + (stats?.parStatut?.valide?.count ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters bar + Bulk Actions */}
      <div className="flex flex-col lg:flex-row items-stretch gap-4">
        {/* Filters */}
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
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
                placeholder="Rechercher par numéro de bordereau..."
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

            {/* Statut dropdown */}
            <FilterDropdown
              label="Statut"
              value={filters.statut ? BORDEREAU_STATUTS_LABELS[filters.statut] : 'Tous'}
              open={statusDropdownOpen}
              onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
              onClose={() => setStatusDropdownOpen(false)}
            >
              <FilterOption
                selected={!filters.statut}
                onClick={() => { setFilters({ ...filters, statut: undefined }); setStatusDropdownOpen(false); setPage(1); }}
              >
                Tous
              </FilterOption>
              {(Object.entries(BORDEREAU_STATUTS_LABELS) as [BordereauStatut, string][]).map(([value, label]) => (
                <FilterOption
                  key={value}
                  selected={filters.statut === value}
                  onClick={() => { setFilters({ ...filters, statut: value }); setStatusDropdownOpen(false); setPage(1); }}
                >
                  {label}
                </FilterOption>
              ))}
            </FilterDropdown>
          </div>
        </div>

        {/* Bulk actions card */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm shrink-0">
            <span className="text-sm text-gray-500 font-medium">{selectedIds.size} sélectionné(s)</span>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={() => setArchiveConfirm(true)}
              disabled={bulkArchiveMutation.isPending}
            >
              <Archive className="w-4 h-4" />
              Archiver
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setDeleteConfirm(true)}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </Button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={bordereaux}
        isLoading={isLoading}
        emptyMessage="Aucun bordereau trouvé"
        pagination={
          data?.meta
            ? {
                page: data.meta.page,
                limit: data.meta.limit,
                total: data.meta.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      {/* Archive confirmation */}
      <AlertDialog open={archiveConfirm} onOpenChange={setArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver les bordereaux</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous archiver <strong>{selectedIds.size}</strong> bordereau(x) ?
              Les bordereaux archivés ne seront plus visibles par défaut.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkArchive}
              disabled={bulkArchiveMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {bulkArchiveMutation.isPending ? 'Archivage...' : `Archiver (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les bordereaux</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer <strong>{selectedIds.size}</strong> bordereau(x) ?
              Les bulletins liés seront dissociés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteMutation.isPending ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingHelp
        title="Aide - Bordereaux"
        subtitle="Gestion des bordereaux de remboursement"
        tips={[
          {
            icon: <FileText className="h-4 w-4 text-blue-500" />,
            title: "Générer un bordereau",
            desc: "Cliquez sur 'Générer bordereau' pour créer un nouveau bordereau à partir des bulletins remboursés.",
          },
          {
            icon: <CheckCircle className="h-4 w-4 text-green-500" />,
            title: "Cycle de vie",
            desc: "Un bordereau passe par : Généré > Validé > Envoyé > Payé.",
          },
          {
            icon: <Download className="h-4 w-4 text-purple-500" />,
            title: "Export bordereau",
            desc: "Exportez chaque bordereau en CSV ou PDF pour l'envoi à l'assureur.",
          },
          {
            icon: <RefreshCw className="h-4 w-4 text-orange-500" />,
            title: "Suivi des statuts",
            desc: "Utilisez le filtre par statut pour suivre les bordereaux en attente de traitement.",
          },
        ]}
      />
    </div>
  );
}
