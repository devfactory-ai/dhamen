/**
 * ClaimDetailsPage - Claim Details Page
 *
 * Dedicated page for viewing claim/PEC details (replaces dialog)
 */
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, User, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';

interface Claim {
  id: string;
  claimNumber: string;
  adhérentId: string;
  adhérentName: string;
  adhérentNationalId: string;
  providerId: string;
  providerName?: string;
  type: 'PHARMACY' | 'CONSULTATION' | 'LAB' | 'HOSPITALIZATION';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  amount: number;
  coveredAmount: number;
  copayAmount: number;
  serviceDate: string;
  diagnosis?: string;
  notes?: string;
  rejectionReason?: string;
  fraudScore: number | null;
  createdAt: string;
  updatedAt: string;
}

const CLAIM_TYPES = {
  PHARMACY: { label: 'Pharmacie', color: 'bg-green-100 text-green-800', icon: '💊' },
  CONSULTATION: { label: 'Consultation', color: 'bg-blue-100 text-blue-800', icon: '🩺' },
  LAB: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800', icon: '🔬' },
  HOSPITALIZATION: { label: 'Hospitalisation', color: 'bg-orange-100 text-orange-800', icon: '🏥' },
};

const CLAIM_STATUS = {
  PENDING: { label: 'En attente', variant: 'warning' as const },
  APPROVED: { label: 'Approuvée', variant: 'success' as const },
  REJECTED: { label: 'Rejetée', variant: 'destructive' as const },
  PAID: { label: 'Payée', variant: 'info' as const },
};

export function ClaimDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claims', id],
    queryFn: async () => {
      const response = await apiClient.get<Claim>(`/claims/${id}`);
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

  if (!claim) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">PEC non trouvée</p>
        <Button onClick={() => navigate('/claims')}>Retour aux PEC</Button>
      </div>
    );
  }

  const typeInfo = CLAIM_TYPES[claim.type];
  const statusInfo = CLAIM_STATUS[claim.status];

  const getFraudScoreColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score > 70) return 'text-destructive';
    if (score > 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/claims" className="hover:text-gray-900 transition-colors">Demandes PEC</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`PEC ${claim.claimNumber}`}
          description={`${typeInfo.label} - ${formatDate(claim.serviceDate)}`}
        />
        <Badge variant={statusInfo.variant} className="text-sm px-3 py-1">
          {statusInfo.label}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* Amount Cards */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatAmount(claim.amount)}</p>
                <p className="text-sm text-muted-foreground">Montant total</p>
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
                <p className="text-2xl font-bold text-green-600">{formatAmount(claim.coveredAmount)}</p>
                <p className="text-sm text-muted-foreground">Montant couvert</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-100">
                <CreditCard className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">{formatAmount(claim.copayAmount)}</p>
                <p className="text-sm text-muted-foreground">Ticket moderateur</p>
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
                <p className="text-lg font-semibold">{formatDate(claim.serviceDate)}</p>
                <p className="text-sm text-muted-foreground">Date du service</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Adhérent Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informations adhérent
            </CardTitle>
            <CardDescription>Details de l'assure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nom complet</p>
                <p className="font-medium">{claim.adhérentName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CIN</p>
                <p className="font-medium">{claim.adhérentNationalId}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Claim Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Details de la PEC
            </CardTitle>
            <CardDescription>Informations de la prise en charge</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <span className={`inline-block mt-1 rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
                  {typeInfo.icon} {typeInfo.label}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Praticien</p>
                <p className="font-medium">{claim.providerName || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date de création</p>
                <p className="font-medium">{formatDate(claim.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dernière mise à jour</p>
                <p className="font-medium">{formatDate(claim.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis & Notes */}
        {(claim.diagnosis || claim.notes) && (
          <Card>
            <CardHeader>
              <CardTitle>Diagnostic & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {claim.diagnosis && (
                <div>
                  <p className="text-sm text-muted-foreground">Diagnostic</p>
                  <p className="font-medium">{claim.diagnosis}</p>
                </div>
              )}
              {claim.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p>{claim.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Fraud Score & Rejection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Analyse & Statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {claim.fraudScore !== null && (
              <div>
                <p className="text-sm text-muted-foreground">Score anti-fraude</p>
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        claim.fraudScore > 70 ? 'bg-destructive' : claim.fraudScore > 40 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${claim.fraudScore}%` }}
                    />
                  </div>
                  <span className={`font-bold ${getFraudScoreColor(claim.fraudScore)}`}>
                    {claim.fraudScore}/100
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {claim.fraudScore > 70 ? 'Risque élevé - Vérification manuelle requise' :
                   claim.fraudScore > 40 ? 'Risque modéré - Attention recommandée' :
                   'Risque faible - Transaction normale'}
                </p>
              </div>
            )}
            {claim.rejectionReason && (
              <div className="p-4 bg-destructive/10 rounded-lg">
                <p className="text-sm font-medium text-destructive">Motif de rejet</p>
                <p className="text-destructive mt-1">{claim.rejectionReason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ClaimDetailsPage;
