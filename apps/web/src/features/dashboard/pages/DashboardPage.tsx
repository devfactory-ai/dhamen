import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { INSURER_ROLES, ADMIN_ROLES } from '@dhamen/shared';
import type { Role } from '@dhamen/shared';
import { apiClient } from '@/lib/api-client';
import { DataTable } from '@/components/ui/data-table';
import { FloatingHelp } from '@/components/ui/floating-help';
import { BarChart3, CalendarDays, Zap } from 'lucide-react';
import KPICards from '../components/KPICards';
import EvolutionChart from '../components/EvolutionChart';
import RepartitionActes from '../components/RepartitionActes';
import AlertesPanel from '../components/AlertesPanel';
import {
  ClipboardIcon,
  UsersIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  UploadIcon,
  type IconProps,
} from '@/components/icons';

/* ------------------------------------------------------------------ */
/*  Stat Card                                                         */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  title: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<IconProps>;
  iconBg: string;
  iconColor: string;
  trend?: { value: string; positive: boolean };
  badge?: string;
  alert?: string;
  isLoading?: boolean;
}

function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  iconBg,
  iconColor,
  trend,
  badge,
  alert,
  isLoading,
}: StatCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="h-10 w-24 animate-pulse rounded bg-gray-200" />
        ) : (
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
            {value}
            {unit && <span className="ml-1 text-lg font-medium text-gray-400">{unit}</span>}
          </p>
        )}
      </div>

      <div className="mt-3">
        {trend && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${
            trend.positive ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {trend.positive ? (
              <ArrowUpIcon className="h-3 w-3" />
            ) : (
              <ArrowDownIcon className="h-3 w-3" />
            )}
            {trend.value}
          </span>
        )}
        {badge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            <ClockIcon className="h-3 w-3" />
            {badge}
          </span>
        )}
        {alert && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
            <span className="font-bold">!</span> {alert}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  XCircleIcon (for Rejets)                                          */
/* ------------------------------------------------------------------ */

function XCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatBubbleIcon (for En attente)                                   */
/* ------------------------------------------------------------------ */

function ChatBubbleIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats config per role (layout only, no hardcoded values)          */
/* ------------------------------------------------------------------ */

interface StatConfig {
  title: string;
  key: string;
  trendKey?: 'claimsTrend' | 'pendingTrend' | 'rejectedTrend';
  unit?: string;
  icon: React.ComponentType<IconProps>;
  iconBg: string;
  iconColor: string;
}

const roleStats: Record<string, { title: string; stats: StatConfig[] }> = {
  ADMIN: {
    title: 'Administration Plateforme',
    stats: [
      { title: 'PEC traitees', key: 'totalClaims', trendKey: 'claimsTrend', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
      { title: 'En attente', key: 'pendingClaims', trendKey: 'pendingTrend', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', trendKey: 'rejectedTrend', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  INSURER_ADMIN: {
    title: 'Administration Assureur',
    stats: [
      { title: 'PEC traitees', key: 'totalClaims', trendKey: 'claimsTrend', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
      { title: 'En attente', key: 'pendingClaims', trendKey: 'pendingTrend', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', trendKey: 'rejectedTrend', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  INSURER_AGENT: {
    title: 'Agent Assureur',
    stats: [
      { title: 'PEC traitees', key: 'processedToday', trendKey: 'claimsTrend', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
      { title: 'En attente', key: 'pendingClaims', trendKey: 'pendingTrend', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', trendKey: 'rejectedTrend', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  PHARMACIST: {
    title: 'Pharmacie',
    stats: [
      { title: 'Dispensations', key: 'totalClaims', trendKey: 'claimsTrend', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'min', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
      { title: 'En attente', key: 'pendingClaims', trendKey: 'pendingTrend', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', trendKey: 'rejectedTrend', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  DOCTOR: {
    title: 'Cabinet Medical',
    stats: [
      { title: 'Consultations', key: 'totalClaims', trendKey: 'claimsTrend', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'min', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
      { title: 'En attente', key: 'pendingClaims', trendKey: 'pendingTrend', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', trendKey: 'rejectedTrend', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  LAB_MANAGER: {
    title: "Laboratoire d'Analyses",
    stats: [
      { title: 'Analyses', key: 'totalClaims', trendKey: 'claimsTrend', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
      { title: 'En attente', key: 'pendingClaims', trendKey: 'pendingTrend', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', trendKey: 'rejectedTrend', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  CLINIC_ADMIN: {
    title: 'Clinique',
    stats: [
      { title: 'Admissions', key: 'admissionsToday', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
      { title: 'En attente', key: 'pendingClaims', trendKey: 'pendingTrend', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', trendKey: 'rejectedTrend', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Quick actions per role type                                       */
/* ------------------------------------------------------------------ */

const quickActionsByRoleType: Record<
  string,
  Array<{
    title: string;
    icon: React.ComponentType<IconProps>;
    href: string;
    disabled?: boolean;
  }>
> = {
  admin: [
    { title: "Gérer utilisateurs", icon: UsersIcon, href: "/users" },
    { title: "Configuration", icon: ClipboardIcon, href: "/settings" },
    {
      title: "Exporter Rapports",
      icon: UploadIcon,
      href: "/reports",
      disabled: true,
    },
  ],
  insurer: [
    {
      title: "Saisir une PEC",
      icon: ClipboardIcon,
      href: "/claims/manage",
      disabled: true,
    },
    { title: "Liste des Adhérents", icon: UsersIcon, href: "/adherents/agent" },
    {
      title: "Exporter Rapports",
      icon: UploadIcon,
      href: "/reports",
      disabled: true,
    },
  ],
  provider: [
    { title: 'Mes actes', icon: ClipboardIcon, href: '/praticien/actes' },
    { title: 'Vérifier éligibilité', icon: CheckCircleIcon, href: '/praticien/eligibilite' },
    { title: 'Mon profil', icon: UsersIcon, href: '/praticien/profil' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const PROVIDER_ROLES_SET = new Set(['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN']);

function getRoleType(role: Role | undefined): 'admin' | 'insurer' | 'provider' {
  if (!role) return 'provider';
  if (ADMIN_ROLES.includes(role)) return 'admin';
  if (INSURER_ROLES.includes(role)) return 'insurer';
  return 'provider';
}

/** Maps provider role to their URL prefix */
const ROLE_TO_PREFIX: Record<string, string> = {
  PHARMACIST: '/praticien',
  DOCTOR: '/praticien',
  LAB_MANAGER: '/praticien',
  CLINIC_ADMIN: '/praticien',
};

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
  trends?: {
    claimsTrend: number;
    pendingTrend: number;
    rejectedTrend: number;
  };
  fetchedAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Recent bulletins types & columns                                  */
/* ------------------------------------------------------------------ */

interface RecentBulletin {
  id: string;
  bulletinNumber: string;
  status: string;
  careType: string;
  careDate: string;
  totalAmount: number;
  reimbursedAmount: number | null;
  createdAt: string;
  adherentName: string;
  companyName: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  scan_uploaded: { label: 'Scan envoyé', color: 'bg-blue-50 text-blue-700' },
  paper_received: { label: 'Reçu', color: 'bg-blue-50 text-blue-700' },
  paper_incomplete: { label: 'Incomplet', color: 'bg-amber-50 text-amber-700' },
  paper_complete: { label: 'Complet', color: 'bg-blue-50 text-blue-700' },
  processing: { label: 'En traitement', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approuvé', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejeté', color: 'bg-red-50 text-red-700' },
  paid: { label: 'Payé', color: 'bg-emerald-50 text-emerald-700' },
  submitted: { label: 'Soumis', color: 'bg-blue-50 text-blue-700' },
  in_batch: { label: 'En lot', color: 'bg-purple-50 text-purple-700' },
};

const CARE_TYPE_LABELS: Record<string, string> = {
  pharmacy: 'Pharmacie',
  consultation: 'Consultation',
  lab: 'Laboratoire',
  hospitalization: 'Hospitalisation',
  dental: 'Dentaire',
  optical: 'Optique',
};

const recentBulletinColumns = [
  {
    key: 'bulletinNumber',
    header: 'Référence',
    render: (b: RecentBulletin) => (
      <span className="text-sm font-medium text-blue-600">{b.bulletinNumber || '—'}</span>
    ),
  },
  {
    key: 'adherentName',
    header: 'Adhérent',
    render: (b: RecentBulletin) => {
      const name = b.adherentName || '—';
      const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
      const colorIdx = (b.id?.charCodeAt(b.id.length - 1) ?? 0) % colors.length;
      return (
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${colors[colorIdx]}`}>
            {initials}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{name}</p>
            <p className="text-xs text-gray-400">{b.companyName}</p>
          </div>
        </div>
      );
    },
  },
  {
    key: 'careType',
    header: 'Type',
    render: (b: RecentBulletin) => (
      <span className="text-sm text-gray-600">{CARE_TYPE_LABELS[b.careType] ?? b.careType ?? '—'}</span>
    ),
  },
  {
    key: 'careDate',
    header: 'Date',
    render: (b: RecentBulletin) => {
      const d = b.careDate || b.createdAt;
      if (!d) return <span className="text-sm text-gray-500">—</span>;
      const date = new Date(d);
      return (
        <span className="text-sm text-gray-500">
          {date.toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      );
    },
  },
  {
    key: 'totalAmount',
    header: 'Montant',
    className: 'text-right',
    render: (b: RecentBulletin) => (
      <span className="text-sm font-medium text-gray-900">
        {b.totalAmount != null ? `${(b.totalAmount / 1000).toFixed(3)} TND` : '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Statut',
    render: (b: RecentBulletin) => {
      const s = STATUS_LABELS[b.status] ?? { label: b.status, color: 'bg-gray-100 text-gray-700' };
      return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
          {s.label}
        </span>
      );
    },
  },
];

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toLocaleString('fr-TN');
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${Math.floor(hours / 24)}j`;
}


/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                    */
/* ------------------------------------------------------------------ */

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role;
  const { selectedCompany } = useAgentContext();

  const roleType = getRoleType(role);
  const roleConfig = role && roleStats[role] ? roleStats[role] : roleStats.INSURER_AGENT;
  const prefix = role ? ROLE_TO_PREFIX[role] : null;

  // Build provider-specific quick actions dynamically
  const quickActions: Array<{ title: string; icon: React.ComponentType<IconProps>; href: string; disabled?: boolean }> = prefix
    ? [
        { title: 'Mes actes', icon: ClipboardIcon, href: `${prefix}/actes` },
        { title: 'Vérifier éligibilité', icon: CheckCircleIcon, href: `${prefix}/eligibilite` },
        { title: 'Mon profil', icon: UsersIcon, href: `${prefix}/profil` },
      ]
    : (quickActionsByRoleType[roleType] ?? quickActionsByRoleType.insurer ?? []);

  const isProvider = PROVIDER_ROLES_SET.has(role || '');

  // Provider roles use /praticien/stats, others use /analytics/dashboard-stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', role],
    queryFn: async () => {
      if (isProvider) {
        const response = await apiClient.get<{
          totalActes: number; enAttente: number; approuves: number; rejetes: number;
          montantTotal: number; montantRembourse: number;
        }>('/praticien/stats');
        if (!response.success) return {} as DashboardStats;
        const d = response.data;
        return {
          totalClaims: d.totalActes,
          pendingClaims: d.enAttente,
          approvedClaims: d.approuves,
          rejectedToday: d.rejetes,
          totalAmount: d.montantTotal,
          processedToday: d.totalActes,
          admissionsToday: d.totalActes,
        } as DashboardStats;
      }
      const response = await apiClient.get<DashboardStats>('/analytics/dashboard-stats');
      if (!response.success) return {} as DashboardStats;
      return response.data;
    },
    staleTime: 30000,
  });

  const stats = statsData ?? {};
  const trends = stats.trends;

  // Recent bulletins — providers use /praticien/actes, others use /analytics/recent-bulletins
  const { data: recentBulletins, isLoading: recentLoading } = useQuery({
    queryKey: ['recent-bulletins', role, selectedCompany?.id],
    queryFn: async () => {
      if (isProvider) {
        const response = await apiClient.get<RecentBulletin[]>('/praticien/actes?page=1&limit=5');
        if (!response.success) return [];
        return Array.isArray(response.data) ? response.data : [];
      }
      const params = new URLSearchParams();
      if (selectedCompany?.id) params.set('companyId', selectedCompany.id);
      const qs = params.toString();
      const response = await apiClient.get<RecentBulletin[]>(`/analytics/recent-bulletins${qs ? `?${qs}` : ''}`);
      if (!response.success) return [];
      return response.data;
    },
    staleTime: 30000,
  });

  // Admin-only: bulletins stats, evolution, remboursements, alertes
  const isAdminRole = role === 'ADMIN';
  const { data: bulletinsStats, isLoading: bulletinsStatsLoading } = useQuery({
    queryKey: ['admin-stats', 'bulletins'],
    queryFn: async () => {
      const response = await apiClient.get<{
        thisMonth: number; thisQuarter: number; thisYear: number;
        byStatus: Record<string, number>;
        approvalRate: number;
        avgProcessingDays: number;
      }>('/admin-stats/bulletins-stats');
      if (!response.success) return undefined;
      return response.data;
    },
    enabled: isAdminRole,
    staleTime: 60000,
  });

  const { data: evolutionData, isLoading: evolutionLoading } = useQuery({
    queryKey: ['admin-stats', 'evolution'],
    queryFn: async () => {
      const response = await apiClient.get<{ months: Array<{ month: string; count: number; total_reimbursed: number }> }>('/admin-stats/evolution-mensuelle');
      if (!response.success) return undefined;
      return (response.data?.months ?? []).map((m) => ({
        mois: m.month,
        bulletins: m.count,
        montant_rembourse: m.total_reimbursed,
      }));
    },
    enabled: isAdminRole,
    staleTime: 60000,
  });

  const { data: remboursementsStats } = useQuery({
    queryKey: ['admin-stats', 'remboursements'],
    queryFn: async () => {
      const response = await apiClient.get<{
        thisMonth: number;
        parTypeActe: Array<{ type_acte: string; count: number; montant: number }>;
      }>('/admin-stats/remboursements-stats');
      if (!response.success) return undefined;
      return response.data;
    },
    enabled: isAdminRole,
    staleTime: 60000,
  });

  const { data: alertesData, isLoading: alertesLoading } = useQuery({
    queryKey: ['admin-stats', 'alertes'],
    queryFn: async () => {
      const response = await apiClient.get<{
        bulletinsEnAttente: number;
        contratsExpirant: number;
        overrideNonJustifie: number;
      }>('/admin-stats/alertes');
      if (!response.success) return undefined;
      return response.data;
    },
    enabled: isAdminRole,
    staleTime: 60000,
  });

  const formatStatValue = (key: string, value: unknown): string => {
    if (value === undefined || value === null) return '-';
    if (key.includes('Amount')) return formatAmount(Number(value));
    if (key.includes('Rate')) return `${Number(value).toFixed(1)}%`;
    if (key.includes('Time')) return String(value);
    return String(value).toLocaleString();
  };

  const getTrend = (trendKey?: string): { value: string; positive: boolean } | undefined => {
    if (!trendKey || !trends) return undefined;
    const val = trends[trendKey as keyof typeof trends];
    if (val === 0) return undefined;
    return {
      value: `${val > 0 ? '+' : ''}${val}% ce mois`,
      positive: val > 0,
    };
  };

  // Early redirects — placed after all hooks to respect Rules of Hooks
  if (role === 'HR') {
    return <Navigate to="/hr/dashboard" replace />;
  }
  const praticienPrefix = role ? ROLE_TO_PREFIX[role] : null;
  if (praticienPrefix && location.pathname === '/dashboard') {
    return <Navigate to={`${praticienPrefix}/dashboard`} replace />;
  }

  return (
    <div className="space-y-6">
      <FloatingHelp
        title="Aide - Tableau de bord"
        subtitle="Comprendre vos indicateurs clés"
        tips={[
          {
            icon: <BarChart3 className="h-4 w-4 text-blue-500" />,
            title: "KPIs affichés",
            desc: "Les indicateurs sont adaptés à votre rôle : PEC traitées, temps moyen, demandes en attente et rejets du jour.",
          },
          {
            icon: <CalendarDays className="h-4 w-4 text-green-500" />,
            title: "Période des données",
            desc: "Les statistiques couvrent le mois en cours par défaut. Les tendances comparent avec le mois précédent (flèches vertes/rouges).",
          },
          {
            icon: <Zap className="h-4 w-4 text-amber-500" />,
            title: "Données en temps réel",
            desc: "Le tableau de bord se rafraîchit automatiquement toutes les 30 secondes. Le statut système en bas à droite confirme la connectivité.",
          },
        ]}
      />
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Bienvenue, {user?.firstName} !
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isProvider
            ? 'Voici le résumé de votre activité et de vos actes.'
            : "Voici l'état actuel de votre portefeuille d'assurance aujourd'hui."}
        </p>
      </div>

      {/* Main grid: Stats 2x2 (left) + Actions rapides & Statut (right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left — 2x2 stat cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-2">
          {(roleConfig?.stats ?? []).map((stat) => (
            <StatCard
              key={stat.title}
              title={stat.title}
              value={formatStatValue(stat.key, stats[stat.key as keyof DashboardStats])}
              unit={stat.unit}
              icon={stat.icon}
              iconBg={stat.iconBg}
              iconColor={stat.iconColor}
              trend={getTrend(stat.trendKey)}
              isLoading={statsLoading}
            />
          ))}
        </div>

        {/* Right — Actions rapides + Statut Système */}
        <div className="flex flex-col gap-5">
          {/* Actions rapides — dark navy */}
          <div className="flex-1 rounded-2xl bg-slate-900 p-4 sm:p-6 text-white">
            <h2 className="text-lg font-semibold">Actions rapides</h2>
            <div className="mt-4 space-y-2.5">
              {quickActions?.map((action) =>
                action.disabled ? (
                  <div
                    key={action.title}
                    className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3.5 opacity-50"
                    title="Bientôt disponible"
                  >
                    <action.icon className="h-5 w-5 text-slate-400" />
                    <span className="flex-1 text-sm font-medium text-slate-300">{action.title}</span>
                    <ChevronRightIcon className="h-4 w-4 text-slate-600" />
                  </div>
                ) : (
                  <button
                    type="button"
                    key={action.title}
                    onClick={() => navigate(action.href)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 transition-all hover:border-blue-500 hover:bg-slate-700 text-left"
                  >
                    <action.icon className="h-5 w-5 text-slate-300 group-hover:text-blue-400" />
                    <span className="flex-1 text-sm font-medium text-white group-hover:text-blue-400">{action.title}</span>
                    <ChevronRightIcon className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-blue-400" />
                  </button>
                )
              )}
            </div>
          </div>

          {/* STATUT SYSTEME */}
          <div className="px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Statut Système</h3>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statsLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="text-sm text-gray-700">Base de données</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statsLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="text-sm text-gray-700">API Connectivité</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              {stats.fetchedAt
                ? `Dernière mise à jour ${formatRelativeTime(stats.fetchedAt)}.`
                : 'Chargement...'}
            </p>
          </div>
        </div>
      </div>

      {/* Derniers bulletins */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Derniers bulletins</h2>
          <button
            type="button"
            onClick={() => {
              const prefix = role ? ROLE_TO_PREFIX[role] : null;
              if (isAdminRole) navigate('/admin/bulletins');
              else if (prefix) navigate(`${prefix}/actes`);
              else navigate('/bulletins/saisie?tab=liste');
            }}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            Voir tout le registre &rarr;
          </button>
        </div>
        {recentLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          <DataTable
            columns={recentBulletinColumns}
            data={recentBulletins ?? []}
            emptyMessage="Aucun bulletin récent"
            emptyStateType="claims"
          />
        )}
      </div>

      {/* Admin-only: enriched dashboard sections */}
      {isAdminRole && (
        <>
          {/* KPI Bulletins */}
          <KPICards
            data={bulletinsStats ? {
              totalBulletins: bulletinsStats.thisMonth,
              enAttente: (bulletinsStats.byStatus?.submitted ?? 0) + (bulletinsStats.byStatus?.processing ?? 0),
              tauxApprobation: bulletinsStats.approvalRate,
              montantRembourse: remboursementsStats?.thisMonth ?? 0,
            } : undefined}
            isLoading={bulletinsStatsLoading}
          />

          {/* Évolution + Répartition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <EvolutionChart data={evolutionData ?? undefined} isLoading={evolutionLoading} />
            <RepartitionActes data={remboursementsStats?.parTypeActe ?? undefined} isLoading={false} />
          </div>

          {/* Alertes */}
          <AlertesPanel data={alertesData ?? undefined} isLoading={alertesLoading} />
        </>
      )}
    </div>
  );
}
