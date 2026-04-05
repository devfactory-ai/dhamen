/**
 * Analytics Dashboard Page
 *
 * Advanced analytics and business intelligence dashboard
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  Download,
  RefreshCw,
  Calendar,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { PageHeader } from '../../../components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { apiClient } from '../../../lib/api-client';

interface KPIMetrics {
  totalClaims: number;
  claimsGrowth: number;
  approvedClaims: number;
  rejectedClaims: number;
  pendingClaims: number;
  approvalRate: number;
  avgProcessingTime: number;
  totalAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
  avgClaimAmount: number;
  monthlySpend: number;
  budgetUtilization: number;
  totalAdhérents: number;
  activeAdhérents: number;
  adhérentGrowth: number;
  avgClaimsPerAdhérent: number;
  totalProviders: number;
  activeProviders: number;
  topProviders: { id: string; name: string; claims: number; amount: number }[];
  fraudAlerts: number;
  fraudRate: number;
  avgFraudScore: number;
  highRiskClaims: number;
}

interface TrendData {
  date: string;
  claims: number;
  amount: number;
  approved: number;
  rejected: number;
}

interface DistributionData {
  category: string;
  count: number;
  amount: number;
  percentage: number;
}

interface PerformanceMetrics {
  period: string;
  claims: number;
  amount: number;
  avgProcessingTime: number;
  approvalRate: number;
  fraudRate: number;
}

type Period = 'jour' | 'semaine' | 'mois' | 'trimestre' | 'année';

export function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState<Period>('mois');

  // Calculate date range based on period
  const getDateRange = (p: Period) => {
    const end = new Date();
    const start = new Date();

    switch (p) {
      case 'jour':
        start.setDate(start.getDate() - 1);
        break;
      case 'semaine':
        start.setDate(start.getDate() - 7);
        break;
      case 'mois':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'trimestre':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'année':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  };

  const dateRange = getDateRange(period);

  // Fetch KPIs
  const { data: kpisData, isLoading: kpisLoading, refetch: refetchKpis } = useQuery({
    queryKey: ['analytics', 'kpis', dateRange],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: KPIMetrics }>(
        `/analytics/kpis?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      return response.data;
    },
  });

  // Fetch trends
  const { data: trendsData } = useQuery({
    queryKey: ['analytics', 'trends', dateRange],
    queryFn: async () => {
      const granularity = period === 'jour' ? 'day' : period === 'semaine' ? 'day' : 'week';
      const response = await apiClient.get<{ success: boolean; data: TrendData[] }>(
        `/analytics/trends?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&granularity=${granularity}`
      );
      return response.data;
    },
  });

  // Fetch distribution
  const { data: distributionData } = useQuery({
    queryKey: ['analytics', 'distribution', dateRange],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: DistributionData[] }>(
        `/analytics/distribution?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&groupBy=care_type`
      );
      return response.data;
    },
  });

  // Fetch monthly performance
  const { data: performanceData } = useQuery({
    queryKey: ['analytics', 'performance'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: PerformanceMetrics[] }>(
        '/analytics/performance/monthly?months=6'
      );
      return response.data;
    },
  });

  const kpis = kpisData;
  const trends = trendsData || [];
  const distribution = distributionData || [];
  const performance = performanceData || [];

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
      minimumFractionDigits: 0,
    }).format(amount / 1000);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-TN').format(num);
  };

  const formatPercent = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const GrowthIndicator = ({ value }: { value: number }) => {
    if (value > 0) {
      return (
        <span className="flex items-center text-green-600 text-sm">
          <TrendingUp className="h-4 w-4 mr-1" />
          +{formatPercent(value)}
        </span>
      );
    } else if (value < 0) {
      return (
        <span className="flex items-center text-red-600 text-sm">
          <TrendingDown className="h-4 w-4 mr-1" />
          {formatPercent(value)}
        </span>
      );
    }
    return <span className="text-gray-500 text-sm">-</span>;
  };

  const handleExport = async (type: string) => {
    try {
      const response = await apiClient.get(
        `/analytics/export?type=${type}&format=csv&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response as unknown as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `analytics-${type}-${dateRange.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de Bord Analytics"
        description="Vue d'ensemble des performances et indicateurs clés"
        icon={<BarChart3 className="h-6 w-6" />}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => refetchKpis()}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualiser
            </button>
            <button
              onClick={() => handleExport('kpis')}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter
            </button>
          </div>
        }
      />

      {/* Period Selector */}
      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg w-fit">
        {(['jour', 'semaine', 'mois', 'trimestre', 'année'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              period === p
                ? 'bg-primary text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Main KPI Cards */}
      {kpisLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : kpis ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Demandes</p>
                    <p className="text-2xl font-bold">{formatNumber(kpis.totalClaims)}</p>
                    <GrowthIndicator value={kpis.claimsGrowth} />
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Montant Total</p>
                    <p className="text-2xl font-bold">{formatAmount(kpis.totalAmount)}</p>
                    <p className="text-sm text-gray-500">
                      Approuvé: {formatAmount(kpis.approvedAmount)}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Adhérents Actifs</p>
                    <p className="text-2xl font-bold">{formatNumber(kpis.activeAdhérents)}</p>
                    <GrowthIndicator value={kpis.adhérentGrowth} />
                  </div>
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Users className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Taux d'Approbation</p>
                    <p className="text-2xl font-bold">{formatPercent(kpis.approvalRate)}</p>
                    <p className="text-sm text-gray-500">
                      {kpis.approvedClaims} approuvées
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-100 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-cyan-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Temps de Traitement Moyen
                    </p>
                    <p className="text-xl font-bold">
                      {kpis.avgProcessingTime.toFixed(1)} heures
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-gray-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Alertes Fraude</p>
                    <p className="text-xl font-bold">{kpis.fraudAlerts}</p>
                    <p className="text-sm text-gray-500">
                      Taux: {formatPercent(kpis.fraudRate)}
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Utilisation Budget</p>
                    <p className="text-xl font-bold">
                      {formatPercent(kpis.budgetUtilization)}
                    </p>
                    <p className="text-sm text-gray-500">
                      Dépenses: {formatAmount(kpis.monthlySpend)}
                    </p>
                  </div>
                  <div className="w-16 h-16 relative">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="#e5e7eb"
                        strokeWidth="6"
                        fill="none"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke={kpis.budgetUtilization > 90 ? '#ef4444' : '#22c55e'}
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${(kpis.budgetUtilization / 100) * 176} 176`}
                      />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribution by Care Type */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition par Type de Soin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {distribution.map((item: DistributionData) => (
                <div key={item.category} className="flex items-center">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium capitalize">
                        {item.category.replace('_', ' ')}
                      </span>
                      <span className="text-sm text-gray-500">
                        {item.count} ({formatPercent(item.percentage)})
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Praticiens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {kpis?.topProviders?.map((provider: { id: string; name: string; claims: number; amount: number }, index: number) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center">
                    <span className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-xs font-medium mr-3">
                      {index + 1}
                    </span>
                    <span className="font-medium">{provider.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatNumber(provider.claims)} demandes</p>
                    <p className="text-sm text-gray-500">{formatAmount(provider.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Performance Mensuelle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium">Période</th>
                  <th className="pb-3 font-medium text-right">Demandes</th>
                  <th className="pb-3 font-medium text-right">Montant</th>
                  <th className="pb-3 font-medium text-right">Taux Appro.</th>
                  <th className="pb-3 font-medium text-right">Temps Moyen</th>
                  <th className="pb-3 font-medium text-right">Taux Fraude</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((row: PerformanceMetrics) => (
                  <tr key={row.period} className="border-b last:border-0">
                    <td className="py-3 font-medium">{row.period}</td>
                    <td className="py-3 text-right">{formatNumber(row.claims)}</td>
                    <td className="py-3 text-right">{formatAmount(row.amount)}</td>
                    <td className="py-3 text-right">
                      <Badge
                        variant={row.approvalRate >= 80 ? 'success' : row.approvalRate >= 60 ? 'warning' : 'error'}
                      >
                        {formatPercent(row.approvalRate)}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">{row.avgProcessingTime.toFixed(1)}h</td>
                    <td className="py-3 text-right">
                      <Badge variant={row.fraudRate < 5 ? 'success' : 'warning'}>
                        {formatPercent(row.fraudRate)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Tendances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-gray-500">
            {trends.length > 0 ? (
              <div className="w-full">
                {/* Simple visual representation */}
                <div className="flex items-end justify-between h-48 gap-1">
                  {trends.slice(-14).map((t: TrendData, i: number) => {
                    const maxClaims = Math.max(...trends.map((x: TrendData) => x.claims), 1);
                    const height = (t.claims / maxClaims) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t"
                        style={{ height: `${height}%` }}
                        title={`${t.date}: ${t.claims} demandes`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{trends[0]?.date}</span>
                  <span>{trends[trends.length - 1]?.date}</span>
                </div>
              </div>
            ) : (
              <p>Aucune donnée de tendance disponible</p>
            )}
          </div>
        </CardContent>
      </Card>

      <FloatingHelp
        title="Aide - Tableau de bord Analytics"
        subtitle="Indicateurs clés de performance"
        tips={[
          {
            icon: <Filter className="h-4 w-4 text-blue-500" />,
            title: "Filtrer par période",
            desc: "Sélectionnez une période (jour, semaine, mois, trimestre, année) pour ajuster les indicateurs.",
          },
          {
            icon: <DollarSign className="h-4 w-4 text-green-500" />,
            title: "KPIs financiers",
            desc: "Suivez les montants totaux, approuvés et le taux d'utilisation du budget en temps réel.",
          },
          {
            icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
            title: "Détection de fraude",
            desc: "Surveillez le taux de fraude et les alertes pour identifier les anomalies rapidement.",
          },
          {
            icon: <Download className="h-4 w-4 text-purple-500" />,
            title: "Exporter les données",
            desc: "Téléchargez les KPIs et rapports au format CSV pour une analyse approfondie.",
          },
        ]}
      />
    </div>
  );
}
