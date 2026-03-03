/**
 * Pre-Authorizations Page
 * List and manage prior authorization requests (accord préalable)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  usePreAuthorizations,
  usePreAuthStats,
  type PreAuthorization,
  type PreAuthFilters,
  getCareTypeLabel,
  getPreAuthStatusLabel,
  getPreAuthStatusVariant,
} from '../hooks/usePreAuthorizations';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  AlertTriangle,
  ArrowUpRight,
  Search,
  Stethoscope,
  Plus,
} from 'lucide-react';

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export function PreAuthorizationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<PreAuthFilters>({});
  const [searchTerm, setSearchTerm] = useState('');

  const isAgent = ['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user?.role || '');

  const { data, isLoading } = usePreAuthorizations(page, 20, {
    ...filters,
    search: searchTerm || undefined,
  });
  const { data: stats } = usePreAuthStats();

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const columns = [
    {
      key: 'preauth',
      header: 'Demande',
      render: (preAuth: PreAuthorization) => (
        <div>
          <p className="font-medium">
            {preAuth.authorization_number || preAuth.id.slice(0, 8)}
          </p>
          <p className="text-muted-foreground text-sm">
            {formatDate(preAuth.submitted_at || preAuth.created_at)}
          </p>
          {preAuth.is_emergency === 1 && (
            <Badge variant="destructive" className="mt-1">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Urgence
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (preAuth: PreAuthorization) => (
        <div>
          <p className="text-sm">{preAuth.adherent_name || '-'}</p>
          <p className="text-muted-foreground text-xs">{preAuth.adherent_number || '-'}</p>
        </div>
      ),
    },
    {
      key: 'care_type',
      header: 'Type de soin',
      render: (preAuth: PreAuthorization) => (
        <div>
          <p className="text-sm">{getCareTypeLabel(preAuth.care_type)}</p>
          <p className="text-muted-foreground text-xs line-clamp-1">
            {preAuth.procedure_description}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (preAuth: PreAuthorization) => (
        <div className="text-right">
          <p className="text-sm">{formatAmount(preAuth.estimated_amount)}</p>
          {preAuth.approved_amount !== null && (
            <p className="text-muted-foreground text-xs">
              Approuvé: {formatAmount(preAuth.approved_amount)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priorité',
      render: (preAuth: PreAuthorization) => (
        <span
          className={`rounded-full px-2 py-1 font-medium text-xs ${PRIORITY_COLORS[preAuth.priority]}`}
        >
          {preAuth.priority === 'urgent'
            ? 'Urgent'
            : preAuth.priority === 'high'
              ? 'Haute'
              : preAuth.priority === 'normal'
                ? 'Normale'
                : 'Basse'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (preAuth: PreAuthorization) => (
        <Badge variant={getPreAuthStatusVariant(preAuth.status)}>
          {getPreAuthStatusLabel(preAuth.status)}
        </Badge>
      ),
    },
    {
      key: 'validity',
      header: 'Validité',
      render: (preAuth: PreAuthorization) => (
        <div className="text-sm">
          {preAuth.validity_start_date && preAuth.validity_end_date ? (
            <>
              <p>{formatDate(preAuth.validity_start_date)}</p>
              <p className="text-muted-foreground text-xs">
                au {formatDate(preAuth.validity_end_date)}
              </p>
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'reviewer',
      header: 'Gestionnaire',
      render: (preAuth: PreAuthorization) => (
        <span className="text-sm">{preAuth.reviewer_name || 'Non assigné'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (preAuth: PreAuthorization) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/pre-authorizations/${preAuth.id}`)}
        >
          Voir
          <ArrowUpRight className="ml-1 h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Accords préalables"
          description="Gestion des demandes d'autorisation préalable"
        />
        {isAgent && (
          <Button onClick={() => navigate('/pre-authorizations/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle demande
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">En attente</CardTitle>
              <Clock className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {(stats.overview.pending || 0) + (stats.overview.under_review || 0)}
              </div>
              <p className="text-muted-foreground text-xs">
                dont {stats.overview.urgent_count || 0} urgents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Info demandée</CardTitle>
              <FileText className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stats.overview.additional_info || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Revue médicale</CardTitle>
              <Stethoscope className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stats.overview.medical_review || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Approuvés</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {(stats.overview.approved || 0) + (stats.overview.partially_approved || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Rejetés</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stats.overview.rejected || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Utilisés</CardTitle>
              <CheckCircle className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stats.overview.used || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
              <Input
                placeholder="Rechercher par adhérent, numéro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select
              value={filters.status || ''}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, status: (value || undefined) as PreAuthFilters['status'] }))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="under_review">En cours d'examen</SelectItem>
                <SelectItem value="additional_info">Info demandée</SelectItem>
                <SelectItem value="medical_review">Revue médicale</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="partially_approved">Partiellement approuvé</SelectItem>
                <SelectItem value="rejected">Rejeté</SelectItem>
                <SelectItem value="expired">Expiré</SelectItem>
                <SelectItem value="cancelled">Annulé</SelectItem>
                <SelectItem value="used">Utilisé</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.careType || ''}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, careType: (value || undefined) as PreAuthFilters['careType'] }))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous les types</SelectItem>
                <SelectItem value="hospitalization">Hospitalisation</SelectItem>
                <SelectItem value="surgery">Chirurgie</SelectItem>
                <SelectItem value="mri">IRM</SelectItem>
                <SelectItem value="scanner">Scanner</SelectItem>
                <SelectItem value="specialized_exam">Examen spécialisé</SelectItem>
                <SelectItem value="dental_prosthesis">Prothèse dentaire</SelectItem>
                <SelectItem value="optical">Optique</SelectItem>
                <SelectItem value="physical_therapy">Kinésithérapie</SelectItem>
                <SelectItem value="chronic_treatment">Traitement chronique</SelectItem>
                <SelectItem value="expensive_medication">Médicament coûteux</SelectItem>
                <SelectItem value="other">Autre</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.priority || ''}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, priority: value || undefined }))
              }
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Toutes priorités" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Toutes priorités</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="normal">Normale</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
              </SelectContent>
            </Select>

            {Object.keys(filters).some((k) => filters[k as keyof PreAuthFilters]) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({});
                  setSearchTerm('');
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data?.data || []}
        isLoading={isLoading}
        pagination={{
          page,
          limit: 20,
          total: data?.meta.total || 0,
          onPageChange: setPage,
        }}
        emptyMessage="Aucune demande d'accord préalable trouvée"
      />
    </div>
  );
}
