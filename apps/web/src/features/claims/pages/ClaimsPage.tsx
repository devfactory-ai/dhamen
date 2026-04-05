import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
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
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

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
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <FilterDropdown
          label="Statut"
          value={statusFilter ? (CLAIM_STATUS[statusFilter]?.label ?? 'Tous les statuts') : 'Tous les statuts'}
          open={statusDropdownOpen}
          onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
          onClose={() => setStatusDropdownOpen(false)}
          menuWidth="w-48"
        >
          <FilterOption selected={!statusFilter} onClick={() => { setStatusFilter(undefined); setStatusDropdownOpen(false); }}>Tous les statuts</FilterOption>
          {Object.entries(CLAIM_STATUS).map(([value, { label }]) => (
            <FilterOption key={value} selected={statusFilter === value} onClick={() => { setStatusFilter(value); setStatusDropdownOpen(false); }}>{label}</FilterOption>
          ))}
        </FilterDropdown>
        <FilterDropdown
          label="Type"
          value={typeFilter ? (CLAIM_TYPES[typeFilter]?.label ?? 'Tous les types') : 'Tous les types'}
          open={typeDropdownOpen}
          onToggle={() => setTypeDropdownOpen(!typeDropdownOpen)}
          onClose={() => setTypeDropdownOpen(false)}
          menuWidth="w-48"
        >
          <FilterOption selected={!typeFilter} onClick={() => { setTypeFilter(undefined); setTypeDropdownOpen(false); }}>Tous les types</FilterOption>
          {Object.entries(CLAIM_TYPES).map(([value, { label }]) => (
            <FilterOption key={value} selected={typeFilter === value} onClick={() => { setTypeFilter(value); setTypeDropdownOpen(false); }}>{label}</FilterOption>
          ))}
        </FilterDropdown>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
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
    </div>
  );
}
