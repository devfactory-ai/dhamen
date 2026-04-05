import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import {
  Stethoscope,
  Pill,
  FlaskConical,
  Building2,
  Eye,
  Smile,
  Baby,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Wallet,
  Filter,
  BarChart3,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';

interface CoverageData {
  care_type: string;
  care_label: string;
  annual_limit: number;
  per_event_limit: number | null;
  reimbursement_rate: number;
  total_consumed: number;
  total_claims: number;
  remaining: number;
  percentage_used: number;
  by_beneficiary: Array<{
    beneficiary_id: string | null;
    beneficiary_name: string;
    consumed: number;
    claims: number;
    last_claim_date: string | null;
  }>;
}

interface ConsommationResponse {
  adhérent: {
    id: string;
    matricule: string;
    name: string;
  };
  contract: {
    id: string;
    policy_number: string;
    insurer_name: string;
    start_date: string;
    end_date: string;
  };
  year: number;
  beneficiaries: Array<{
    id: string | null;
    name: string;
    relationship: string;
  }>;
  coverage: CoverageData[];
  totals: {
    total_annual_limit: number;
    total_consumed: number;
    total_remaining: number;
    total_claims: number;
  };
}

const careTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  consultation: Stethoscope,
  pharmacy: Pill,
  lab: FlaskConical,
  hospital: Building2,
  dental: Smile,
  optical: Eye,
  maternity: Baby,
};

const careTypeColors: Record<string, string> = {
  consultation: 'bg-blue-500',
  pharmacy: 'bg-green-500',
  lab: 'bg-purple-500',
  hospital: 'bg-red-500',
  dental: 'bg-yellow-500',
  optical: 'bg-cyan-500',
  maternity: 'bg-pink-500',
};

function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getStatusBadge(percentage: number) {
  if (percentage >= 90) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Presque épuisé
      </Badge>
    );
  }
  if (percentage >= 70) {
    return (
      <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800">
        <TrendingUp className="h-3 w-3" />
        Attention
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800">
      <CheckCircle className="h-3 w-3" />
      Disponible
    </Badge>
  );
}

