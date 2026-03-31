import { useQuery } from '@tanstack/react-query';
import { Users, FileText, CreditCard, TrendingUp, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { useNavigate } from 'react-router-dom';
import { NoEntrepriseGuard } from '../components/NoEntrepriseGuard';

interface CompanyStats {
  totalAdherents: number;
  activeContracts: number;
  totalClaims: number;
  pendingClaims: number;
}

interface Company {
  id: string;
  name: string;
  matricule_fiscal: string | null;
  employee_count: number | null;
}

export function HRDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['hr-company', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return null;
      const response = await apiClient.get<{ data: Company }>(`/companies/${user.companyId}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data;
    },
    enabled: !!user?.companyId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['hr-company-stats', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return null;
      const response = await apiClient.get<{ data: CompanyStats }>(`/companies/${user.companyId}/stats`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data;
    },
    enabled: !!user?.companyId,
  });

  const isLoading = companyLoading || statsLoading;

  return (
    <NoEntrepriseGuard>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Bienvenue, ${user?.firstName || 'RH'}`}
          description={company?.name || 'Gestion des adhérents de votre entreprise'}
        />
        <Button onClick={() => navigate('/hr/adherents/new')}>
          <UserPlus className="mr-2 h-4 w-4" />
          Ajouter un adhérent
        </Button>
      </div>

      {/* Company Info */}
      {company && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <h3 className="text-lg font-semibold">{company.name}</h3>
              {company.matricule_fiscal && (
                <p className="text-sm text-muted-foreground">MF: {company.matricule_fiscal}</p>
              )}
            </div>
            <Badge variant="success">Entreprise active</Badge>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Adhérents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '-' : stats?.totalAdherents || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Salariés inscrits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Contrats actifs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '-' : stats?.activeContracts || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Couvertures en cours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total demandes</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '-' : stats?.totalClaims || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Remboursements soumis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {isLoading ? '-' : stats?.pendingClaims || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Demandes en cours
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/hr/adherents')}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold">Gérer les adhérents</h3>
              <p className="text-sm text-muted-foreground">
                Ajouter, modifier ou désactiver des salariés
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/hr/claims')}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CreditCard className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold">Suivi des remboursements</h3>
              <p className="text-sm text-muted-foreground">
                Voir l'état des demandes des salariés
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/hr/contracts')}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold">Contrats et garanties</h3>
              <p className="text-sm text-muted-foreground">
                Consulter les couvertures de l'entreprise
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </NoEntrepriseGuard>
  );
}

export default HRDashboardPage;
