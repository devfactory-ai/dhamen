import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { INSURER_ROLES, ADMIN_ROLES } from '@dhamen/shared';
import type { Role } from '@dhamen/shared';
import { apiClient } from '@/lib/api-client';
import { DataTable } from '@/components/ui/data-table';
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
          <p className="text-4xl font-bold text-gray-900">
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
/*  Stats config per role                                             */
/* ------------------------------------------------------------------ */

const roleStats: Record<string, { title: string; stats: Array<{ title: string; key: string; unit?: string; icon: React.ComponentType<IconProps>; iconBg: string; iconColor: string; trend?: { value: string; positive: boolean }; badge?: string; alert?: string }> }> = {
  ADMIN: {
    title: 'Administration Plateforme',
    stats: [
      { title: 'PEC traitees', key: 'totalClaims', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', trend: { value: '+12.5%', positive: true } },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badge: 'Optimise' },
      { title: 'En attente', key: 'pendingClaims', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500', alert: '8 critiques' },
      { title: 'Rejets', key: 'rejectedToday', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500', trend: { value: '-2% ce mois', positive: false } },
    ],
  },
  INSURER_ADMIN: {
    title: 'Administration Assureur',
    stats: [
      { title: 'PEC traitees', key: 'totalClaims', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', trend: { value: '+12.5%', positive: true } },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badge: 'Optimise' },
      { title: 'En attente', key: 'pendingClaims', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500', alert: '8 critiques' },
      { title: 'Rejets', key: 'rejectedToday', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500', trend: { value: '-2% ce mois', positive: false } },
    ],
  },
  INSURER_AGENT: {
    title: 'Agent Assureur',
    stats: [
      { title: 'PEC traitees', key: 'processedToday', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', trend: { value: '+12.5%', positive: true } },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badge: 'Optimise' },
      { title: 'En attente', key: 'pendingClaims', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500', alert: '8 critiques' },
      { title: 'Rejets', key: 'rejectedToday', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500', trend: { value: '-2% ce mois', positive: false } },
    ],
  },
  PHARMACIST: {
    title: 'Pharmacie',
    stats: [
      { title: 'Dispensations', key: 'totalClaims', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', trend: { value: '+12%', positive: true } },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'min', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badge: 'Optimise' },
      { title: 'En attente', key: 'pendingClaims', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500', trend: { value: '-3%', positive: false } },
    ],
  },
  DOCTOR: {
    title: 'Cabinet Medical',
    stats: [
      { title: 'Consultations', key: 'totalClaims', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', trend: { value: '+8%', positive: true } },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'min', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badge: 'Optimise' },
      { title: 'En attente', key: 'pendingClaims', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  LAB_MANAGER: {
    title: "Laboratoire d'Analyses",
    stats: [
      { title: 'Analyses', key: 'totalClaims', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', trend: { value: '+15%', positive: true } },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badge: 'Optimise' },
      { title: 'En attente', key: 'pendingClaims', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
    ],
  },
  CLINIC_ADMIN: {
    title: 'Clinique',
    stats: [
      { title: 'Admissions', key: 'admissionsToday', icon: CheckCircleIcon, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      { title: 'Temps moyen', key: 'avgProcessingTime', unit: 'hrs', icon: ClockIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badge: 'Optimise' },
      { title: 'En attente', key: 'pendingClaims', icon: ChatBubbleIcon, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
      { title: 'Rejets', key: 'rejectedToday', icon: XCircleIcon, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
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
    { title: "Gerer utilisateurs", icon: UsersIcon, href: "/users" },
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
    { title: "Nouvelle PEC", icon: ClipboardIcon, href: "/claims" },
    { title: "Nouvel Adherent", icon: UsersIcon, href: "/adherents/agent/new" },
    {
      title: "Exporter Rapports",
      icon: UploadIcon,
      href: "/reports",
      disabled: true,
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

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

// Sample recent PEC data (placeholder until API is ready)
interface RecentPEC {
  id: string;
  ref: string;
  adherent: string;
  contract: string;
  type: string;
  date: string;
  montant: string;
  statut: string;
  statutColor: string;
}

const recentPEC: RecentPEC[] = [
  { id: '1', ref: 'PEC-2026-001', adherent: 'Mohamed Ben Ali', contract: 'CT-4521', type: 'Pharmacie', date: '23/03/2026', montant: '245.500', statut: 'Approuvee', statutColor: 'bg-emerald-50 text-emerald-700' },
  { id: '2', ref: 'PEC-2026-002', adherent: 'Fatma Trabelsi', contract: 'CT-3892', type: 'Consultation', date: '23/03/2026', montant: '120.000', statut: 'En attente', statutColor: 'bg-amber-50 text-amber-700' },
  { id: '3', ref: 'PEC-2026-003', adherent: 'Ahmed Gharbi', contract: 'CT-5104', type: 'Laboratoire', date: '22/03/2026', montant: '380.000', statut: 'Approuvee', statutColor: 'bg-emerald-50 text-emerald-700' },
  { id: '4', ref: 'PEC-2026-004', adherent: 'Sana Mejri', contract: 'CT-2847', type: 'Pharmacie', date: '22/03/2026', montant: '95.750', statut: 'Rejetee', statutColor: 'bg-red-50 text-red-700' },
  { id: '5', ref: 'PEC-2026-005', adherent: 'Karim Bouazizi', contract: 'CT-6230', type: 'Hospitalisation', date: '21/03/2026', montant: '1,250.000', statut: 'En attente', statutColor: 'bg-amber-50 text-amber-700' },
];

const recentPECColumns = [
  {
    key: 'ref',
    header: 'Reference',
    render: (pec: RecentPEC) => (
      <span className="text-sm font-medium text-blue-600">{pec.ref}</span>
    ),
  },
  {
    key: 'adherent',
    header: 'Adherent',
    render: (pec: RecentPEC) => {
      const initials = pec.adherent.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
      const colorIdx = pec.id.charCodeAt(0) % colors.length;
      return (
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${colors[colorIdx]}`}>
            {initials}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{pec.adherent}</p>
            <p className="text-xs text-gray-400">{pec.contract}</p>
          </div>
        </div>
      );
    },
  },
  {
    key: 'type',
    header: 'Type',
    render: (pec: RecentPEC) => (
      <span className="text-sm text-gray-600">{pec.type}</span>
    ),
  },
  {
    key: 'date',
    header: 'Date',
    render: (pec: RecentPEC) => (
      <span className="text-sm text-gray-500">{pec.date}</span>
    ),
  },
  {
    key: 'montant',
    header: 'Montant',
    className: 'text-right',
    render: (pec: RecentPEC) => (
      <span className="text-sm font-medium text-gray-900">{pec.montant} TND</span>
    ),
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (pec: RecentPEC) => (
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${pec.statutColor}`}>
        {pec.statut}
      </span>
    ),
  },
];

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toLocaleString('fr-TN');
}


/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                    */
/* ------------------------------------------------------------------ */

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const roleType = getRoleType(role);
  const roleConfig = role && roleStats[role] ? roleStats[role] : roleStats.INSURER_AGENT;
  const quickActions = quickActionsByRoleType[roleType] ?? quickActionsByRoleType.insurer;

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', role],
    queryFn: async () => {
      const response = await apiClient.get<DashboardStats>('/analytics/dashboard-stats');
      if (!response.success) return {} as DashboardStats;
      return response.data;
    },
    staleTime: 30000,
  });

  const stats = statsData ?? {};

  const formatStatValue = (key: string, value: unknown): string => {
    if (value === undefined || value === null) return '-';
    if (key.includes('Amount')) return formatAmount(Number(value));
    if (key.includes('Rate')) return `${Number(value).toFixed(1)}%`;
    if (key.includes('Time')) return String(value);
    return String(value).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Welcome header — simple, white background */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Bienvenue, {user?.firstName} !
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Voici l'etat actuel de votre portefeuille d'assurance aujourd'hui.
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
              trend={stat.trend}
              badge={stat.badge}
              alert={stat.alert}
              isLoading={statsLoading}
            />
          ))}
        </div>

        {/* Right — Actions rapides + Statut Systeme */}
        <div className="flex flex-col gap-5">
          {/* Actions rapides — dark navy */}
          <div className="flex-1 rounded-2xl bg-slate-900 p-6 text-white">
            <h2 className="text-lg font-semibold">Actions rapides</h2>
            <div className="mt-4 space-y-2.5">
              {quickActions?.map((action) =>
                action.disabled ? (
                  <div
                    key={action.title}
                    className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3.5 opacity-50"
                    title="Bientot disponible"
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Statut Systeme</h3>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-gray-700">Base de donnees synchronisee</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-gray-700">API Connectivite stable</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Derniere mise a jour effectuee il y a 12 minutes. Aucune interruption prevue.
            </p>
          </div>
        </div>
      </div>

      {/* Dernieres PEC */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Dernieres PEC</h2>
          <span className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
            Voir tout le registre &rarr;
          </span>
        </div>
        <DataTable
          columns={recentPECColumns}
          data={recentPEC}
          emptyMessage="Aucune PEC recente"
          emptyStateType="claims"
        />
      </div>
    </div>
  );
}
