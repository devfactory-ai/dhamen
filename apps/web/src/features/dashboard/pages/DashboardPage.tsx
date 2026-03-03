import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_LABELS, INSURER_ROLES, ADMIN_ROLES } from '@dhamen/shared';
import type { Role } from '@dhamen/shared';
import { apiClient } from '@/lib/api-client';
import {
  ClipboardIcon,
  CurrencyIcon,
  UsersIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  type IconProps,
} from '@/components/icons';

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<IconProps>;
  trend?: { value: string; positive: boolean };
  color: string;
  isLoading?: boolean;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  color,
  isLoading,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse bg-gray-200 rounded" />
          ) : (
            <p className="text-3xl font-bold text-gray-900">{value}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{description}</p>
          {trend && (
            <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              trend.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {trend.positive ? (
                <ArrowUpIcon className="w-3 h-3" />
              ) : (
                <ArrowDownIcon className="w-3 h-3" />
              )}
              {trend.value}
            </div>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

const statusConfig: Record<string, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  approved: { label: 'Approuvé', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', dotColor: 'bg-emerald-500' },
  approuvee: { label: 'Approuvé', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', dotColor: 'bg-emerald-500' },
  pending: { label: 'En attente', bgColor: 'bg-amber-50', textColor: 'text-amber-700', dotColor: 'bg-amber-500' },
  soumise: { label: 'En attente', bgColor: 'bg-amber-50', textColor: 'text-amber-700', dotColor: 'bg-amber-500' },
  en_cours: { label: 'En cours', bgColor: 'bg-blue-50', textColor: 'text-blue-700', dotColor: 'bg-blue-500' },
  rejected: { label: 'Rejeté', bgColor: 'bg-red-50', textColor: 'text-red-700', dotColor: 'bg-red-500' },
  rejetee: { label: 'Rejeté', bgColor: 'bg-red-50', textColor: 'text-red-700', dotColor: 'bg-red-500' },
};

// Stats configuration par rôle avec couleurs
const roleStats: Record<string, { title: string; stats: Array<{ title: string; key: string; description: string; icon: React.ComponentType<IconProps>; color: string; trend?: { value: string; positive: boolean } }> }> = {
  ADMIN: {
    title: 'Administration Plateforme',
    stats: [
      { title: 'Utilisateurs actifs', key: 'totalUsers', description: 'Total utilisateurs', icon: UsersIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '5%', positive: true } },
      { title: 'PEC traitées', key: 'totalClaims', description: 'Ce mois', icon: ClipboardIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '18%', positive: true } },
      { title: 'Volume total', key: 'totalAmount', description: 'TND ce mois', icon: CurrencyIcon, color: 'bg-purple-100 text-purple-600', trend: { value: '12%', positive: true } },
      { title: 'Taux approbation', key: 'approvalRate', description: 'PEC approuvées', icon: CheckCircleIcon, color: 'bg-orange-100 text-orange-600', trend: { value: '0.1%', positive: true } },
    ],
  },
  INSURER_ADMIN: {
    title: 'Administration Assureur',
    stats: [
      { title: 'Adhérents', key: 'totalAdherents', description: 'Portefeuille actif', icon: UsersIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '3%', positive: true } },
      { title: 'PEC en attente', key: 'pendingClaims', description: 'À traiter', icon: ClipboardIcon, color: 'bg-amber-100 text-amber-600' },
      { title: 'Montant engagé', key: 'totalAmount', description: 'TND ce mois', icon: CurrencyIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '7%', positive: true } },
      { title: 'Taux approbation', key: 'approvalRate', description: 'Taux approuvées', icon: CheckCircleIcon, color: 'bg-purple-100 text-purple-600' },
    ],
  },
  INSURER_AGENT: {
    title: 'Agent Assureur',
    stats: [
      { title: 'PEC traitées', key: 'processedToday', description: "Aujourd'hui", icon: ClipboardIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '15%', positive: true } },
      { title: 'Temps moyen', key: 'avgProcessingTime', description: 'Par dossier', icon: CheckCircleIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '12%', positive: true } },
      { title: 'En attente', key: 'pendingClaims', description: 'À valider', icon: UsersIcon, color: 'bg-amber-100 text-amber-600' },
      { title: 'Rejets', key: 'rejectedToday', description: "Aujourd'hui", icon: CurrencyIcon, color: 'bg-red-100 text-red-600' },
    ],
  },
  PHARMACIST: {
    title: 'Pharmacie',
    stats: [
      { title: 'Dispensations', key: 'totalClaims', description: "Aujourd'hui", icon: ClipboardIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '12%', positive: true } },
      { title: 'Montant PEC', key: 'totalAmount', description: "TND aujourd'hui", icon: CurrencyIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '8%', positive: true } },
      { title: 'Patients servis', key: 'uniquePatients', description: 'Patients uniques', icon: UsersIcon, color: 'bg-purple-100 text-purple-600' },
      { title: 'Taux acceptation', key: 'approvalRate', description: 'PEC approuvées', icon: CheckCircleIcon, color: 'bg-teal-100 text-teal-600', trend: { value: '2%', positive: true } },
    ],
  },
  DOCTOR: {
    title: 'Cabinet Médical',
    stats: [
      { title: 'Consultations', key: 'totalClaims', description: "Aujourd'hui", icon: ClipboardIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '8%', positive: true } },
      { title: 'PEC validées', key: 'approvedClaims', description: "Aujourd'hui", icon: CheckCircleIcon, color: 'bg-emerald-100 text-emerald-600' },
      { title: 'Montant total', key: 'totalAmount', description: "TND aujourd'hui", icon: CurrencyIcon, color: 'bg-purple-100 text-purple-600' },
      { title: 'Patients', key: 'uniquePatients', description: 'Patients uniques', icon: UsersIcon, color: 'bg-teal-100 text-teal-600' },
    ],
  },
  LAB_MANAGER: {
    title: "Laboratoire d'Analyses",
    stats: [
      { title: 'Analyses', key: 'totalClaims', description: "Aujourd'hui", icon: ClipboardIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '15%', positive: true } },
      { title: 'En attente', key: 'pendingClaims', description: 'Résultats à saisir', icon: CheckCircleIcon, color: 'bg-amber-100 text-amber-600' },
      { title: 'Montant PEC', key: 'totalAmount', description: "TND aujourd'hui", icon: CurrencyIcon, color: 'bg-emerald-100 text-emerald-600' },
      { title: 'Patients', key: 'uniquePatients', description: 'Patients uniques', icon: UsersIcon, color: 'bg-purple-100 text-purple-600' },
    ],
  },
  CLINIC_ADMIN: {
    title: 'Clinique',
    stats: [
      { title: 'Admissions', key: 'admissionsToday', description: "Aujourd'hui", icon: ClipboardIcon, color: 'bg-blue-100 text-blue-600' },
      { title: 'Hospitalisés', key: 'currentPatients', description: 'Actuellement', icon: UsersIcon, color: 'bg-purple-100 text-purple-600' },
      { title: 'PEC en cours', key: 'totalAmount', description: 'TND engagements', icon: CurrencyIcon, color: 'bg-emerald-100 text-emerald-600' },
      { title: 'Sorties prévues', key: 'dischargeToday', description: "Aujourd'hui", icon: CheckCircleIcon, color: 'bg-teal-100 text-teal-600' },
    ],
  },
};

