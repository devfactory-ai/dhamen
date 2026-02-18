import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface ReportStats {
  period: string;
  claims: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  amounts: {
    total: number;
    covered: number;
    copay: number;
  };
  byType: {
    type: string;
    count: number;
    amount: number;
  }[];
  trend: {
    date: string;
    claims: number;
    amount: number;
  }[];
}

export function ReportsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('month');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'stats', period],
    queryFn: async () => {
      const response = await apiClient.get<ReportStats>('/reports/stats', {
        params: { period },
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const typeLabels: Record<string, string> = {
    PHARMACY: 'Pharmacie',
    CONSULTATION: 'Consultation',
    LAB: 'Laboratoire',
    HOSPITALIZATION: 'Hospitalisation',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapports"
        description="Statistiques et analyses d'activité"
      />

      {/* Period Filter */}
      <div className="flex items-center justify-between">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Cette semaine</SelectItem>
            <SelectItem value="month">Ce mois</SelectItem>
            <SelectItem value="quarter">Ce trimestre</SelectItem>
            <SelectItem value="year">Cette année</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline">
            Exporter PDF
          </Button>
          <Button variant="outline">
            Exporter Excel
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total PEC</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.claims.total}</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="text-green-600">{data.claims.approved} approuvées</span>
                  <span className="text-destructive">{data.claims.rejected} rejetées</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Montant total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatAmount(data.amounts.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Montant couvert</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">{formatAmount(data.amounts.covered)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ticket modérateur</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-muted-foreground">{formatAmount(data.amounts.copay)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* By Type */}
            <Card>
              <CardHeader>
                <CardTitle>Répartition par type</CardTitle>
                <CardDescription>Distribution des PEC par type de prestation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.byType.map((item) => {
                    const percentage = (item.count / data.claims.total) * 100;
                    return (
                      <div key={item.type}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span>{typeLabels[item.type] || item.type}</span>
                          <span className="font-medium">{item.count} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{formatAmount(item.amount)}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Tendance</CardTitle>
                <CardDescription>Évolution des PEC sur la période</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.trend.slice(-10).map((item, index) => {
                    const maxClaims = Math.max(...data.trend.map((t) => t.claims));
                    const percentage = (item.claims / maxClaims) * 100;
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <span className="w-20 text-xs text-muted-foreground">
                          {new Date(item.date).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short' })}
                        </span>
                        <div className="flex-1">
                          <div className="h-4 w-full overflow-hidden rounded bg-muted">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-12 text-right text-sm font-medium">{item.claims}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Approval Rate */}
          <Card>
            <CardHeader>
              <CardTitle>Taux d'approbation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div className="relative h-32 w-32">
                  <svg className="h-32 w-32 -rotate-90 transform" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-muted"
                      strokeWidth="2"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-green-500"
                      strokeWidth="2"
                      strokeDasharray={`${(data.claims.approved / data.claims.total) * 100} 100`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">
                      {((data.claims.approved / data.claims.total) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span>Approuvées: {data.claims.approved}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-destructive" />
                    <span>Rejetées: {data.claims.rejected}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <span>En attente: {data.claims.pending}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
