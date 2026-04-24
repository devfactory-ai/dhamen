import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { ChevronRight, FileText, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export function BordereauCreatePage() {
  const navigate = useNavigate();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [periodStart, setPeriodStart] = useState(firstOfMonth.toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState(lastOfMonth.toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Preview available bulletins
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['bordereaux-preview', periodStart, periodEnd],
    queryFn: async () => {
      const response = await apiClient.get<{ count: number; totalAmount: number; reimbursedAmount: number }>(
        '/bordereaux/available-bulletins',
        { params: { periodStart, periodEnd } }
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!periodStart && !!periodEnd,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{
        id: string; bordereauNumber: string; claimsCount: number;
        totalAmount: number; coveredAmount: number;
      }>('/bordereaux/generate', {
        periodStart,
        periodEnd,
        notes: notes || undefined,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Bordereau ${data.bordereauNumber} généré avec ${data.claimsCount} bulletin(s)`);
      navigate(`/bordereaux/${data.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la génération');
    },
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const canGenerate = preview && preview.count > 0 && !generateMutation.isPending;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/bordereaux" className="hover:text-gray-900 transition-colors">Bordereaux</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Nouveau bordereau</span>
      </nav>

      <PageHeader
        title="Nouveau bordereau"
        description="Regrouper les bulletins validés/remboursés d'une période pour facturation à l'assureur"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Period Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Période</CardTitle>
            <CardDescription>Sélectionnez la période des bulletins à regrouper</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Date de début</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Date de fin</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optionnel)</Label>
              <Textarea
                id="notes"
                placeholder="Notes ou commentaires pour ce bordereau..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Aperçu</CardTitle>
            <CardDescription>Bulletins disponibles pour cette période</CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : preview && preview.count > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">{preview.count}</span> bulletin(s) prêt(s) à être regroupé(s)
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Montant total</p>
                    <p className="text-xl font-bold">{formatAmount(preview.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Montant remboursé</p>
                    <p className="text-xl font-bold text-primary">{formatAmount(preview.reimbursedAmount)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  Aucun bulletin validé/remboursé disponible pour cette période
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/bordereaux')}>
          Annuler
        </Button>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={!canGenerate}
        >
          {generateMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          Générer le bordereau
        </Button>
      </div>
    </div>
  );
}

export default BordereauCreatePage;
