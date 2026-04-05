/**
 * Appeals Page
 * List and manage claim appeals (recours)
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
  useAppeals,
  useAppealStats,
  type Appeal,
  type AppealFilters,
  getAppealReasonLabel,
  getAppealStatusLabel,
  getAppealStatusVariant,
} from '../hooks/useAppeals';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  FileQuestion,
  ArrowUpRight,
  Search,
  Filter,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export function AppealsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AppealFilters>({});
  const [searchTerm, setSearchTerm] = useState('');

  const isAgent = ['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user?.role || '');

  const { data, isLoading } = useAppeals(page, 20, {
    ...filters,
    search: searchTerm || undefined,
  });
  const { data: stats } = useAppealStats();

  const formatDate = (dateString: string) => {
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
    }).format(amount / 1000);
  };

  const columns = [
    {
      key: 'appeal',
      header: 'Recours',
      render: (appeal: Appeal) => (
        <div>
          <p className="font-medium">{appeal.claim_reference || appeal.id.slice(0, 8)}</p>
          <p className="text-muted-foreground text-sm">{formatDate(appeal.submitted_at)}</p>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (appeal: Appeal) => (
        <div>
          <p className="text-sm">{appeal.adherent_name || '-'}</p>
          <p className="text-muted-foreground text-xs">{appeal.adherent_number || '-'}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Motif',
      render: (appeal: Appeal) => (
        <span className="text-sm">{getAppealReasonLabel(appeal.reason)}</span>
      ),
    },
    {
      key: 'priority',
      header: 'Priorité',
      render: (appeal: Appeal) => (
        <span
          className={`rounded-full px-2 py-1 font-medium text-xs ${PRIORITY_COLORS[appeal.priority]}`}
        >
          {appeal.priority === 'urgent'
            ? 'Urgent'
            : appeal.priority === 'high'
              ? 'Haute'
              : appeal.priority === 'normal'
                ? 'Normale'
                : 'Basse'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (appeal: Appeal) => (
        <Badge variant={getAppealStatusVariant(appeal.status)}>
          {getAppealStatusLabel(appeal.status)}
        </Badge>
      ),
    },
    {
      key: 'reviewer',
      header: 'Gestionnaire',
      render: (appeal: Appeal) => (
        <span className="text-sm">{appeal.reviewer_name || 'Non assigné'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (appeal: Appeal) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/appeals/${appeal.id}`)}>
          Voir
          <ArrowUpRight className="ml-1 h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recours"
        description="Gestion des contestations et recours sur les sinistres"
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">En attente</CardTitle>
              <Clock className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {(stats.overview.submitted || 0) + (stats.overview.under_review || 0)}
              </div>
              <p className="text-muted-foreground text-xs">
                dont {stats.overview.urgent_count || 0} urgents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Info demandée</CardTitle>
              <FileQuestion className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {stats.overview.additional_info_requested || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Escaladés</CardTitle>
              <AlertCircle className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stats.overview.escalated || 0}</div>
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
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
              <Input
                placeholder="Rechercher par adhérent, référence..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select
              value={filters.status || ''}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, status: value || undefined }))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous les statuts</SelectItem>
                <SelectItem value="submitted">Soumis</SelectItem>
                <SelectItem value="under_review">En cours d'examen</SelectItem>
                <SelectItem value="additional_info_requested">Info demandée</SelectItem>
                <SelectItem value="escalated">Escaladé</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="partially_approved">Partiellement approuvé</SelectItem>
                <SelectItem value="rejected">Rejeté</SelectItem>
                <SelectItem value="withdrawn">Retiré</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.reason || ''}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, reason: value || undefined }))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les motifs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous les motifs</SelectItem>
                <SelectItem value="coverage_dispute">Contestation couverture</SelectItem>
                <SelectItem value="amount_dispute">Contestation montant</SelectItem>
                <SelectItem value="rejection_dispute">Contestation rejet</SelectItem>
                <SelectItem value="document_missing">Documents manquants</SelectItem>
                <SelectItem value="calculation_error">Erreur de calcul</SelectItem>
                <SelectItem value="medical_necessity">Nécessité médicale</SelectItem>
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

            {Object.keys(filters).some((k) => filters[k as keyof AppealFilters]) && (
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
          totalPages: data?.meta.totalPages || 1,
          total: data?.meta.total || 0,
          onPageChange: setPage,
        }}
        emptyMessage="Aucun recours trouvé"
      />

      <FloatingHelp
        title="Gestion des recours"
        tips={[
          { icon: <Search className="h-4 w-4 text-blue-500" />, title: "Recherche", desc: "Recherchez un recours par nom d'adhérent ou référence de sinistre." },
          { icon: <Filter className="h-4 w-4 text-purple-500" />, title: "Filtres", desc: "Filtrez par statut, motif de contestation ou niveau de priorité." },
          { icon: <Clock className="h-4 w-4 text-amber-500" />, title: "Priorité", desc: "Les recours urgents sont signalés en rouge et doivent être traités en priorité." },
          { icon: <ArrowUpRight className="h-4 w-4 text-green-500" />, title: "Consulter un recours", desc: "Cliquez sur 'Voir' pour accéder au détail du recours et le traiter." },
        ]}
      />
    </div>
  );
}
