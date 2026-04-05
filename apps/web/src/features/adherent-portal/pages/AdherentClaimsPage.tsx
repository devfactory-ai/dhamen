import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { FileText, Download, Eye, Pill, Stethoscope, FlaskConical, Building2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Claim {
  id: string;
  claimNumber: string;
  type: 'PHARMACY' | 'CONSULTATION' | 'LAB' | 'HOSPITALIZATION';
  providerName: string;
  date: string;
  totalAmount: number;
  coveredAmount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  items: ClaimItem[];
}

interface ClaimItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  coveredAmount: number;
}

const CLAIM_TYPES = {
  PHARMACY: { label: 'Pharmacie', icon: Pill, color: 'bg-blue-100 text-blue-600' },
  CONSULTATION: { label: 'Consultation', icon: Stethoscope, color: 'bg-green-100 text-green-600' },
  LAB: { label: 'Laboratoire', icon: FlaskConical, color: 'bg-purple-100 text-purple-600' },
  HOSPITALIZATION: { label: 'Hospitalisation', icon: Building2, color: 'bg-orange-100 text-orange-600' },
};

const CLAIM_STATUS = {
  PENDING: { label: 'En attente', variant: 'warning' as const },
  APPROVED: { label: 'Approuvé', variant: 'success' as const },
  REJECTED: { label: 'Refusé', variant: 'destructive' as const },
  PAID: { label: 'Payé', variant: 'default' as const },
};

export function AdhérentClaimsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['adhérent-claims', user?.id, page],
    queryFn: async () => {
      const response = await apiClient.get<{ claims: Claim[]; total: number }>('/adherents/me/claims', {
        params: { page, limit: 10 },
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!user?.id,
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
      minimumFractionDigits: 3,
    }).format(amount / 1000);
  };

  const columns = [
    {
      key: 'claimNumber',
      header: 'N PEC',
      render: (claim: Claim) => (
        <div>
          <p className="font-mono font-medium">{claim.claimNumber}</p>
          <p className="text-sm text-muted-foreground">{formatDate(claim.date)}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (claim: Claim) => {
        const typeInfo = CLAIM_TYPES[claim.type];
        const Icon = typeInfo.icon;
        return (
          <div className="flex items-center gap-2">
            <div className={`rounded-full p-1.5 ${typeInfo.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span>{typeInfo.label}</span>
          </div>
        );
      },
    },
    {
      key: 'provider',
      header: 'Praticien',
      render: (claim: Claim) => claim.providerName,
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (claim: Claim) => (
        <div>
          <p className="font-medium">{formatAmount(claim.totalAmount)}</p>
          <p className="text-sm text-green-600">
            Rembourse: {formatAmount(claim.coveredAmount)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (claim: Claim) => {
        const statusInfo = CLAIM_STATUS[claim.status];
        return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (claim: Claim) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedClaim(claim)}
        >
          <Eye className="mr-2 h-4 w-4" />
          Details
        </Button>
      ),
    },
  ];

  // Calculate totals
  const totals = data?.claims?.reduce(
    (acc, claim) => ({
      total: acc.total + claim.totalAmount,
      covered: acc.covered + claim.coveredAmount,
    }),
    { total: 0, covered: 0 }
  ) || { total: 0, covered: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes remboursements"
        description="Historique de vos prises en charge"
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total demandes</p>
                <p className="text-2xl font-bold">{data?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Download className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Montant total</p>
                <p className="text-2xl font-bold">{formatAmount(totals.total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Download className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rembourse</p>
                <p className="text-2xl font-bold text-green-600">{formatAmount(totals.covered)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Claims Table */}
      <DataTable
        columns={columns}
        data={data?.claims || []}
        isLoading={isLoading}
        emptyMessage="Aucune prise en charge trouvée"
        pagination={
          data
            ? {
                page,
                limit: 10,
                total: data.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      {/* Claim Details Dialog */}
      <Dialog open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Details de la prise en charge {selectedClaim?.claimNumber}
            </DialogTitle>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(selectedClaim.date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Praticien</p>
                  <p className="font-medium">{selectedClaim.providerName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{CLAIM_TYPES[selectedClaim.type].label}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Statut</p>
                  <Badge variant={CLAIM_STATUS[selectedClaim.status].variant}>
                    {CLAIM_STATUS[selectedClaim.status].label}
                  </Badge>
                </div>
              </div>

              {selectedClaim.items && selectedClaim.items.length > 0 && (
                <div>
                  <h4 className="mb-3 font-semibold">Details des prestations</h4>
                  <div className="rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left">Description</th>
                          <th className="px-4 py-2 text-right">Qte</th>
                          <th className="px-4 py-2 text-right">P.U.</th>
                          <th className="px-4 py-2 text-right">Total</th>
                          <th className="px-4 py-2 text-right">Rembourse</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedClaim.items.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-4 py-2">{item.description}</td>
                            <td className="px-4 py-2 text-right">{item.quantity}</td>
                            <td className="px-4 py-2 text-right">{formatAmount(item.unitPrice)}</td>
                            <td className="px-4 py-2 text-right">{formatAmount(item.totalPrice)}</td>
                            <td className="px-4 py-2 text-right text-green-600">
                              {formatAmount(item.coveredAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted font-medium">
                        <tr>
                          <td colSpan={3} className="px-4 py-2">Total</td>
                          <td className="px-4 py-2 text-right">{formatAmount(selectedClaim.totalAmount)}</td>
                          <td className="px-4 py-2 text-right text-green-600">
                            {formatAmount(selectedClaim.coveredAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdhérentClaimsPage;
