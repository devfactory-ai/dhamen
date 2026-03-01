import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Download, CheckCircle, Loader2, Eye } from 'lucide-react';

interface ReconciliationSummary {
  period: string;
  totalClaims: number;
  totalAmount: number;
  matchedClaims: number;
  matchedAmount: number;
  unmatchedClaims: number;
  unmatchedAmount: number;
  disputedClaims: number;
  disputedAmount: number;
  matchRate: number;
}

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
  MATCHED: { label: 'Rapproché', variant: 'success' as const },
  UNMATCHED: { label: 'Non rapproché', variant: 'warning' as const },
  DISPUTED: { label: 'Contesté', variant: 'destructive' as const },
  RESOLVED: { label: 'Résolu', variant: 'info' as const },
};

export function ReconciliationPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [periodFilter, setPeriodFilter] = useState<string>('2024-01');
  const [isExporting, setIsExporting] = useState(false);

  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['reconciliation', 'summary', periodFilter],
    queryFn: async () => {
      const response = await apiClient.get<ReconciliationSummary>('/reconciliation/summary', {
        params: { period: periodFilter },
      });
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reconciliation', page, periodFilter],
    queryFn: async () => {
      const response = await apiClient.get<{ items: ReconciliationItem[]; total: number }>('/reconciliation', {
        params: { page, limit: 20, period: periodFilter },
      });
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const reconcileMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiClient.post<{ item: ReconciliationItem }>(`/reconciliation/${itemId}/reconcile`);
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      toast.success('Rapprochement effectué avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors du rapprochement');
    },
  });

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const response = await apiClient.get<Blob>('/reconciliation/export', {
        params: { period: periodFilter },
        responseType: 'blob',
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de l\'export');
      }

      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reconciliation-${periodFilter}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Export téléchargé avec succès');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const handleReconcile = (itemId: string) => {
    reconcileMutation.mutate(itemId);
  };

  const columns = [
    {
      key: 'bordereau',
      header: 'Bordereau',
      render: (item: ReconciliationItem) => (
        <div>
          <p className="font-medium">{item.bordereauNumber}</p>
          <p className='text-muted-foreground text-sm'>{item.providerName}</p>
        </div>
      ),
    },
    {
      key: 'claims',
      header: 'PEC',
      render: (item: ReconciliationItem) => item.claimCount,
    },
    {
      key: 'déclaréd',
      header: 'Déclaré',
      render: (item: ReconciliationItem) => (
        <span className="text-right font-medium">{formatAmount(item.déclarédAmount)}</span>
      ),
    },
    {
      key: 'verified',
      header: 'Vérifié',
      render: (item: ReconciliationItem) => (
        <span className="text-right font-medium">{formatAmount(item.verifiedAmount)}</span>
      ),
    },
    {
      key: 'difference',
      header: 'Écart',
      render: (item: ReconciliationItem) => {
        const diff = item.difference;
        const color = diff === 0 ? '' : diff > 0 ? 'text-green-600' : 'text-destructive';
        return (
          <span className={`font-medium ${color}`}>
            {diff > 0 ? '+' : ''}{formatAmount(diff)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Statut',
      render: (item: ReconciliationItem) => {
        const statusInfo = RECONCILIATION_STATUS[item.status];
        return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (item: ReconciliationItem) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/reconciliation/${item.id}`)}>
            <Eye className="mr-1 h-3 w-3" />
            Détails
          </Button>
          {item.status === 'UNMATCHED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReconcile(item.id)}
              disabled={reconcileMutation.isPending}
            >
              {reconcileMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-3 w-3" />
              )}
              Rapprocher
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Generate period options
  const periods = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('fr-TN', { month: 'long', year: 'numeric' });
    periods.push({ value, label });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Réconciliation"
        description="Rapprochement des paiements et bordereaux"
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className='font-medium text-muted-foreground text-sm'>Taux de rapprochement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='font-bold text-2xl text-primary'>{summary.matchRate.toFixed(1)}%</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${summary.matchRate}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className='font-medium text-muted-foreground text-sm'>Rapprochés</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='font-bold text-2xl text-green-600'>{summary.matchedClaims}</p>
              <p className='text-muted-foreground text-sm'>{formatAmount(summary.matchedAmount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className='font-medium text-muted-foreground text-sm'>Non rapprochés</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='font-bold text-2xl text-yellow-600'>{summary.unmatchedClaims}</p>
              <p className='text-muted-foreground text-sm'>{formatAmount(summary.unmatchedAmount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className='font-medium text-muted-foreground text-sm'>Contestés</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='font-bold text-2xl text-destructive'>{summary.disputedClaims}</p>
              <p className='text-muted-foreground text-sm'>{formatAmount(summary.disputedAmount)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Exporter
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.items || []}
        isLoading={isLoading}
        emptyMessage="Aucune réconciliation trouvée"
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
    </div>
  );
}
