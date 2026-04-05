/**
 * SoinFlow Advanced Analytics Page
 *
 * Interactive charts, comparisons, and detailed analytics
 */
import { useState, useMemo } from 'react';
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
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  useSanteDashboard,
  useAnalyticsComparison,
  formatMontant,
  formatPourcentage,
  TYPE_SOIN_COLORS,
  STATUT_COLORS,
} from '../hooks/useStats';

type Period = 'week' | 'month' | 'quarter' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Cette semaine',
  month: 'Ce mois',
  quarter: 'Ce trimestre',
  year: 'Cette année',
};

const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export function SanteAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: dashboardData, isLoading, refetch } = useSanteDashboard(period === 'quarter' ? 'month' : period);
  const { data: comparisonData } = useAnalyticsComparison(period);

  const chartData = useMemo(() => {
    if (!dashboardData?.tendances) return [];
    return dashboardData.tendances.map((t) => ({
      ...t,
      montantDemandeTND: t.montantDemande / 1000,
      montantRembourseTND: t.montantRembourse / 1000,
    }));
  }, [dashboardData?.tendances]);

  const pieData = useMemo(() => {
    if (!dashboardData?.parTypeSoin) return [];
    return dashboardData.parTypeSoin.map((item) => ({
      name: item.typeSoin,
      value: item.count,
      montant: item.montantTotal / 1000,
      color: TYPE_SOIN_COLORS[item.typeSoin] || '#6b7280',
    }));
  }, [dashboardData?.parTypeSoin]);

  const statutData = useMemo(() => {
    if (!dashboardData?.parStatut) return [];
    return dashboardData.parStatut.map((item) => ({
      name: item.statut,
      value: item.count,
      color: STATUT_COLORS[item.statut] || '#6b7280',
    }));
  }, [dashboardData?.parStatut]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics Avances" description="Chargement..." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-32 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const kpis = dashboardData?.kpis;
  const comparison = comparisonData;

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Analytics Avancés"
          description="Analyses détaillées et comparaisons de performance"
        />
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
        </div>
      </div>

      {/* Comparison Cards */}
      {comparison && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ComparisonCard
            title="Demandes"
            current={kpis?.demandesTotal || 0}
            previous={comparison.previousDemandes}
            format="number"
          />
          <ComparisonCard
            title="Montant Rembourse"
            current={kpis?.montantTotalRembourse || 0}
            previous={comparison.previousMontant}
            format="currency"
          />
          <ComparisonCard
            title="Taux Approbation"
            current={kpis ? (kpis.demandesApprouvees / kpis.demandesTotal) * 100 : 0}
            previous={comparison.previousTauxApprobation}
            format="percent"
          />
          <ComparisonCard
            title="Delai Moyen"
            current={kpis?.delaiMoyenTraitement || 0}
            previous={comparison.previousDelai}
            format="hours"
            invertTrend
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="trends">Tendances</TabsTrigger>
          <TabsTrigger value="distribution">Répartition</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Activity Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Activité quotidienne</CardTitle>
                <CardDescription>Demandes et remboursements sur la période</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => value.slice(-5)}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                        formatter={(value: number, name: string) => {
                          if (name.includes('TND')) return [`${value.toFixed(3)} TND`, name.replace('TND', '')];
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="demandes" name="Demandes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="montantRembourseTND"
                        name="Montant TND"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Distribution by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Répartition par type de soin</CardTitle>
                <CardDescription>Volume de demandes par catégorie</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string, props: { payload: { montant: number } }) => [
                          `${value} demandes (${props.payload.montant.toFixed(3)} TND)`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Répartition par statut</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statutData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Demandes" radius={[0, 4, 4, 0]}>
                      {statutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Evolution des demandes</CardTitle>
              <CardDescription>Tendance du volume de demandes dans le temps</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorDemandes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="demandes"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorDemandes)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evolution des montants</CardTitle>
              <CardDescription>Comparaison demandes vs remboursements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v} TND`} />
                    <Tooltip formatter={(value: number) => [`${value.toFixed(3)} TND`]} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="montantDemandeTND"
                      name="Montant demande"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="montantRembourseTND"
                      name="Montant rembourse"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Par type de soin (montants)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pieData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v} TND`} />
                      <Tooltip formatter={(value: number) => [`${value.toFixed(3)} TND`]} />
                      <Bar dataKey="montant" name="Montant total" radius={[4, 4, 0, 0]}>
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Répartition par statut</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statutData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {statutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Taux d'approbation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-5xl font-bold text-green-600">
                    {kpis ? formatPourcentage((kpis.demandesApprouvees / kpis.demandesTotal) * 100) : '0%'}
                  </div>
                  <p className="text-muted-foreground mt-2">
                    {kpis?.demandesApprouvees || 0} approuvees sur {kpis?.demandesTotal || 0}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Taux de remboursement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-5xl font-bold text-blue-600">
                    {formatPourcentage(kpis?.tauxRemboursementMoyen || 0)}
                  </div>
                  <p className="text-muted-foreground mt-2">
                    {formatMontant(kpis?.montantTotalRembourse || 0)} remboursés
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Delai moyen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-5xl font-bold text-amber-600">
                    {(kpis?.delaiMoyenTraitement || 0).toFixed(1)}h
                  </div>
                  <p className="text-muted-foreground mt-2">
                    Temps de traitement moyen
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Praticiens */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Praticiens</CardTitle>
              <CardDescription>Par volume de demandes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dashboardData?.topPraticiens?.slice(0, 10) || []}
                    layout="vertical"
                    margin={{ left: 100 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis
                      type="category"
                      dataKey="nom"
                      width={100}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'montantTotal') return [formatMontant(value * 1000), 'Montant'];
                        return [value, 'Demandes'];
                      }}
                    />
                    <Bar dataKey="nbDemandes" name="Demandes" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Comparison Card Component
interface ComparisonCardProps {
  title: string;
  current: number;
  previous: number;
  format: 'number' | 'currency' | 'percent' | 'hours';
  invertTrend?: boolean;
}

function ComparisonCard({ title, current, previous, format, invertTrend }: ComparisonCardProps) {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const isPositive = invertTrend ? change < 0 : change > 0;

  const formatValue = (value: number) => {
    switch (format) {
      case 'currency':
        return formatMontant(value);
      case 'percent':
        return formatPourcentage(value);
      case 'hours':
        return `${value.toFixed(1)}h`;
      default:
        return value.toLocaleString('fr-TN');
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{formatValue(current)}</p>
            <div className="flex items-center gap-1 mt-1">
              {change !== 0 && (
                <>
                  {isPositive ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {change > 0 ? '+' : ''}{change.toFixed(1)}%
                  </span>
                </>
              )}
              <span className="text-xs text-muted-foreground ml-1">vs période précédénte</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SanteAnalyticsPage;
