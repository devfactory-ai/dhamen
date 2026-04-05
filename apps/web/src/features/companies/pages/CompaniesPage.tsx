import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Users, Eye, Pencil, Search, X, Trash2, FileText, Link2 } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/usePermissions';

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
  real_adherent_count?: number;
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
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('companies', 'read');
  const canCreate = hasPermission('companies', 'create');
  const canUpdate = hasPermission('companies', 'update');
  const canDelete = hasPermission('companies', 'delete');

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<Company | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

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

  const companies: Company[] = data?.companies ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === companies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(companies.map((c) => c.id)));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<{ id: string; deleted: boolean }>(
        `/companies/${id}`
      );
      if (!response.success) throw new Error(response.error?.message || 'Erreur lors de la suppression');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setDeleteConfirm(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const response = await apiClient.delete<{ id: string; deleted: boolean }>(
          `/companies/${id}`
        );
        if (!response.success) throw new Error(response.error?.message || 'Erreur lors de la suppression');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    },
  });

  const columns = [
    ...(canDelete ? [{
      key: 'select',
      header: companies.length > 0 ? (
        <input
          type="checkbox"
          checked={selectedIds.size === companies.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ) : null,
      render: (company: Company) => (
        <input
          type="checkbox"
          checked={selectedIds.has(company.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); toggleSelect(company.id); }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    }] : []),
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
          <span>{company.real_adherent_count ?? company.employee_count ?? '-'}</span>
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
          {canUpdate && (
            <Button variant="ghost" size="icon" title="Modifier" onClick={() => navigate(`/companies/${company.id}/edit`)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              title="Supprimer"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDeleteConfirm(company); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Accès refusé</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter les entreprises.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FloatingHelp
        title="Aide - Entreprises"
        subtitle="Gestion des entreprises clientes"
        tips={[
          {
            icon: <Link2 className="h-4 w-4 text-blue-500" />,
            title: "Lien entreprise-contrat",
            desc: "Chaque entreprise est rattachée à un contrat groupe. C'est ce contrat qui définit les garanties et plafonds pour tous les salariés.",
          },
          {
            icon: <FileText className="h-4 w-4 text-green-500" />,
            title: "Matricule fiscal (MF)",
            desc: "Le matricule fiscal est l'identifiant unique de l'entreprise auprès de l'administration tunisienne. Il est vérifié automatiquement.",
          },
          {
            icon: <Users className="h-4 w-4 text-purple-500" />,
            title: "Gestion RH",
            desc: "Chaque entreprise peut avoir un utilisateur RH qui gère ses adhérents, consulte les contrats et suit les remboursements.",
          },
        ]}
      />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entreprises</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gérer les entreprises clientes et leurs RH
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleteMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer ({selectedIds.size})
            </Button>
          )}
          {canCreate && (
            <Button
              className="gap-2 bg-slate-900 hover:bg-[#19355d]"
              onClick={() => navigate("/companies/new")}
            >
              <Plus className="w-4 h-4" /> Nouvelle entreprise
            </Button>
          )}
        </div>
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
        <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 py-4 md:py-0 text-white shadow-sm shrink-0">
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

      {/* Single delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 !mt-0">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Confirmer la suppression</h3>
            <p className="mt-2 text-sm text-gray-600">
              Êtes-vous sûr de vouloir supprimer l'entreprise <strong>{deleteConfirm.name}</strong> ? Cette action est irréversible.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteMutation.isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 !mt-0">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Suppression en masse</h3>
            <p className="mt-2 text-sm text-gray-600">
              Êtes-vous sûr de vouloir supprimer <strong>{selectedIds.size}</strong> entreprise(s) ? Cette action est irréversible.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleteMutation.isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompaniesPage;
