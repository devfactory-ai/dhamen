/**
 * SoinFlow Demandes management page (for gestionnaire)
 */
import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
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
  useSanteDemandes,
  useSanteStats,
  useUpdateSanteDemandeStatut,
  SANTE_TYPE_SOINS_LABELS,
  SANTE_STATUTS_LABELS,
  SANTE_STATUTS_COLORS,
  type SanteDemande,
} from '../hooks/useSante';
import { useToast } from '@/stores/toast';
import { apiClient } from '@/lib/api-client';
import type { SanteStatutDemande, SanteTypeSoin } from '@dhamen/shared';

export function SanteDemandesPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{
    statut?: SanteStatutDemande;
    typeSoin?: SanteTypeSoin;
  }>({});
  const [selectedDemande, setSelectedDemande] = useState<SanteDemande | null>(null);
  const [processingData, setProcessingData] = useState({
    action: 'approuver' as 'approuver' | 'rejeter',
    montantRembourse: '',
    motifRejet: '',
    notesInternes: '',
  });
  const { toast } = useToast();

  const { data, isLoading } = useSanteDemandes(page, 20, filters);
  const { data: stats } = useSanteStats();
  const updateStatut = useUpdateSanteDemandeStatut();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleProcess = async () => {
    if (!selectedDemande) return;

    try {
      await updateStatut.mutateAsync({
        id: selectedDemande.id,
        data: {
          statut: processingData.action === 'approuver' ? 'approuvee' : 'rejetee',
          montantRembourse: processingData.action === 'approuver'
            ? Number.parseFloat(processingData.montantRembourse) || undefined
            : undefined,
          motifRejet: processingData.action === 'rejeter' ? processingData.motifRejet : undefined,
          notesInternes: processingData.notesInternes || undefined,
        },
      });

      toast({
        title: processingData.action === 'approuver' ? 'Demande approuvee' : 'Demande rejetee',
        variant: processingData.action === 'approuver' ? 'success' : 'destructive',
      });

      setSelectedDemande(null);
      setProcessingData({ action: 'approuver', montantRembourse: '', motifRejet: '', notesInternes: '' });
    } catch {
      toast({
        title: 'Erreur lors du traitement',
        description: 'Veuillez reessayer',
        variant: 'destructive',
      });
    }
  };

  const openProcessDialog = (demande: SanteDemande) => {
    setSelectedDemande(demande);
    setProcessingData({
      action: 'approuver',
      montantRembourse: demande.montantDemande.toString(),
      motifRejet: '',
      notesInternes: '',
    });
  };

  const canProcess = (demande: SanteDemande) => {
    return ['soumise', 'en_examen', 'info_requise'].includes(demande.statut);
  };

  const handleExport = async (format: 'pdf' | 'csv') => {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (filters.statut) params.append('statut', filters.statut);
      if (filters.typeSoin) params.append('typeSoin', filters.typeSoin);

      const url = `${apiClient.getBaseUrl()}/sante/exports/demandes?${params.toString()}`;
      window.open(url, '_blank');
    } catch {
      toast({
        title: 'Erreur lors de l\'export',
        variant: 'destructive',
      });
    }
  };

  const columns = [
    {
      key: 'demande',
      header: 'Demande',
      render: (demande: SanteDemande) => (
        <div>
          <p className="font-medium">{demande.numeroDemande}</p>
          <p className="text-muted-foreground text-sm">{formatDate(demande.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adherent',
      render: (demande: SanteDemande) => (
        <div>
          <p className="text-sm">{demande.adherentId}</p>
          <p className="text-muted-foreground text-xs">
            {demande.source === 'adherent' ? 'Bulletin' : 'Praticien'}
          </p>
        </div>
      ),
    },
    {
      key: 'typeSoin',
      header: 'Type',
      render: (demande: SanteDemande) => (
        <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800 text-xs">
          {SANTE_TYPE_SOINS_LABELS[demande.typeSoin]}
        </span>
      ),
    },
    {
      key: 'montant',
      header: 'Montant',
      render: (demande: SanteDemande) => (
        <div className="text-right">
          <p className="font-medium">{formatAmount(demande.montantDemande)}</p>
          {demande.montantRembourse && (
            <p className="text-green-600 text-sm">
              {formatAmount(demande.montantRembourse)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'dateSoin',
      header: 'Date soin',
      render: (demande: SanteDemande) => (
        <span className="text-sm">{formatDate(demande.dateSoin)}</span>
      ),
    },
    {
      key: 'scoreFraude',
      header: 'Score',
      render: (demande: SanteDemande) => {
        if (demande.scoreFraude === null) return '-';
        const color =
          demande.scoreFraude > 70
            ? 'text-destructive'
            : demande.scoreFraude > 40
              ? 'text-yellow-600'
              : 'text-green-600';
        return <span className={`font-medium ${color}`}>{demande.scoreFraude}</span>;
      },
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (demande: SanteDemande) => (
        <span className={`rounded-full px-2 py-1 text-xs ${SANTE_STATUTS_COLORS[demande.statut]}`}>
          {SANTE_STATUTS_LABELS[demande.statut]}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (demande: SanteDemande) => (
        <div className="flex justify-end gap-2">
          {canProcess(demande) && (
            <Button size="sm" onClick={() => openProcessDialog(demande)}>
              Traiter
            </Button>
          )}
          {!canProcess(demande) && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedDemande(demande)}>
              Details
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demandes SoinFlow"
        description="Gerer les demandes de remboursement sante"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport('csv')}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport('pdf')}>
              Export PDF
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats?.total ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">A traiter</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-yellow-600">
              {(stats?.parStatut?.soumise ?? 0) + (stats?.parStatut?.en_examen ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Montant demande</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats ? formatAmount(stats.montantTotal) : '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Rembourse</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-green-600">
              {stats ? formatAmount(stats.montantRembourse) : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={filters.statut ?? 'all'}
          onValueChange={(v) => setFilters({ ...filters, statut: v === 'all' ? undefined : v as SanteStatutDemande })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(SANTE_STATUTS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.typeSoin ?? 'all'}
          onValueChange={(v) => setFilters({ ...filters, typeSoin: v === 'all' ? undefined : v as SanteTypeSoin })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type de soin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(SANTE_TYPE_SOINS_LABELS).map(([value, label]) => (
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
        emptyMessage="Aucune demande trouvee"
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

      {/* Process Dialog */}
      <Dialog
        open={!!selectedDemande && canProcess(selectedDemande)}
        onOpenChange={() => setSelectedDemande(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter la demande {selectedDemande?.numeroDemande}</DialogTitle>
            <DialogDescription>Approuver ou rejeter cette demande de remboursement</DialogDescription>
          </DialogHeader>

          {selectedDemande && (
            <div className="space-y-4">
              {/* Demande Info */}
              <div className="rounded-lg bg-muted p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="font-medium">{SANTE_TYPE_SOINS_LABELS[selectedDemande.typeSoin]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Montant demande</p>
                    <p className="font-medium">{formatAmount(selectedDemande.montantDemande)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date soin</p>
                    <p className="font-medium">{formatDate(selectedDemande.dateSoin)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Score fraude</p>
                    <p
                      className={`font-medium ${
                        selectedDemande.scoreFraude && selectedDemande.scoreFraude > 70
                          ? 'text-destructive'
                          : ''
                      }`}
                    >
                      {selectedDemande.scoreFraude ?? 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Decision */}
              <div className="space-y-2">
                <Label>Decision</Label>
                <div className="flex gap-2">
                  <Button
                    variant={processingData.action === 'approuver' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setProcessingData({ ...processingData, action: 'approuver' })}
                  >
                    Approuver
                  </Button>
                  <Button
                    variant={processingData.action === 'rejeter' ? 'destructive' : 'outline'}
                    className="flex-1"
                    onClick={() => setProcessingData({ ...processingData, action: 'rejeter' })}
                  >
                    Rejeter
                  </Button>
                </div>
              </div>

              {processingData.action === 'approuver' && (
                <div className="space-y-2">
                  <Label htmlFor="montantRembourse">Montant rembourse (TND)</Label>
                  <Input
                    id="montantRembourse"
                    type="number"
                    step="0.001"
                    value={processingData.montantRembourse}
                    onChange={(e) =>
                      setProcessingData({ ...processingData, montantRembourse: e.target.value })
                    }
                  />
                </div>
              )}

              {processingData.action === 'rejeter' && (
                <div className="space-y-2">
                  <Label htmlFor="motifRejet">Motif du rejet</Label>
                  <Textarea
                    id="motifRejet"
                    value={processingData.motifRejet}
                    onChange={(e) =>
                      setProcessingData({ ...processingData, motifRejet: e.target.value })
                    }
                    placeholder="Indiquer le motif du rejet..."
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes internes (optionnel)</Label>
                <Textarea
                  id="notes"
                  value={processingData.notesInternes}
                  onChange={(e) =>
                    setProcessingData({ ...processingData, notesInternes: e.target.value })
                  }
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setSelectedDemande(null)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleProcess}
                  disabled={updateStatut.isPending}
                  variant={processingData.action === 'rejeter' ? 'destructive' : 'default'}
                >
                  {updateStatut.isPending
                    ? 'Traitement...'
                    : processingData.action === 'approuver'
                      ? 'Approuver'
                      : 'Rejeter'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
