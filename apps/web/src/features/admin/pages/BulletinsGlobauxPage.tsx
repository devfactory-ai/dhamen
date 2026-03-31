import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, RotateCcw, Eye, Filter } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api-client';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  scan_uploaded: 'Scanné',
  paper_received: 'Reçu',
  paper_incomplete: 'Incomplet',
  paper_complete: 'Complet',
  processing: 'En traitement',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  reimbursed: 'Remboursé',
  pending_payment: 'En paiement',
  submitted: 'Soumis',
  in_batch: 'Dans un lot',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  scan_uploaded: 'bg-blue-100 text-blue-700',
  paper_received: 'bg-blue-100 text-blue-700',
  processing: 'bg-amber-100 text-amber-700',
  paper_complete: 'bg-amber-100 text-amber-700',
  paper_incomplete: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  reimbursed: 'bg-purple-100 text-purple-700',
  pending_payment: 'bg-orange-100 text-orange-700',
  in_batch: 'bg-indigo-100 text-indigo-700',
};

const CARE_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consultation',
  pharmacy: 'Pharmacie',
  laboratory: 'Laboratoire',
  optical: 'Optique',
  dental: 'Dentaire',
  hospitalization: 'Hospitalisation',
  radiology: 'Radiologie',
  physiotherapy: 'Kinésithérapie',
};

interface BulletinRow {
  id: string;
  bulletinNumber: string;
  adherentName: string;
  adherentFirstName: string;
  adherentLastName: string;
  beneficiaryName: string;
  status: string;
  careDate: string;
  totalAmount: number;
  reimbursedAmount: number;
  agentName: string;
  careType: string;
}

interface BulletinsResponse {
  data: BulletinRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

const avatarColors = [
  'bg-blue-600',
  'bg-purple-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `${amount.toFixed(3)} TND`;
}

export function BulletinsGlobauxPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [careType, setCareType] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  if (search) queryParams.set('search', search);
  if (status) queryParams.set('status', status);
  if (dateFrom) queryParams.set('dateFrom', dateFrom);
  if (dateTo) queryParams.set('dateTo', dateTo);
  if (careType) queryParams.set('careType', careType);

  const { data, isLoading } = useQuery<BulletinsResponse>({
    queryKey: ['admin-bulletins', page, search, status, dateFrom, dateTo, careType],
    queryFn: async () => {
      const res = await apiClient.get<BulletinsResponse>(
        `/bulletins-soins/admin/all?${queryParams.toString()}`
      );
      if (!res.success) throw new Error(res.error?.message || 'Erreur de chargement');
      return res.data!;
    },
  });

  const bulletins: BulletinRow[] = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setCareType('');
    setPage(1);
  };

  const hasFilters = search || status || dateFrom || dateTo || careType;

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const exportParams = new URLSearchParams();
      if (search) exportParams.set('search', search);
      if (status) exportParams.set('status', status);
      if (dateFrom) exportParams.set('dateFrom', dateFrom);
      if (dateTo) exportParams.set('dateTo', dateTo);
      if (careType) exportParams.set('careType', careType);

      const res = await apiClient.get<Blob>(
        `/bulletins-soins/admin/export?${exportParams.toString()}`,
        { responseType: 'blob' }
      );

      const blob = res instanceof Blob ? res : new Blob([JSON.stringify(res)], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulletins-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Export error handled silently
    } finally {
      setIsExporting(false);
    }
  };

  const columns = [
    {
      key: 'bulletinNumber',
      header: 'N° Bulletin',
      render: (row: BulletinRow) => (
        <span className="text-blue-600 font-medium text-sm">{row.bulletinNumber || '—'}</span>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (row: BulletinRow) => {
        const firstName = row.adherentFirstName ?? '';
        const lastName = row.adherentLastName ?? '';
        const fullName = row.adherentName || `${firstName} ${lastName}`.trim();
        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(fullName)}`}
            >
              {getInitials(firstName || fullName.split(' ')[0] || '', lastName || fullName.split(' ')[1] || '')}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{fullName || '—'}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'beneficiary',
      header: 'Bénéficiaire',
      render: (row: BulletinRow) => (
        <span className="text-sm text-gray-700">{row.beneficiaryName || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: BulletinRow) => (
        <Badge
          variant="outline"
          className={STATUS_BADGE_COLORS[row.status] || 'bg-gray-100 text-gray-700'}
        >
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      key: 'careDate',
      header: 'Date soins',
      render: (row: BulletinRow) => (
        <span className="text-sm text-gray-600">{formatDate(row.careDate)}</span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Montant facturé',
      render: (row: BulletinRow) => (
        <span className="text-sm font-medium text-gray-900">{formatAmount(row.totalAmount)}</span>
      ),
    },
    {
      key: 'reimbursedAmount',
      header: 'Montant remboursé',
      render: (row: BulletinRow) => (
        <span className="text-sm font-medium text-emerald-700">{formatAmount(row.reimbursedAmount)}</span>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (row: BulletinRow) => (
        <span className="text-sm text-gray-600">{row.agentName || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: BulletinRow) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/admin/bulletins/${row.id}`)}
          title="Voir le détail"
        >
          <Eye className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Bulletins de soins"
          description="Vue globale de tous les bulletins de soins"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter CSV'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Rechercher par nom, matricule, numéro..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>

              {/* Status */}
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Tous les statuts</option>
                <option value="draft">Brouillon</option>
                <option value="submitted">Soumis</option>
                <option value="processing">En traitement</option>
                <option value="approved">Approuvé</option>
                <option value="rejected">Rejeté</option>
                <option value="reimbursed">Remboursé</option>
                <option value="in_batch">Dans un lot</option>
                <option value="pending_payment">En paiement</option>
              </select>

              {/* Care type */}
              <select
                value={careType}
                onChange={(e) => {
                  setCareType(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Tous les types de soins</option>
                {Object.entries(CARE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col sm:flex-row items-end gap-3">
              {/* Date from */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Date saisie (du)</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Date to */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Date saisie (au)</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex gap-2 ml-auto">
                {/* Reset */}
                {hasFilters && (
                  <Button variant="outline" onClick={resetFilters}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Réinitialiser
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      {hasFilters && !isLoading && (
        <p className="text-sm text-gray-500">
          {total} résultat(s) trouvé(s)
        </p>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={bulletins}
        isLoading={isLoading}
        emptyMessage="Aucun bulletin de soins trouvé"
        searchTerm={search}
        onClearSearch={() => {
          setSearch('');
          setPage(1);
        }}
        pagination={
          data?.meta
            ? {
                page,
                limit: 20,
                total,
                onPageChange: setPage,
              }
            : undefined
        }
      />
    </div>
  );
}

export default BulletinsGlobauxPage;
