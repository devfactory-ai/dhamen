import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, CreditCard, Clock, CheckCircle, XCircle, Search, Filter, Eye } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { apiClient } from '@/lib/api-client';
import { toCSV, downloadCSV, type ExportColumn } from '@/lib/export-utils';
import { useToast } from '@/stores/toast';
import { NoEntrepriseGuard } from '../components/NoEntrepriseGuard';

interface Claim {
  id: string;
  reference: string;
  adherent_name: string;
  adherent_id: string;
  type: string;
  provider_name: string;
  amount: number;
  covered_amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  created_at: string;
  processed_at: string | null;
}

interface CompanyStats {
  totalAdherents: number;
  activeContracts: number;
  totalClaims: number;
  pendingClaims: number;
  totalReimbursed: number;
}

function formatAmount(amount: number): string {
  return (amount / 1000).toFixed(3) + ' TND';
}

export function HRClaimsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('claims', 'read');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: claims, isLoading } = useQuery({
    queryKey: ['hr-claims', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const response = await apiClient.get<Claim[]>(`/companies/${user.companyId}/claims`);
      if (!response.success) throw new Error(response.error?.message);
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!user?.companyId,
  });

  const { data: companyStats } = useQuery({
    queryKey: ['hr-company-stats', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return null;
      const response = await apiClient.get<CompanyStats>(`/companies/${user.companyId}/stats`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!user?.companyId,
  });

  const filteredClaims = claims?.filter((claim) => {
    const matchesSearch = !searchTerm ||
      claim.adherent_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      claim.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      claim.provider_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || claim.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredTotal = filteredClaims?.length ?? 0;
  const paginatedClaims = filteredClaims?.slice((page - 1) * pageSize, page * pageSize) ?? [];

  const getStatusBadge = (status: Claim['status']) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning"><Clock className="mr-1 h-3 w-3" />En attente</Badge>;
      case 'APPROVED':
        return <Badge variant="success"><CheckCircle className="mr-1 h-3 w-3" />Approuvé</Badge>;
      case 'PAID':
        return <Badge variant="success"><CreditCard className="mr-1 h-3 w-3" />Payé</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejeté</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const exportColumns: ExportColumn<Claim>[] = [
    { key: 'reference', header: 'Référence' },
    { key: 'adherent_name', header: 'Adhérent' },
    { key: 'type', header: 'Type' },
    { key: 'provider_name', header: 'Praticien' },
    { key: 'amount', header: 'Montant' },
    { key: 'covered_amount', header: 'Montant couvert' },
    { key: 'status', header: 'Statut' },
    { key: 'created_at', header: 'Date' },
  ];

  const handleExport = () => {
    if (!claims?.length) {
      toast({ title: 'Aucune donnée à exporter', variant: 'destructive' });
      return;
    }
    setIsExporting(true);
    try {
      const csv = toCSV(claims, exportColumns);
      downloadCSV(csv, 'remboursements-entreprise');
      toast({ title: `${claims.length} remboursements exportés`, variant: 'success' });
    } catch {
      toast({ title: "Erreur lors de l'export", variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const columns = [
    {
      key: 'reference',
      header: 'Référence',
      render: (claim: Claim) => (
        <div>
          <p className="font-medium font-mono">{claim.reference}</p>
          <p className="text-sm text-muted-foreground">{claim.type}</p>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (claim: Claim) => claim.adherent_name,
    },
    {
      key: 'provider',
      header: 'Praticien',
      render: (claim: Claim) => claim.provider_name,
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (claim: Claim) => (
        <div>
          <p className="font-medium">{formatAmount(claim.covered_amount)}</p>
          <p className="text-sm text-muted-foreground">sur {formatAmount(claim.amount)}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (claim: Claim) => new Date(claim.created_at).toLocaleDateString('fr-TN'),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (claim: Claim) => getStatusBadge(claim.status),
    },
  ];

  return (
    <NoEntrepriseGuard>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <PageHeader
          title="Suivi des remboursements"
          description="Consultez les demandes de remboursement de vos salaries"
        />
        {canRead && (
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter CSV'}
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total demandes</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companyStats?.totalClaims ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{companyStats?.pendingClaims ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Approuvés</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{(companyStats?.totalClaims ?? 0) - (companyStats?.pendingClaims ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total remboursé</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companyStats?.totalReimbursed ? formatAmount(companyStats.totalReimbursed) : '0 TND'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters bar + Total card */}
      <div className="flex flex-col lg:flex-row items-stretch gap-4">
        {/* Filters */}
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Rechercher par adhérent, référence, praticien..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
              {searchTerm && (
                <button type="button" onClick={() => { setSearchTerm(""); setPage(1); }} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Statut dropdown */}
            <FilterDropdown
              label="Statut"
              value={statusFilter === "all" ? "Tous" : statusFilter === "PENDING" ? "En attente" : statusFilter === "APPROVED" ? "Approuvé" : statusFilter === "PAID" ? "Payé" : "Rejeté"}
              open={statusDropdownOpen}
              onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
              onClose={() => setStatusDropdownOpen(false)}
            >
              {([
                { value: "all" as const, label: "Tous", color: null },
                { value: "PENDING" as const, label: "En attente", color: "bg-amber-400" },
                { value: "APPROVED" as const, label: "Approuvé", color: "bg-emerald-500" },
                { value: "PAID" as const, label: "Payé", color: "bg-blue-500" },
                { value: "REJECTED" as const, label: "Rejeté", color: "bg-red-400" },
              ]).map((opt) => (
                <FilterOption
                  key={opt.value}
                  selected={statusFilter === opt.value}
                  onClick={() => { setStatusFilter(opt.value); setStatusDropdownOpen(false); setPage(1); }}
                  color={opt.color ?? undefined}
                >
                  {opt.label}
                </FilterOption>
              ))}
            </FilterDropdown>
          </div>
        </div>

        {/* Total card */}
        <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 py-4 lg:py-0 text-white shadow-sm shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
              Total Demandes
            </p>
            <p className="text-2xl font-bold">
              {(companyStats?.totalClaims ?? 0).toLocaleString("fr-TN")}
            </p>
          </div>
          <CreditCard className="w-8 h-8 text-white ml-auto" />
        </div>
      </div>

      {/* Claims Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={paginatedClaims}
          isLoading={isLoading}
          emptyMessage="Aucune demande de remboursement"
          pagination={{
            page,
            limit: pageSize,
            total: filteredTotal,
            onPageChange: setPage,
          }}
        />
      </div>
    </div>
    <FloatingHelp
      title="Suivi des remboursements"
      tips={[
        { icon: <Search className="h-4 w-4 text-blue-500" />, title: "Recherche", desc: "Recherchez par adhérent, référence ou praticien." },
        { icon: <Filter className="h-4 w-4 text-purple-500" />, title: "Filtres", desc: "Filtrez par statut : en attente, approuvé, payé ou rejeté." },
        { icon: <CreditCard className="h-4 w-4 text-green-500" />, title: "Montants", desc: "Consultez le montant couvert et le total pour chaque demande." },
        { icon: <Download className="h-4 w-4 text-orange-500" />, title: "Export", desc: "Exportez les remboursements au format CSV pour vos rapports." },
      ]}
    />
    </NoEntrepriseGuard>
  );
}

export default HRClaimsPage;
