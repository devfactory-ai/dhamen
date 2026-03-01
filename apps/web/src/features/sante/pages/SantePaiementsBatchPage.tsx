/**
 * SantePaiementsBatchPage - Batch Payments Processing Page
 *
 * Dedicated page for batch processing multiple payments
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, CheckCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useBatchPaiements,
  PAIEMENT_METHODES_LABELS,
  type PaiementMéthode,
} from '../hooks/usePaiements';
import { useToast } from '@/stores/toast';

export function SantePaiementsBatchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const batchMutation = useBatchPaiements();

  // Get IDs from URL query params
  const idsParam = searchParams.get('ids');
  const selectedIds = idsParam ? idsParam.split(',') : [];

  const [batchData, setBatchData] = useState({
    action: 'valider' as 'valider' | 'payer',
    méthode: 'virement' as PaiementMéthode,
    référence: '',
  });

  useEffect(() => {
    if (selectedIds.length === 0) {
      toast({ title: 'Aucun paiement sélectionné', variant: 'destructive' });
      navigate('/sante/paiements');
    }
  }, [selectedIds.length, navigate, toast]);

  const handleBatch = async () => {
    if (selectedIds.length === 0) {
      toast({ title: 'Sélectionnez des paiements', variant: 'destructive' });
      return;
    }

    try {
      const result = await batchMutation.mutateAsync({
        action: batchData.action,
        paiementIds: selectedIds,
        méthode: batchData.action === 'payer' ? batchData.méthode : undefined,
        référence: batchData.action === 'payer' ? batchData.référence : undefined,
      });
      toast({
        title: `${result.processed} paiements traites`,
        variant: 'success',
      });
      navigate('/sante/paiements');
    } catch (error) {
      toast({
        title: 'Erreur lors du traitement',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sante/paiements')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title="Traitement par lot"
          description={`${selectedIds.length} paiement(s) sélectionné(s)`}
        />
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Paiements sélectionnés
          </CardTitle>
          <CardDescription>
            Les paiements suivants seront traites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {selectedIds.map((id) => (
              <span
                key={id}
                className="inline-block rounded-full bg-muted px-3 py-1 text-sm"
              >
                {id.slice(0, 8)}...
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Batch Form */}
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Options de traitement
          </CardTitle>
          <CardDescription>Sélectionnez l'action a effectuér</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select
              value={batchData.action}
              onValueChange={(v) => setBatchData({ ...batchData, action: v as 'valider' | 'payer' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="valider">Valider</SelectItem>
                <SelectItem value="payer">Payer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {batchData.action === 'payer' && (
            <>
              <div className="space-y-2">
                <Label>Méthode de paiement</Label>
                <Select
                  value={batchData.méthode}
                  onValueChange={(v) => setBatchData({ ...batchData, méthode: v as PaiementMéthode })}
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
                <Label htmlFor="batchRéférence">Référence commune (optionnel)</Label>
                <Input
                  id="batchRéférence"
                  value={batchData.référence}
                  onChange={(e) => setBatchData({ ...batchData, référence: e.target.value })}
                  placeholder="Référence commune pour tous les paiements..."
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate('/sante/paiements')}>
              Annuler
            </Button>
            <Button onClick={handleBatch} disabled={batchMutation.isPending}>
              {batchMutation.isPending ? 'Traitement...' : `Traiter ${selectedIds.length} paiement(s)`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SantePaiementsBatchPage;
