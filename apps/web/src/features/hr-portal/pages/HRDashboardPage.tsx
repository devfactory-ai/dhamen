import { useQuery } from '@tanstack/react-query';
import { Users, FileText, CreditCard, TrendingUp, UserPlus, Banknote } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { apiClient } from '@/lib/api-client';
import { useNavigate } from 'react-router-dom';
import { NoEntrepriseGuard } from '../components/NoEntrepriseGuard';
import { DataTable } from '@/components/ui/data-table';

interface CompanyStats {
  totalAdherents: number;
  activeContracts: number;
  totalClaims: number;
  pendingClaims: number;
  totalReimbursed: number;
}

interface Company {
  id: string;
  name: string;
  matricule_fiscal: string | null;
  employee_count: number | null;
}

interface RecentBulletin {
  id: string;
  bulletinNumber: string;
  status: string;
  careType: string;
  careDate: string;
  totalAmount: number;
  reimbursedAmount: number | null;
  createdAt: string;
  adherentName: string;
  companyName: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  scan_uploaded: { label: 'Scan envoyé', color: 'bg-blue-50 text-blue-700' },
  paper_received: { label: 'Reçu', color: 'bg-blue-50 text-blue-700' },
  paper_incomplete: { label: 'Incomplet', color: 'bg-amber-50 text-amber-700' },
  paper_complete: { label: 'Complet', color: 'bg-blue-50 text-blue-700' },
  processing: { label: 'En traitement', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approuvé', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejeté', color: 'bg-red-50 text-red-700' },
  paid: { label: 'Payé', color: 'bg-emerald-50 text-emerald-700' },
  submitted: { label: 'Soumis', color: 'bg-blue-50 text-blue-700' },
  in_batch: { label: 'En lot', color: 'bg-purple-50 text-purple-700' },
  pending: { label: 'En attente', color: 'bg-amber-50 text-amber-700' },
};

const CARE_TYPE_LABELS: Record<string, string> = {
  pharmacy: 'Pharmacie',
  consultation: 'Consultation',
  lab: 'Laboratoire',
  hospitalization: 'Hospitalisation',
  dental: 'Dentaire',
  optical: 'Optique',
};

function formatAmount(amount: number): string {
  return (amount / 1000).toFixed(3) + ' TND';
}

export function HRDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreateAdherent = hasPermission('adherents', 'create');

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['hr-company', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return null;
      const response = await apiClient.get<Company>(`/companies/${user.companyId}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!user?.companyId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['hr-company-stats', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return null;
      const response = await apiClient.get<CompanyStats>(`/companies/${user.companyId}/stats`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!user?.companyId,
  });

  // Recent bulletins for HR company — fetch from company claims endpoint
  const { data: recentBulletins, isLoading: recentLoading } = useQuery({
    queryKey: ['hr-recent-bulletins', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const response = await apiClient.get<Record<string, unknown>[]>(`/companies/${user.companyId}/claims`);
      if (!response.success) return [];
      const claims = Array.isArray(response.data) ? response.data : [];
      return claims.slice(0, 10).map((c) => ({
        id: String(c.id || ''),
        bulletinNumber: String(c.reference || '—'),
        status: String(c.status || '').toLowerCase(),
        careType: String(c.type || ''),
        careDate: String(c.created_at || ''),
        totalAmount: Number(c.amount) || 0,
        reimbursedAmount: Number(c.covered_amount) || null,
        createdAt: String(c.created_at || ''),
        adherentName: String(c.adherent_name || '—'),
        companyName: user?.companyName || '',
      }));
    },
    enabled: !!user?.companyId,
    staleTime: 30000,
  });

  const isLoading = companyLoading || statsLoading;

  const bulletinColumns = [
    {
      key: 'bulletinNumber',
      header: 'Référence',
      render: (b: RecentBulletin) => (
        <span className="text-sm font-medium text-blue-600">{b.bulletinNumber || '—'}</span>
      ),
    },
    {
      key: 'adherentName',
      header: 'Adhérent',
      render: (b: RecentBulletin) => (
        <span className="text-sm text-gray-900">{b.adherentName || '—'}</span>
      ),
    },
    {
      key: 'careType',
      header: 'Type',
      render: (b: RecentBulletin) => (
        <span className="text-sm text-gray-600">{CARE_TYPE_LABELS[b.careType] ?? b.careType ?? '—'}</span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Montant',
      className: 'text-right',
      render: (b: RecentBulletin) => (
        <span className="text-sm font-medium text-gray-900">
          {b.totalAmount != null ? formatAmount(b.totalAmount) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (b: RecentBulletin) => {
        const s = STATUS_LABELS[b.status] ?? { label: b.status, color: 'bg-gray-100 text-gray-700' };
        return (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
            {s.label}
          </span>
        );
      },
    },
  ];

  return (
    <NoEntrepriseGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title={`Bienvenue, ${user?.firstName || "RH"}`}
            description={
              company?.name || "Gestion des adhérents de votre entreprise"
            }
          />
          {canCreateAdherent && (
            <Button
              onClick={() => navigate("/adherents/agent/new")}
              className="bg-slate-900 hover:bg-[#19355d]"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Ajouter un Adhérent
            </Button>
          )}
        </div>

        {/* Company Info */}
        {company && (
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <h3 className="text-lg font-semibold">{company.name}</h3>
                {company.matricule_fiscal && (
                  <p className="text-sm text-muted-foreground">
                    MF: {company.matricule_fiscal}
                  </p>
                )}
              </div>
              <Badge variant="success">Entreprise active</Badge>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Adhérents</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  (stats?.totalAdherents ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">Salariés inscrits</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Contrats actifs
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  (stats?.activeContracts ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Couvertures en cours
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total demandes
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  (stats?.totalClaims ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">Bulletins soumis</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {isLoading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  (stats?.pendingClaims ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">Demandes en cours</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total remboursé
              </CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {isLoading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                ) : stats?.totalReimbursed != null ? (
                  formatAmount(stats.totalReimbursed)
                ) : (
                  "0 TND"
                )}
              </div>
              <p className="text-xs text-muted-foreground">Montant remboursé</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Bulletins */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Derniers bulletins
            </h2>
          </div>
          {recentLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg bg-gray-100"
                />
              ))}
            </div>
          ) : (
            <DataTable
              columns={bulletinColumns}
              data={recentBulletins ?? []}
              emptyMessage="Aucun bulletin récent"
              emptyStateType="claims"
            />
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate("/adherents/agent")}
          >
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

          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate("/hr/claims")}
          >
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

          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate("/group-contracts")}
          >
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
