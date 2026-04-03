import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/usePermissions';

/** Matches the actual API response from GET /eligibility/check */
interface EligibilityApiResponse {
  'adhérent': {
    id: string;
    memberNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string | null;
    city: string | null;
  };
  contract: {
    id: string;
    number: string;
    planType: string;
    startDate: string;
    endDate: string;
    status: string;
    annualLimit: number | null;
    insurerName: string;
  } | null;
  eligible: boolean;
  coverage: Record<string, unknown>;
  message: string;
}

/** Coverage item shape from CoverageConfig in the DB */
interface CoverageItem {
  enabled?: boolean;
  reimbursementRate?: number;
  annualLimit?: number | null;
  genericOnly?: boolean;
  specialities?: string[];
  roomType?: string;
}

/** Normalized interface for the component */
interface EligibilityResult {
  adherent: {
    id: string;
    memberNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string | null;
    city: string | null;
  };
  contract: {
    id: string;
    number: string;
    planType: string;
    startDate: string;
    endDate: string;
    status: string;
    annualLimit: number | null;
    insurerName: string;
  } | null;
  eligible: boolean;
  coverage: {
    pharmacy?: number;
    consultation?: number;
    lab?: number;
    hospitalization?: number;
  };
  message: string;
}

function extractRate(item: unknown): number | undefined {
  if (item && typeof item === 'object' && 'reimbursementRate' in item) {
    return (item as CoverageItem).reimbursementRate;
  }
  if (typeof item === 'number') return item;
  return undefined;
}

function normalizeEligibilityResponse(raw: EligibilityApiResponse): EligibilityResult {
  const cov = raw.coverage || {};
  return {
    adherent: raw['adhérent'],
    contract: raw.contract,
    eligible: raw.eligible,
    coverage: {
      pharmacy: extractRate(cov.pharmacy),
      consultation: extractRate(cov.consultation),
      lab: extractRate(cov.lab),
      hospitalization: extractRate(cov.hospitalization),
    },
    message: raw.message,
  };
}

export function EligibilityPage() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('adherents', 'read');
  const [nationalId, setNationalId] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['eligibility', nationalId],
    queryFn: async () => {
      const response = await apiClient.get<EligibilityApiResponse>('/eligibility/check', {
        params: { nationalId },
      });
      if (!response.success) { throw new Error(response.error?.message); }
      return normalizeEligibilityResponse(response.data);
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

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Accès refusé</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de vérifier l'éligibilité.</p>
        </div>
      </div>
    );
  }

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
                <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-destructive">Adhérent non trouvé</p>
                <p className='text-muted-foreground text-sm'>
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
          <Card className={data.eligible ? 'border-green-500' : 'border-destructive'}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${data.eligible ? 'bg-green-100' : 'bg-destructive/10'}`}>
                  {data.eligible ? (
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`font-medium ${data.eligible ? 'text-green-600' : 'text-destructive'}`}>
                    {data.eligible ? 'Éligible' : 'Non éligible'}
                  </p>
                  <p className='text-muted-foreground text-sm'>{data.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Adhérent Info */}
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
                    <Label className="text-muted-foreground">Ville</Label>
                    <p className="font-medium">{data.adherent.city || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Date de naissance</Label>
                    <p className="font-medium">{formatDate(data.adherent.dateOfBirth)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contract Info */}
            {data.contract && (
              <Card>
                <CardHeader>
                  <CardTitle>Contrat</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">N° Contrat</Label>
                      <p className="font-medium">{data.contract.number || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Assureur</Label>
                      <p className="font-medium">{data.contract.insurerName || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Validité</Label>
                      <p className="font-medium">
                        {data.contract.startDate ? formatDate(data.contract.startDate) : '—'} - {data.contract.endDate ? formatDate(data.contract.endDate) : '—'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Statut</Label>
                      <Badge variant={data.contract.status === 'active' ? 'success' : 'destructive'}>
                        {data.contract.status === 'active' ? 'Actif' : data.contract.status || '—'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Coverage — only if contract + coverage data present */}
          {data.contract && data.coverage && (
            <Card>
              <CardHeader>
                <CardTitle>Couverture</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Coverage Rates */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {data.coverage.pharmacy != null && (
                      <div className="rounded-lg bg-muted p-4 text-center">
                        <p className='font-bold text-2xl text-green-600'>{data.coverage.pharmacy}%</p>
                        <p className='text-muted-foreground text-sm'>Pharmacie</p>
                      </div>
                    )}
                    {data.coverage.consultation != null && (
                      <div className="rounded-lg bg-muted p-4 text-center">
                        <p className='font-bold text-2xl text-blue-600'>{data.coverage.consultation}%</p>
                        <p className='text-muted-foreground text-sm'>Consultation</p>
                      </div>
                    )}
                    {data.coverage.lab != null && (
                      <div className="rounded-lg bg-muted p-4 text-center">
                        <p className='font-bold text-2xl text-purple-600'>{data.coverage.lab}%</p>
                        <p className='text-muted-foreground text-sm'>Laboratoire</p>
                      </div>
                    )}
                    {data.coverage.hospitalization != null && (
                      <div className="rounded-lg bg-muted p-4 text-center">
                        <p className='font-bold text-2xl text-orange-600'>{data.coverage.hospitalization}%</p>
                        <p className='text-muted-foreground text-sm'>Hospitalisation</p>
                      </div>
                    )}
                  </div>

                  {/* Annual limit from contract */}
                  {data.contract?.annualLimit != null && (
                    <div className="rounded-lg bg-muted p-4">
                      <p className="text-sm text-muted-foreground">Plafond annuel du contrat</p>
                      <p className="font-bold text-lg">{formatAmount(data.contract.annualLimit)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
