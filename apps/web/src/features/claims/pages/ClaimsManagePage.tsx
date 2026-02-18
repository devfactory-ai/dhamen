import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClaims, useProcessClaim, type Claim } from '../hooks/useClaims';

const CLAIM_TYPES = {
  PHARMACY: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  CONSULTATION: { label: 'Consultation', color: 'bg-blue-100 text-blue-800' },
  LAB: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  HOSPITALIZATION: { label: 'Hospitalisation', color: 'bg-orange-100 text-orange-800' },
};

const CLAIM_STATUS = {
  PENDING: { label: 'En attente', variant: 'warning' as const },
  APPROVED: { label: 'Approuvée', variant: 'success' as const },
  REJECTED: { label: 'Rejetée', variant: 'destructive' as const },
  PAID: { label: 'Payée', variant: 'info' as const },
};

export function ClaimsManagePage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [processingData, setProcessingData] = useState<{
    status: 'APPROVED' | 'REJECTED';
    coveredAmount: string;
    rejectionReason: string;
    notes: string;
  }>({
    status: 'APPROVED',
    coveredAmount: '',
    rejectionReason: '',
    notes: '',
  });

  const { data, isLoading } = useClaims(page, 20, { status: statusFilter });
  const processClaim = useProcessClaim();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleProcess = async () => {
    if (!selectedClaim) return;

    try {
      await processClaim.mutateAsync({
        id: selectedClaim.id,
        data: {
          status: processingData.status,
          coveredAmount: processingData.status === 'APPROVED' ? parseFloat(processingData.coveredAmount) * 1000 : undefined,
          rejectionReason: processingData.status === 'REJECTED' ? processingData.rejectionReason : undefined,
          notes: processingData.notes || undefined,
        },
      });
      setSelectedClaim(null);
      setProcessingData({ status: 'APPROVED', coveredAmount: '', rejectionReason: '', notes: '' });
    } catch (error) {
      console.error('Error processing claim:', error);
    }
  };

  const openProcessDialog = (claim: Claim) => {
    setSelectedClaim(claim);
    setProcessingData({
      status: 'APPROVED',
      coveredAmount: (claim.amount / 1000).toString(),
      rejectionReason: '',
      notes: '',
    });
  };

  const columns = [
    {
      key: 'claim',
      header: 'PEC',
      render: (claim: Claim) => (
        <div>
          <p className="font-medium">{claim.claimNumber}</p>
          <p className="text-sm text-muted-foreground">{formatDate(claim.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (claim: Claim) => (
        <div>
          <p className="text-sm">{claim.adherentName || '-'}</p>
          <p className="text-xs text-muted-foreground">{claim.adherentNationalId || '-'}</p>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Prestataire',
      render: (claim: Claim) => (
        <div>
          <p className="text-sm">{claim.providerName || '-'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (claim: Claim) => {
        const typeInfo = CLAIM_TYPES[claim.type];
        return (
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (claim: Claim) => (
        <div className="text-right">
          <p className="font-medium">{formatAmount(claim.amount)}</p>
        </div>
      ),
    },
    {
      key: 'fraudScore',
      header: 'Score',
      render: (claim: Claim) => {
        if (claim.fraudScore === null) return '-';
        const color = claim.fraudScore > 70 ? 'text-destructive' : claim.fraudScore > 40 ? 'text-yellow-600' : 'text-green-600';
        return <span className={`font-medium ${color}`}>{claim.fraudScore}</span>;
      },
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
      className: 'text-right',
      render: (claim: Claim) => (
        <div className="flex justify-end gap-2">
          {claim.status === 'PENDING' && (
            <Button size="sm" onClick={() => openProcessDialog(claim)}>
              Traiter
            </Button>
          )}
          {claim.status !== 'PENDING' && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedClaim(claim)}>
              Détails
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Stats
  const pendingCount = data?.claims.filter((c) => c.status === 'PENDING').length || 0;
  const totalPendingAmount = data?.claims
    .filter((c) => c.status === 'PENDING')
    .reduce((sum, c) => sum + c.amount, 0) || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des PEC"
        description="Valider ou rejeter les demandes de prise en charge"
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">PEC en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Montant en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatAmount(totalPendingAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CLAIM_STATUS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.claims || []}
        isLoading={isLoading}
        emptyMessage="Aucune PEC trouvée"
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

      {/* Process Claim Dialog */}
      <Dialog open={!!selectedClaim && selectedClaim.status === 'PENDING'} onOpenChange={() => setSelectedClaim(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter la PEC {selectedClaim?.claimNumber}</DialogTitle>
            <DialogDescription>
              Valider ou rejeter cette demande de prise en charge
            </DialogDescription>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-4">
              {/* Claim Info */}
              <div className="rounded-lg bg-muted p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Adhérent</p>
                    <p className="font-medium">{selectedClaim.adherentName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Montant demandé</p>
                    <p className="font-medium">{formatAmount(selectedClaim.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Prestataire</p>
                    <p className="font-medium">{selectedClaim.providerName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Score anti-fraude</p>
                    <p className={`font-medium ${selectedClaim.fraudScore && selectedClaim.fraudScore > 70 ? 'text-destructive' : ''}`}>
                      {selectedClaim.fraudScore ?? 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Decision */}
              <div className="space-y-2">
                <Label>Décision</Label>
                <div className="flex gap-2">
                  <Button
                    variant={processingData.status === 'APPROVED' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setProcessingData({ ...processingData, status: 'APPROVED' })}
                  >
                    Approuver
                  </Button>
                  <Button
                    variant={processingData.status === 'REJECTED' ? 'destructive' : 'outline'}
                    className="flex-1"
                    onClick={() => setProcessingData({ ...processingData, status: 'REJECTED' })}
                  >
                    Rejeter
                  </Button>
                </div>
              </div>

              {processingData.status === 'APPROVED' && (
                <div className="space-y-2">
                  <Label htmlFor="coveredAmount">Montant couvert (TND)</Label>
                  <Input
                    id="coveredAmount"
                    type="number"
                    step="0.001"
                    value={processingData.coveredAmount}
                    onChange={(e) => setProcessingData({ ...processingData, coveredAmount: e.target.value })}
                  />
                </div>
              )}

              {processingData.status === 'REJECTED' && (
                <div className="space-y-2">
                  <Label htmlFor="rejectionReason">Motif du rejet</Label>
                  <Textarea
                    id="rejectionReason"
                    value={processingData.rejectionReason}
                    onChange={(e) => setProcessingData({ ...processingData, rejectionReason: e.target.value })}
                    placeholder="Indiquer le motif du rejet..."
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optionnel)</Label>
                <Textarea
                  id="notes"
                  value={processingData.notes}
                  onChange={(e) => setProcessingData({ ...processingData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setSelectedClaim(null)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleProcess}
                  disabled={processClaim.isPending}
                  variant={processingData.status === 'REJECTED' ? 'destructive' : 'default'}
                >
                  {processClaim.isPending ? 'Traitement...' : processingData.status === 'APPROVED' ? 'Approuver' : 'Rejeter'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