export function AdherentConsommationPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<string>('all');

  // Fetch consumption data
  const { data: consommationData, isLoading } = useQuery({
    queryKey: ['adhérent-consommation', selectedYear],
    queryFn: async () => {
      const response = await apiClient.get<ConsommationResponse>(`/consommation/me?year=${selectedYear}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  // Filter coverage by beneficiary
  const filteredCoverage = consommationData?.coverage?.map((cov) => {
    if (selectedBeneficiary === 'all') return cov;

    const filteredByBenef = cov.by_beneficiary.filter((b) =>
      selectedBeneficiary === 'principal' ? b.beneficiary_id === null : b.beneficiary_id === selectedBeneficiary
    );

    const consumed = filteredByBenef.reduce((sum, b) => sum + b.consumed, 0);
    const claims = filteredByBenef.reduce((sum, b) => sum + b.claims, 0);

    return {
      ...cov,
      total_consumed: consumed,
      total_claims: claims,
      remaining: Math.max(0, cov.annual_limit - consumed),
      percentage_used: Math.min(100, (consumed / cov.annual_limit) * 100),
      by_beneficiary: filteredByBenef,
    };
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ma Consommation"
        description="Suivez votre consommation de garanties et ce qu'il vous reste"
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-900">
                  {consommationData?.totals?.total_annual_limit?.toFixed(0) || 0} TND
                </p>
                <p className="text-sm text-blue-700">Plafond annuel total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-white">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-900">
                  {consommationData?.totals?.total_consumed?.toFixed(0) || 0} TND
                </p>
                <p className="text-sm text-orange-700">Consommé</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-900">
                  {consommationData?.totals?.total_remaining?.toFixed(0) || 0} TND
                </p>
                <p className="text-sm text-green-700">Restant</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <Users className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{consommationData?.totals?.total_claims || 0}</p>
                <p className="text-sm text-muted-foreground">Actes remboursés</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="w-40">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Année" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currentYear.toString()}>{currentYear}</SelectItem>
                  <SelectItem value={(currentYear - 1).toString()}>{currentYear - 1}</SelectItem>
                  <SelectItem value={(currentYear - 2).toString()}>{currentYear - 2}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <Select value={selectedBeneficiary} onValueChange={setSelectedBeneficiary}>
                <SelectTrigger>
                  <SelectValue placeholder="Bénéficiaire" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les bénéficiaires</SelectItem>
                  <SelectItem value="principal">Moi uniquement</SelectItem>
                  {consommationData?.beneficiaries
                    ?.filter((b) => b.id !== null)
                    .map((b) => (
                      <SelectItem key={b.id!} value={b.id!}>
                        {b.name} ({b.relationship})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="details">Détail par type</TabsTrigger>
          <TabsTrigger value="beneficiaries">Par bénéficiaire</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCoverage?.map((coverage) => {
              const Icon = careTypeIcons[coverage.care_type] || Stethoscope;
              const colorClass = careTypeColors[coverage.care_type] || 'bg-gray-500';

              return (
                <Card key={coverage.care_type} className="overflow-hidden">
                  <div className={`h-2 ${colorClass}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <div className={`rounded-lg p-2 ${colorClass} bg-opacity-10`}>
                          <Icon className={`h-5 w-5 ${colorClass.replace('bg-', 'text-')}`} />
                        </div>
                        {coverage.care_label}
                      </CardTitle>
                      {getStatusBadge(coverage.percentage_used)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Consommé</span>
                        <span className="font-medium">{coverage.total_consumed.toFixed(2)} TND</span>
                      </div>
                      <Progress
                        value={coverage.percentage_used}
                        className="h-3"
                      />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Restant</span>
                        <span className="font-medium text-green-600">{coverage.remaining.toFixed(2)} TND</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t text-center">
                      <div>
                        <p className="text-lg font-bold">{coverage.annual_limit.toFixed(0)}</p>
                        <p className="text-xs text-muted-foreground">Plafond TND</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{coverage.reimbursement_rate}%</p>
                        <p className="text-xs text-muted-foreground">Taux remb.</p>
                      </div>
                    </div>

                    {coverage.total_claims > 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        {coverage.total_claims} acte{coverage.total_claims > 1 ? 's' : ''} remboursé{coverage.total_claims > 1 ? 's' : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          {filteredCoverage?.map((coverage) => {
            const Icon = careTypeIcons[coverage.care_type] || Stethoscope;
            const colorClass = careTypeColors[coverage.care_type] || 'bg-gray-500';

            return (
              <Card key={coverage.care_type}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${colorClass}`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      {coverage.care_label}
                    </CardTitle>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{coverage.remaining.toFixed(2)} TND</p>
                      <p className="text-sm text-muted-foreground">restant sur {coverage.annual_limit.toFixed(0)} TND</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{coverage.percentage_used.toFixed(1)}% utilisé</span>
                      <span>{coverage.total_consumed.toFixed(2)} / {coverage.annual_limit.toFixed(0)} TND</span>
                    </div>
                    <Progress value={coverage.percentage_used} className="h-4" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Plafond annuel</p>
                      <p className="text-lg font-semibold">{coverage.annual_limit.toFixed(0)} TND</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Taux remboursement</p>
                      <p className="text-lg font-semibold">{coverage.reimbursement_rate}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Plafond/acte</p>
                      <p className="text-lg font-semibold">
                        {coverage.per_event_limit ? `${coverage.per_event_limit} TND` : 'Illimité'}
                      </p>
                    </div>
                  </div>

                  {coverage.by_beneficiary.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium mb-3">Répartition par bénéficiaire</p>
                      <div className="space-y-2">
                        {coverage.by_beneficiary.map((b, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 rounded-lg p-2">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span>{b.beneficiary_name}</span>
                              {!b.beneficiary_id && (
                                <Badge variant="outline" className="text-xs">Principal</Badge>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="font-medium">{b.consumed.toFixed(2)} TND</span>
                              <span className="text-muted-foreground ml-2">({b.claims} actes)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* By Beneficiary Tab */}
        <TabsContent value="beneficiaries" className="space-y-4">
          {consommationData?.beneficiaries?.map((beneficiary) => {
            const beneficiaryData = filteredCoverage?.map((cov) => {
              const data = cov.by_beneficiary.find((b) =>
                beneficiary.id === null ? b.beneficiary_id === null : b.beneficiary_id === beneficiary.id
              );
              return {
                ...cov,
                consumed: data?.consumed || 0,
                claims: data?.claims || 0,
              };
            }).filter((c) => c.consumed > 0);

            const totalConsumed = beneficiaryData?.reduce((sum, c) => sum + c.consumed, 0) || 0;

            return (
              <Card key={beneficiary.id || 'principal'}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p>{beneficiary.name}</p>
                        <p className="text-sm font-normal text-muted-foreground">{beneficiary.relationship}</p>
                      </div>
                    </CardTitle>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{totalConsumed.toFixed(2)} TND</p>
                      <p className="text-sm text-muted-foreground">total consommé</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {beneficiaryData && beneficiaryData.length > 0 ? (
                    <div className="space-y-3">
                      {beneficiaryData.map((cov) => {
                        const Icon = careTypeIcons[cov.care_type] || Stethoscope;
                        const percentage = (cov.consumed / cov.annual_limit) * 100;

                        return (
                          <div key={cov.care_type} className="flex items-center gap-4">
                            <Icon className="h-5 w-5 text-muted-foreground" />
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span>{cov.care_label}</span>
                                <span>{cov.consumed.toFixed(2)} / {cov.annual_limit.toFixed(0)} TND</span>
                              </div>
                              <Progress value={percentage} className="h-2" />
                            </div>
                            <Badge variant="outline">{cov.claims} actes</Badge>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      Aucune consommation enregistrée pour {selectedYear}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Contract Info */}
      {consommationData?.contract && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-muted-foreground">Contrat</p>
                <p className="font-medium">{consommationData.contract.policy_number}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Assureur</p>
                <p className="font-medium">{consommationData.contract.insurer_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Période</p>
                <p className="font-medium">
                  {new Date(consommationData.contract.start_date).toLocaleDateString('fr-TN')} -{' '}
                  {new Date(consommationData.contract.end_date).toLocaleDateString('fr-TN')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Bénéficiaires</p>
                <p className="font-medium">{consommationData.beneficiaries?.length || 1} personne(s)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <FloatingHelp
        title="Aide - Consommation"
        subtitle="Suivez l'utilisation de vos garanties"
        tips={[
          {
            icon: <Wallet className="h-4 w-4 text-blue-500" />,
            title: "Plafonds annuels",
            desc: "Chaque type de soin a un plafond annuel. Surveillez votre consommation pour éviter les dépassements.",
          },
          {
            icon: <Filter className="h-4 w-4 text-amber-500" />,
            title: "Filtrer par bénéficiaire",
            desc: "Utilisez le filtre pour voir la consommation de chaque membre de la famille séparément.",
          },
          {
            icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
            title: "Alertes de plafond",
            desc: "Un badge 'Presque épuisé' apparaît quand vous avez consommé plus de 90% d'une garantie.",
          },
          {
            icon: <BarChart3 className="h-4 w-4 text-green-500" />,
            title: "Historique par année",
            desc: "Changez l'année pour consulter votre consommation sur les exercices précédents.",
          },
        ]}
      />
    </div>
  );
}

export default AdherentConsommationPage;
