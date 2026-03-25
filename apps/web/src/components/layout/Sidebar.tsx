import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import type { Role } from '@dhamen/shared';
import {
  DashboardIcon,
  UsersIcon,
  DocumentIcon,
  DocumentsIcon,
  DocumentCheckIcon,
  ChartIcon,
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
  ChevronRightIcon,
  PenIcon,
  ArchiveIcon,
  ClockIcon,
  UploadIcon,
  ListIcon,
  type IconProps,
} from '@/components/icons';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<IconProps>;
  roles: Role[] | 'all';
  badge?: string;
  disabled?: boolean;
  children?: NavItem[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { name: 'Tableau de bord', href: '/dashboard', icon: DashboardIcon, roles: 'all' },
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
      { name: 'Médicaments', href: '/admin/medications', icon: PillIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'] },
    ],
  },
  {
    title: 'Espace RH',
    items: [
      { name: 'Tableau de bord', href: '/hr/dashboard', icon: DashboardIcon, roles: ['HR'] },
      { name: 'Adhérents', href: '/hr/adherents', icon: UsersIcon, roles: ['HR'] },
      { name: 'Contrats', href: '/hr/contracts', icon: DocumentIcon, roles: ['HR'] },
      { name: 'Remboursements', href: '/hr/claims', icon: CreditCardIcon, roles: ['HR'] },
    ],
  },
  {
    title: 'Gestion Assurance',
    items: [
      {
        name: 'Adhérents', href: '/adherents', icon: UserGroupIcon, roles: ['ADMIN'],
        children: [
          { name: 'Liste adhérents', href: '/adherents', icon: ListIcon, roles: ['ADMIN'] },
          { name: 'Import CSV', href: '/adherents/import', icon: UploadIcon, roles: ['ADMIN'] },
        ],
      },
      {
        name: 'Adhérents', href: '/adherents/agent', icon: UserGroupIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'],
        children: [
          { name: 'Liste adhérents', href: '/adherents/agent', icon: ListIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
          { name: 'Import CSV', href: '/adherents/import', icon: UploadIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
        ],
      },
      { name: 'Contrats groupe', href: '/group-contracts', icon: DocumentCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'] },
      {
        name: 'Gestion bulletins', href: '/bulletins', icon: ClipboardIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'],
        children: [
          { name: 'Saisie bulletin', href: '/bulletins/saisie', icon: PenIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
          { name: 'Importer un lot', href: '/bulletins/import-lot', icon: UploadIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
          { name: 'Validation', href: '/bulletins/validation', icon: ClipboardCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN'], disabled: true },
          { name: 'Historique', href: '/bulletins/history', icon: ClockIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
          { name: 'Paiements adhérents', href: '/bulletins/payments', icon: CurrencyIcon, roles: ['INSURER_ADMIN'] },
          { name: 'Archives bulletins', href: '/bulletins/archive', icon: ArchiveIcon, roles: ['INSURER_ADMIN', 'INSURER_AGENT'] },
        ],
      },
      { name: 'Gestion PEC', href: '/claims/manage', icon: ShieldIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'], disabled: true },
      { name: 'Réconciliation', href: '/reconciliation', icon: CalculatorIcon, roles: ['ADMIN', 'INSURER_ADMIN'], disabled: true },
      { name: 'Cartes virtuelles', href: '/cards', icon: CreditCardIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'], disabled: true },
      { name: 'Accords préalables', href: '/pre-authorizations', icon: DocumentCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'DOCTOR', 'CLINIC_ADMIN'], disabled: true },
      { name: 'Recours', href: '/appeals', icon: ClipboardCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'], disabled: true },
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
      { name: 'Garanties', href: '/sante/garanties', icon: ShieldIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN'], disabled: true },
      { name: 'Workflows', href: '/sante/workflows', icon: WorkflowIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT'] },
      { name: 'Documents', href: '/sante/documents', icon: DocumentsIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT'] },
      { name: 'Anti-Fraude', href: '/sante/fraud', icon: FraudIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE'], badge: 'IA' },
      { name: 'Contre-visites', href: '/sante/contre-visites', icon: ClipboardCheckIcon, roles: ['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'], disabled: true },
      { name: 'Rapports', href: '/sante/reports', icon: ReportsIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN'], disabled: true },
      { name: 'Praticiens', href: '/sante/praticiens', icon: UserGroupIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'PRATICIEN', 'HR'], disabled: true },
      { name: 'Business Intel.', href: '/bi', icon: BIIcon, roles: ['ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN'], disabled: true },
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
      { name: 'Rapports', href: '/reports', icon: ChartIcon, roles: 'all', disabled: true },
    ],
  },
];

export function Sidebar() {
  const { sidebarOpen, sidebarCollapsed, toggleSidebar, toggleSidebarCollapsed } = useUIStore();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompany, setCompany } = useAgentContext();
  const isAgent = user?.role === 'INSURER_AGENT' || user?.role === 'INSURER_ADMIN';
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  // Auto-expand parent menu when navigating to a child route
  useEffect(() => {
    for (const section of navigationSections) {
      for (const item of section.items) {
        if (item.children) {
          const isChildActive = item.children.some(
            (child) => location.pathname === child.href || location.pathname.startsWith(child.href + '/')
          );
          if (isChildActive) {
            setExpandedMenus((prev) => {
              if (prev[item.name]) return prev;
              return { ...prev, [item.name]: true };
            });
          }
        }
      }
    }
  }, [location.pathname]);

  const toggleMenu = (name: string) => {
    setExpandedMenus((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const isAdmin = user?.role === 'ADMIN';

  // Filter navigation sections based on user role
  // Disabled items are only visible for ADMIN, hidden for other roles
  const filteredSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.roles === 'all') return !item.disabled || isAdmin;
        if (!user?.role) return false;
        if (!item.roles.includes(user.role)) return false;
        if (item.disabled && !isAdmin) return false;
        return true;
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
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-gray-200 transition-all duration-300',
          sidebarCollapsed ? 'w-[68px]' : 'w-72',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo + Collapse toggle */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-lg text-gray-900 leading-tight">Dhamen</span>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Insurance Management</span>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebarCollapsed}
              className="hidden lg:flex p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Réduire le menu"
            >
              <ChevronRightIcon className="w-4 h-4 rotate-180" />
            </button>
          )}
          {sidebarCollapsed && (
            <button
              onClick={toggleSidebarCollapsed}
              className="hidden lg:flex p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Agrandir le menu"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Company context for agents */}
        {isAgent && !sidebarCollapsed && (
          <div className="mx-3 mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider">Entreprise</p>
                <p className="text-sm font-medium text-blue-900 truncate">
                  {selectedCompany?.name || 'Non sélectionnée'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompany(null);
                  navigate('/select-context');
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
              >
                Changer
              </button>
            </div>
          </div>
        )}
        {isAgent && sidebarCollapsed && (
          <div className="mx-auto mt-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCompany(null);
                navigate('/select-context');
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              title={selectedCompany?.name || 'Changer d\'entreprise'}
            >
              <CompanyIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {filteredSections.map((section) => (
            <div key={section.title}>
              {!sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-3 mb-2 group cursor-pointer"
                >
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {section.title}
                  </span>
                  <ChevronRightIcon
                    className={cn(
                      'w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-transform duration-200 opacity-0',
                      collapsedSections[section.title] ? 'rotate-0' : 'rotate-90'
                    )}
                  
                  />
                </button>
              )}
              {!collapsedSections[section.title] && (
              <div className="space-y-1">
                {section.items.map((item) => {
                  // Item with submenu
                  if (item.children && item.children.length > 0) {
                    const isExpanded = expandedMenus[item.name] ?? false;
                    const filteredChildren = item.children.filter((child) => {
                      if (child.roles === 'all') return !child.disabled || isAdmin;
                      if (!user?.role) return false;
                      if (!child.roles.includes(user.role)) return false;
                      if (child.disabled && !isAdmin) return false;
                      return true;
                    });
                    if (filteredChildren.length === 0) return null;

                    return (
                      <div key={item.href}>
                        <button
                          type="button"
                          onClick={() => toggleMenu(item.name)}
                          title={sidebarCollapsed ? item.name : undefined}
                          className={cn(
                            'flex w-full items-center rounded-xl text-sm font-medium transition-all duration-200',
                            sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                            isExpanded
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          )}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0" />
                          {!sidebarCollapsed && (
                            <>
                              <span className="truncate flex-1 text-left">{item.name}</span>
                              <ChevronRightIcon
                                className={cn(
                                  'w-4 h-4 transition-transform duration-200',
                                  isExpanded ? 'rotate-90' : 'rotate-0'
                                )}
                              />
                            </>
                          )}
                        </button>
                        {isExpanded && !sidebarCollapsed && (
                          <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-100 pl-3">
                            {filteredChildren.map((child) =>
                              child.disabled ? (
                                <span
                                  key={child.href}
                                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm cursor-not-allowed opacity-40 text-gray-400"
                                >
                                  <child.icon className="h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">{child.name}</span>
                                </span>
                              ) : (
                                <NavLink
                                  key={child.href}
                                  to={child.href}
                                  end
                                  className={({ isActive }) =>
                                    cn(
                                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                                      isActive
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                                    )
                                  }
                                >
                                  <child.icon className="h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">{child.name}</span>
                                </NavLink>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Regular item (no children)
                  return item.disabled ? (
                    <span
                      key={item.href}
                      title={sidebarCollapsed ? `${item.name} (bientôt)` : 'Bientôt disponible'}
                      className={cn(
                        'flex items-center rounded-xl text-sm font-medium cursor-not-allowed opacity-40',
                        sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                        'text-gray-400'
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="truncate">{item.name}</span>
                      )}
                    </span>
                  ) : (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                          sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                          isActive
                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        )
                      }
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <>
                          <span className="truncate">{item.name}</span>
                          {item.badge && (
                            <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
              )}
            </div>
          ))}
        </nav>

        {/* Bottom section: New Policy + Settings + Support */}
        <div className="p-3 border-t border-gray-100 shrink-0 space-y-2">
          {/* Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )
            }
            title={sidebarCollapsed ? 'Settings' : undefined}
          >
            <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            {!sidebarCollapsed && <span>Settings</span>}
          </NavLink>

          {/* Support */}
          <NavLink
            to="/about"
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )
            }
            title={sidebarCollapsed ? 'Support' : undefined}
          >
            <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
            </svg>
            {!sidebarCollapsed && <span>Support</span>}
          </NavLink>
        </div>
      </aside>
    </>
  );
}
