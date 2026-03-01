/**
 * ReconciliationDetailsPage - Reconciliation Item Details Page
 *
 * Dedicated page for viewing reconciliation details
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, Loader2, FileText, CreditCard, Building, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface ReconciliationItem {
  id: string;
  bordereauId: string;
  bordereauNumber: string;
  providerId: string;
  providerName: string;
  period: string;
  claimCount: number;
  déclarédAmount: number;
  verifiedAmount: number;
  difference: number;
  status: 'MATCHED' | 'UNMATCHED' | 'DISPUTED' | 'RESOLVED';
  createdAt: string;
}

const RECONCILIATION_STATUS = {
  MATCHED: { label: 'Rapproche', variant: 'success' as const },
  UNMATCHED: { label: 'Non rapproche', variant: 'warning' as const },
  DISPUTED: { label: 'Conteste', variant: 'destructive' as const },
  RESOLVED: { label: 'Résolu', variant: 'info' as const },
};

export function ReconciliationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ['reconciliation', 'item', id],
    queryFn: async () => {
      const response = await apiClient.get<ReconciliationItem>(`/reconciliation/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const reconcileMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiClient.post<{ item: ReconciliationItem }>(`/reconciliation/${itemId}/reconcile`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      toast.success('Rapprochement effectué avec succès');
      navigate('/reconciliation');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors du rapprochement');
    },
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Élément de réconciliation non trouvé</p>
        <Button onClick={() => navigate('/reconciliation')}>Retour a la reconciliation</Button>
      </div>
    );
  }

  const statusInfo = RECONCILIATION_STATUS[item.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reconciliation')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <PageHeader
            title={`Reconciliation - ${item.bordereauNumber}`}
            description={`Période: ${item.period}`}
          />
        </div>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{item.claimCount}</p>
                <p className="text-sm text-muted-foreground">PEC</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatAmount(item.déclarédAmount)}</p>
                <p className="text-sm text-muted-foreground">Montant déclaré</p>
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
                <p className="text-2xl font-bold">{formatAmount(item.verifiedAmount)}</p>
                <p className="text-sm text-muted-foreground">Montant vérifié</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${
                item.difference === 0 ? 'bg-gray-100' :
                item.difference > 0 ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <CreditCard className={`h-6 w-6 ${
                  item.difference === 0 ? 'text-gray-600' :
                  item.difference > 0 ? 'text-green-600' : 'text-red-600'
                }`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${
                  item.difference === 0 ? '' :
                  item.difference > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {item.difference > 0 ? '+' : ''}{formatAmount(item.difference)}
                </p>
                <p className="text-sm text-muted-foreground">Ecart</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Informations
            </CardTitle>
            <CardDescription>Details du bordereau</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Bordereau</p>
                <p className="font-medium">{item.bordereauNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prestataire</p>
                <p className="font-medium">{item.providerName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Période</p>
                <p className="font-medium">{item.period}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Statut</p>
                <Badge variant={statusInfo.variant} className="mt-1">
                  {statusInfo.label}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Montants
            </CardTitle>
            <CardDescription>Comparaison des montants</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Montant déclaré</span>
                <span className="font-medium">{formatAmount(item.déclarédAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Montant vérifié</span>
                <span className="font-medium">{formatAmount(item.verifiedAmount)}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-medium">Ecart</span>
                <span className={`font-bold text-lg ${
                  item.difference === 0 ? '' :
                  item.difference > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {item.difference > 0 ? '+' : ''}{formatAmount(item.difference)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {item.status === 'UNMATCHED' && (
        <div className="flex justify-end">
          <Button
            onClick={() => reconcileMutation.mutate(item.id)}
            disabled={reconcileMutation.isPending}
          >
            {reconcileMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Rapprocher
          </Button>
        </div>
      )}
    </div>
  );
}

export default ReconciliationDetailsPage;
