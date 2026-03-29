import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Building2, Users, Eye, Pencil, Search, X } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['companies', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const response = await apiClient.get<Company[]>(
        `/companies?${params}`
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
          {/* <Button variant="ghost" size="icon" title="Voir" onClick={() => navigate(`/companies/${company.id}`)}>
            <Eye className="h-4 w-4" />
          </Button> */}
          <Button variant="ghost" size="icon" title="Modifier" onClick={() => navigate(`/companies/${company.id}/edit`)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entreprises</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gérer les entreprises clientes et leurs RH
          </p>
        </div>
        <Button
          className="gap-2 bg-slate-900 hover:bg-[#19355d]"
          onClick={() => navigate("/companies/new")}
        >
          <Plus className="w-4 h-4" /> Nouvelle entreprise
        </Button>
      </div>

      {/* Filters bar + Total card */}
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="w-[18px] h-[18px] text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Rechercher par nom, matricule fiscale..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 text-white shadow-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
              Total Entreprises
            </p>
            <p className="text-2xl font-bold text-[30px]">
              {(data?.total || 0).toLocaleString("fr-TN")}
            </p>
          </div>
          <Building2 className="w-8 h-8 text-white ml-auto" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={data?.companies || []}
          isLoading={isLoading}
          emptyMessage="Aucune entreprise trouvée"
          onRowClick={(company) => navigate(`/companies/${company.id}`)}
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
    </div>
  );
}

export default CompaniesPage;
