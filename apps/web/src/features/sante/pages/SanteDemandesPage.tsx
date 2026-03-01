/**
 * SoinFlow Demandes management page (for gestionnaire)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useSanteDemandes,
  useSanteStats,
  SANTE_TYPE_SOINS_LABELS,
  SANTE_STATUTS_LABELS,
  SANTE_STATUTS_COLORS,
  type SanteDemande,
} from '../hooks/useSante';
import { useToast } from '@/stores/toast';
import { apiClient } from '@/lib/api-client';
import type { SanteStatutDemande, SanteTypeSoin } from '@dhamen/shared';

export function SanteDemandesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{
    statut?: SanteStatutDemande;
    typeSoin?: SanteTypeSoin;
  }>({});
  const { toast } = useToast();

  const { data, isLoading } = useSanteDemandes(page, 20, filters);
  const { data: stats } = useSanteStats();

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
          <p className="font-medium">{demande.numéroDemande}</p>
          <p className="text-muted-foreground text-sm">{formatDate(demande.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'adhérent',
      header: 'Adhérent',
      render: (demande: SanteDemande) => (
        <div>
          <p className="text-sm">{demande.adhérentId}</p>
          <p className="text-muted-foreground text-xs">
            {demande.source === 'adhérent' ? 'Bulletin' : 'Praticien'}
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
            <Button size="sm" onClick={() => navigate(`/sante/demandes/${demande.id}/process`)}>
              Traiter
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate(`/sante/demandes/${demande.id}`)}>
            Details
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demandes SoinFlow"
        description="Gérer les demandes de remboursement sante"
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
        emptyMessage="Aucune demande trouvée"
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
