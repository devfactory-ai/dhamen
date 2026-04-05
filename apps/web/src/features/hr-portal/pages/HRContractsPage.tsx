import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Calendar, Shield, Users, Eye, Clock } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { apiClient } from '@/lib/api-client';
import { NoEntrepriseGuard } from '../components/NoEntrepriseGuard';

interface Contract {
  id: string;
  contract_number: string;
  type: string;
  start_date: string;
  end_date: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  insurer_name: string;
  employee_count: number;
  monthly_premium: number;
  coverage_details: string | null;
}

interface ContractStats {
  activeContracts: number;
  totalEmployees: number;
  monthlyPremium: number;
}

export function HRContractsPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('contracts', 'read');

  const { data: contracts, isLoading } = useQuery({
    queryKey: ['hr-contracts', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const response = await apiClient.get<{ data: Contract[] }>(`/companies/${user.companyId}/contracts`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data || [];
    },
    enabled: !!user?.companyId,
  });

  const stats: ContractStats = {
    activeContracts: contracts?.filter(c => c.status === 'ACTIVE').length || 0,
    totalEmployees: contracts?.reduce((sum, c) => sum + c.employee_count, 0) || 0,
    monthlyPremium: contracts?.reduce((sum, c) => sum + c.monthly_premium, 0) || 0,
  };

  const getStatusBadge = (status: Contract['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Actif</Badge>;
      case 'SUSPENDED':
        return <Badge variant="warning">Suspendu</Badge>;
      case 'EXPIRED':
        return <Badge variant="destructive">Expiré</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const columns = [
    {
      key: 'contract_number',
      header: 'N° Contrat',
      render: (contract: Contract) => (
        <div>
          <p className="font-medium">{contract.contract_number}</p>
          <p className="text-sm text-muted-foreground">{contract.type}</p>
        </div>
      ),
    },
    {
      key: 'insurer',
      header: 'Assureur',
      render: (contract: Contract) => contract.insurer_name,
    },
    {
      key: 'dates',
      header: 'Période',
      render: (contract: Contract) => (
        <div className="text-sm">
          <p>Du {new Date(contract.start_date).toLocaleDateString('fr-TN')}</p>
          {contract.end_date && (
            <p className="text-muted-foreground">
              Au {new Date(contract.end_date).toLocaleDateString('fr-TN')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'employees',
      header: 'Effectif',
      render: (contract: Contract) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{contract.employee_count}</span>
        </div>
      ),
    },
    {
      key: 'premium',
      header: 'Prime mensuelle',
      render: (contract: Contract) => (
        <span className="font-medium">{contract.monthly_premium.toLocaleString()} TND</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (contract: Contract) => getStatusBadge(contract.status),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (contract: Contract) => canRead ? (
        <Button variant="ghost" size="sm">
          <Download className="mr-2 h-4 w-4" />
          PDF
        </Button>
      ) : null,
    },
  ];

  return (
    <NoEntrepriseGuard>
    <div className="space-y-6">
      <PageHeader
        title="Contrats d'assurance"
        description="Consultez les contrats groupe de votre entreprise"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Contrats actifs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeContracts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Salariés couverts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Prime totale/mois</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.monthlyPremium.toLocaleString()} TND</div>
          </CardContent>
        </Card>
      </div>

      {/* Contracts Table */}
      <DataTable
        columns={columns}
        data={contracts || []}
        isLoading={isLoading}
        emptyMessage="Aucun contrat trouvé"
      />
    </div>
    <FloatingHelp
      title="Contrats d'assurance"
      tips={[
        { icon: <FileText className="h-4 w-4 text-blue-500" />, title: "Détails contrat", desc: "Consultez le numéro, l'assureur et la période de chaque contrat." },
        { icon: <Users className="h-4 w-4 text-green-500" />, title: "Effectif", desc: "Vérifiez le nombre de salariés couverts par contrat." },
        { icon: <Shield className="h-4 w-4 text-purple-500" />, title: "Statut", desc: "Les contrats peuvent être actifs, suspendus ou expirés." },
        { icon: <Clock className="h-4 w-4 text-orange-500" />, title: "Renouvellement", desc: "Surveillez les dates d'expiration pour anticiper les renouvellements." },
      ]}
    />
    </NoEntrepriseGuard>
  );
}

export default HRContractsPage;