// Actions rapides par type de rôle
const quickActionsByRoleType = {
  admin: [
    { title: 'Gérer utilisateurs', desc: 'Administration', icon: UsersIcon, href: '/users', gradient: 'from-blue-500 to-blue-600' },
    { title: 'Voir statistiques', desc: 'Tableau de bord global', icon: CheckCircleIcon, href: '/reports', gradient: 'from-emerald-500 to-emerald-600' },
    { title: 'Configuration', desc: 'Paramètres système', icon: CurrencyIcon, href: '/settings', gradient: 'from-purple-500 to-purple-600' },
    { title: 'Audit', desc: "Journal d'activité", icon: ClipboardIcon, href: '/audit', gradient: 'from-orange-500 to-orange-600' },
  ],
  insurer: [
    { title: 'Valider PEC', desc: 'Dossiers en attente', icon: ClipboardIcon, href: '/claims/manage', gradient: 'from-blue-500 to-blue-600' },
    { title: 'Adhérents', desc: 'Gestion portefeuille', icon: UsersIcon, href: '/adherents', gradient: 'from-emerald-500 to-emerald-600' },
    { title: 'Réconciliation', desc: 'Rapprochement paiements', icon: CurrencyIcon, href: '/reconciliation', gradient: 'from-purple-500 to-purple-600' },
    { title: 'Rapports', desc: 'Statistiques', icon: CheckCircleIcon, href: '/reports', gradient: 'from-orange-500 to-orange-600' },
  ],
  provider: [
    { title: 'Nouvelle PEC', desc: 'Créer prise en charge', icon: ClipboardIcon, href: '/claims', gradient: 'from-blue-500 to-blue-600' },
    { title: 'Vérifier éligibilité', desc: 'Consulter les droits', icon: UsersIcon, href: '/eligibility', gradient: 'from-emerald-500 to-emerald-600' },
    { title: 'Mes bordereaux', desc: 'Consulter paiements', icon: CurrencyIcon, href: '/bordereaux', gradient: 'from-purple-500 to-purple-600' },
    { title: 'Rapports', desc: 'Mon activité', icon: CheckCircleIcon, href: '/reports', gradient: 'from-orange-500 to-orange-600' },
  ],
};

