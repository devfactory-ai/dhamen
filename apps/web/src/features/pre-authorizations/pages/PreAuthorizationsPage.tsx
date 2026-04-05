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
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
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
import { usePermissions } from '@/hooks/usePermissions';
import {
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  AlertTriangle,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  Search,
  Stethoscope,
  Plus,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';


const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export function PreAuthorizationsPage() {
  const { hasPermission } = usePermissions();
  const canApprove = hasPermission('claims', 'approve');
  const canReject = hasPermission('claims', 'reject');

  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<PreAuthFilters>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [careTypeDropdownOpen, setCareTypeDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const isAgent = ['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user?.role || '');

  const { data, isLoading } = usePreAuthorizations(page, 20, {
    ...filters,
    search: searchTerm || undefined,
    sortBy: 'created_at',
    sortOrder,
  } as PreAuthFilters & { sortBy: string; sortOrder: string });
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
      header: (
        <button
          onClick={() => { setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); setPage(1); }}
          className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
        >
          Demande
          {sortOrder === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </button>
      ),
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
      <FloatingHelp
        title="Aide - Accords préalables"
        subtitle="Comprendre les demandes d'autorisation"
        tips={[
          {
            icon: <Info className="h-4 w-4 text-blue-500" />,
            title: "Qu'est-ce qu'un accord préalable ?",
            desc: "C'est une autorisation demandée avant un acte coûteux (hospitalisation, chirurgie, IRM). L'assureur confirme la prise en charge avant l'intervention.",
          },
          {
            icon: <Clock className="h-4 w-4 text-amber-500" />,
            title: "Délai de réponse",
            desc: "Les demandes normales sont traitées sous 48-72h. Les urgences sont prioritaires et traitées dans la journée si soumises avant 14h.",
          },
          {
            icon: <ShieldCheck className="h-4 w-4 text-green-500" />,
            title: "Statuts de la demande",
            desc: "En attente -> En examen -> Approuvé/Rejeté. Une demande approuvée a une période de validité : l'acte doit être réalisé dans ce délai.",
          },
        ]}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Accords préalables"
          description="Gestion des demandes d'autorisation préalable"
        />
        {isAgent && (
          <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => navigate('/pre-authorizations/new')}>
            <Plus className="w-4 h-4" /> Nouvelle demande
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-4">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
              <Input
                placeholder="Rechercher par adhérent, numéro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <FilterDropdown
              label="Statut"
              value={filters.status ? getPreAuthStatusLabel(filters.status) : 'Tous les statuts'}
              open={statusDropdownOpen}
              onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
              onClose={() => setStatusDropdownOpen(false)}
              menuWidth="w-52"
            >
              <FilterOption selected={!filters.status} onClick={() => { setFilters((prev) => ({ ...prev, status: undefined })); setStatusDropdownOpen(false); }}>
                Tous les statuts
              </FilterOption>
              <FilterOption selected={filters.status === 'draft'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'draft' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Brouillon
              </FilterOption>
              <FilterOption selected={filters.status === 'pending'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'pending' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                En attente
              </FilterOption>
              <FilterOption selected={filters.status === 'under_review'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'under_review' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                En cours d'examen
              </FilterOption>
              <FilterOption selected={filters.status === 'additional_info'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'additional_info' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Info demandée
              </FilterOption>
              <FilterOption selected={filters.status === 'medical_review'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'medical_review' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Revue médicale
              </FilterOption>
              <FilterOption selected={filters.status === 'approved'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'approved' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Approuvé
              </FilterOption>
              <FilterOption selected={filters.status === 'partially_approved'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'partially_approved' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Partiellement approuvé
              </FilterOption>
              <FilterOption selected={filters.status === 'rejected'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'rejected' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Rejeté
              </FilterOption>
              <FilterOption selected={filters.status === 'expired'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'expired' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Expiré
              </FilterOption>
              <FilterOption selected={filters.status === 'cancelled'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'cancelled' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Annulé
              </FilterOption>
              <FilterOption selected={filters.status === 'used'} onClick={() => { setFilters((prev) => ({ ...prev, status: 'used' as PreAuthFilters['status'] })); setStatusDropdownOpen(false); }}>
                Utilisé
              </FilterOption>
            </FilterDropdown>

            <FilterDropdown
              label="Type"
              value={filters.careType ? getCareTypeLabel(filters.careType) : 'Tous les types'}
              open={careTypeDropdownOpen}
              onToggle={() => setCareTypeDropdownOpen(!careTypeDropdownOpen)}
              onClose={() => setCareTypeDropdownOpen(false)}
              menuWidth="w-48"
            >
              <FilterOption selected={!filters.careType} onClick={() => { setFilters((prev) => ({ ...prev, careType: undefined })); setCareTypeDropdownOpen(false); }}>
                Tous les types
              </FilterOption>
              <FilterOption selected={filters.careType === 'hospitalization'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'hospitalization' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Hospitalisation
              </FilterOption>
              <FilterOption selected={filters.careType === 'surgery'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'surgery' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Chirurgie
              </FilterOption>
              <FilterOption selected={filters.careType === 'mri'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'mri' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                IRM
              </FilterOption>
              <FilterOption selected={filters.careType === 'scanner'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'scanner' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Scanner
              </FilterOption>
              <FilterOption selected={filters.careType === 'specialized_exam'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'specialized_exam' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Examen spécialisé
              </FilterOption>
              <FilterOption selected={filters.careType === 'dental_prosthesis'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'dental_prosthesis' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Prothèse dentaire
              </FilterOption>
              <FilterOption selected={filters.careType === 'optical'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'optical' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Optique
              </FilterOption>
              <FilterOption selected={filters.careType === 'physical_therapy'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'physical_therapy' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Kinésithérapie
              </FilterOption>
              <FilterOption selected={filters.careType === 'chronic_treatment'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'chronic_treatment' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Traitement chronique
              </FilterOption>
              <FilterOption selected={filters.careType === 'expensive_medication'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'expensive_medication' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Médicament coûteux
              </FilterOption>
              <FilterOption selected={filters.careType === 'other'} onClick={() => { setFilters((prev) => ({ ...prev, careType: 'other' as PreAuthFilters['careType'] })); setCareTypeDropdownOpen(false); }}>
                Autre
              </FilterOption>
            </FilterDropdown>

            <FilterDropdown
              label="Priorité"
              value={filters.priority === 'urgent' ? 'Urgent' : filters.priority === 'high' ? 'Haute' : filters.priority === 'normal' ? 'Normale' : filters.priority === 'low' ? 'Basse' : 'Toutes priorités'}
              open={priorityDropdownOpen}
              onToggle={() => setPriorityDropdownOpen(!priorityDropdownOpen)}
              onClose={() => setPriorityDropdownOpen(false)}
              menuWidth="w-48"
            >
              <FilterOption selected={!filters.priority} onClick={() => { setFilters((prev) => ({ ...prev, priority: undefined })); setPriorityDropdownOpen(false); }}>
                Toutes priorités
              </FilterOption>
              <FilterOption selected={filters.priority === 'urgent'} onClick={() => { setFilters((prev) => ({ ...prev, priority: 'urgent' })); setPriorityDropdownOpen(false); }}>
                Urgent
              </FilterOption>
              <FilterOption selected={filters.priority === 'high'} onClick={() => { setFilters((prev) => ({ ...prev, priority: 'high' })); setPriorityDropdownOpen(false); }}>
                Haute
              </FilterOption>
              <FilterOption selected={filters.priority === 'normal'} onClick={() => { setFilters((prev) => ({ ...prev, priority: 'normal' })); setPriorityDropdownOpen(false); }}>
                Normale
              </FilterOption>
              <FilterOption selected={filters.priority === 'low'} onClick={() => { setFilters((prev) => ({ ...prev, priority: 'low' })); setPriorityDropdownOpen(false); }}>
                Basse
              </FilterOption>
            </FilterDropdown>

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
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
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
    </div>
  );
}
