import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

interface EligibilityResult {
  adherent: {
    id: string;
    memberNumber: string;
    firstName: string;
    lastName: string;
    nationalId: string;
    dateOfBirth: string;
    relationship: string;
  };
  contract: {
    id: string;
    name: string;
    contractNumber: string;
    insurerName: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  coverage: {
    pharmacy: number;
    consultation: number;
    lab: number;
    hospitalization: number;
    annualCeiling: number;
    usedAmount: number;
    remainingAmount: number;
  };
  isEligible: boolean;
  eligibilityMessage: string;
}

export function EligibilityPage() {
  const [nationalId, setNationalId] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['eligibility', nationalId],
    queryFn: async () => {
      const response = await apiClient.get<EligibilityResult>('/eligibility/check', {
        params: { nationalId },
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: searchTriggered && nationalId.length >= 8,
  });

  const handleSearch = () => {
    if (nationalId.length >= 8) {
      setSearchTriggered(true);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vérification d'Éligibilité"
        description="Vérifier les droits d'un adhérent en temps réel"
      />

      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle>Rechercher un adhérent</CardTitle>
          <CardDescription>Entrez le numéro CIN de l'adhérent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="N° CIN (ex: 12345678)"
                value={nationalId}
                onChange={(e) => {
                  setNationalId(e.target.value);
                  setSearchTriggered(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={nationalId.length < 8 || isLoading}>
              {isLoading ? 'Recherche...' : 'Vérifier'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-destructive">Adhérent non trouvé</p>
                <p className="text-sm text-muted-foreground">
                  Aucun adhérent trouvé avec ce numéro CIN
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          {/* Eligibility Status */}
          <Card className={data.isEligible ? 'border-green-500' : 'border-destructive'}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${data.isEligible ? 'bg-green-100' : 'bg-destructive/10'}`}>
                  {data.isEligible ? (
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`font-medium ${data.isEligible ? 'text-green-600' : 'text-destructive'}`}>
                    {data.isEligible ? 'Éligible' : 'Non éligible'}
                  </p>
                  <p className="text-sm text-muted-foreground">{data.eligibilityMessage}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Adherent Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informations Adhérent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Nom complet</Label>
                    <p className="font-medium">{data.adherent.firstName} {data.adherent.lastName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">N° Adhérent</Label>
                    <p className="font-medium">{data.adherent.memberNumber}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">CIN</Label>
                    <p className="font-medium">{data.adherent.nationalId}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Date de naissance</Label>
                    <p className="font-medium">{formatDate(data.adherent.dateOfBirth)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contract Info */}
            <Card>
              <CardHeader>
                <CardTitle>Contrat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Contrat</Label>
                    <p className="font-medium">{data.contract.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Assureur</Label>
                    <p className="font-medium">{data.contract.insurerName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Validité</Label>
                    <p className="font-medium">
                      {formatDate(data.contract.startDate)} - {formatDate(data.contract.endDate)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Statut</Label>
                    <Badge variant={data.contract.status === 'ACTIVE' ? 'success' : 'destructive'}>
                      {data.contract.status === 'ACTIVE' ? 'Actif' : data.contract.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coverage */}
          <Card>
            <CardHeader>
              <CardTitle>Couverture</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Coverage Rates */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="rounded-lg bg-muted p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{data.coverage.pharmacy}%</p>
                    <p className="text-sm text-muted-foreground">Pharmacie</p>
                  </div>
                  <div className="rounded-lg bg-muted p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{data.coverage.consultation}%</p>
                    <p className="text-sm text-muted-foreground">Consultation</p>
                  </div>
                  <div className="rounded-lg bg-muted p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">{data.coverage.lab}%</p>
                    <p className="text-sm text-muted-foreground">Laboratoire</p>
                  </div>
                  <div className="rounded-lg bg-muted p-4 text-center">
                    <p className="text-2xl font-bold text-orange-600">{data.coverage.hospitalization}%</p>
                    <p className="text-sm text-muted-foreground">Hospitalisation</p>
                  </div>
                </div>

                {/* Ceiling Usage */}
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span>Plafond annuel utilisé</span>
                    <span className="font-medium">
                      {formatAmount(data.coverage.usedAmount)} / {formatAmount(data.coverage.annualCeiling)}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${Math.min((data.coverage.usedAmount / data.coverage.annualCeiling) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Reste disponible: <span className="font-medium text-green-600">{formatAmount(data.coverage.remainingAmount)}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
