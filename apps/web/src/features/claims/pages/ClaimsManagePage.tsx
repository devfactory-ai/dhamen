import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClaims, type Claim } from '../hooks/useClaims';

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
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');

  const { data, isLoading } = useClaims(page, 20, { status: statusFilter });

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

  const columns = [
    {
      key: 'claim',
      header: 'PEC',
      render: (claim: Claim) => (
        <div>
          <p className="font-medium">{claim.claimNumber}</p>
          <p className='text-muted-foreground text-sm'>{formatDate(claim.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'adhérent',
      header: 'Adhérent',
      render: (claim: Claim) => (
        <div>
          <p className="text-sm">{claim.adhérentName || '-'}</p>
          <p className='text-muted-foreground text-xs'>{claim.adhérentNationalId || '-'}</p>
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
          <span className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
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
        if (claim.fraudScore === null) { return '-'; }
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
            <Button size="sm" onClick={() => navigate(`/claims/manage/${claim.id}/process`)}>
              Traiter
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate(`/claims/${claim.id}`)}>
            Details
          </Button>
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
            <CardTitle className='font-medium text-muted-foreground text-sm'>PEC en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='font-bold text-2xl text-yellow-600'>{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className='font-medium text-muted-foreground text-sm'>Montant en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='font-bold text-2xl'>{formatAmount(totalPendingAmount)}</p>
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
    </div>
  );
}
