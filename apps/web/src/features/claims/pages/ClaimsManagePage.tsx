import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { useClaims, type Claim } from '../hooks/useClaims';
import { FloatingHelp } from '@/components/ui/floating-help';
import { Filter, CheckCircle, AlertTriangle, Eye } from 'lucide-react';

const CLAIM_TYPES: Record<string, { label: string; color: string }> = {
  pharmacie: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  consultation: { label: 'Consultation', color: 'bg-blue-100 text-blue-800' },
  laboratoire: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  hospitalisation: { label: 'Hospitalisation', color: 'bg-orange-100 text-orange-800' },
  dentaire: { label: 'Dentaire', color: 'bg-pink-100 text-pink-800' },
  optique: { label: 'Optique', color: 'bg-cyan-100 text-cyan-800' },
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

export function ClaimsManagePage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('soumise');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const { data, isLoading } = useClaims(page, 20, { statut: statusFilter });

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
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
      key: "claim",
      header: "PEC",
      render: (claim: Claim) => (
        <div>
          <p className="font-medium">{claim.numeroDemande}</p>
          <p className="text-muted-foreground text-sm">
            {formatDate(claim.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: "adherent",
      header: "Adhérent",
      render: (claim: Claim) => (
        <div>
          <p className="text-sm">
            {claim.adherent
              ? `${claim.adherent.firstName} ${claim.adherent.lastName}`
              : "-"}
          </p>
        </div>
      ),
    },
    {
      key: "praticien",
      header: "Praticien",
      render: (claim: Claim) => (
        <div>
          <p className="text-sm">{claim.praticien?.nom ?? "-"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (claim: Claim) => {
        const typeInfo = CLAIM_TYPES[claim.typeSoin];
        return typeInfo ? (
          <span
            className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}
          >
            {typeInfo.label}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {claim.typeSoin}
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Montant",
      render: (claim: Claim) => (
        <div className="text-right">
          <p className="font-medium">{formatAmount(claim.montantDemande)}</p>
        </div>
      ),
    },
    {
      key: "fraudScore",
      header: "Score",
      render: (claim: Claim) => {
        if (claim.scoreFraude === null) {
          return "-";
        }
        const color =
          claim.scoreFraude > 70
            ? "text-destructive"
            : claim.scoreFraude > 40
              ? "text-yellow-600"
              : "text-green-600";
        return (
          <span className={`font-medium ${color}`}>{claim.scoreFraude}</span>
        );
      },
    },
    {
      key: "status",
      header: "Statut",
      className: "text-center",
      render: (claim: Claim) => {
        const statusInfo = CLAIM_STATUS[claim.statut];
        return statusInfo ? (
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        ) : (
          <span className="text-xs">{claim.statut}</span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-center",
      render: (claim: Claim) => (
        <div className="flex justify-end gap-2">
          {["soumise", "en_examen"].includes(claim.statut) && (
            <Button
              size="sm"
              onClick={() => navigate(`/claims/manage/${claim.id}/process`)}
            >
              Traiter
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/claims/${claim.id}`)}
          >
            Détails
          </Button>
        </div>
      ),
    },
  ];

  // Stats
  const pendingCount = data?.claims.filter((c) => ['soumise', 'en_examen'].includes(c.statut)).length || 0;
  const totalPendingAmount = data?.claims
    .filter((c) => ['soumise', 'en_examen'].includes(c.statut))
    .reduce((sum, c) => sum + c.montantDemande, 0) || 0;

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
        <FilterDropdown
          label="Statut"
          value={CLAIM_STATUS[statusFilter]?.label ?? statusFilter}
          open={statusDropdownOpen}
          onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
          onClose={() => setStatusDropdownOpen(false)}
          menuWidth="w-48"
        >
          {Object.entries(CLAIM_STATUS).map(([value, { label }]) => (
            <FilterOption key={value} selected={statusFilter === value} onClick={() => { setStatusFilter(value); setStatusDropdownOpen(false); }}>{label}</FilterOption>
          ))}
        </FilterDropdown>
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

      <FloatingHelp
        title="Gestion des PEC"
        tips={[
          { icon: <Filter className="h-4 w-4 text-purple-500" />, title: "Filtrer par statut", desc: "Utilisez le filtre pour afficher les PEC soumises, en examen, approuvées ou rejetées." },
          { icon: <CheckCircle className="h-4 w-4 text-green-500" />, title: "Traiter une PEC", desc: "Cliquez sur 'Traiter' pour valider ou rejeter une demande de prise en charge." },
          { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, title: "Score anti-fraude", desc: "Consultez le score de fraude pour identifier les demandes suspectes (> 70 = risque élevé)." },
          { icon: <Eye className="h-4 w-4 text-blue-500" />, title: "Détails", desc: "Cliquez sur 'Détails' pour voir le détail complet d'une PEC et son historique." },
        ]}
      />
    </div>
  );
}