function getRoleType(role: Role | undefined): 'admin' | 'insurer' | 'provider' {
  if (!role) return 'provider';
  if (ADMIN_ROLES.includes(role)) return 'admin';
  if (INSURER_ROLES.includes(role)) return 'insurer';
  return 'provider';
}

interface DashboardStats {
  totalUsers?: number;
  totalAdherents?: number;
  totalClaims?: number;
  pendingClaims?: number;
  approvedClaims?: number;
  totalAmount?: number;
  approvalRate?: number;
  processedToday?: number;
  avgProcessingTime?: string;
  rejectedToday?: number;
  uniquePatients?: number;
  admissionsToday?: number;
  currentPatients?: number;
  dischargeToday?: number;
}

interface RecentClaim {
  id: string;
  adherent?: { prenom: string; nom: string };
  provider?: { nom: string };
  montant_demande: number;
  statut: string;
  created_at: string;
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  return amount.toLocaleString('fr-TN');
}

function formatTimeAgo(date: string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  return `Il y a ${diffDays}j`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;
  const roleType = getRoleType(role);
  const roleConfig = role && roleStats[role] ? roleStats[role] : roleStats.PHARMACIST;
  const quickActions = quickActionsByRoleType[roleType];

  // Fetch dashboard stats from API
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', role],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: DashboardStats }>('/analytics/dashboard');
      return response.data;
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch recent claims
  const { data: claimsData, isLoading: claimsLoading } = useQuery({
    queryKey: ['recent-claims'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: RecentClaim[] }>('/sante/demandes?limit=5&sort=created_at:desc');
      return response.data;
    },
    staleTime: 30000,
  });

  const stats = statsData ?? {};
  const recentClaims = claimsData ?? [];

  // Format stat value
  const formatStatValue = (key: string, value: unknown): string => {
    if (value === undefined || value === null) return '-';
    if (key.includes('Amount')) return formatAmount(Number(value));
    if (key.includes('Rate')) return `${Number(value).toFixed(1)}%`;
    if (key.includes('Time')) return String(value);
    return String(value).toLocaleString();
  };

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-emerald-600 rounded-2xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-300 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-blue-100 text-sm mb-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            {new Date().toLocaleDateString('fr-TN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="text-3xl font-bold mb-1">
            Bienvenue, {user?.firstName}!
          </h1>
          <p className="text-blue-100">
            {role ? ROLE_LABELS[role] : ''} — {roleConfig?.title ?? ''}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(roleConfig?.stats ?? []).map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={formatStatValue(stat.key, stats[stat.key as keyof DashboardStats])}
            description={stat.description}
            icon={stat.icon}
            color={stat.color}
            trend={stat.trend}
            isLoading={statsLoading}
          />
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent claims - wider */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Dernières PEC</h2>
              <p className="text-sm text-gray-500">Les 5 dernières prises en charge</p>
            </div>
            <Link to="/claims" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
              Voir tout
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {claimsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                        <div className="h-3 w-48 bg-gray-200 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              ))
            ) : recentClaims.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                Aucune PEC récente
              </div>
            ) : (
              recentClaims.map((claim) => {
                const patientName = claim.adherent
                  ? `${claim.adherent.prenom} ${claim.adherent.nom}`
                  : 'Patient inconnu';
                const providerName = claim.provider?.nom ?? 'Prestataire inconnu';
                const initials = patientName.split(' ').map(n => n[0]).join('').slice(0, 2);
                const status = statusConfig[claim.statut] ?? statusConfig.pending;

                return (
                  <div key={claim.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-600 font-semibold text-sm">
                            {initials}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{patientName}</p>
                          <p className="text-xs text-gray-500">
                            {claim.id} • {providerName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{(claim.montant_demande / 1000).toFixed(3)} TND</p>
                          <p className="text-xs text-gray-500">{formatTimeAgo(claim.created_at)}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${status.bgColor}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                          <span className={`text-xs font-medium ${status.textColor}`}>
                            {status.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Actions rapides</h2>
            <p className="text-sm text-gray-500">Accès aux fonctions principales</p>
          </div>
          <div className="p-4 space-y-3">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                to={action.href}
                className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{action.title}</p>
                  <p className="text-xs text-gray-500">{action.desc}</p>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
