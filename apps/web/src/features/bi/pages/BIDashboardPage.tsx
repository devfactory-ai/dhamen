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
import { BarChart3, TrendingUp, ShieldAlert, Download } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';

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
    adhérentsActifs: number;
    adhérentsChange: number;
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
  const [période, setPériode] = useState('30j');
  const [assureur, setAssureur] = useState('all');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['bi-stats', période, assureur],
    queryFn: async () => {
      const response = await apiClient.get<BIStats>('/analytics/bi');
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
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
        <Select value={période} onValueChange={setPériode}>
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
            <p className="font-bold text-2xl">{stats.kpis.adhérentsActifs}</p>
            <p className="text-xs">{renderChange(stats.kpis.adhérentsChange)} vs période préc.</p>
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

      <FloatingHelp
        title="Aide - Business Intelligence"
        subtitle="Tableau de bord analytique avancé"
        tips={[
          {
            icon: <BarChart3 className="h-4 w-4 text-blue-500" />,
            title: "KPIs en temps réel",
            desc: "Visualisez les indicateurs clés : demandes, remboursements, taux d'acceptation et délais de traitement.",
          },
          {
            icon: <TrendingUp className="h-4 w-4 text-green-500" />,
            title: "Évolution mensuelle",
            desc: "Analysez les tendances des montants demandés et remboursés mois par mois.",
          },
          {
            icon: <ShieldAlert className="h-4 w-4 text-red-500" />,
            title: "Suivi de la fraude",
            desc: "Surveillez les alertes fraude par niveau et l'évolution des montants suspects.",
          },
          {
            icon: <Download className="h-4 w-4 text-amber-500" />,
            title: "Export des rapports",
            desc: "Exportez vos données en PDF ou Excel pour les partager avec votre équipe.",
          },
        ]}
      />
    </div>
  );
}

