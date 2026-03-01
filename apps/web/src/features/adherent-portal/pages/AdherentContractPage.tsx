import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { FileText, Shield, Pill, Stethoscope, FlaskConical, Building2, Calendar, TrendingUp } from 'lucide-react';

interface ContractDetails {
  id: string;
  contractNumber: string;
  name: string;
  type: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE';
  insurerName: string;
  insurerLogo?: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  coveragePharmacy: number;
  coverageConsultation: number;
  coverageLab: number;
  coverageHospitalization: number;
  annualCeiling: number;
  usedAmount: number;
  remainingAmount: number;
}

const CONTRACT_TYPES = {
  INDIVIDUAL: 'Individuel',
  GROUP: 'Groupe',
  CORPORATE: 'Entreprise',
};

export function AdhérentContractPage() {
  const { user } = useAuth();

  const { data: contract, isLoading } = useQuery({
    queryKey: ['adhérent-contract', user?.id],
    queryFn: async () => {
      const response = await apiClient.get<{ contract: ContractDetails }>('/adherents/me/contract');
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.contract;
    },
    enabled: !!user?.id,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
      minimumFractionDigits: 3,
    }).format(amount / 1000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mon contrat" description="Chargement..." />
        <div className="grid gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mon contrat" description="Details de votre couverture" />
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucun contrat actif</h3>
            <p className="mt-2 text-muted-foreground">
              Vous n'avez pas de contrat d'assurance sante actif.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const usagePercentage = contract.annualCeiling > 0
    ? Math.round((contract.usedAmount / contract.annualCeiling) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon contrat"
        description="Details de votre couverture sante"
      />

      {/* Contract Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {contract.name}
            </CardTitle>
            <Badge variant={contract.status === 'ACTIVE' ? 'success' : 'destructive'}>
              {contract.status === 'ACTIVE' ? 'Actif' : contract.status === 'SUSPENDED' ? 'Suspendu' : 'Expiré'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">N Contrat</p>
              <p className="font-mono font-medium">{contract.contractNumber}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Assureur</p>
              <p className="font-medium">{contract.insurerName}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Type</p>
              <Badge variant="outline">{CONTRACT_TYPES[contract.type]}</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Validite</p>
              <div className="flex items-center gap-1 text-sm">
                <Calendar className="h-4 w-4" />
                {formatDate(contract.startDate)} - {formatDate(contract.endDate)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Annual Ceiling Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Consommation annuelle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span>Utilise: {formatAmount(contract.usedAmount)}</span>
            <span>Plafond: {formatAmount(contract.annualCeiling)}</span>
          </div>
          <Progress value={usagePercentage} className="h-3" />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {usagePercentage}% du plafond utilisé
            </span>
            <span className="font-semibold text-green-600">
              Reste: {formatAmount(contract.remainingAmount)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Coverage Details */}
      <Card>
        <CardHeader>
          <CardTitle>Taux de remboursement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Pill className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pharmacie</p>
                <p className="text-2xl font-bold">{contract.coveragePharmacy}%</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Stethoscope className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Consultation</p>
                <p className="text-2xl font-bold">{contract.coverageConsultation}%</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                <FlaskConical className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Laboratoire</p>
                <p className="text-2xl font-bold">{contract.coverageLab}%</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                <Building2 className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hospitalisation</p>
                <p className="text-2xl font-bold">{contract.coverageHospitalization}%</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdhérentContractPage;
