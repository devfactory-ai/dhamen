import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_LABELS, INSURER_ROLES, ADMIN_ROLES } from '@dhamen/shared';
import type { Role } from '@dhamen/shared';

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  color,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; positive: boolean };
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{description}</p>
          {trend && (
            <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              trend.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {trend.positive ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 10 7-7m0 0 7 7m-7-7v18" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 14-7 7m0 0-7-7m7 7V3" />
                </svg>
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

function ClaimsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  );
}

function MoneyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

const recentClaims = [
  { id: 'PEC-2025-001', patient: 'Mohamed Ben Ali', provider: 'Pharmacie Centrale', amount: '125.500', status: 'approved', time: 'Il y a 5 min' },
  { id: 'PEC-2025-002', patient: 'Fatma Trabelsi', provider: 'Dr. Mrad', amount: '45.000', status: 'pending', time: 'Il y a 12 min' },
  { id: 'PEC-2025-003', patient: 'Ahmed Khelifi', provider: 'Lab BioMedic', amount: '230.000', status: 'approved', time: 'Il y a 25 min' },
  { id: 'PEC-2025-004', patient: 'Sonia Mbarki', provider: 'Clinique Pasteur', amount: '78.500', status: 'rejected', time: 'Il y a 45 min' },
  { id: 'PEC-2025-005', patient: 'Karim Bouazizi', provider: 'Pharmacie Avicenne', amount: '156.750', status: 'approved', time: 'Il y a 1h' },
];

const statusConfig: Record<string, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  approved: { label: 'Approuvé', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', dotColor: 'bg-emerald-500' },
  pending: { label: 'En attente', bgColor: 'bg-amber-50', textColor: 'text-amber-700', dotColor: 'bg-amber-500' },
  rejected: { label: 'Rejeté', bgColor: 'bg-red-50', textColor: 'text-red-700', dotColor: 'bg-red-500' },
};

// Stats par rôle avec couleurs
const roleStats: Record<string, { title: string; stats: Array<{ title: string; value: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string; trend?: { value: string; positive: boolean } }> }> = {
  ADMIN: {
    title: 'Administration Plateforme',
    stats: [
      { title: 'Utilisateurs actifs', value: '1,247', description: 'Total utilisateurs', icon: UsersIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '5%', positive: true } },
      { title: 'PEC traitées', value: '15,892', description: 'Ce mois', icon: ClaimsIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '18%', positive: true } },
      { title: 'Volume total', value: '2.4M', description: 'TND ce mois', icon: MoneyIcon, color: 'bg-purple-100 text-purple-600', trend: { value: '12%', positive: true } },
      { title: 'Taux de fraude', value: '0.3%', description: 'Détectées', icon: CheckIcon, color: 'bg-orange-100 text-orange-600', trend: { value: '0.1%', positive: true } },
    ],
  },
  INSURER_ADMIN: {
    title: 'Administration Assureur',
    stats: [
      { title: 'Adhérents', value: '8,456', description: 'Portefeuille actif', icon: UsersIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '3%', positive: true } },
      { title: 'PEC en attente', value: '234', description: 'À traiter', icon: ClaimsIcon, color: 'bg-amber-100 text-amber-600' },
      { title: 'Montant engagé', value: '856K', description: 'TND ce mois', icon: MoneyIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '7%', positive: true } },
      { title: 'Réconciliation', value: '98.5%', description: 'Taux rapprochement', icon: CheckIcon, color: 'bg-purple-100 text-purple-600' },
    ],
  },
  INSURER_AGENT: {
    title: 'Agent Assureur',
    stats: [
      { title: 'PEC traitées', value: '127', description: "Aujourd'hui", icon: ClaimsIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '15%', positive: true } },
      { title: 'Temps moyen', value: '2.3 min', description: 'Par dossier', icon: CheckIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '12%', positive: true } },
      { title: 'En attente', value: '18', description: 'À valider', icon: UsersIcon, color: 'bg-amber-100 text-amber-600' },
      { title: 'Rejets', value: '4', description: "Aujourd'hui", icon: MoneyIcon, color: 'bg-red-100 text-red-600' },
    ],
  },
  PHARMACIST: {
    title: 'Pharmacie',
    stats: [
      { title: 'Dispensations', value: '47', description: "Aujourd'hui", icon: ClaimsIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '12%', positive: true } },
      { title: 'Montant PEC', value: '12,450', description: "TND aujourd'hui", icon: MoneyIcon, color: 'bg-emerald-100 text-emerald-600', trend: { value: '8%', positive: true } },
      { title: 'Patients servis', value: '38', description: 'Patients uniques', icon: UsersIcon, color: 'bg-purple-100 text-purple-600' },
      { title: 'Taux acceptation', value: '94%', description: 'PEC approuvées', icon: CheckIcon, color: 'bg-teal-100 text-teal-600', trend: { value: '2%', positive: true } },
    ],
  },
  DOCTOR: {
    title: 'Cabinet Médical',
    stats: [
      { title: 'Consultations', value: '23', description: "Aujourd'hui", icon: ClaimsIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '8%', positive: true } },
      { title: 'PEC validées', value: '21', description: "Aujourd'hui", icon: CheckIcon, color: 'bg-emerald-100 text-emerald-600' },
      { title: 'Montant total', value: '1,840', description: "TND aujourd'hui", icon: MoneyIcon, color: 'bg-purple-100 text-purple-600' },
      { title: 'Patients', value: '19', description: 'Patients uniques', icon: UsersIcon, color: 'bg-teal-100 text-teal-600' },
    ],
  },
  LAB_MANAGER: {
    title: 'Laboratoire d\'Analyses',
    stats: [
      { title: 'Analyses', value: '89', description: "Aujourd'hui", icon: ClaimsIcon, color: 'bg-blue-100 text-blue-600', trend: { value: '15%', positive: true } },
      { title: 'En attente', value: '12', description: 'Résultats à saisir', icon: CheckIcon, color: 'bg-amber-100 text-amber-600' },
      { title: 'Montant PEC', value: '4,560', description: "TND aujourd'hui", icon: MoneyIcon, color: 'bg-emerald-100 text-emerald-600' },
      { title: 'Patients', value: '67', description: 'Patients uniques', icon: UsersIcon, color: 'bg-purple-100 text-purple-600' },
    ],
  },
  CLINIC_ADMIN: {
    title: 'Clinique',
    stats: [
      { title: 'Admissions', value: '8', description: "Aujourd'hui", icon: ClaimsIcon, color: 'bg-blue-100 text-blue-600' },
      { title: 'Hospitalisés', value: '34', description: 'Actuellement', icon: UsersIcon, color: 'bg-purple-100 text-purple-600' },
      { title: 'PEC en cours', value: '156K', description: 'TND engagements', icon: MoneyIcon, color: 'bg-emerald-100 text-emerald-600' },
      { title: 'Sorties prévues', value: '5', description: "Aujourd'hui", icon: CheckIcon, color: 'bg-teal-100 text-teal-600' },
    ],
  },
};

