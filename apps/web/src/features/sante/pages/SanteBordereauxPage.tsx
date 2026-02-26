/**
 * SoinFlow Bordereaux management page
 */
import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useBordereaux,
  useBordereauById,
  useBordereauStats,
  useCreateBordereau,
  useUpdateBordereauStatut,
  BORDEREAU_STATUTS_LABELS,
  BORDEREAU_STATUTS_COLORS,
  type Bordereau,
  type BordereauStatut,
} from '../hooks/useBordereaux';
import { useToast } from '@/stores/toast';
import { apiClient } from '@/lib/api-client';

export function SanteBordereauxPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ statut?: BordereauStatut }>({});
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createData, setCreateData] = useState({
    periodeDebut: '',
    periodeFin: '',
    notes: '',
  });
  const [updateAction, setUpdateAction] = useState<BordereauStatut | null>(null);
  const { toast } = useToast();

  const { data, isLoading } = useBordereaux(page, 20, filters);
  const { data: stats } = useBordereauStats();
  const { data: selectedBordereau } = useBordereauById(selectedId);
  const createMutation = useCreateBordereau();
  const updateMutation = useUpdateBordereauStatut();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000); // Convert millimes to TND
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleCreate = async () => {
    if (!createData.periodeDebut || !createData.periodeFin) {
      toast({ title: 'Veuillez remplir les dates', variant: 'destructive' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        periodeDebut: createData.periodeDebut,
        periodeFin: createData.periodeFin,
        notes: createData.notes || undefined,
      });
      toast({ title: 'Bordereau cree avec succes', variant: 'success' });
      setShowCreate(false);
      setCreateData({ periodeDebut: '', periodeFin: '', notes: '' });
    } catch (error) {
      toast({
        title: 'Erreur lors de la creation',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const handleStatusUpdate = async (id: string, newStatut: BordereauStatut) => {
    try {
      await updateMutation.mutateAsync({ id, data: { statut: newStatut } });
      toast({ title: `Bordereau ${BORDEREAU_STATUTS_LABELS[newStatut].toLowerCase()}`, variant: 'success' });
      setUpdateAction(null);
    } catch (error) {
      toast({
        title: 'Erreur lors de la mise a jour',
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
    };
    return transitions[statut];
  };

  const getActionLabel = (statut: BordereauStatut): string => {
    const labels: Record<BordereauStatut, string> = {
      genere: 'Valider',
      valide: 'Marquer envoye',
      envoye: 'Marquer paye',
      paye: '',
      annule: '',
    };
    return labels[statut];
  };

  const handleExport = (id: string, format: 'pdf' | 'csv' = 'csv') => {
    const url = `${apiClient.getBaseUrl()}/sante/exports/bordereau/${id}?format=${format}`;
    window.open(url, '_blank');
  };

  const columns = [
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
      header: 'Periode',
      render: (b: Bordereau) => (
        <span className="text-sm">
          {formatDate(b.periodeDebut)} - {formatDate(b.periodeFin)}
        </span>
      ),
    },
    {
      key: 'demandes',
      header: 'Demandes',
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
        <span className={`rounded-full px-2 py-1 text-xs ${BORDEREAU_STATUTS_COLORS[b.statut]}`}>
          {BORDEREAU_STATUTS_LABELS[b.statut]}
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
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(b.id)}>
              Details
            </Button>
            {nextAction && (
              <Button size="sm" onClick={() => handleStatusUpdate(b.id, nextAction)}>
                {getActionLabel(b.statut)}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleExport(b.id, 'csv')}>
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport(b.id, 'pdf')}>
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
        title="Bordereaux SoinFlow"
        description="Gestion des bordereaux de remboursement"
        action={
          <Button onClick={() => setShowCreate(true)}>
            Generer bordereau
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
            <CardTitle className="font-medium text-muted-foreground text-sm">Demandes</CardTitle>
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
            <CardTitle className="font-medium text-muted-foreground text-sm">A traiter</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-yellow-600">
              {(stats?.parStatut?.genere?.count ?? 0) + (stats?.parStatut?.valide?.count ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={filters.statut ?? 'all'}
          onValueChange={(v) => setFilters({ ...filters, statut: v === 'all' ? undefined : v as BordereauStatut })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(BORDEREAU_STATUTS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="Aucun bordereau trouve"
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

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generer un bordereau</DialogTitle>
            <DialogDescription>
              Regrouper les demandes approuvees de la periode pour paiement
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodeDebut">Date debut</Label>
                <Input
                  id="periodeDebut"
                  type="date"
                  value={createData.periodeDebut}
                  onChange={(e) => setCreateData({ ...createData, periodeDebut: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodeFin">Date fin</Label>
                <Input
                  id="periodeFin"
                  type="date"
                  value={createData.periodeFin}
                  onChange={(e) => setCreateData({ ...createData, periodeFin: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optionnel)</Label>
              <Textarea
                id="notes"
                value={createData.notes}
                onChange={(e) => setCreateData({ ...createData, notes: e.target.value })}
                placeholder="Notes internes..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Generation...' : 'Generer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={!!selectedId && !!selectedBordereau} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bordereau {selectedBordereau?.numeroBordereau}</DialogTitle>
            <DialogDescription>
              Periode: {selectedBordereau && formatDate(selectedBordereau.periodeDebut)} - {selectedBordereau && formatDate(selectedBordereau.periodeFin)}
            </DialogDescription>
          </DialogHeader>

          {selectedBordereau && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-4 rounded-lg bg-muted p-4">
                <div>
                  <p className="text-muted-foreground text-sm">Statut</p>
                  <span className={`rounded-full px-2 py-1 text-xs ${BORDEREAU_STATUTS_COLORS[selectedBordereau.statut]}`}>
                    {BORDEREAU_STATUTS_LABELS[selectedBordereau.statut]}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Demandes</p>
                  <p className="font-medium">{selectedBordereau.nombreDemandes}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Montant total</p>
                  <p className="font-medium">{formatAmount(selectedBordereau.montantTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Generation</p>
                  <p className="font-medium">{formatDate(selectedBordereau.dateGeneration)}</p>
                </div>
              </div>

              {/* Lines */}
              <div>
                <h4 className="mb-2 font-medium">Lignes ({selectedBordereau.lignes?.length ?? 0})</h4>
                <div className="max-h-64 overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="p-2 text-left">Demande</th>
                        <th className="p-2 text-left">Adherent</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-right">Demande</th>
                        <th className="p-2 text-right">Rembourse</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBordereau.lignes?.map((ligne) => (
                        <tr key={ligne.id} className="border-t">
                          <td className="p-2">{ligne.numeroDemande}</td>
                          <td className="p-2">{ligne.adherentNom}</td>
                          <td className="p-2">{ligne.typeSoin}</td>
                          <td className="p-2">{formatDate(ligne.dateSoin)}</td>
                          <td className="p-2 text-right">{formatAmount(ligne.montantDemande)}</td>
                          <td className="p-2 text-right text-green-600">{formatAmount(ligne.montantRembourse)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setSelectedId(null)}>
                  Fermer
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport(selectedBordereau.id, 'csv')}
                >
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport(selectedBordereau.id, 'pdf')}
                >
                  Export PDF
                </Button>
                {getNextAction(selectedBordereau.statut) && (
                  <Button onClick={() => handleStatusUpdate(selectedBordereau.id, getNextAction(selectedBordereau.statut)!)}>
                    {getActionLabel(selectedBordereau.statut)}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
