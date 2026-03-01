/**
 * SantePaiementProcessPage - Process Payment Page
 *
 * Dedicated page for processing a single payment
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import {
  useUpdatePaiementStatut,
  PAIEMENT_STATUTS_LABELS,
  PAIEMENT_STATUTS_COLORS,
  PAIEMENT_METHODES_LABELS,
  type Paiement,
  type PaiementMéthode,
} from '../hooks/usePaiements';
import { useToast } from '@/stores/toast';

export function SantePaiementProcessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateMutation = useUpdatePaiementStatut();

  const [paymentData, setPaymentData] = useState({
    méthode: 'virement' as PaiementMéthode,
    référence: '',
  });

  const { data: paiement, isLoading } = useQuery({
    queryKey: ['sante-paiements', id],
    queryFn: async () => {
      const response = await apiClient.get<Paiement>(`/sante/paiements/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
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
    });
  };

  const handlePayment = async () => {
    if (!paiement) return;

    try {
      await updateMutation.mutateAsync({
        id: paiement.id,
        data: {
          statut: 'paye',
          méthode: paymentData.méthode,
          référence: paymentData.référence || undefined,
        },
      });
      toast({ title: 'Paiement effectué avec succès', variant: 'success' });
      navigate('/sante/paiements');
    } catch (error) {
      toast({
        title: 'Erreur lors du paiement',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
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

  if (!paiement) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Paiement non trouvé</p>
        <Button onClick={() => navigate('/sante/paiements')}>Retour aux paiements</Button>
      </div>
    );
  }

  if (paiement.statut !== 'valide') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Ce paiement ne peut pas etre traite (statut: {PAIEMENT_STATUTS_LABELS[paiement.statut]})</p>
        <Button onClick={() => navigate('/sante/paiements')}>Retour aux paiements</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sante/paiements')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={`Paiement ${paiement.numéroPaiement}`}
          description="Effectuér le paiement"
        />
      </div>

      {/* Payment Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Résumé du paiement
          </CardTitle>
          <CardDescription>Vérifiéz les informations avant de procédér</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Numéro</p>
              <p className="font-medium">{paiement.numéroPaiement}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Montant</p>
              <p className="font-bold text-xl text-green-600">{formatAmount(paiement.montant)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bénéficiaire</p>
              <p className="font-medium">{paiement.bénéficiaireId}</p>
              <p className="text-xs text-muted-foreground">
                {paiement.bénéficiaireType === 'adhérent' ? 'Adhérent' : 'Praticien'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <span className={`inline-block rounded-full px-2 py-1 text-xs ${PAIEMENT_STATUTS_COLORS[paiement.statut]}`}>
                {PAIEMENT_STATUTS_LABELS[paiement.statut]}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Form */}
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Informations de paiement</CardTitle>
          <CardDescription>Sélectionnez la méthode et ajoutez une référence</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Méthode de paiement</Label>
            <Select
              value={paymentData.méthode}
              onValueChange={(v) => setPaymentData({ ...paymentData, méthode: v as PaiementMéthode })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAIEMENT_METHODES_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="référence">Référence (optionnel)</Label>
            <Input
              id="référence"
              value={paymentData.référence}
              onChange={(e) => setPaymentData({ ...paymentData, référence: e.target.value })}
              placeholder="Numéro de virement, cheque..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate('/sante/paiements')}>
              Annuler
            </Button>
            <Button onClick={handlePayment} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Traitement...' : 'Confirmer paiement'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SantePaiementProcessPage;
