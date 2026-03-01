/**
 * SanteContreVisitesPage - Manage follow-up examinations
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { Eye, Calendar, FileText, ClipboardCheck } from 'lucide-react';
import type { SanteStatutContreVisite } from '@dhamen/shared';

interface ContreVisite {
  id: string;
  demandeId: string;
  numéroContreVisite: string;
  statut: SanteStatutContreVisite;
  motif: string;
  dateDemande: string;
  datePlanifiee: string | null;
  dateLimite: string | null;
  dateEffectuée: string | null;
  conclusion: string | null;
  impactDécision: string | null;
  demande: {
    numéroDemande: string;
    typeSoin: string;
    montantDemande: number;
    statut: string;
  };
  adhérent: {
    firstName: string;
    lastName: string;
  };
  praticien: {
    nom: string;
    prénom: string;
    spécialité: string;
  } | null;
  demandeur: {
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
}

const STATUT_LABELS: Record<SanteStatutContreVisite, string> = {
  demandee: 'Demandee',
  planifiée: 'Planifiee',
  en_attente: 'En attente',
  effectuée: 'Effectuée',
  rapport_soumis: 'Rapport soumis',
  validée: 'Validée',
  annulée: 'Annulée',
};

const STATUT_VARIANTS: Record<SanteStatutContreVisite, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
  demandee: 'outline',
  planifiée: 'secondary',
  en_attente: 'default',
  effectuée: 'default',
  rapport_soumis: 'secondary',
  validée: 'success',
  annulée: 'destructive',
};

const TYPE_SOIN_LABELS: Record<string, string> = {
  pharmacie: 'Pharmacie',
  consultation: 'Consultation',
  hospitalisation: 'Hospitalisation',
  optique: 'Optique',
  dentaire: 'Dentaire',
  laboratoire: 'Laboratoire',
  kinesitherapie: 'Kinesitherapie',
  autre: 'Autre',
};

export function SanteContreVisitesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statutFilter, setStatutFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['sante-contre-visites', page, statutFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (statutFilter !== 'all') {
        params.append('statut', statutFilter);
      }
      const response = await apiClient.get<{ data: ContreVisite[]; meta: { total: number; totalPages: number } }>(
        `/sante/contre-visites?${params.toString()}`
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
      minimumFractionDigits: 3,
    }).format(amount / 1000);
  };

  const columns = [
    {
      key: 'numéro',
      header: 'Numéro',
      render: (cv: ContreVisite) => (
        <div>
          <p className="font-mono font-medium text-sm">{cv.numéroContreVisite}</p>
          <p className="text-muted-foreground text-xs">Demande: {cv.demande.numéroDemande}</p>
        </div>
      ),
    },
    {
      key: 'adhérent',
      header: 'Adhérent',
      render: (cv: ContreVisite) => (
        <div>
          <p className="font-medium">{cv.adherent.firstName} {cv.adherent.lastName}</p>
          <p className="text-muted-foreground text-xs">
            {TYPE_SOIN_LABELS[cv.demande.typeSoin]} - {formatAmount(cv.demande.montantDemande)}
          </p>
        </div>
      ),
    },
    {
      key: 'motif',
      header: 'Motif',
      render: (cv: ContreVisite) => (
        <p className="text-sm max-w-[200px] truncate" title={cv.motif}>
          {cv.motif}
        </p>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      render: (cv: ContreVisite) => (
        <div className="text-sm">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span>Demandee: {formatDate(cv.dateDemande)}</span>
          </div>
          {cv.datePlanifiee && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Planifiee: {formatDate(cv.datePlanifiee)}</span>
            </div>
          )}
          {cv.dateLimite && (
            <div className="flex items-center gap-1 text-amber-600">
              <span>Limite: {formatDate(cv.dateLimite)}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'praticien',
      header: 'Praticien',
      render: (cv: ContreVisite) => (
        cv.praticien ? (
          <div>
            <p className="text-sm">{cv.praticien.prenom} {cv.praticien.nom}</p>
            <p className="text-muted-foreground text-xs">{cv.praticien.spécialité}</p>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">Non assigne</span>
        )
      ),
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (cv: ContreVisite) => (
        <div className="space-y-1">
          <Badge variant={STATUT_VARIANTS[cv.statut]}>
            {STATUT_LABELS[cv.statut]}
          </Badge>
          {cv.conclusion && (
            <p className="text-xs text-muted-foreground capitalize">
              {cv.conclusion.replace('_', ' ')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (cv: ContreVisite) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/sante/contre-visites/${cv.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {cv.statut === 'demandee' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/sante/contre-visites/${cv.id}/planifier`)}
            >
              <Calendar className="mr-1 h-4 w-4" />
              Planifier
            </Button>
          )}
          {['planifiée', 'en_attente', 'effectuée'].includes(cv.statut) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/sante/contre-visites/${cv.id}/rapport`)}
            >
              <FileText className="mr-1 h-4 w-4" />
              Rapport
            </Button>
          )}
          {cv.statut === 'rapport_soumis' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate(`/sante/contre-visites/${cv.id}/valider`)}
            >
              <ClipboardCheck className="mr-1 h-4 w-4" />
              Valider
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contre-visites"
        description="Gérer les demandes de contre-visite medicale"
      />

      <div className="flex gap-4">
        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="demandee">Demandee</SelectItem>
            <SelectItem value="planifiée">Planifiee</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="effectuée">Effectuée</SelectItem>
            <SelectItem value="rapport_soumis">Rapport soumis</SelectItem>
            <SelectItem value="validée">Validée</SelectItem>
            <SelectItem value="annulée">Annulée</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="Aucune contre-visite trouvée"
        pagination={
          data?.meta
            ? {
                page,
                limit: 20,
                total: data.meta.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />
    </div>
  );
}

export default SanteContreVisitesPage;
