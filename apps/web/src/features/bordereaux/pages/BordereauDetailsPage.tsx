/**
 * BordereauDetailsPage - Bordereau Details Page
 *
 * Dedicated page for viewing bordereau details
 */
import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, Send, Loader2, FileText, CreditCard, Calendar, Building } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface Bordereau {
  id: string;
  bordereauNumber: string;
  insurerId: string;
  insurerName: string;
  providerId: string;
  providerName: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'PAID' | 'DISPUTED';
  claimCount: number;
  totalAmount: number;
  coveredAmount: number;
  paidAmount: number;
  submittedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

const BORDEREAU_STATUS = {
  DRAFT: { label: 'Brouillon', variant: 'secondary' as const },
  SUBMITTED: { label: 'Soumis', variant: 'info' as const },
  VALIDATED: { label: 'Validé', variant: 'success' as const },
  PAID: { label: 'Payé', variant: 'success' as const },
  DISPUTED: { label: 'Conteste', variant: 'destructive' as const },
};

export function BordereauDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data: bordereau, isLoading } = useQuery({
    queryKey: ['bordereaux', id],
    queryFn: async () => {
      const response = await apiClient.get<Bordereau>(`/bordereaux/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: async (bordereauId: string) => {
      const response = await apiClient.post<{ bordereau: Bordereau }>(`/bordereaux/${bordereauId}/submit`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bordereaux'] });
      toast.success('Bordereau soumis avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la soumission');
    },
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

  const handleDownloadPdf = async () => {
    if (!bordereau) return;
    try {
      setDownloadingPdf(true);
      const response = await apiClient.get<Blob>(`/bordereaux/${bordereau.id}/pdf`, {
        responseType: 'blob',
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du telechargement');
      }

      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bordereau-${bordereau.bordereauNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('PDF téléchargé avec succès');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors du telechargement');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!bordereau) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Bordereau non trouvé</p>
        <Button onClick={() => navigate('/bordereaux')}>Retour aux bordereaux</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/bordereaux" className="hover:text-gray-900 transition-colors">Bordereaux</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Bordereau ${bordereau.bordereauNumber}`}
          description={`Période: ${formatDate(bordereau.periodStart)} - ${formatDate(bordereau.periodEnd)}`}
        />
        <Badge variant={BORDEREAU_STATUS[bordereau.status].variant}>
          {BORDEREAU_STATUS[bordereau.status].label}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bordereau.claimCount}</p>
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
                <p className="text-2xl font-bold">{formatAmount(bordereau.totalAmount)}</p>
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
                <p className="text-2xl font-bold text-primary">{formatAmount(bordereau.coveredAmount)}</p>
                <p className="text-sm text-muted-foreground">Montant couvert</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-emerald-100">
                <CreditCard className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{formatAmount(bordereau.paidAmount)}</p>
                <p className="text-sm text-muted-foreground">Montant paye</p>
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
                <p className="text-sm text-muted-foreground">Assureur</p>
                <p className="font-medium">{bordereau.insurerName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Praticien</p>
                <p className="font-medium">{bordereau.providerName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Statut</p>
                <Badge variant={BORDEREAU_STATUS[bordereau.status].variant} className="mt-1">
                  {BORDEREAU_STATUS[bordereau.status].label}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Créé le</p>
                <p className="font-medium">{formatDate(bordereau.createdAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Dates
            </CardTitle>
            <CardDescription>Historique du bordereau</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Période debut</p>
                <p className="font-medium">{formatDate(bordereau.periodStart)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Période fin</p>
                <p className="font-medium">{formatDate(bordereau.periodEnd)}</p>
              </div>
              {bordereau.submittedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Soumis le</p>
                  <p className="font-medium">{formatDate(bordereau.submittedAt)}</p>
                </div>
              )}
              {bordereau.paidAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Paye le</p>
                  <p className="font-medium text-green-600">{formatDate(bordereau.paidAt)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf}>
          {downloadingPdf ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Télécharger PDF
        </Button>
        {bordereau.status === 'DRAFT' && (
          <Button onClick={() => submitMutation.mutate(bordereau.id)} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Soumettre
          </Button>
        )}
      </div>
    </div>
  );
}

export default BordereauDetailsPage;
