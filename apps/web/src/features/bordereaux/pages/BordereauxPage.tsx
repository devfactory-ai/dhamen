import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';

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
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selectedBordereau, setSelectedBordereau] = useState<Bordereau | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bordereaux', page, statusFilter],
    queryFn: async () => {
      const response = await apiClient.get<{ bordereaux: Bordereau[]; total: number }>('/bordereaux', {
        params: { page, limit: 20, status: statusFilter },
      });
      if (!response.success) throw new Error(response.error?.message);
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

  const columns = [
    {
      key: 'bordereau',
      header: 'Bordereau',
      render: (bordereau: Bordereau) => (
        <div>
          <p className="font-medium">{bordereau.bordereauNumber}</p>
          <p className="text-sm text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">sur {formatAmount(bordereau.totalAmount)}</p>
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
          <Button variant="ghost" size="sm" onClick={() => setSelectedBordereau(bordereau)}>
            Détails
          </Button>
          {bordereau.status === 'DRAFT' && (
            <Button variant="outline" size="sm">
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
            <CardTitle className="text-sm font-medium text-muted-foreground">PEC totales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.claims}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Montant couvert</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatAmount(totals.covered)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Montant payé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatAmount(totals.paid)}</p>
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

      {/* Bordereau Details Dialog */}
      <Dialog open={!!selectedBordereau} onOpenChange={() => setSelectedBordereau(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bordereau {selectedBordereau?.bordereauNumber}</DialogTitle>
            <DialogDescription>
              Période: {selectedBordereau && formatDate(selectedBordereau.periodStart)} - {selectedBordereau && formatDate(selectedBordereau.periodEnd)}
            </DialogDescription>
          </DialogHeader>
          {selectedBordereau && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Assureur</p>
                  <p className="font-medium">{selectedBordereau.insurerName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Nombre de PEC</p>
                  <p className="font-medium">{selectedBordereau.claimCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Montant total</p>
                  <p className="font-medium">{formatAmount(selectedBordereau.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Montant couvert</p>
                  <p className="font-medium text-primary">{formatAmount(selectedBordereau.coveredAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Montant payé</p>
                  <p className="font-medium text-green-600">{formatAmount(selectedBordereau.paidAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Statut</p>
                  <Badge variant={BORDEREAU_STATUS[selectedBordereau.status].variant}>
                    {BORDEREAU_STATUS[selectedBordereau.status].label}
                  </Badge>
                </div>
              </div>
              {selectedBordereau.submittedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Soumis le</p>
                  <p className="font-medium">{formatDate(selectedBordereau.submittedAt)}</p>
                </div>
              )}
              {selectedBordereau.paidAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Payé le</p>
                  <p className="font-medium">{formatDate(selectedBordereau.paidAt)}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline">Télécharger PDF</Button>
                {selectedBordereau.status === 'DRAFT' && (
                  <Button>Soumettre</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
