import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, FileText, Building2, Shield, Eye, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

interface GroupContract {
  id: string;
  contract_number: string;
  company_id: string;
  company_name: string;
  insurer_name: string | null;
  intermediary: string | null;
  effective_date: string;
  expiry_date: string | null;
  global_ceiling: number | null;
  covered_risks: string | null;
  category: string | null;
  status: string;
  guarantees_count: number;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'default' }> = {
  active: { label: 'Actif', variant: 'success' },
  draft: { label: 'Brouillon', variant: 'secondary' },
  expired: { label: 'Expire', variant: 'destructive' },
  suspended: { label: 'Suspendu', variant: 'default' },
};

export function GroupContractsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['group-contracts', page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const response = await apiClient.get<GroupContract[]>(
        `/group-contracts?${params.toString()}`
      );
      if (!response.success) throw new Error(response.error?.message);
      const raw = response as unknown as { data: GroupContract[]; meta?: { total: number } };
      return { contracts: Array.isArray(raw.data) ? raw.data : [], total: raw.meta?.total || 0 };
    },
  });

  const activeCount = data?.contracts?.filter((c) => c.status === 'active').length || 0;
  const companiesCount = new Set(data?.contracts?.map((c) => c.company_id)).size || 0;

  const columns = [
    {
      key: 'contract_number',
      header: 'Numero contrat',
      render: (contract: GroupContract) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{contract.contract_number}</p>
            <p className="text-sm text-muted-foreground">
              {contract.category || '-'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Societe',
      render: (contract: GroupContract) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>{contract.company_name}</span>
        </div>
      ),
    },
    {
      key: 'insurer',
      header: 'Assureur',
      render: (contract: GroupContract) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span>{contract.insurer_name || '-'}</span>
        </div>
      ),
    },
    {
      key: 'effective_date',
      header: 'Date effet',
      render: (contract: GroupContract) =>
        contract.effective_date
          ? new Date(contract.effective_date).toLocaleDateString('fr-TN')
          : '-',
    },
    {
      key: 'status',
      header: 'Statut',
      render: (contract: GroupContract) => {
        const s = STATUS_LABELS[contract.status] || { label: contract.status, variant: 'secondary' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (contract: GroupContract) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" title="Voir" onClick={() => navigate(`/group-contracts/${contract.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Modifier" onClick={() => navigate(`/group-contracts/${contract.id}/edit`)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Contrats groupe"
          description="Gerer les contrats d'assurance groupe et leurs garanties"
        />
        <Button onClick={() => navigate('/group-contracts/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau contrat
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data?.total || 0}</p>
              <p className="text-sm text-muted-foreground">Total contrats</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Contrats actifs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Building2 className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{companiesCount}</p>
              <p className="text-sm text-muted-foreground">Societes couvertes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Statut :</label>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Tous</option>
          <option value="active">Actif</option>
          <option value="draft">Brouillon</option>
          <option value="expired">Expire</option>
          <option value="suspended">Suspendu</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.contracts || []}
        isLoading={isLoading}
        emptyMessage="Aucun contrat groupe trouve"
        pagination={
          data
            ? {
                page,
                limit: 20,
                total: data.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />
    </div>
  );
}

export default GroupContractsPage;
