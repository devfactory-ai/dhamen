import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, Filter, CreditCard, Clock, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { useAuth } from '@/features/auth/hooks/useAuth';
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

interface ClaimStats {
  total: number;
  pending: number;
  approved: number;
  totalAmount: number;
}

export function HRClaimsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  const { data: claims, isLoading } = useQuery({
    queryKey: ['hr-claims', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const response = await apiClient.get<{ data: Claim[] }>(`/companies/${user.companyId}/claims`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data || [];
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

  const stats: ClaimStats = {
    total: claims?.length || 0,
    pending: claims?.filter(c => c.status === 'PENDING').length || 0,
    approved: claims?.filter(c => c.status === 'APPROVED' || c.status === 'PAID').length || 0,
    totalAmount: claims?.reduce((sum, c) => sum + c.covered_amount, 0) || 0,
  };

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
          <p className="font-medium">{claim.covered_amount.toLocaleString()} TND</p>
          <p className="text-sm text-muted-foreground">sur {claim.amount.toLocaleString()} TND</p>
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
      <div className="flex items-center justify-between">
        <PageHeader
          title="Suivi des remboursements"
          description="Consultez les demandes de remboursement de vos salaries"
        />
        <Button variant="outline" onClick={handleExport} disabled={isExporting}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? 'Export...' : 'Exporter CSV'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total demandes</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Approuvés</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Montant total</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAmount.toLocaleString()} TND</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par adhérent, référence, praticien..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg bg-white"
        >
          <option value="all">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="APPROVED">Approuvé</option>
          <option value="PAID">Payé</option>
          <option value="REJECTED">Rejeté</option>
        </select>
      </div>

      {/* Claims Table */}
      <DataTable
        columns={columns}
        data={filteredClaims || []}
        isLoading={isLoading}
        emptyMessage="Aucune demande de remboursement"
      />
    </div>
    </NoEntrepriseGuard>
  );
}

export default HRClaimsPage;
