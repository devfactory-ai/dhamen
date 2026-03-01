/**
 * ClaimProcessPage - Process Claim Page
 *
 * Dedicated page for processing (approving/rejecting) a claim
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { useProcessClaim, type Claim } from '../hooks/useClaims';
import { useToast } from '@/stores/toast';

const CLAIM_TYPES = {
  PHARMACY: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  CONSULTATION: { label: 'Consultation', color: 'bg-blue-100 text-blue-800' },
  LAB: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  HOSPITALIZATION: { label: 'Hospitalisation', color: 'bg-orange-100 text-orange-800' },
};

export function ClaimProcessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const processClaim = useProcessClaim();

  const [processingData, setProcessingData] = useState<{
    status: 'APPROVED' | 'REJECTED';
    coveredAmount: string;
    rejectionReason: string;
    notes: string;
  }>({
    status: 'APPROVED',
    coveredAmount: '',
    rejectionReason: '',
    notes: '',
  });

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claims', id],
    queryFn: async () => {
      const response = await apiClient.get<Claim>(`/claims/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  // Initialize covered amount when claim loads
  useState(() => {
    if (claim) {
      setProcessingData((prev) => ({
        ...prev,
        coveredAmount: (claim.amount / 1000).toString(),
      }));
    }
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleProcess = async () => {
    if (!claim) return;

    try {
      await processClaim.mutateAsync({
        id: claim.id,
        data: {
          status: processingData.status,
          coveredAmount: processingData.status === 'APPROVED' ? Number.parseFloat(processingData.coveredAmount) * 1000 : undefined,
          rejectionReason: processingData.status === 'REJECTED' ? processingData.rejectionReason : undefined,
          notes: processingData.notes || undefined,
        },
      });
      toast({
        title: processingData.status === 'APPROVED' ? 'PEC approuvee' : 'PEC rejetée',
        variant: processingData.status === 'APPROVED' ? 'success' : 'destructive',
      });
      navigate('/claims/manage');
    } catch {
      toast({
        title: 'Erreur lors du traitement',
        description: 'Veuillez réessayer',
        variant: 'destructive',
      });
    }
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
        <Button onClick={() => navigate('/claims/manage')}>Retour aux PEC</Button>
      </div>
    );
  }

  if (claim.status !== 'PENDING') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Cette PEC a déjà été traitée</p>
        <Button onClick={() => navigate('/claims/manage')}>Retour aux PEC</Button>
      </div>
    );
  }

  const typeInfo = CLAIM_TYPES[claim.type];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/claims/manage')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={`Traiter PEC ${claim.claimNumber}`}
          description="Valider ou rejeter cette demande de prise en charge"
        />
      </div>

      {/* Claim Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé de la PEC</CardTitle>
          <CardDescription>Informations sur la demande de prise en charge</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Adhérent</p>
              <p className="font-medium">{claim.adhérentName || '-'}</p>
              <p className="text-xs text-muted-foreground">{claim.adhérentNationalId || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Prestataire</p>
              <p className="font-medium">{claim.providerName || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <span className={`inline-block mt-1 rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
                {typeInfo.label}
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{formatDate(claim.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Amount Info */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Montant demande</p>
              <p className="text-3xl font-bold text-primary">{formatAmount(claim.amount)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Fraud Score */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-4">
              <div className={`p-3 rounded-full ${
                claim.fraudScore && claim.fraudScore > 70
                  ? 'bg-red-100'
                  : claim.fraudScore && claim.fraudScore > 40
                    ? 'bg-yellow-100'
                    : 'bg-green-100'
              }`}>
                <AlertTriangle className={`h-6 w-6 ${
                  claim.fraudScore && claim.fraudScore > 70
                    ? 'text-red-600'
                    : claim.fraudScore && claim.fraudScore > 40
                      ? 'text-yellow-600'
                      : 'text-green-600'
                }`} />
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Score anti-fraude</p>
                <p className={`text-2xl font-bold ${
                  claim.fraudScore && claim.fraudScore > 70
                    ? 'text-red-600'
                    : claim.fraudScore && claim.fraudScore > 40
                      ? 'text-yellow-600'
                      : 'text-green-600'
                }`}>
                  {claim.fraudScore ?? 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Décision Form */}
      <Card>
        <CardHeader>
          <CardTitle>Décision</CardTitle>
          <CardDescription>Choisissez d'approuver ou rejeter cette PEC</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Décision Buttons */}
          <div className="flex gap-4">
            <Button
              variant={processingData.status === 'APPROVED' ? 'default' : 'outline'}
              className="flex-1 h-20"
              onClick={() => setProcessingData({ ...processingData, status: 'APPROVED' })}
            >
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-6 w-6" />
                <span>Approuver</span>
              </div>
            </Button>
            <Button
              variant={processingData.status === 'REJECTED' ? 'destructive' : 'outline'}
              className="flex-1 h-20"
              onClick={() => setProcessingData({ ...processingData, status: 'REJECTED' })}
            >
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-6 w-6" />
                <span>Rejeter</span>
              </div>
            </Button>
          </div>

          {processingData.status === 'APPROVED' && (
            <div className="space-y-2">
              <Label htmlFor="coveredAmount">Montant couvert (TND)</Label>
              <Input
                id="coveredAmount"
                type="number"
                step="0.001"
                value={processingData.coveredAmount}
                onChange={(e) => setProcessingData({ ...processingData, coveredAmount: e.target.value })}
              />
            </div>
          )}

          {processingData.status === 'REJECTED' && (
            <div className="space-y-2">
              <Label htmlFor="rejectionReason">Motif du rejet *</Label>
              <Textarea
                id="rejectionReason"
                value={processingData.rejectionReason}
                onChange={(e) => setProcessingData({ ...processingData, rejectionReason: e.target.value })}
                placeholder="Indiquer le motif du rejet..."
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Textarea
              id="notes"
              value={processingData.notes}
              onChange={(e) => setProcessingData({ ...processingData, notes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate('/claims/manage')}>
              Annuler
            </Button>
            <Button
              onClick={handleProcess}
              disabled={processClaim.isPending || (processingData.status === 'REJECTED' && !processingData.rejectionReason)}
              variant={processingData.status === 'REJECTED' ? 'destructive' : 'default'}
            >
              {processClaim.isPending ? 'Traitement...' : processingData.status === 'APPROVED' ? 'Approuver la PEC' : 'Rejeter la PEC'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ClaimProcessPage;
