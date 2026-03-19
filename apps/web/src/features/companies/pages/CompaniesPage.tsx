import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Building2, Users, FileText, Eye, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

interface Company {
  id: string;
  name: string;
  code: string | null;
  matricule_fiscal: string | null;
  contract_number: string | null;
  date_ouverture: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  sector: string | null;
  employee_count: number | null;
  insurer_id: string | null;
  is_active: number;
  created_at: string;
}

const SECTOR_LABELS: Record<string, string> = {
  IT: 'Informatique',
  BANKING: 'Banque',
  HEALTHCARE: 'Sante',
  MANUFACTURING: 'Industrie',
  RETAIL: 'Commerce',
  SERVICES: 'Services',
  OTHER: 'Autre',
};

export function CompaniesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['companies', page],
    queryFn: async () => {
      const response = await apiClient.get<Company[]>(
        `/companies?page=${page}&limit=20`
      );
      if (!response.success) throw new Error(response.error?.message);
      const raw = response as unknown as { data: Company[]; meta?: { total: number } };
      return { companies: Array.isArray(raw.data) ? raw.data : [], total: raw.meta?.total || 0 };
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Entreprise',
      render: (company: Company) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{company.name}</p>
            <p className="text-sm text-muted-foreground">
              {[company.code, company.matricule_fiscal ? `MF: ${company.matricule_fiscal}` : null].filter(Boolean).join(' - ') || '-'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'sector',
      header: 'Secteur',
      render: (company: Company) => (
        <Badge variant="secondary">
          {company.sector ? SECTOR_LABELS[company.sector] || company.sector : '-'}
        </Badge>
      ),
    },
    {
      key: 'city',
      header: 'Ville',
      render: (company: Company) => company.city || '-',
    },
    {
      key: 'employees',
      header: 'Effectif',
      render: (company: Company) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{company.employee_count || '-'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (company: Company) => (
        <Badge variant={company.is_active ? 'success' : 'destructive'}>
          {company.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (company: Company) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" title="Voir" onClick={() => navigate(`/companies/${company.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Modifier" onClick={() => navigate(`/companies/${company.id}/edit`)}>
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
          title="Entreprises"
          description="Gérer les entreprises clientes et leurs RH"
        />
        <Button onClick={() => navigate('/companies/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle entreprise
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data?.total || 0}</p>
              <p className="text-sm text-muted-foreground">Entreprises</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">-</p>
              <p className="text-sm text-muted-foreground">Utilisateurs RH</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">-</p>
              <p className="text-sm text-muted-foreground">Contrats groupe</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={data?.companies || []}
        isLoading={isLoading}
        emptyMessage="Aucune entreprise trouvée"
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

export default CompaniesPage;
