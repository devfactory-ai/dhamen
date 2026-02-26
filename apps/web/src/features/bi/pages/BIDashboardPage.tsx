/**
 * Business Intelligence Dashboard Page
 *
 * Advanced analytics and reporting dashboard
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface BIStats {
  kpis: {
    totalDemandes: number;
    demandesChange: number;
    montantRembourse: number;
    montantChange: number;
    tauxAcceptation: number;
    tauxChange: number;
    delaiMoyenTraitement: number;
    delaiChange: number;
    scoreFraudeMoyen: number;
    fraudeChange: number;
    adherentsActifs: number;
    adherentsChange: number;
  };
  tendanceMensuelle: Array<{
    mois: string;
    demandes: number;
    montantRembourse: number;
    montantDemande: number;
  }>;
  repartitionTypeSoin: Array<{
    type: string;
    count: number;
    montant: number;
  }>;
  topPraticiens: Array<{
    id: string;
    nom: string;
    type: string;
    demandes: number;
    montant: number;
  }>;
  repartitionStatut: Array<{
    statut: string;
    count: number;
  }>;
  performanceAssureurs: Array<{
    assureur: string;
    demandes: number;
    montant: number;
    delaiMoyen: number;
  }>;
  alertesFraude: Array<{
    niveau: string;
    count: number;
  }>;
  evolutionFraude: Array<{
    semaine: string;
    alertes: number;
    montantSuspect: number;
  }>;
}

export function BIDashboardPage() {
  const [periode, setPeriode] = useState('30j');
  const [assureur, setAssureur] = useState('all');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['bi-stats', periode, assureur],
    queryFn: async () => {
      // Mock data for now
      return getMockBIStats();
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
      maximumFractionDigits: 0,
    }).format(value / 1000);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const renderChange = (value: number) => {
    const isPositive = value >= 0;
    return (
      <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
        {isPositive ? '+' : ''}
        {value.toFixed(1)}%
      </span>
    );
  };

  if (isLoading || !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Intelligence"
        description="Tableau de bord analytique avancé"
      />

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={periode} onValueChange={setPeriode}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7j">7 derniers jours</SelectItem>
            <SelectItem value="30j">30 derniers jours</SelectItem>
            <SelectItem value="90j">90 derniers jours</SelectItem>
            <SelectItem value="12m">12 derniers mois</SelectItem>
            <SelectItem value="ytd">Année en cours</SelectItem>
          </SelectContent>
        </Select>

        <Select value={assureur} onValueChange={setAssureur}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Assureur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les assureurs</SelectItem>
            <SelectItem value="star">STAR</SelectItem>
            <SelectItem value="comar">COMAR</SelectItem>
            <SelectItem value="gat">GAT</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline">Exporter PDF</Button>
          <Button variant="outline">Exporter Excel</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-sm">Demandes</p>
            <p className="font-bold text-2xl">{stats.kpis.totalDemandes}</p>
            <p className="text-xs">{renderChange(stats.kpis.demandesChange)} vs période préc.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-sm">Remboursé</p>
            <p className="font-bold text-2xl">{formatCurrency(stats.kpis.montantRembourse)}</p>
            <p className="text-xs">{renderChange(stats.kpis.montantChange)} vs période préc.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-sm">Taux acceptation</p>
            <p className="font-bold text-2xl">{formatPercent(stats.kpis.tauxAcceptation)}</p>
            <p className="text-xs">{renderChange(stats.kpis.tauxChange)} vs période préc.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-sm">Délai moyen</p>
            <p className="font-bold text-2xl">{stats.kpis.delaiMoyenTraitement}h</p>
            <p className="text-xs">{renderChange(-stats.kpis.delaiChange)} vs période préc.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-sm">Score fraude moy.</p>
            <p className="font-bold text-2xl">{stats.kpis.scoreFraudeMoyen}</p>
            <p className="text-xs">{renderChange(stats.kpis.fraudeChange)} vs période préc.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-sm">Adhérents actifs</p>
            <p className="font-bold text-2xl">{stats.kpis.adherentsActifs}</p>
            <p className="text-xs">{renderChange(stats.kpis.adherentsChange)} vs période préc.</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Évolution mensuelle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.tendanceMensuelle}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mois" />
                  <YAxis yAxisId="left" tickFormatter={(v) => `${v / 1000}k`} />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name.includes('montant') ? formatCurrency(value) : value
                    }
                  />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="montantRembourse"
                    name="Remboursé"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="montantDemande"
                    name="Demandé"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="demandes"
                    name="Nb demandes"
                    stroke="#f59e0b"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Care Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition par type de soin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.repartitionTypeSoin}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="montant"
                    nameKey="type"
                    label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
                  >
                    {stats.repartitionTypeSoin.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.repartitionStatut} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="statut" type="category" width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Fraud Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Alertes fraude par niveau</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.alertesFraude}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="count"
                    nameKey="niveau"
                    label
                  >
                    <Cell fill="#22c55e" />
                    <Cell fill="#f59e0b" />
                    <Cell fill="#f97316" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Fraud Evolution */}
        <Card>
          <CardHeader>
            <CardTitle>Évolution fraude</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.evolutionFraude}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="semaine" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="alertes"
                    name="Alertes"
                    stroke="#ef4444"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="montantSuspect"
                    name="Montant suspect"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 praticiens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topPraticiens.map((praticien, index) => (
                <div
                  key={praticien.id}
                  className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-sm">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{praticien.nom}</p>
                      <p className="text-muted-foreground text-sm">{praticien.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(praticien.montant)}</p>
                    <p className="text-muted-foreground text-sm">{praticien.demandes} demandes</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Insurer Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Performance par assureur</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.performanceAssureurs}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="assureur" />
                  <YAxis yAxisId="left" tickFormatter={(v) => `${v / 1000}k`} />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip formatter={(value: number, name: string) =>
                    name === 'Montant' ? formatCurrency(value) : value
                  } />
                  <Legend />
                  <Bar yAxisId="left" dataKey="montant" name="Montant" fill="#3b82f6" />
                  <Bar yAxisId="right" dataKey="demandes" name="Demandes" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getMockBIStats(): BIStats {
  return {
    kpis: {
      totalDemandes: 2847,
      demandesChange: 12.5,
      montantRembourse: 425000000,
      montantChange: 8.3,
      tauxAcceptation: 89.2,
      tauxChange: 2.1,
      delaiMoyenTraitement: 18,
      delaiChange: 15,
      scoreFraudeMoyen: 12,
      fraudeChange: -5.2,
      adherentsActifs: 15420,
      adherentsChange: 4.8,
    },
    tendanceMensuelle: [
      { mois: 'Sep', demandes: 450, montantRembourse: 65000000, montantDemande: 82000000 },
      { mois: 'Oct', demandes: 520, montantRembourse: 72000000, montantDemande: 91000000 },
      { mois: 'Nov', demandes: 480, montantRembourse: 68000000, montantDemande: 86000000 },
      { mois: 'Dec', demandes: 550, montantRembourse: 78000000, montantDemande: 98000000 },
      { mois: 'Jan', demandes: 620, montantRembourse: 85000000, montantDemande: 107000000 },
      { mois: 'Fev', demandes: 580, montantRembourse: 82000000, montantDemande: 103000000 },
    ],
    repartitionTypeSoin: [
      { type: 'Pharmacie', count: 1250, montant: 180000000 },
      { type: 'Consultation', count: 850, montant: 85000000 },
      { type: 'Hospitalisation', count: 120, montant: 95000000 },
      { type: 'Laboratoire', count: 420, montant: 42000000 },
      { type: 'Optique', count: 180, montant: 18000000 },
      { type: 'Dentaire', count: 27, montant: 5000000 },
    ],
    topPraticiens: [
      { id: '1', nom: 'Pharmacie El Medina', type: 'Pharmacie', demandes: 245, montant: 35000000 },
      { id: '2', nom: 'Clinique Les Oliviers', type: 'Clinique', demandes: 89, montant: 28000000 },
      { id: '3', nom: 'Pharmacie Centrale', type: 'Pharmacie', demandes: 198, montant: 25000000 },
      { id: '4', nom: 'Dr. Karim Mansouri', type: 'Médecin', demandes: 312, montant: 22000000 },
      { id: '5', nom: 'Laboratoire BioAnalyse', type: 'Laboratoire', demandes: 156, montant: 18000000 },
    ],
    repartitionStatut: [
      { statut: 'Approuvées', count: 2540 },
      { statut: 'En attente', count: 180 },
      { statut: 'Rejetées', count: 95 },
      { statut: 'En paiement', count: 32 },
    ],
    performanceAssureurs: [
      { assureur: 'STAR', demandes: 980, montant: 145000000, delaiMoyen: 16 },
      { assureur: 'COMAR', demandes: 750, montant: 112000000, delaiMoyen: 20 },
      { assureur: 'GAT', demandes: 620, montant: 95000000, delaiMoyen: 18 },
      { assureur: 'Autres', demandes: 497, montant: 73000000, delaiMoyen: 22 },
    ],
    alertesFraude: [
      { niveau: 'Faible', count: 45 },
      { niveau: 'Moyen', count: 28 },
      { niveau: 'Élevé', count: 12 },
      { niveau: 'Critique', count: 5 },
    ],
    evolutionFraude: [
      { semaine: 'S1', alertes: 8, montantSuspect: 2500000 },
      { semaine: 'S2', alertes: 12, montantSuspect: 3800000 },
      { semaine: 'S3', alertes: 15, montantSuspect: 4200000 },
      { semaine: 'S4', alertes: 10, montantSuspect: 2900000 },
    ],
  };
}
