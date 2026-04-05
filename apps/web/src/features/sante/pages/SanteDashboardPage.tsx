/**
 * SoinFlow Dashboard Page
 *
 * KPIs, charts and real-time statistics for gestionnaires
 */
import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Building,
  BarChart3,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useSanteDashboard,
  formatMontant,
  formatPourcentage,
  formatDelai,
  TYPE_SOIN_COLORS,
  STATUT_COLORS,
  STATUT_LABELS,
  type SanteKPIs,
  type StatsTendance,
  type StatsParTypeSoin,
  type StatsParStatut,
  type TopPraticien,
} from '../hooks/useStats';

type Period = 'week' | 'month' | 'year';

export default function SanteDashboardPage() {
  const [period, setPeriod] = useState<Period>('month');
  const { data, isLoading, isError } = useSanteDashboard(period);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard SoinFlow" description="Chargement..." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-20 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard SoinFlow" description="Erreur de chargement" />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center text-red-700">
            Impossible de charger les statistiques
          </CardContent>
        </Card>
      </div>
    );
  }

  const { kpis, tendances, parTypeSoin, parStatut, topPraticiens } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Dashboard SoinFlow"
          description="Vue d'ensemble des remboursements sante"
        />
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Cette semaine</SelectItem>
            <SelectItem value="month">Ce mois</SelectItem>
            <SelectItem value="year">Cette année</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Demandes totales"
          value={kpis.demandesTotal}
          subtitle={`${kpis.demandesAujourdhui} aujourd'hui`}
          icon={FileText}
          trend={kpis.demandesAujourdhui > 0 ? 'up' : 'neutral'}
        />
        <KPICard
          title="En cours"
          value={kpis.demandesEnCours}
          subtitle="A traiter"
          icon={Clock}
          color="yellow"
        />
        <KPICard
          title="Approuvees"
          value={kpis.demandesApprouvees}
          subtitle={formatPourcentage((kpis.demandesApprouvees / kpis.demandesTotal) * 100)}
          icon={CheckCircle}
          color="green"
        />
        <KPICard
          title="Rejetees"
          value={kpis.demandesRejetees}
          subtitle={formatPourcentage((kpis.demandesRejetees / kpis.demandesTotal) * 100)}
          icon={XCircle}
          color="red"
        />
      </div>

      {/* Financial KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Montant demande"
          value={formatMontant(kpis.montantTotalDemande)}
          icon={DollarSign}
          isMonetary
        />
        <KPICard
          title="Montant rembourse"
          value={formatMontant(kpis.montantTotalRembourse)}
          subtitle={`Taux: ${formatPourcentage(kpis.tauxRemboursementMoyen)}`}
          icon={DollarSign}
          color="green"
          isMonetary
        />
        <KPICard
          title="En attente"
          value={formatMontant(kpis.montantEnAttente)}
          icon={Clock}
          color="yellow"
          isMonetary
        />
        <KPICard
          title="Delai moyen"
          value={formatDelai(kpis.delaiMoyenTraitement)}
          subtitle="Temps de traitement"
          icon={Activity}
        />
      </div>

      {/* Alert and User KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Alertes fraude"
          value={kpis.alertesFraude}
          subtitle={`Score moyen: ${kpis.scoreRisqueMoyen.toFixed(0)}`}
          icon={AlertTriangle}
          color={kpis.alertesFraude > 0 ? 'red' : 'green'}
        />
        <KPICard
          title="Adhérents actifs"
          value={kpis.adhérentsActifs}
          subtitle={`+${kpis.nouveauxAdhérents} ce mois`}
          icon={Users}
          trend="up"
        />
        <KPICard
          title="Praticiens actifs"
          value={kpis.praticiensActifs}
          subtitle={`${kpis.praticiensConventionnes} conventionnes`}
          icon={Building}
        />
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taux conventionnement</p>
                <p className="text-2xl font-bold">
                  {formatPourcentage((kpis.praticiensConventionnes / kpis.praticiensActifs) * 100)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tendances Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Tendances</CardTitle>
          </CardHeader>
          <CardContent>
            <TendancesChart data={tendances} />
          </CardContent>
        </Card>

        {/* Par Type Soin */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition par type de soin</CardTitle>
          </CardHeader>
          <CardContent>
            <TypeSoinChart data={parTypeSoin} />
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Par Statut */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <StatutChart data={parStatut} />
          </CardContent>
        </Card>

        {/* Top Praticiens */}
        <Card>
          <CardHeader>
            <CardTitle>Top Praticiens</CardTitle>
          </CardHeader>
          <CardContent>
            <TopPraticiensTable data={topPraticiens} />
          </CardContent>
        </Card>
      </div>

      <FloatingHelp
        title="Aide - Dashboard"
        subtitle="Vue d'ensemble des remboursements sante"
        tips={[
          {
            icon: <BarChart3 className="h-4 w-4 text-blue-500" />,
            title: "Indicateurs cles",
            desc: "Les KPIs affichent les demandes, montants et delais de traitement en temps reel.",
          },
          {
            icon: <Clock className="h-4 w-4 text-orange-500" />,
            title: "Periode d'analyse",
            desc: "Changez la periode (semaine, mois, annee) pour adapter les statistiques.",
          },
          {
            icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
            title: "Alertes fraude",
            desc: "Surveillez le nombre d'alertes fraude et le score de risque moyen.",
          },
          {
            icon: <Activity className="h-4 w-4 text-green-500" />,
            title: "Tendances",
            desc: "Les graphiques montrent l'evolution des demandes et la repartition par type de soin.",
          },
        ]}
      />
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'default' | 'green' | 'red' | 'yellow';
  trend?: 'up' | 'down' | 'neutral';
  isMonetary?: boolean;
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'default',
  trend,
  isMonetary,
}: KPICardProps) {
  const colorClasses = {
    default: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${isMonetary ? 'font-mono' : ''}`}>{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                {subtitle}
              </p>
            )}
          </div>
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${colorClasses[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TendancesChart({ data }: { data: StatsTendance[] }) {
  if (data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Aucune donnée</p>;
  }

  const maxDemandes = Math.max(...data.map((d) => d.demandes));
  const maxMontant = Math.max(...data.map((d) => d.montantRembourse));

  return (
    <div className="space-y-4">
      {/* Simple bar chart representation */}
      <div className="flex items-end gap-1 h-32">
        {data.slice(-14).map((item, i) => {
          const height = maxDemandes > 0 ? (item.demandes / maxDemandes) * 100 : 0;
          return (
            <div
              key={i}
              className="flex-1 bg-primary/80 rounded-t transition-all hover:bg-primary"
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${item.date}: ${item.demandes} demandes`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
        <div>
          <p className="text-sm text-muted-foreground">Total demandes</p>
          <p className="text-lg font-semibold">{data.reduce((s, d) => s + d.demandes, 0)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total rembourse</p>
          <p className="text-lg font-semibold font-mono">
            {formatMontant(data.reduce((s, d) => s + d.montantRembourse, 0))}
          </p>
        </div>
      </div>
    </div>
  );
}

function TypeSoinChart({ data }: { data: StatsParTypeSoin[] }) {
  if (data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Aucune donnée</p>;
  }

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.typeSoin} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="capitalize">{item.typeSoin}</span>
            <span className="text-muted-foreground">
              {item.count} ({formatPourcentage(item.pourcentage)})
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${item.pourcentage}%`,
                backgroundColor: TYPE_SOIN_COLORS[item.typeSoin] || '#6b7280',
              }}
            />
          </div>
        </div>
      ))}
      <div className="pt-2 border-t">
        <p className="text-sm text-muted-foreground">Total: {total} demandes</p>
      </div>
    </div>
  );
}

function StatutChart({ data }: { data: StatsParStatut[] }) {
  if (data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Aucune donnée</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.statut} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: STATUT_COLORS[item.statut] || '#6b7280' }}
            />
            <span className="text-sm">{STATUT_LABELS[item.statut] || item.statut}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{item.count}</span>
            <Badge variant="secondary" className="text-xs">
              {formatPourcentage(item.pourcentage)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopPraticiensTable({ data }: { data: TopPraticien[] }) {
  if (data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Aucune donnée</p>;
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((praticien, index) => (
        <div
          key={praticien.id}
          className="flex items-center justify-between py-2 border-b last:border-0"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground w-5">
              #{index + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{praticien.nom}</p>
              <p className="text-xs text-muted-foreground">{praticien.spécialité}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{praticien.nbDemandes} demandes</p>
            <p className="text-xs text-muted-foreground font-mono">
              {formatMontant(praticien.montantTotal)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
