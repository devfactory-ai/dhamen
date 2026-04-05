/**
 * SoinFlow Paiements management page
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  usePaiements,
  usePaiementsStats,
  useUpdatePaiementStatut,
  PAIEMENT_STATUTS_LABELS,
  PAIEMENT_STATUTS_COLORS,
  PAIEMENT_METHODES_LABELS,
  type Paiement,
  type PaiementStatut,
} from '../hooks/usePaiements';
import { useToast } from '@/stores/toast';
import { FloatingHelp } from '@/components/ui/floating-help';
import { CreditCard, CheckCircle, Users, Clock } from 'lucide-react';

export function SantePaiementsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ statut?: PaiementStatut }>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();

  const { data, isLoading } = usePaiements(page, 20, filters);
  const { data: stats } = usePaiementsStats();
  const updateMutation = useUpdatePaiementStatut();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000); // Convert millimes to TND
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleQuickValidate = async (paiement: Paiement) => {
    try {
      await updateMutation.mutateAsync({
        id: paiement.id,
        data: { statut: 'valide' },
      });
      toast({ title: 'Paiement valide', variant: 'success' });
    } catch (error) {
      toast({
        title: 'Erreur lors de la validation',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const handleBatchProcess = () => {
    if (selectedIds.length === 0) {
      toast({ title: 'Sélectionnez des paiements', variant: 'destructive' });
      return;
    }
    navigate(`/sante/paiements/batch?ids=${selectedIds.join(',')}`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const eligibleIds = (data?.data ?? [])
      .filter((p) => p.statut === 'en_attente' || p.statut === 'valide')
      .map((p) => p.id);

    if (selectedIds.length === eligibleIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleIds);
    }
  };

  const columns = [
    {
      key: 'select',
      header: () => (
        <Checkbox
          checked={selectedIds.length > 0 && selectedIds.length === (data?.data ?? []).filter((p) => ['en_attente', 'valide'].includes(p.statut)).length}
          onCheckedChange={toggleSelectAll}
        />
      ),
      render: (p: Paiement) => {
        const canSelect = ['en_attente', 'valide'].includes(p.statut);
        return canSelect ? (
          <Checkbox
            checked={selectedIds.includes(p.id)}
            onCheckedChange={() => toggleSelect(p.id)}
          />
        ) : null;
      },
    },
    {
      key: 'paiement',
      header: 'Paiement',
      render: (p: Paiement) => (
        <div>
          <p className="font-medium">{p.numéroPaiement}</p>
          <p className="text-muted-foreground text-sm">{formatDate(p.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'bénéficiaire',
      header: 'Bénéficiaire',
      render: (p: Paiement) => (
        <div>
          <p className="text-sm">{p.bénéficiaireId}</p>
          <p className="text-muted-foreground text-xs">
            {p.bénéficiaireType === 'adhérent' ? 'Adhérent' : 'Praticien'}
          </p>
        </div>
      ),
    },
    {
      key: 'montant',
      header: 'Montant',
      render: (p: Paiement) => (
        <span className="font-medium">{formatAmount(p.montant)}</span>
      ),
    },
    {
      key: 'méthode',
      header: 'Méthode',
      render: (p: Paiement) => (
        <span className="text-sm">
          {p.méthode ? PAIEMENT_METHODES_LABELS[p.méthode] : '-'}
        </span>
      ),
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (p: Paiement) => (
        <span className={`rounded-full px-2 py-1 text-xs ${PAIEMENT_STATUTS_COLORS[p.statut]}`}>
          {PAIEMENT_STATUTS_LABELS[p.statut]}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p: Paiement) => (
        <div className="flex justify-end gap-2">
          {p.statut === 'en_attente' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickValidate(p)}
              disabled={updateMutation.isPending}
            >
              Valider
            </Button>
          )}
          {p.statut === 'valide' && (
            <Button
              size="sm"
              onClick={() => navigate(`/sante/paiements/${p.id}/process`)}
            >
              Payer
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate(`/sante/paiements/${p.id}`)}>
            Details
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements SoinFlow"
        description="Gestion des paiements de remboursement"
        action={
          selectedIds.length > 0 ? (
            <Button onClick={handleBatchProcess}>
              Traiter {selectedIds.length} paiement(s)
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats?.totalPaiements ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Montant total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{stats ? formatAmount(stats.montantTotal) : '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">En attente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-yellow-600">
              {stats?.parStatut?.en_attente?.count ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Payes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-green-600">
              {stats?.parStatut?.paye?.count ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={filters.statut ?? 'all'}
          onValueChange={(v) => setFilters({ ...filters, statut: v === 'all' ? undefined : v as PaiementStatut })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(PAIEMENT_STATUTS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="Aucun adhérent trouvé"
        pagination={
          data?.meta
            ? {
                page: data.meta.page,
                limit: data.meta.limit,
                total: data.meta.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      <FloatingHelp
        title="Aide - Paiements"
        subtitle="Gestion des paiements de remboursement"
        tips={[
          {
            icon: <CheckCircle className="h-4 w-4 text-green-500" />,
            title: "Valider un paiement",
            desc: "Cliquez sur 'Valider' pour approuver un paiement en attente avant le reglement.",
          },
          {
            icon: <CreditCard className="h-4 w-4 text-blue-500" />,
            title: "Traitement par lot",
            desc: "Selectionnez plusieurs paiements avec les cases a cocher pour un traitement groupe.",
          },
          {
            icon: <Users className="h-4 w-4 text-purple-500" />,
            title: "Beneficiaire",
            desc: "Le paiement peut etre destine a un adherent ou a un praticien selon le type de demande.",
          },
          {
            icon: <Clock className="h-4 w-4 text-orange-500" />,
            title: "Suivi des statuts",
            desc: "Filtrez par statut pour voir les paiements en attente, valides ou deja payes.",
          },
        ]}
      />
    </div>
  );
}
