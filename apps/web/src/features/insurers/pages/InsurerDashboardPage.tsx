/**
 * Insurer Dashboard Page
 *
 * Comprehensive dashboard for insurance company administrators
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api-client';

// Types
interface InsurerStats {
  adhérentsActifs: number;
  contratsActifs: number;
  prestatairesConventionnes: number;
  demandesEnCours: number;
  montantPaiementsMois: number;
  tauxRemboursement: number;
  alertesFraude: number;
  bordereauEnAttente: number;
}

interface DemandeRecente {
  id: string;
  numéroDemande: string;
  adhérent: string;
  typeSoin: string;
  montant: number;
  statut: string;
  dateSoumission: string;
  scoreFraude: number;
}

interface PerformanceMetric {
  période: string;
  demandesTraitées: number;
  delaiMoyenTraitement: number;
  tauxApprobation: number;
  montantRembourse: number;
}

// Mock data
const mockStats: InsurerStats = {
  adhérentsActifs: 15420,
  contratsActifs: 342,
  prestatairesConventionnes: 1250,
  demandesEnCours: 89,
  montantPaiementsMois: 2450000000,
  tauxRemboursement: 78.5,
  alertesFraude: 12,
  bordereauEnAttente: 5,
};

const mockDemandes: DemandeRecente[] = [
  {
    id: '1',
    numéroDemande: 'DEM-2025-001234',
    adhérent: 'Mohamed Ben Ali',
    typeSoin: 'pharmacie',
    montant: 125500,
    statut: 'en_examen',
    dateSoumission: '2025-02-26T10:30:00Z',
    scoreFraude: 15,
  },
  {
    id: '2',
    numéroDemande: 'DEM-2025-001235',
    adhérent: 'Fatma Trabelsi',
    typeSoin: 'consultation',
    montant: 85000,
    statut: 'approuvee',
    dateSoumission: '2025-02-26T09:15:00Z',
    scoreFraude: 5,
  },
  {
    id: '3',
    numéroDemande: 'DEM-2025-001236',
    adhérent: 'Ahmed Mansouri',
    typeSoin: 'hospitalisation',
    montant: 2500000,
    statut: 'en_examen',
    dateSoumission: '2025-02-26T08:45:00Z',
    scoreFraude: 45,
  },
  {
    id: '4',
    numéroDemande: 'DEM-2025-001237',
    adhérent: 'Sarra Gharbi',
    typeSoin: 'laboratoire',
    montant: 75000,
    statut: 'approuvee',
    dateSoumission: '2025-02-25T16:20:00Z',
    scoreFraude: 8,
  },
  {
    id: '5',
    numéroDemande: 'DEM-2025-001238',
    adhérent: 'Karim Chaabane',
    typeSoin: 'optique',
    montant: 350000,
    statut: 'rejetée',
    dateSoumission: '2025-02-25T14:10:00Z',
    scoreFraude: 72,
  },
];

const mockPerformance: PerformanceMetric[] = [
  { période: 'Janvier 2025', demandesTraitées: 4520, delaiMoyenTraitement: 1.2, tauxApprobation: 85.3, montantRembourse: 2150000000 },
  { période: 'Décembre 2024', demandesTraitées: 4180, delaiMoyenTraitement: 1.5, tauxApprobation: 82.1, montantRembourse: 1980000000 },
  { période: 'Novembre 2024', demandesTraitées: 3920, delaiMoyenTraitement: 1.8, tauxApprobation: 80.5, montantRembourse: 1850000000 },
];

export function InsurerDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<'jour' | 'semaine' | 'mois'>('mois');

  // In production, fetch from API
  const { data: stats } = useQuery({
    queryKey: ['insurer-stats', selectedPeriod],
    queryFn: async () => mockStats,
  });

  const { data: demandes } = useQuery({
    queryKey: ['insurer-demandes-récentes'],
    queryFn: async () => mockDemandes,
  });

  const { data: performance } = useQuery({
    queryKey: ['insurer-performance'],
    queryFn: async () => mockPerformance,
  });

  const formatAmount = (millimes: number) => {
    return (millimes / 1000).toLocaleString('fr-TN', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }) + ' TND';
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

  const getStatusBadge = (statut: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
      soumise: 'secondary',
      en_examen: 'warning',
      approuvee: 'success',
      rejetée: 'destructive',
      payee: 'success',
    };
    const labels: Record<string, string> = {
      soumise: 'Soumise',
      en_examen: 'En examen',
      approuvee: 'Approuvée',
      rejetée: 'Rejetée',
      payee: 'Payée',
    };
    return <Badge variant={variants[statut] || 'default'}>{labels[statut] || statut}</Badge>;
  };

  const getFraudBadge = (score: number) => {
    if (score >= 70) return <Badge variant="destructive">Élevé ({score})</Badge>;
    if (score >= 40) return <Badge variant="warning">Moyen ({score})</Badge>;
    return <Badge variant="success">Faible ({score})</Badge>;
  };

  const demandesColumns: Column<DemandeRecente>[] = [
    { key: 'numéroDemande', header: 'N° Demande', sortable: true },
    { key: 'adhérent', header: 'Adhérent', sortable: true },
    {
      key: 'typeSoin',
      header: 'Type',
      render: (row) => row.typeSoin.charAt(0).toUpperCase() + row.typeSoin.slice(1),
    },
    {
      key: 'montant',
      header: 'Montant',
      render: (row) => formatAmount(row.montant),
      sortable: true,
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (row) => getStatusBadge(row.statut),
    },
    {
      key: 'scoreFraude',
      header: 'Score Fraude',
      render: (row) => getFraudBadge(row.scoreFraude),
    },
    {
      key: 'dateSoumission',
      header: 'Date',
      render: (row) => formatDate(row.dateSoumission),
      sortable: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de Bord Assureur"
        description="Vue d'ensemble de l'activité et des performances"
      />

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['jour', 'semaine', 'mois'] as const).map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedPeriod === period
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Adhérents Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.adhérentsActifs.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              +2.5% vs mois précédent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contrats Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.contratsActifs}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.prestatairesConventionnes} prestataires conventionnés
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paiements du Mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats && formatAmount(stats.montantPaiementsMois)}
            </div>
            <p className="text-xs text-muted-foreground">
              Taux de remboursement: {stats?.tauxRemboursement}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Demandes en Cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.demandesEnCours}</div>
            <div className="flex items-center gap-2 mt-1">
              {stats && stats.alertesFraude > 0 && (
                <Badge variant="destructive">{stats.alertesFraude} alertes fraude</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {stats && (stats.alertesFraude > 0 || stats.bordereauEnAttente > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.alertesFraude > 0 && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <span>⚠️</span>
                  Alertes Fraude
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  {stats.alertesFraude} demande(s) nécessitent une vérification manuelle
                </p>
                <button className="text-sm text-primary hover:underline">
                  Voir les alertes →
                </button>
              </CardContent>
            </Card>
          )}

          {stats.bordereauEnAttente > 0 && (
            <Card className="border-warning">
              <CardHeader>
                <CardTitle className="text-warning flex items-center gap-2">
                  <span>📋</span>
                  Bordereaux en Attente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  {stats.bordereauEnAttente} bordereau(x) à valider pour paiement
                </p>
                <button className="text-sm text-primary hover:underline">
                  Gérer les bordereaux →
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recent Claims */}
      <Card>
        <CardHeader>
          <CardTitle>Demandes Récentes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={demandes || []}
            columns={demandesColumns}
            onRowClick={(row) => console.log('View demande:', row.id)}
          />
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Mensuelle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Période</th>
                  <th className="text-right py-3 px-4 font-medium">Demandes Traitées</th>
                  <th className="text-right py-3 px-4 font-medium">Délai Moyen (jours)</th>
                  <th className="text-right py-3 px-4 font-medium">Taux d'Approbation</th>
                  <th className="text-right py-3 px-4 font-medium">Montant Remboursé</th>
                </tr>
              </thead>
              <tbody>
                {performance?.map((metric, index) => (
                  <tr key={metric.période} className={index % 2 === 0 ? 'bg-muted/50' : ''}>
                    <td className="py-3 px-4 font-medium">{metric.période}</td>
                    <td className="text-right py-3 px-4">{metric.demandesTraitées.toLocaleString()}</td>
                    <td className="text-right py-3 px-4">{metric.delaiMoyenTraitement}</td>
                    <td className="text-right py-3 px-4">
                      <Badge variant={metric.tauxApprobation >= 80 ? 'success' : 'warning'}>
                        {metric.tauxApprobation}%
                      </Badge>
                    </td>
                    <td className="text-right py-3 px-4">{formatAmount(metric.montantRembourse)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <CardContent className="pt-6">
            <div className="text-center">
              <span className="text-3xl">📊</span>
              <h3 className="mt-2 font-medium">Rapports</h3>
              <p className="text-sm text-muted-foreground">Générer des rapports</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <CardContent className="pt-6">
            <div className="text-center">
              <span className="text-3xl">💰</span>
              <h3 className="mt-2 font-medium">Bordereaux</h3>
              <p className="text-sm text-muted-foreground">Gérer les paiements</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <CardContent className="pt-6">
            <div className="text-center">
              <span className="text-3xl">🏥</span>
              <h3 className="mt-2 font-medium">Prestataires</h3>
              <p className="text-sm text-muted-foreground">Réseau conventionné</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <CardContent className="pt-6">
            <div className="text-center">
              <span className="text-3xl">⚙️</span>
              <h3 className="mt-2 font-medium">Paramètres</h3>
              <p className="text-sm text-muted-foreground">Configuration</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
