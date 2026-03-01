/**
 * SoinFlow Bordereaux management page
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useBordereaux,
  useBordereauStats,
  useUpdateBordereauStatut,
  BORDEREAU_STATUTS_LABELS,
  BORDEREAU_STATUTS_COLORS,
  type Bordereau,
  type BordereauStatut,
} from '../hooks/useBordereaux';
import { useToast } from '@/stores/toast';
import { apiClient } from '@/lib/api-client';

export function SanteBordereauxPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ statut?: BordereauStatut }>({});
  const { toast } = useToast();

  const { data, isLoading } = useBordereaux(page, 20, filters);
  const { data: stats } = useBordereauStats();
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

  const handleStatusUpdate = async (id: string, newStatut: BordereauStatut) => {
    try {
      await updateMutation.mutateAsync({ id, data: { statut: newStatut } });
      toast({ title: `Bordereau ${BORDEREAU_STATUTS_LABELS[newStatut].toLowerCase()}`, variant: 'success' });
      setUpdateAction(null);
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
      généré: 'valide',
      valide: 'envoye',
      envoye: 'paye',
      paye: null,
      annule: null,
    };
    return transitions[statut];
  };

  const getActionLabel = (statut: BordereauStatut): string => {
    const labels: Record<BordereauStatut, string> = {
      généré: 'Valider',
      valide: 'Marquer envoyé',
      envoye: 'Marquer payé',
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
          <p className="font-medium">{b.numéroBordereau}</p>
          <p className="text-muted-foreground text-sm">{formatDate(b.dateGeneration)}</p>
        </div>
      ),
    },
    {
      key: 'période',
      header: 'Période',
      render: (b: Bordereau) => (
        <span className="text-sm">
          {formatDate(b.périodeDebut)} - {formatDate(b.périodeFin)}
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
            <Button variant="ghost" size="sm" onClick={() => navigate(`/sante/bordereaux/${b.id}`)}>
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
        emptyMessage="Aucun adhérent trouvé"
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
    </div>
  );
}