// Actions rapides par type de rôle
const quickActionsByRoleType = {
  admin: [
    { title: 'Gérer utilisateurs', desc: 'Administration', icon: UsersIcon, href: '/users', gradient: 'from-blue-500 to-blue-600' },
    { title: 'Voir statistiques', desc: 'Tableau de bord global', icon: CheckIcon, href: '/reports', gradient: 'from-emerald-500 to-emerald-600' },
    { title: 'Configuration', desc: 'Paramètres système', icon: MoneyIcon, href: '/settings', gradient: 'from-purple-500 to-purple-600' },
    { title: 'Audit', desc: 'Journal d\'activité', icon: ClaimsIcon, href: '/reports', gradient: 'from-orange-500 to-orange-600' },
  ],
  insurer: [
    { title: 'Valider PEC', desc: 'Dossiers en attente', icon: ClaimsIcon, href: '/claims/manage', gradient: 'from-blue-500 to-blue-600' },
    { title: 'Adhérents', desc: 'Gestion portefeuille', icon: UsersIcon, href: '/adhérents', gradient: 'from-emerald-500 to-emerald-600' },
    { title: 'Réconciliation', desc: 'Rapprochement paiements', icon: MoneyIcon, href: '/reconciliation', gradient: 'from-purple-500 to-purple-600' },
    { title: 'Rapports', desc: 'Statistiques', icon: CheckIcon, href: '/reports', gradient: 'from-orange-500 to-orange-600' },
  ],
  provider: [
    { title: 'Nouvelle PEC', desc: 'Créer prise en charge', icon: ClaimsIcon, href: '/claims', gradient: 'from-blue-500 to-blue-600' },
    { title: 'Vérifier éligibilité', desc: 'Consulter les droits', icon: UsersIcon, href: '/eligibility', gradient: 'from-emerald-500 to-emerald-600' },
    { title: 'Mes bordereaux', desc: 'Consulter paiements', icon: MoneyIcon, href: '/bordereaux', gradient: 'from-purple-500 to-purple-600' },
    { title: 'Rapports', desc: 'Mon activité', icon: CheckIcon, href: '/reports', gradient: 'from-orange-500 to-orange-600' },
  ],
};

function getRoleType(role: Role | undefined): 'admin' | 'insurer' | 'provider' {
  if (!role) return 'provider';
  if (ADMIN_ROLES.includes(role)) return 'admin';
  if (INSURER_ROLES.includes(role)) return 'insurer';
  return 'provider';
}

export function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;
  const roleType = getRoleType(role);
  const roleConfig = role && roleStats[role] ? roleStats[role] : roleStats.PHARMACIST;
  const quickActions = quickActionsByRoleType[roleType];

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
            value={stat.value}
            description={stat.description}
            icon={stat.icon}
            color={stat.color}
            trend={stat.trend}
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
            <a href="/claims" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
              Voir tout
            </a>
          </div>
          <div className="divide-y divide-gray-100">
            {recentClaims.map((claim) => (
              <div key={claim.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <span className="text-gray-600 font-semibold text-sm">
                        {claim.patient.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{claim.patient}</p>
                      <p className="text-xs text-gray-500">
                        {claim.id} • {claim.provider}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{claim.amount} TND</p>
                      <p className="text-xs text-gray-500">{claim.time}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusConfig[claim.status]?.bgColor}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[claim.status]?.dotColor}`} />
                      <span className={`text-xs font-medium ${statusConfig[claim.status]?.textColor}`}>
                        {statusConfig[claim.status]?.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
              <a
                key={action.title}
                href={action.href}
                className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{action.title}</p>
                  <p className="text-xs text-gray-500">{action.desc}</p>
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 5 7 7-7 7" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
