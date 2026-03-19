/**
 * ContractDetailsPage - Contract Details Page
 *
 * Dedicated page for viewing contract details (replaces dialog)
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, Users, Calendar, CreditCard, FileText, Download, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient, API_BASE_URL } from '@/lib/api-client';

interface Contract {
  id: string;
  insurerId: string;
  insurerName: string;
  contractNumber: string;
  policyNumber?: string;
  name: string;
  type: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE';
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
  coveragePharmacy: number;
  coverageConsultation: number;
  coverageLab: number;
  coverageHospitalization: number;
  annualCeiling: number;
  adhérentCount: number;
  documentId?: string;
  documentUrl?: string;
  createdAt: string;
}

const CONTRACT_TYPES = {
  INDIVIDUAL: { label: 'Individuel', color: 'bg-blue-100 text-blue-800' },
  GROUP: { label: 'Groupe', color: 'bg-green-100 text-green-800' },
  CORPORATE: { label: 'Entreprise', color: 'bg-purple-100 text-purple-800' },
};

const CONTRACT_STATUS = {
  ACTIVE: { label: 'Actif', variant: 'success' as const },
  SUSPENDED: { label: 'Suspendu', variant: 'warning' as const },
  EXPIRED: { label: 'Expiré', variant: 'secondary' as const },
  CANCELLED: { label: 'Annulé', variant: 'destructive' as const },
};

export function ContractDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contracts', id],
    queryFn: async () => {
      const response = await apiClient.get<Contract>(`/contracts/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
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
    }).format(amount / 1000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Contrat non trouvé</p>
        <Button onClick={() => navigate('/contracts')}>Retour aux contrats</Button>
      </div>
    );
  }

  const typeInfo = CONTRACT_TYPES[contract.type];
  const statusInfo = CONTRACT_STATUS[contract.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/contracts')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <PageHeader
            title={contract.name}
            description={`Contrat N° ${contract.contractNumber}`}
          />
        </div>
        <Button onClick={() => navigate(`/contracts/${id}/edit`)}>
          <Edit className="h-4 w-4 mr-2" />
          Modifier
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Key Metrics */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{contract.adhérentCount}</p>
                <p className="text-sm text-muted-foreground">Adhérents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100">
                <CreditCard className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatAmount(contract.annualCeiling)}</p>
                <p className="text-sm text-muted-foreground">Plafond annuel</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">{formatDate(contract.endDate)}</p>
                <p className="text-sm text-muted-foreground">Date d'expiration</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Général Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
            <CardDescription>Details du contrat d'assurance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Assureur</p>
                <p className="font-medium">{contract.insurerName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <span className={`inline-block mt-1 rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date de debut</p>
                <p className="font-medium">{formatDate(contract.startDate)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date de fin</p>
                <p className="font-medium">{formatDate(contract.endDate)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Statut</p>
                <Badge variant={statusInfo.variant} className="mt-1">{statusInfo.label}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date de création</p>
                <p className="font-medium">{formatDate(contract.createdAt)}</p>
              </div>
              {contract.policyNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">N° de police</p>
                  <p className="font-medium">{contract.policyNumber}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Coverage Rates */}
        <Card>
          <CardHeader>
            <CardTitle>Taux de couverture</CardTitle>
            <CardDescription>Pourcentage de prise en charge par type de soin</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Pharmacie</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${contract.coveragePharmacy}%` }}
                    />
                  </div>
                  <span className="font-semibold w-12 text-right">{contract.coveragePharmacy}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Consultation</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${contract.coverageConsultation}%` }}
                    />
                  </div>
                  <span className="font-semibold w-12 text-right">{contract.coverageConsultation}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Laboratoire</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${contract.coverageLab}%` }}
                    />
                  </div>
                  <span className="font-semibold w-12 text-right">{contract.coverageLab}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Hospitalisation</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full"
                      style={{ width: `${contract.coverageHospitalization}%` }}
                    />
                  </div>
                  <span className="font-semibold w-12 text-right">{contract.coverageHospitalization}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document PDF Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document du contrat
          </CardTitle>
          <CardDescription>Fichier PDF du contrat d'assurance</CardDescription>
        </CardHeader>
        <CardContent>
          {contract.documentId ? (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <FileText className="h-8 w-8 text-red-600" />
                </div>
                <div>
                  <p className="font-medium">Contrat_{contract.contractNumber}.pdf</p>
                  <p className="text-sm text-muted-foreground">Document PDF du contrat</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const apiUrl = API_BASE_URL;
                    window.open(`${apiUrl}/documents/${contract.documentId}/download`, '_blank');
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Télécharger
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const apiUrl = API_BASE_URL;
                    window.open(`${apiUrl}/documents/${contract.documentId}/download?disposition=inline`, '_blank');
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ouvrir
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-50" />
              <p className="font-medium">Aucun document associe</p>
              <p className="text-sm">Vous pouvez ajouter un PDF en modifiant le contrat</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate(`/contracts/${id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Ajouter un document
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ContractDetailsPage;
