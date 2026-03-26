import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Users, FileText, Activity, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';

const SECTOR_LABELS: Record<string, string> = {
  IT: 'Informatique',
  BANKING: 'Banque',
  HEALTHCARE: 'Sante',
  MANUFACTURING: 'Industrie',
  RETAIL: 'Commerce',
  SERVICES: 'Services',
  OTHER: 'Autre',
};

interface Company {
  id: string;
  name: string;
  matricule_fiscal: string | null;
  code: string | null;
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
  updated_at: string;
}

interface CompanyStats {
  totalAdherents: number;
  activeContracts: number;
  totalClaims: number;
  pendingClaims: number;
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const response = await apiClient.get<Company>(`/companies/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: ['company-stats', id],
    queryFn: async () => {
      const response = await apiClient.get<CompanyStats>(`/companies/${id}/stats`);
      if (!response.success) return { totalAdherents: 0, activeContracts: 0, totalClaims: 0, pendingClaims: 0 };
      return response.data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Chargement...</div>;
  }

  if (!company) {
    return <div className="flex items-center justify-center p-8">Entreprise non trouvee</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/companies')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <PageHeader
            title={company.name}
            description={company.matricule_fiscal ? `MF: ${company.matricule_fiscal}` : 'Fiche entreprise'}
          />
        </div>
        <Button onClick={() => navigate(`/companies/${id}/edit`)}>
          <Pencil className="mr-2 h-4 w-4" />
          Modifier
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalAdherents || 0}</p>
              <p className="text-sm text-muted-foreground">Adherents</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.activeContracts || 0}</p>
              <p className="text-sm text-muted-foreground">Contrats actifs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalClaims || 0}</p>
              <p className="text-sm text-muted-foreground">Sinistres</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
              <Activity className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.pendingClaims || 0}</p>
              <p className="text-sm text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Informations générales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Code société</p>
              <p className="font-medium">{company.code || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Raison sociale</p>
              <p className="font-medium">{company.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Matricule fiscale</p>
              <p className="font-medium">{company.matricule_fiscal || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Numéro de contrat</p>
              <p className="font-medium">{company.contract_number || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date d'ouverture</p>
              <p className="font-medium">{company.date_ouverture ? new Date(company.date_ouverture).toLocaleDateString('fr-TN') : '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Secteur</p>
              <p className="font-medium">
                {company.sector ? (
                  <Badge variant="secondary">{SECTOR_LABELS[company.sector] || company.sector}</Badge>
                ) : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Effectif</p>
              <p className="font-medium">{company.employee_count || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Adresse</p>
              <p className="font-medium">{company.address || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ville</p>
              <p className="font-medium">{company.city || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Telephone</p>
              <p className="font-medium">{company.phone || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{company.email || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <Badge variant={company.is_active ? 'success' : 'destructive'}>
                {company.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date de creation</p>
              <p className="font-medium">{new Date(company.created_at).toLocaleDateString('fr-TN')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CompanyDetailPage;
