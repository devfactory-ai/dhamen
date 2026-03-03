import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { Role } from '@dhamen/shared';
import { ROLE_LABELS } from '@dhamen/shared';
import {
  HomeIcon,
  UsersIcon,
  DocumentIcon,
  DocumentsIcon,
  DocumentCheckIcon,
  ChartIcon,
  SettingsIcon,
  BuildingIcon,
  CompanyIcon,
  ShieldIcon,
  ClipboardIcon,
  ClipboardCheckIcon,
  CalculatorIcon,
  SearchIcon,
  HeartIcon,
  CurrencyIcon,
  CheckCircleIcon,
  UserGroupIcon,
  WorkflowIcon,
  AnalyticsIcon,
  FraudIcon,
  ReportsIcon,
  BIIcon,
  CreditCardIcon,
  UserIcon,
  PillIcon,
  CloseIcon,
  type IconProps,
} from '@/components/icons';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<IconProps>;
  roles: Role[] | 'all';
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { name: 'Tableau de bord', href: '/dashboard', icon: HomeIcon, roles: 'all' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'Utilisateurs', href: '/users', icon: UsersIcon, roles: ['ADMIN'] },
      { name: 'Prestataires', href: '/providers', icon: BuildingIcon, roles: ['ADMIN'] },
      { name: 'Assureurs', href: '/insurers', icon: ShieldIcon, roles: ['ADMIN'] },
      { name: 'Entreprises', href: '/companies', icon: CompanyIcon, roles: ['ADMIN', 'INSURER_ADMIN'] },
      { name: 'Vérification MF', href: '/admin/mf-verification', icon: DocumentCheckIcon, roles: ['ADMIN'] },
      { name: 'Médicaments', href: '/admin/medications', icon: PillIcon, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'Espace RH',
    items: [
      { name: 'Tableau de bord', href: '/hr/dashboard', icon: HomeIcon, roles: ['HR'] },
      { name: 'Adhérents', href: '/hr/adherents', icon: UsersIcon, roles: ['HR'] },
      { name: 'Contrats', href: '/hr/contracts', icon: DocumentIcon, roles: ['HR'] },
      { name: 'Remboursements', href: '/hr/claims', icon: CreditCardIcon, roles: ['HR'] },
    ],
  },
  {
    title: 'Gestion Assurance',
    items: [
      { name: 'Adhérents', href: '/adherents', icon: UsersIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'] },
      { name: 'Contrats', href: '/contracts', icon: DocumentIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'] },
      { name: 'Gestion PEC', href: '/claims/manage', icon: ClipboardCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'] },
      { name: 'Saisie bulletins', href: '/bulletins/saisie', icon: DocumentsIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
      { name: 'Validation bulletins', href: '/bulletins/validation', icon: ClipboardCheckIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
      { name: 'Paiements adhérents', href: '/bulletins/payments', icon: CurrencyIcon, roles: ['INSURER_ADMIN'] },
      { name: 'Archives bulletins', href: '/bulletins/archive', icon: DocumentsIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
      { name: 'Réconciliation', href: '/reconciliation', icon: CalculatorIcon, roles: ['ADMIN', 'INSURER_ADMIN'] },
      { name: 'Cartes virtuelles', href: '/cards', icon: CreditCardIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'] },
      { name: 'Accords préalables', href: '/pre-authorizations', icon: DocumentCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'DOCTOR', 'CLINIC_ADMIN'] },
      { name: 'Recours', href: '/appeals', icon: ClipboardCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'] },
    ],
  },
  {
    title: 'SoinFlow IA',
    items: [
      { name: 'Dashboard Santé', href: '/sante/dashboard', icon: ChartIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE'], badge: 'IA' },
      { name: 'Analytics', href: '/sante/analytics', icon: AnalyticsIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE'] },
      { name: 'Demandes', href: '/sante/demandes', icon: HeartIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT'] },
      { name: 'Bordereaux', href: '/sante/bordereaux', icon: DocumentIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE'] },
      { name: 'Paiements', href: '/sante/paiements', icon: CurrencyIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE'] },
      { name: 'Éligibilité', href: '/sante/eligibility', icon: CheckCircleIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN'] },
      { name: 'Garanties', href: '/sante/garanties', icon: ShieldIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN'] },
      { name: 'Workflows', href: '/sante/workflows', icon: WorkflowIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT'] },
      { name: 'Documents', href: '/sante/documents', icon: DocumentsIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT'] },
      { name: 'Anti-Fraude', href: '/sante/fraud', icon: FraudIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE'], badge: 'IA' },
      { name: 'Contre-visites', href: '/sante/contre-visites', icon: ClipboardCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'] },
      { name: 'Rapports', href: '/sante/reports', icon: ReportsIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN'] },
      { name: 'Praticiens', href: '/sante/praticiens', icon: UserGroupIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN', 'HR'] },
      { name: 'Business Intel.', href: '/bi', icon: BIIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN'] },
    ],
  },
  {
    title: 'Prestataire',
    items: [
      { name: 'Prises en charge', href: '/claims', icon: ClipboardIcon, roles: ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN'] },
      { name: 'Éligibilité', href: '/eligibility', icon: SearchIcon, roles: ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN'] },
      { name: 'Vérifier carte', href: '/cards/verify', icon: CreditCardIcon, roles: ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN'] },
      { name: 'Mes bordereaux', href: '/bordereaux', icon: DocumentIcon, roles: ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN'] },
    ],
  },
  {
    title: 'Mon Espace Adhérent',
    items: [
      { name: 'Mon profil', href: '/adherent/profile', icon: UserIcon, roles: ['ADHERENT'] },
      { name: 'Mon contrat', href: '/adherent/contract', icon: DocumentIcon, roles: ['ADHERENT'] },
      { name: 'Ma consommation', href: '/adherent/consommation', icon: ChartIcon, roles: ['ADHERENT'] },
      { name: 'Mes ayants droit', href: '/adherent/beneficiaries', icon: UsersIcon, roles: ['ADHERENT'] },
      { name: 'Mes bulletins de soins', href: '/adherent/bulletins', icon: DocumentsIcon, roles: ['ADHERENT'] },
      { name: 'Mes remboursements', href: '/adherent/claims', icon: ClipboardIcon, roles: ['ADHERENT'] },
      { name: 'Ma carte virtuelle', href: '/adherent/card', icon: CreditCardIcon, roles: ['ADHERENT'] },
      { name: 'Prestataires de santé', href: '/adherent/providers', icon: SearchIcon, roles: ['ADHERENT'] },
    ],
  },
  {
    title: 'Autres',
    items: [
      { name: 'Rapports', href: '/reports', icon: ChartIcon, roles: 'all' },
      { name: 'Paramètres', href: '/settings', icon: SettingsIcon, roles: 'all' },
    ],
  },
];

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user } = useAuth();

  // Filter navigation sections based on user role
  const filteredSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.roles === 'all') return true;
        if (!user?.role) return false;
        return item.roles.includes(user.role);
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white border-r border-gray-200 transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
              <span className="text-xl font-bold text-white">D</span>
            </div>
            <div>
              <span className="font-bold text-xl text-gray-900">Dhamen</span>
              <span className="text-gray-400 text-xs ml-1.5">ضامن</span>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {filteredSections.map((section) => (
            <div key={section.title}>
              <h3 className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{item.name}</span>
                    {item.badge && (
                      <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/30">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.role ? ROLE_LABELS[user.role] : ''}
              </p>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
