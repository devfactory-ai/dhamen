import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Send, Loader2, FileText, Eye, Clock } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';

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
  DISPUTED: { label: 'Contesté', variant: 'destructive' as const },
};

export function BordereauxPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bordereaux', page, statusFilter],
    queryFn: async () => {
      const response = await apiClient.get<{ bordereaux: Bordereau[]; total: number }>('/bordereaux', {
        params: { page, limit: 20, status: statusFilter },
      });
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
  });

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

  const submitMutation = useMutation({
    mutationFn: async (bordereauId: string) => {
      const response = await apiClient.post<{ bordereau: Bordereau }>(`/bordereaux/${bordereauId}/submit`);
      if (!response.success) { throw new Error(response.error?.message); }
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

  const handleSubmitBordereau = (bordereauId: string) => {
    submitMutation.mutate(bordereauId);
  };

  const columns = [
    {
      key: 'bordereau',
      header: 'Bordereau',
      render: (bordereau: Bordereau) => (
        <div>
          <p className="font-medium">{bordereau.bordereauNumber}</p>
          <p className='text-muted-foreground text-sm'>
            {formatDate(bordereau.periodStart)} - {formatDate(bordereau.periodEnd)}
          </p>
        </div>
      ),
    },
    {
      key: 'insurer',
      header: 'Assureur',
      render: (bordereau: Bordereau) => bordereau.insurerName,
    },
    {
      key: 'claims',
      header: 'PEC',
      render: (bordereau: Bordereau) => (
        <span className="font-medium">{bordereau.claimCount}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (bordereau: Bordereau) => (
        <div className="text-right">
          <p className="font-medium">{formatAmount(bordereau.coveredAmount)}</p>
          <p className='text-muted-foreground text-xs'>sur {formatAmount(bordereau.totalAmount)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (bordereau: Bordereau) => {
        const statusInfo = BORDEREAU_STATUS[bordereau.status];
        return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (bordereau: Bordereau) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/bordereaux/${bordereau.id}`)}>
            Details
          </Button>
          {bordereau.status === 'DRAFT' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSubmitBordereau(bordereau.id)}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Send className="mr-1 h-3 w-3" />
              )}
              Soumettre
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Calculate totals
  const totals = data?.bordereaux.reduce(
    (acc, b) => ({
      claims: acc.claims + b.claimCount,
      covered: acc.covered + b.coveredAmount,
      paid: acc.paid + b.paidAmount,
    }),
    { claims: 0, covered: 0, paid: 0 }
  ) || { claims: 0, covered: 0, paid: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bordereaux"
        description="Relevés de facturation pour paiement"
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className='font-medium text-muted-foreground text-sm'>PEC totales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='font-bold text-2xl'>{totals.claims}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className='font-medium text-muted-foreground text-sm'>Montant couvert</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='font-bold text-2xl text-primary'>{formatAmount(totals.covered)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className='font-medium text-muted-foreground text-sm'>Montant payé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='font-bold text-2xl text-green-600'>{formatAmount(totals.paid)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(BORDEREAU_STATUS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.bordereaux || []}
        isLoading={isLoading}
        emptyMessage="Aucun bordereau trouvé"
        pagination={
          data
            ? {
                page,
                limit: 20,
                total: data.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      <FloatingHelp
        title="Bordereaux"
        tips={[
          { icon: <FileText className="h-4 w-4 text-blue-500" />, title: "Qu'est-ce qu'un bordereau ?", desc: "Un bordereau regroupe les PEC d'une période pour facturation entre prestataire et assureur." },
          { icon: <Send className="h-4 w-4 text-green-500" />, title: "Soumettre", desc: "Les bordereaux en brouillon peuvent être soumis à l'assureur pour validation et paiement." },
          { icon: <Clock className="h-4 w-4 text-amber-500" />, title: "Suivi des statuts", desc: "Suivez le cycle : Brouillon, Soumis, Validé, Payé ou Contesté." },
          { icon: <Eye className="h-4 w-4 text-purple-500" />, title: "Détails", desc: "Cliquez sur 'Détails' pour voir la liste des PEC incluses dans le bordereau." },
        ]}
      />
    </div>
  );
}
