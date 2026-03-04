import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClaims, type Claim } from '../hooks/useClaims';
import { useAuth } from '@/features/auth/hooks/useAuth';

const CLAIM_TYPES: Record<string, { label: string; color: string }> = {
  pharmacie: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  consultation: { label: 'Consultation', color: 'bg-blue-100 text-blue-800' },
  laboratoire: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  hospitalisation: { label: 'Hospitalisation', color: 'bg-orange-100 text-orange-800' },
  dentaire: { label: 'Dentaire', color: 'bg-pink-100 text-pink-800' },
  optique: { label: 'Optique', color: 'bg-cyan-100 text-cyan-800' },
  kinesitherapie: { label: 'Kinésithérapie', color: 'bg-amber-100 text-amber-800' },
  autre: { label: 'Autre', color: 'bg-gray-100 text-gray-800' },
};

const CLAIM_STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'destructive' | 'info' | 'default' }> = {
  soumise: { label: 'Soumise', variant: 'warning' },
  en_examen: { label: 'En examen', variant: 'info' },
  info_requise: { label: 'Info requise', variant: 'default' },
  approuvee: { label: 'Approuvée', variant: 'success' },
  en_paiement: { label: 'En paiement', variant: 'info' },
  payee: { label: 'Payée', variant: 'success' },
  rejetee: { label: 'Rejetée', variant: 'destructive' },
};

export function ClaimsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const isProvider = ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN'].includes(user?.role || '');

  const { data, isLoading } = useClaims(page, 20, {
    statut: statusFilter,
    typeSoin: typeFilter,
  });

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
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
          <p className="font-medium">{claim.numeroDemande}</p>
          <p className='text-muted-foreground text-sm'>{formatDate(claim.dateSoin)}</p>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (claim: Claim) => (
        <div>
          <p className="text-sm">
            {claim.adherent
              ? `${claim.adherent.firstName} ${claim.adherent.lastName}`
              : '-'}
          </p>
        </div>
      ),
    },
    {
      key: 'praticien',
      header: 'Praticien',
      render: (claim: Claim) => (
        <div>
          <p className="text-sm">{claim.praticien?.nom ?? '-'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (claim: Claim) => {
        const typeInfo = CLAIM_TYPES[claim.typeSoin] ?? CLAIM_TYPES.autre!;
        return (
          <span className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo?.color}`}>
            {typeInfo?.label}
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (claim: Claim) => (
        <div className="text-right">
          <p className="font-medium">{formatAmount(claim.montantDemande)}</p>
          {claim.montantRembourse != null && (
            <p className='text-green-600 text-xs'>Remboursé: {formatAmount(claim.montantRembourse)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (claim: Claim) => {
        const statusInfo = CLAIM_STATUS[claim.statut] ?? CLAIM_STATUS.soumise!;
        return <Badge variant={statusInfo?.variant}>{statusInfo?.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (claim: Claim) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/claims/${claim.id}`)}>
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
                onClick: () => navigate('/claims/new'),
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
    </div>
  );
}
