/**
 * SoinFlow Paiements management page
 */
import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  usePaiements,
  usePaiementsStats,
  useUpdatePaiementStatut,
  useBatchPaiements,
  PAIEMENT_STATUTS_LABELS,
  PAIEMENT_STATUTS_COLORS,
  PAIEMENT_METHODES_LABELS,
  type Paiement,
  type PaiementStatut,
  type PaiementMethode,
} from '../hooks/usePaiements';
import { useToast } from '@/stores/toast';

export function SantePaiementsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ statut?: PaiementStatut }>({});
  const [selectedPaiement, setSelectedPaiement] = useState<Paiement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchData, setBatchData] = useState({
    action: 'valider' as 'valider' | 'payer',
    methode: 'virement' as PaiementMethode,
    reference: '',
  });
  const [paymentData, setPaymentData] = useState({
    methode: 'virement' as PaiementMethode,
    reference: '',
  });
  const { toast } = useToast();

  const { data, isLoading } = usePaiements(page, 20, filters);
  const { data: stats } = usePaiementsStats();
  const updateMutation = useUpdatePaiementStatut();
  const batchMutation = useBatchPaiements();

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

  const handleStatusUpdate = async (newStatut: PaiementStatut) => {
    if (!selectedPaiement) return;

    try {
      await updateMutation.mutateAsync({
        id: selectedPaiement.id,
        data: {
          statut: newStatut,
          methode: newStatut === 'paye' ? paymentData.methode : undefined,
          reference: newStatut === 'paye' ? paymentData.reference : undefined,
        },
      });
      toast({ title: `Paiement ${PAIEMENT_STATUTS_LABELS[newStatut].toLowerCase()}`, variant: 'success' });
      setSelectedPaiement(null);
    } catch (error) {
      toast({
        title: 'Erreur lors de la mise a jour',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const handleBatch = async () => {
    if (selectedIds.length === 0) {
      toast({ title: 'Selectionnez des paiements', variant: 'destructive' });
      return;
    }

    try {
      const result = await batchMutation.mutateAsync({
        action: batchData.action,
        paiementIds: selectedIds,
        methode: batchData.action === 'payer' ? batchData.methode : undefined,
        reference: batchData.action === 'payer' ? batchData.reference : undefined,
      });
      toast({
        title: `${result.processed} paiements traites`,
        variant: 'success',
      });
      setShowBatchDialog(false);
      setSelectedIds([]);
      setBatchData({ action: 'valider', methode: 'virement', reference: '' });
    } catch (error) {
      toast({
        title: 'Erreur lors du traitement',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const eligibleIds = (data?.data ?? [])
      .filter((p) => p.statut === 'en_attente' || p.statut === 'valide')
      .map((p) => p.id);

    if (selectedIds.length === eligibleIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleIds);
    }
  };

  const columns = [
    {
      key: 'select',
      header: () => (
        <Checkbox
          checked={selectedIds.length > 0 && selectedIds.length === (data?.data ?? []).filter((p) => ['en_attente', 'valide'].includes(p.statut)).length}
          onCheckedChange={toggleSelectAll}
        />
      ),
      render: (p: Paiement) => {
        const canSelect = ['en_attente', 'valide'].includes(p.statut);
        return canSelect ? (
          <Checkbox
            checked={selectedIds.includes(p.id)}
            onCheckedChange={() => toggleSelect(p.id)}
          />
        ) : null;
      },
    },
    {
      key: 'paiement',
      header: 'Paiement',
      render: (p: Paiement) => (
        <div>
          <p className="font-medium">{p.numeroPaiement}</p>
          <p className="text-muted-foreground text-sm">{formatDate(p.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'beneficiaire',
      header: 'Beneficiaire',
      render: (p: Paiement) => (
        <div>
          <p className="text-sm">{p.beneficiaireId}</p>
          <p className="text-muted-foreground text-xs">
            {p.beneficiaireType === 'adherent' ? 'Adherent' : 'Praticien'}
          </p>
        </div>
      ),
    },
    {
      key: 'montant',
      header: 'Montant',
      render: (p: Paiement) => (
        <span className="font-medium">{formatAmount(p.montant)}</span>
      ),
    },
    {
      key: 'methode',
      header: 'Methode',
      render: (p: Paiement) => (
        <span className="text-sm">
          {p.methode ? PAIEMENT_METHODES_LABELS[p.methode] : '-'}
        </span>
      ),
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (p: Paiement) => (
        <span className={`rounded-full px-2 py-1 text-xs ${PAIEMENT_STATUTS_COLORS[p.statut]}`}>
          {PAIEMENT_STATUTS_LABELS[p.statut]}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p: Paiement) => (
        <div className="flex justify-end gap-2">
          {p.statut === 'en_attente' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusUpdate.call({ selectedPaiement: p }, 'valide')}
            >
              Valider
            </Button>
          )}
          {p.statut === 'valide' && (
            <Button
              size="sm"
              onClick={() => {
                setSelectedPaiement(p);
                setPaymentData({ methode: 'virement', reference: '' });
              }}
            >
              Payer
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelectedPaiement(p)}>
            Details
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements SoinFlow"
        description="Gestion des paiements de remboursement"
        action={
          selectedIds.length > 0 ? (
            <Button onClick={() => setShowBatchDialog(true)}>
              Traiter {selectedIds.length} paiement(s)
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats?.totalPaiements ?? '-'}</p>
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
            <CardTitle className="font-medium text-muted-foreground text-sm">En attente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-yellow-600">
              {stats?.parStatut?.en_attente?.count ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Payes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-green-600">
              {stats?.parStatut?.paye?.count ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={filters.statut ?? 'all'}
          onValueChange={(v) => setFilters({ ...filters, statut: v === 'all' ? undefined : v as PaiementStatut })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(PAIEMENT_STATUTS_LABELS).map(([value, label]) => (
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
        emptyMessage="Aucun paiement trouve"
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

      {/* Payment Dialog */}
      <Dialog
        open={!!selectedPaiement && selectedPaiement.statut === 'valide'}
        onOpenChange={() => setSelectedPaiement(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Effectuer le paiement</DialogTitle>
            <DialogDescription>
              Paiement {selectedPaiement?.numeroPaiement} - {selectedPaiement && formatAmount(selectedPaiement.montant)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Methode de paiement</Label>
              <Select
                value={paymentData.methode}
                onValueChange={(v) => setPaymentData({ ...paymentData, methode: v as PaiementMethode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAIEMENT_METHODES_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={paymentData.reference}
                onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                placeholder="Numero de virement, cheque..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setSelectedPaiement(null)}>
                Annuler
              </Button>
              <Button onClick={() => handleStatusUpdate('paye')} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Traitement...' : 'Confirmer paiement'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Traitement par lot</DialogTitle>
            <DialogDescription>
              {selectedIds.length} paiement(s) selectionne(s)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={batchData.action}
                onValueChange={(v) => setBatchData({ ...batchData, action: v as 'valider' | 'payer' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valider">Valider</SelectItem>
                  <SelectItem value="payer">Payer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {batchData.action === 'payer' && (
              <>
                <div className="space-y-2">
                  <Label>Methode</Label>
                  <Select
                    value={batchData.methode}
                    onValueChange={(v) => setBatchData({ ...batchData, methode: v as PaiementMethode })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAIEMENT_METHODES_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batchReference">Reference</Label>
                  <Input
                    id="batchReference"
                    value={batchData.reference}
                    onChange={(e) => setBatchData({ ...batchData, reference: e.target.value })}
                    placeholder="Reference commune..."
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
                Annuler
              </Button>
              <Button onClick={handleBatch} disabled={batchMutation.isPending}>
                {batchMutation.isPending ? 'Traitement...' : 'Executer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
