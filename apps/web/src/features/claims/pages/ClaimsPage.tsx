import { useState } from 'react';
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
import { useClaims, type Claim } from '../hooks/useClaims';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { NewClaimForm } from '../components/NewClaimForm';

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

export function ClaimsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [isNewClaimOpen, setIsNewClaimOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const isProvider = ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'].includes(user?.role || '');

  const { data, isLoading } = useClaims(page, 20, {
    status: statusFilter,
    type: typeFilter,
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
      month: '2-digit',
      year: 'numeric',
    });
  };

  const columns = [
    {
      key: 'claim',
      header: 'PEC',
      render: (claim: Claim) => (
        <div>
          <p className="font-medium">{claim.claimNumber}</p>
          <p className="text-sm text-muted-foreground">{formatDate(claim.serviceDate)}</p>
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
          {claim.status === 'APPROVED' && (
            <p className="text-xs text-green-600">Couvert: {formatAmount(claim.coveredAmount)}</p>
          )}
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
      className: 'text-right',
      render: (claim: Claim) => (
        <Button variant="ghost" size="sm" onClick={() => setSelectedClaim(claim)}>
          Détails
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prises en Charge"
        description={isProvider ? 'Gérer vos demandes de prise en charge' : 'Consulter et traiter les PEC'}
        action={
          isProvider
            ? {
                label: 'Nouvelle PEC',
                onClick: () => setIsNewClaimOpen(true),
              }
            : undefined
        }
      />

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(CLAIM_STATUS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(CLAIM_TYPES).map(([value, { label }]) => (
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

      {/* New Claim Dialog */}
      <Dialog open={isNewClaimOpen} onOpenChange={setIsNewClaimOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle Prise en Charge</DialogTitle>
            <DialogDescription>
              Créer une nouvelle demande de prise en charge
            </DialogDescription>
          </DialogHeader>
          <NewClaimForm onSuccess={() => setIsNewClaimOpen(false)} onCancel={() => setIsNewClaimOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Claim Details Dialog */}
      <Dialog open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails PEC {selectedClaim?.claimNumber}</DialogTitle>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Adhérent</p>
                  <p className="font-medium">{selectedClaim.adherentName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CIN</p>
                  <p className="font-medium">{selectedClaim.adherentNationalId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{CLAIM_TYPES[selectedClaim.type].label}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(selectedClaim.serviceDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Montant total</p>
                  <p className="font-medium">{formatAmount(selectedClaim.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Montant couvert</p>
                  <p className="font-medium text-green-600">{formatAmount(selectedClaim.coveredAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ticket modérateur</p>
                  <p className="font-medium">{formatAmount(selectedClaim.copayAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Statut</p>
                  <Badge variant={CLAIM_STATUS[selectedClaim.status].variant}>
                    {CLAIM_STATUS[selectedClaim.status].label}
                  </Badge>
                </div>
              </div>
              {selectedClaim.diagnosis && (
                <div>
                  <p className="text-sm text-muted-foreground">Diagnostic</p>
                  <p>{selectedClaim.diagnosis}</p>
                </div>
              )}
              {selectedClaim.rejectionReason && (
                <div>
                  <p className="text-sm text-muted-foreground">Motif de rejet</p>
                  <p className="text-destructive">{selectedClaim.rejectionReason}</p>
                </div>
              )}
              {selectedClaim.fraudScore !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">Score anti-fraude</p>
                  <p className={selectedClaim.fraudScore > 70 ? 'text-destructive' : selectedClaim.fraudScore > 40 ? 'text-yellow-600' : 'text-green-600'}>
                    {selectedClaim.fraudScore}/100
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
