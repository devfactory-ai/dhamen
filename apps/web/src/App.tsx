import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AgentContextGuard } from '@/components/guards/AgentContextGuard';
import { RoleGuard, PermissionGuard } from '@/components/guards/RoleGuard';
import { SkipLinks } from '@/components/ui/skip-links';
import { AnnouncerProvider } from '@/components/ui/screen-reader';
import { PWAPrompts } from '@/components/ui/pwa-prompts';

// Lazy load feature pages for better initial bundle size
const UsersPage = lazy(() => import('@/features/users/pages/UsersPage').then(m => ({ default: m.UsersPage })));
const UserFormPage = lazy(() => import('@/features/users/pages/UserFormPage').then(m => ({ default: m.default })));
const UsersImportPage = lazy(() => import('@/features/users/pages/UsersImportPage').then(m => ({ default: m.default })));
const ProvidersPage = lazy(() => import('@/features/providers/pages/ProvidersPage').then(m => ({ default: m.ProvidersPage })));
const ProviderFormPage = lazy(() => import('@/features/providers/pages/ProviderFormPage').then(m => ({ default: m.default })));
const ProviderDetailPage = lazy(() => import('@/features/providers/pages/ProviderDetailPage').then(m => ({ default: m.default })));
const ProvidersImportPage = lazy(() => import('@/features/providers/pages/ProvidersImportPage').then(m => ({ default: m.default })));
const InsurersPage = lazy(() => import('@/features/insurers/pages/InsurersPage').then(m => ({ default: m.InsurersPage })));
const InsurerFormPage = lazy(() => import('@/features/insurers/pages/InsurerFormPage').then(m => ({ default: m.default })));
const AdherentFormPage = lazy(() => import('@/features/adherents/pages/AdherentFormPage').then(m => ({ default: m.default })));
const AdherentsImportPage = lazy(() => import('@/features/adherents/pages/AdherentsImportPage').then(m => ({ default: m.default })));
const ContractsPage = lazy(() => import('@/features/contracts/pages/ContractsPage').then(m => ({ default: m.ContractsPage })));
const ContractFormPage = lazy(() => import('@/features/contracts/pages/ContractFormPage').then(m => ({ default: m.default })));
const ContractDetailsPage = lazy(() => import('@/features/contracts/pages/ContractDetailsPage').then(m => ({ default: m.default })));
const ClaimsPage = lazy(() => import('@/features/claims/pages/ClaimsPage').then(m => ({ default: m.ClaimsPage })));
const ClaimFormPage = lazy(() => import('@/features/claims/pages/ClaimFormPage').then(m => ({ default: m.default })));
const ClaimDetailsPage = lazy(() => import('@/features/claims/pages/ClaimDetailsPage').then(m => ({ default: m.default })));
const ClaimsManagePage = lazy(() => import('@/features/claims/pages/ClaimsManagePage').then(m => ({ default: m.ClaimsManagePage })));
const ClaimProcessPage = lazy(() => import('@/features/claims/pages/ClaimProcessPage').then(m => ({ default: m.default })));
const EligibilityPage = lazy(() => import('@/features/eligibility/pages/EligibilityPage').then(m => ({ default: m.EligibilityPage })));
const BordereauxPage = lazy(() => import('@/features/bordereaux/pages/BordereauxPage').then(m => ({ default: m.BordereauxPage })));
const BordereauDetailsPage = lazy(() => import('@/features/bordereaux/pages/BordereauDetailsPage').then(m => ({ default: m.default })));
const ReconciliationPage = lazy(() => import('@/features/reconciliation/pages/ReconciliationPage').then(m => ({ default: m.ReconciliationPage })));
const ReconciliationDetailsPage = lazy(() => import('@/features/reconciliation/pages/ReconciliationDetailsPage').then(m => ({ default: m.default })));
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const MfaSetupPage = lazy(() => import('@/features/settings/pages/MfaSetupPage').then(m => ({ default: m.default })));
const NotificationsSettingsPage = lazy(() => import('@/features/settings/pages/NotificationsSettingsPage').then(m => ({ default: m.default })));
const AboutPage = lazy(() => import('@/features/about/pages/AboutPage'));
const MfaVerifyPage = lazy(() => import('@/features/auth/pages/MfaVerifyPage').then(m => ({ default: m.MfaVerifyPage })));
const AuthSuccessPage = lazy(() => import('@/features/auth/pages/AuthSuccessPage').then(m => ({ default: m.AuthSuccessPage })));
const PasswordResetPage = lazy(() => import('@/features/auth/pages/PasswordResetPage').then(m => ({ default: m.PasswordResetPage })));
const PasswordResetConfirmPage = lazy(() => import('@/features/auth/pages/PasswordResetConfirmPage').then(m => ({ default: m.PasswordResetConfirmPage })));
const MagicLinkPage = lazy(() => import('@/features/auth/pages/MagicLinkPage').then(m => ({ default: m.MagicLinkPage })));
const MagicLinkVerifyPage = lazy(() => import('@/features/auth/pages/MagicLinkVerifyPage').then(m => ({ default: m.MagicLinkVerifyPage })));
const PasskeyInvitePage = lazy(() => import('@/features/auth/pages/PasskeyInvitePage').then(m => ({ default: m.default })));
const SanteDemandesPage = lazy(() => import('@/features/sante/pages/SanteDemandesPage').then(m => ({ default: m.SanteDemandesPage })));
const SanteDemandeDetailsPage = lazy(() => import('@/features/sante/pages/SanteDemandeDetailsPage').then(m => ({ default: m.default })));
const SanteDemandeProcessPage = lazy(() => import('@/features/sante/pages/SanteDemandeProcessPage').then(m => ({ default: m.default })));
const SanteBordereauxPage = lazy(() => import('@/features/sante/pages/SanteBordereauxPage').then(m => ({ default: m.SanteBordereauxPage })));
const SanteBordereauCreatePage = lazy(() => import('@/features/sante/pages/SanteBordereauCreatePage').then(m => ({ default: m.default })));
const SanteBordereauDetailsPage = lazy(() => import('@/features/sante/pages/SanteBordereauDetailsPage').then(m => ({ default: m.default })));
const SantePaiementsPage = lazy(() => import('@/features/sante/pages/SantePaiementsPage').then(m => ({ default: m.SantePaiementsPage })));
const SantePaiementDetailsPage = lazy(() => import('@/features/sante/pages/SantePaiementDetailsPage').then(m => ({ default: m.default })));
const SantePaiementProcessPage = lazy(() => import('@/features/sante/pages/SantePaiementProcessPage').then(m => ({ default: m.default })));
const SantePaiementsBatchPage = lazy(() => import('@/features/sante/pages/SantePaiementsBatchPage').then(m => ({ default: m.default })));
const SanteEligibilityPage = lazy(() => import('@/features/sante/pages/SanteEligibilityPage').then(m => ({ default: m.default })));
const SantePraticiensPage = lazy(() => import('@/features/sante/pages/SantePraticiensPage').then(m => ({ default: m.default })));
const SantePraticienDetailsPage = lazy(() => import('@/features/sante/pages/SantePraticienDetailsPage').then(m => ({ default: m.default })));
const SanteDashboardPage = lazy(() => import('@/features/sante/pages/SanteDashboardPage').then(m => ({ default: m.default })));
const SanteGarantiesPage = lazy(() => import('@/features/sante/pages/SanteGarantiesPage').then(m => ({ default: m.default })));
const SanteWorkflowsPage = lazy(() => import('@/features/sante/pages/SanteWorkflowsPage').then(m => ({ default: m.SanteWorkflowsPage })));
const SanteAnalyticsPage = lazy(() => import('@/features/sante/pages/SanteAnalyticsPage').then(m => ({ default: m.SanteAnalyticsPage })));
const SanteDocumentsPage = lazy(() => import('@/features/sante/pages/SanteDocumentsPage').then(m => ({ default: m.SanteDocumentsPage })));
const SanteFraudPage = lazy(() => import('@/features/sante/pages/SanteFraudPage').then(m => ({ default: m.SanteFraudPage })));
const SanteReportsPage = lazy(() => import('@/features/sante/pages/SanteReportsPage').then(m => ({ default: m.SanteReportsPage })));
const SanteContreVisitesPage = lazy(() => import('@/features/sante/pages/SanteContreVisitesPage').then(m => ({ default: m.default })));
const SanteContreVisiteDetailsPage = lazy(() => import('@/features/sante/pages/SanteContreVisiteDetailsPage').then(m => ({ default: m.default })));
const BIDashboardPage = lazy(() => import('@/features/bi/pages/BIDashboardPage').then(m => ({ default: m.BIDashboardPage })));
const InsurerDashboardPage = lazy(() => import('@/features/insurers/pages/InsurerDashboardPage').then(m => ({ default: m.InsurerDashboardPage })));
const AnalyticsDashboardPage = lazy(() => import('@/features/analytics/pages/AnalyticsDashboardPage').then(m => ({ default: m.AnalyticsDashboardPage })));
const AuditLogsPage = lazy(() => import('@/features/admin/pages/AuditLogsPage').then(m => ({ default: m.default })));
const CardVerificationPage = lazy(() => import('@/features/cards/pages/CardVerificationPage').then(m => ({ default: m.default })));
const CardsManagementPage = lazy(() => import('@/features/cards/pages/CardsManagementPage').then(m => ({ default: m.default })));
const CardGeneratePage = lazy(() => import('@/features/cards/pages/CardGeneratePage').then(m => ({ default: m.default })));
const CardDetailsPage = lazy(() => import('@/features/cards/pages/CardDetailsPage').then(m => ({ default: m.default })));
// Adherent Portal pages
const AdherentProfilePage = lazy(() => import('@/features/adherent-portal/pages/AdherentProfilePage').then(m => ({ default: m.default })));
const AdherentContractPage = lazy(() => import('@/features/adherent-portal/pages/AdherentContractPage').then(m => ({ default: m.default })));
const AdherentClaimsPage = lazy(() => import('@/features/adherent-portal/pages/AdherentClaimsPage').then(m => ({ default: m.default })));
const AdherentCardPage = lazy(() => import('@/features/adherent-portal/pages/AdherentCardPage').then(m => ({ default: m.default })));
const AdherentProvidersPage = lazy(() => import('@/features/adherent-portal/pages/AdherentProvidersPage').then(m => ({ default: m.default })));
const AdherentBeneficiariesPage = lazy(() => import('@/features/adherent-portal/pages/AdherentBeneficiariesPage').then(m => ({ default: m.default })));
const AdherentBulletinsPage = lazy(() => import('@/features/adherent-portal/pages/AdherentBulletinsPage').then(m => ({ default: m.default })));
const AdherentConsommationPage = lazy(() => import('@/features/adherent-portal/pages/AdherentConsommationPage').then(m => ({ default: m.default })));
// Admin pages
const MFVerificationPage = lazy(() => import('@/features/admin/pages/MFVerificationPage').then(m => ({ default: m.default })));
const RolesPage = lazy(() => import('@/features/admin/pages/RolesPage').then(m => ({ default: m.default })));
const BulletinsGlobauxPage = lazy(() => import('@/features/admin/pages/BulletinsGlobauxPage').then(m => ({ default: m.default })));
const AdminBulletinDetailPage = lazy(() => import('@/features/admin/pages/AdminBulletinDetailPage').then(m => ({ default: m.default })));
const GarantiesContratPage = lazy(() => import('@/features/admin/pages/GarantiesContratPage').then(m => ({ default: m.default })));
const MedicationsPage = lazy(() => import('@/features/admin/pages/MedicationsPage').then(m => ({ default: m.default })));
const MedicationDetailPage = lazy(() => import('@/features/admin/pages/MedicationDetailPage').then(m => ({ default: m.default })));
const MedicationFamilyFormPage = lazy(() => import('@/features/admin/pages/MedicationFamilyFormPage').then(m => ({ default: m.default })));
const MedicationBaremeFormPage = lazy(() => import('@/features/admin/pages/MedicationBaremeFormPage').then(m => ({ default: m.default })));
// Companies pages
const CompaniesPage = lazy(() => import('@/features/companies/pages/CompaniesPage').then(m => ({ default: m.default })));
const CompanyDetailPage = lazy(() => import('@/features/companies/pages/CompanyDetailPage').then(m => ({ default: m.default })));
const CompanyFormPage = lazy(() => import('@/features/companies/pages/CompanyFormPage').then(m => ({ default: m.default })));
// Group Contracts pages
const GroupContractsPage = lazy(() => import('@/features/group-contracts/pages/GroupContractsPage').then(m => ({ default: m.default })));
const GroupContractDetailPage = lazy(() => import('@/features/group-contracts/pages/GroupContractDetailPage').then(m => ({ default: m.default })));
const GroupContractFormPage = lazy(() => import('@/features/group-contracts/pages/GroupContractFormPage').then(m => ({ default: m.default })));
// HR Portal pages
const HRDashboardPage = lazy(() => import('@/features/hr-portal/pages/HRDashboardPage').then(m => ({ default: m.default })));
const HRAdherentsPage = lazy(() => import('@/features/hr-portal/pages/HRAdherentsPage').then(m => ({ default: m.default })));
const HRContractsPage = lazy(() => import('@/features/hr-portal/pages/HRContractsPage').then(m => ({ default: m.default })));
const HRClaimsPage = lazy(() => import('@/features/hr-portal/pages/HRClaimsPage').then(m => ({ default: m.default })));
// Agent context selection
const SelectContextPage = lazy(() => import('@/features/agent/pages/SelectContextPage').then(m => ({ default: m.default })));
// Bulletins validation (insurer)
const BulletinsValidationPage = lazy(() => import('@/features/bulletins/pages/BulletinsValidationPage').then(m => ({ default: m.default })));
const BulletinsPaymentPage = lazy(() => import('@/features/bulletins/pages/BulletinsPaymentPage').then(m => ({ default: m.default })));
const BulletinsSaisiePage = lazy(() => import('@/features/bulletins/pages/BulletinsSaisiePage').then(m => ({ default: m.default })));
const BulletinsArchivePage = lazy(() => import('@/features/bulletins/pages/BulletinsArchivePage').then(m => ({ default: m.default })));
const BulletinsImportPage = lazy(() => import('@/features/bulletins/pages/BulletinsImportPage').then(m => ({ default: m.default })));
const BulletinsHistoryPage = lazy(() => import('@/features/bulletins/pages/BulletinsHistoryPage').then(m => ({ default: m.default })));
const BulletinHistoryDetailPage = lazy(() => import('@/features/bulletins/pages/BulletinHistoryDetailPage').then(m => ({ default: m.default })));
const AgentAdherentsPage = lazy(() => import('@/features/adherents/pages/AgentAdherentsPage').then(m => ({ default: m.AgentAdherentsPage })));
const AgentAdherentFormPage = lazy(() => import('@/features/adherents/pages/AgentAdherentFormPage').then(m => ({ default: m.default })));
const AgentAdherentDetailPage = lazy(() => import('@/features/adherents/pages/AgentAdherentDetailPage').then(m => ({ default: m.default })));
// Praticien pages
const PraticienActesPage = lazy(() => import('@/features/praticien/pages/PraticienActesPage').then(m => ({ default: m.PraticienActesPage })));
const PraticienActeDetailPage = lazy(() => import('@/features/praticien/pages/PraticienActeDetailPage').then(m => ({ default: m.PraticienActeDetailPage })));
const PraticienProfilPage = lazy(() => import('@/features/praticien/pages/PraticienProfilPage').then(m => ({ default: m.PraticienProfilPage })));
// Appeals page
const AppealsPage = lazy(() => import('@/features/appeals/pages/AppealsPage').then(m => ({ default: m.AppealsPage })));
const AppealDetailsPage = lazy(() => import('@/features/appeals/pages/AppealDetailsPage').then(m => ({ default: m.default })));
// Pre-Authorizations pages
const PreAuthorizationsPage = lazy(() => import('@/features/pre-authorizations/pages/PreAuthorizationsPage').then(m => ({ default: m.PreAuthorizationsPage })));
const PreAuthorizationDetailsPage = lazy(() => import('@/features/pre-authorizations/pages/PreAuthorizationDetailsPage').then(m => ({ default: m.default })));

/**
 * Loading spinner for lazy-loaded routes
 */
function PageLoader() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for page content
 */
function PageSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      <div className="mt-6 space-y-3">
        <div className="h-12 w-full animate-pulse rounded bg-muted" />
        <div className="h-12 w-full animate-pulse rounded bg-muted" />
        <div className="h-12 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <AnnouncerProvider>
        <SkipLinks />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        <Route
          path="/mfa/verify"
          element={
            <Suspense fallback={<PageLoader />}>
              <MfaVerifyPage />
            </Suspense>
          }
        />
        <Route
          path="/auth/success"
          element={
            <Suspense fallback={<PageLoader />}>
              <AuthSuccessPage />
            </Suspense>
          }
        />
        <Route
          path="/auth/reset-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <PasswordResetPage />
            </Suspense>
          }
        />
        <Route
          path="/auth/reset-password/confirm"
          element={
            <Suspense fallback={<PageLoader />}>
              <PasswordResetConfirmPage />
            </Suspense>
          }
        />
        <Route
          path="/auth/magic-link"
          element={
            <Suspense fallback={<PageLoader />}>
              <MagicLinkPage />
            </Suspense>
          }
        />
        <Route
          path="/auth/magic-link/verify"
          element={
            <Suspense fallback={<PageLoader />}>
              <MagicLinkVerifyPage />
            </Suspense>
          }
        />
        <Route
          path="/auth/passkey/invite"
          element={
            <Suspense fallback={<PageLoader />}>
              <PasskeyInvitePage />
            </Suspense>
          }
        />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout>
                <Suspense fallback={<PageSkeleton />}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    {/* Permission-guarded routes — access controlled by DB permissions */}
                    <Route path="/users" element={<PermissionGuard resource="users" action="read"><UsersPage /></PermissionGuard>} />
                    <Route path="/users/new" element={<PermissionGuard resource="users" action="create"><UserFormPage /></PermissionGuard>} />
                    <Route path="/users/import" element={<RoleGuard roles={['ADMIN']}><UsersImportPage /></RoleGuard>} />
                    <Route path="/users/:id/edit" element={<PermissionGuard resource="users" action="update"><UserFormPage /></PermissionGuard>} />
                    <Route path="/providers" element={<PermissionGuard resource="providers" action="read"><ProvidersPage /></PermissionGuard>} />
                    <Route path="/providers/new" element={<PermissionGuard resource="providers" action="create"><ProviderFormPage /></PermissionGuard>} />
                    <Route path="/providers/import" element={<PermissionGuard resource="providers" action="create"><ProvidersImportPage /></PermissionGuard>} />
                    <Route path="/providers/:id/edit" element={<PermissionGuard resource="providers" action="update"><ProviderFormPage /></PermissionGuard>} />
                    <Route path="/providers/:id" element={<PermissionGuard resource="providers" action="read"><ProviderDetailPage /></PermissionGuard>} />
                    <Route path="/insurers" element={<PermissionGuard resource="insurers" action="read"><InsurersPage /></PermissionGuard>} />
                    <Route path="/insurers/new" element={<PermissionGuard resource="insurers" action="create"><InsurerFormPage /></PermissionGuard>} />
                    <Route path="/insurers/:id/edit" element={<PermissionGuard resource="insurers" action="update"><InsurerFormPage /></PermissionGuard>} />
                    {/* Admin-only: roles, audit — always static RoleGuard */}
                    <Route path="/admin/roles" element={<RoleGuard roles={['ADMIN']}><RolesPage /></RoleGuard>} />
                    <Route path="/admin/bulletins" element={<PermissionGuard resource="bulletins_soins" action="read"><BulletinsGlobauxPage /></PermissionGuard>} />
                    <Route path="/admin/bulletins/:id" element={<PermissionGuard resource="bulletins_soins" action="read"><AdminBulletinDetailPage /></PermissionGuard>} />
                    <Route path="/admin/garanties/:id" element={<RoleGuard roles={['ADMIN']}><GarantiesContratPage /></RoleGuard>} />
                    <Route path="/admin/mf-verification" element={<RoleGuard roles={['ADMIN']}><MFVerificationPage /></RoleGuard>} />
                    <Route path="/admin/medications" element={<PermissionGuard resource="adherents" action="read"><MedicationsPage /></PermissionGuard>} />
                    <Route path="/admin/medications/families/new" element={<RoleGuard roles={['ADMIN']}><MedicationFamilyFormPage /></RoleGuard>} />
                    <Route path="/admin/medications/baremes/new" element={<RoleGuard roles={['ADMIN']}><MedicationBaremeFormPage /></RoleGuard>} />
                    <Route path="/admin/medications/baremes/:id/edit" element={<RoleGuard roles={['ADMIN']}><MedicationBaremeFormPage /></RoleGuard>} />
                    <Route path="/admin/medications/:id" element={<PermissionGuard resource="adherents" action="read"><MedicationDetailPage /></PermissionGuard>} />
                    {/* Companies routes */}
                    <Route path="/companies" element={<PermissionGuard resource="companies" action="read"><CompaniesPage /></PermissionGuard>} />
                    <Route path="/companies/new" element={<PermissionGuard resource="companies" action="create"><CompanyFormPage /></PermissionGuard>} />
                    <Route path="/companies/:id" element={<PermissionGuard resource="companies" action="read"><CompanyDetailPage /></PermissionGuard>} />
                    <Route path="/companies/:id/edit" element={<PermissionGuard resource="companies" action="update"><CompanyFormPage /></PermissionGuard>} />
                    {/* Group Contracts routes */}
                    <Route path="/group-contracts" element={<PermissionGuard resource="contracts" action="read"><GroupContractsPage /></PermissionGuard>} />
                    <Route path="/group-contracts/new" element={<PermissionGuard resource="contracts" action="create"><GroupContractFormPage /></PermissionGuard>} />
                    <Route path="/group-contracts/:id" element={<PermissionGuard resource="contracts" action="read"><GroupContractDetailPage /></PermissionGuard>} />
                    <Route path="/group-contracts/:id/edit" element={<PermissionGuard resource="contracts" action="update"><GroupContractFormPage /></PermissionGuard>} />
                    {/* HR Portal routes — HR only */}
                    <Route path="/hr" element={<RoleGuard roles={['HR']}><HRDashboardPage /></RoleGuard>} />
                    <Route path="/hr/dashboard" element={<RoleGuard roles={['HR']}><HRDashboardPage /></RoleGuard>} />
                    <Route path="/hr/adherents" element={<RoleGuard roles={['HR']}><HRAdherentsPage /></RoleGuard>} />
                    <Route path="/hr/contracts" element={<RoleGuard roles={['HR']}><HRContractsPage /></RoleGuard>} />
                    <Route path="/hr/claims" element={<RoleGuard roles={['HR']}><HRClaimsPage /></RoleGuard>} />
                    {/* Insurer routes */}
                    <Route path="/insurer/dashboard" element={<RoleGuard roles={['INSURER_ADMIN', 'INSURER_AGENT']}><InsurerDashboardPage /></RoleGuard>} />
                    <Route path="/adherents" element={<PermissionGuard resource="adherents" action="read"><AgentAdherentsPage /></PermissionGuard>} />
                    <Route path="/adherents/new" element={<PermissionGuard resource="adherents" action="create"><AdherentFormPage /></PermissionGuard>} />
                    <Route path="/adherents/import" element={<PermissionGuard resource="adherents" action="create"><AdherentsImportPage /></PermissionGuard>} />
                    <Route path="/adherents/:id/edit" element={<PermissionGuard resource="adherents" action="update"><AdherentFormPage /></PermissionGuard>} />
                    <Route path="/contracts" element={<PermissionGuard resource="contracts" action="read"><ContractsPage /></PermissionGuard>} />
                    <Route path="/contracts/new" element={<PermissionGuard resource="contracts" action="create"><ContractFormPage /></PermissionGuard>} />
                    <Route path="/contracts/:id" element={<PermissionGuard resource="contracts" action="read"><ContractDetailsPage /></PermissionGuard>} />
                    <Route path="/contracts/:id/edit" element={<PermissionGuard resource="contracts" action="update"><ContractFormPage /></PermissionGuard>} />
                    <Route path="/claims/manage" element={<PermissionGuard resource="claims" action="approve"><ClaimsManagePage /></PermissionGuard>} />
                    <Route path="/claims/manage/:id/process" element={<PermissionGuard resource="claims" action="approve"><ClaimProcessPage /></PermissionGuard>} />
                    <Route path="/select-context" element={<RoleGuard roles={['INSURER_ADMIN', 'INSURER_AGENT']}><SelectContextPage /></RoleGuard>} />
                    <Route path="/bulletins/validation" element={<PermissionGuard resource="bulletins_soins" action="validate"><BulletinsValidationPage /></PermissionGuard>} />
                    <Route path="/bulletins/payments" element={<PermissionGuard resource="bulletins_soins" action="read"><BulletinsPaymentPage /></PermissionGuard>} />
                    <Route path="/bulletins/saisie" element={<PermissionGuard resource="bulletins_soins" action="read"><AgentContextGuard><BulletinsSaisiePage /></AgentContextGuard></PermissionGuard>} />
                    <Route path="/adherents/agent" element={<PermissionGuard resource="adherents" action="read"><AgentContextGuard><AgentAdherentsPage /></AgentContextGuard></PermissionGuard>} />
                    <Route path="/adherents/agent/new" element={<PermissionGuard resource="adherents" action="create"><AgentContextGuard><AgentAdherentFormPage /></AgentContextGuard></PermissionGuard>} />
                    <Route path="/adherents/agent/:id" element={<PermissionGuard resource="adherents" action="read"><AgentContextGuard><AgentAdherentDetailPage /></AgentContextGuard></PermissionGuard>} />
                    <Route path="/adherents/agent/:id/edit" element={<PermissionGuard resource="adherents" action="update"><AgentContextGuard><AgentAdherentFormPage /></AgentContextGuard></PermissionGuard>} />
                    <Route path="/bulletins/history" element={<PermissionGuard resource="bulletins_soins" action="read"><AgentContextGuard><BulletinsHistoryPage /></AgentContextGuard></PermissionGuard>} />
                    <Route path="/bulletins/history/:id" element={<PermissionGuard resource="bulletins_soins" action="read"><BulletinHistoryDetailPage /></PermissionGuard>} />
                    <Route path="/bulletins/archive" element={<PermissionGuard resource="bulletins_soins" action="read"><BulletinsArchivePage /></PermissionGuard>} />
                    <Route path="/bulletins/import-lot" element={<PermissionGuard resource="bulletins_soins" action="read"><AgentContextGuard><BulletinsImportPage /></AgentContextGuard></PermissionGuard>} />
                    <Route path="/reconciliation" element={<ReconciliationPage />} />
                    <Route path="/reconciliation/:id" element={<ReconciliationDetailsPage />} />
                    {/* Appeals routes */}
                    <Route path="/appeals" element={<AppealsPage />} />
                    <Route path="/appeals/:id" element={<AppealDetailsPage />} />
                    {/* Pre-Authorizations routes */}
                    <Route path="/pre-authorizations" element={<PreAuthorizationsPage />} />
                    <Route path="/pre-authorizations/:id" element={<PreAuthorizationDetailsPage />} />
                    {/* Provider routes */}
                    <Route path="/claims" element={<PermissionGuard resource="claims" action="read"><ClaimsPage /></PermissionGuard>} />
                    <Route path="/claims/new" element={<PermissionGuard resource="claims" action="create"><ClaimFormPage /></PermissionGuard>} />
                    <Route path="/claims/:id" element={<PermissionGuard resource="claims" action="read"><ClaimDetailsPage /></PermissionGuard>} />
                    <Route path="/eligibility" element={<PermissionGuard resource="adherents" action="read"><EligibilityPage /></PermissionGuard>} />
                    <Route path="/bordereaux" element={<BordereauxPage />} />
                    <Route path="/bordereaux/:id" element={<BordereauDetailsPage />} />
                    <Route path="/cards/verify" element={<CardVerificationPage />} />
                    {/* Praticien routes — single set of routes, content adapts to role */}
                    <Route path="/praticien/dashboard" element={<RoleGuard roles={['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN']}><DashboardPage /></RoleGuard>} />
                    <Route path="/praticien/actes" element={<RoleGuard roles={['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN']}><PraticienActesPage /></RoleGuard>} />
                    <Route path="/praticien/actes/:id" element={<RoleGuard roles={['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN']}><PraticienActeDetailPage /></RoleGuard>} />
                    <Route path="/praticien/eligibilite" element={<RoleGuard roles={['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN']}><EligibilityPage /></RoleGuard>} />
                    <Route path="/praticien/profil" element={<RoleGuard roles={['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN']}><PraticienProfilPage /></RoleGuard>} />
                    {/* Cards management */}
                    <Route path="/cards" element={<PermissionGuard resource="adherents" action="read"><CardsManagementPage /></PermissionGuard>} />
                    <Route path="/cards/generate" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN']}><CardGeneratePage /></RoleGuard>} />
                    <Route path="/cards/:id" element={<PermissionGuard resource="adherents" action="read"><CardDetailsPage /></PermissionGuard>} />
                    {/* SoinFlow routes — SOIN_* + ADMIN + INSURER */}
                    <Route path="/sante/demandes" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR']}><SanteDemandesPage /></RoleGuard>} />
                    <Route path="/sante/demandes/:id" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR']}><SanteDemandeDetailsPage /></RoleGuard>} />
                    <Route path="/sante/demandes/:id/process" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SanteDemandeProcessPage /></RoleGuard>} />
                    <Route path="/sante/bordereaux" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteBordereauxPage /></RoleGuard>} />
                    <Route path="/sante/bordereaux/new" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteBordereauCreatePage /></RoleGuard>} />
                    <Route path="/sante/bordereaux/:id" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteBordereauDetailsPage /></RoleGuard>} />
                    <Route path="/sante/paiements" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SantePaiementsPage /></RoleGuard>} />
                    <Route path="/sante/paiements/batch" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SantePaiementsBatchPage /></RoleGuard>} />
                    <Route path="/sante/paiements/:id" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SantePaiementDetailsPage /></RoleGuard>} />
                    <Route path="/sante/paiements/:id/process" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SantePaiementProcessPage /></RoleGuard>} />
                    <Route path="/sante/eligibility" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SanteEligibilityPage /></RoleGuard>} />
                    <Route path="/sante/praticiens" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SantePraticiensPage /></RoleGuard>} />
                    <Route path="/sante/praticiens/:id" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SantePraticienDetailsPage /></RoleGuard>} />
                    <Route path="/sante/dashboard" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteDashboardPage /></RoleGuard>} />
                    <Route path="/sante/garanties" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SanteGarantiesPage /></RoleGuard>} />
                    <Route path="/sante/workflows" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteWorkflowsPage /></RoleGuard>} />
                    <Route path="/sante/analytics" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteAnalyticsPage /></RoleGuard>} />
                    <Route path="/sante/documents" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SanteDocumentsPage /></RoleGuard>} />
                    <Route path="/sante/fraud" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteFraudPage /></RoleGuard>} />
                    <Route path="/sante/reports" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE']}><SanteReportsPage /></RoleGuard>} />
                    <Route path="/sante/contre-visites" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SanteContreVisitesPage /></RoleGuard>} />
                    <Route path="/sante/contre-visites/:id" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT']}><SanteContreVisiteDetailsPage /></RoleGuard>} />
                    {/* BI Dashboard — ADMIN + INSURER */}
                    <Route path="/bi" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT']}><BIDashboardPage /></RoleGuard>} />
                    <Route path="/bi/dashboard" element={<RoleGuard roles={['ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT']}><BIDashboardPage /></RoleGuard>} />
                    {/* Analytics & Audit */}
                    <Route path="/analytics" element={<PermissionGuard resource="adherents" action="read"><AnalyticsDashboardPage /></PermissionGuard>} />
                    <Route path="/audit" element={<RoleGuard roles={['ADMIN']}><AuditLogsPage /></RoleGuard>} />
                    {/* Adherent Portal routes — ADHERENT only */}
                    <Route path="/adherent/profile" element={<RoleGuard roles={['ADHERENT']}><AdherentProfilePage /></RoleGuard>} />
                    <Route path="/adherent/contract" element={<RoleGuard roles={['ADHERENT']}><AdherentContractPage /></RoleGuard>} />
                    <Route path="/adherent/claims" element={<RoleGuard roles={['ADHERENT']}><AdherentClaimsPage /></RoleGuard>} />
                    <Route path="/adherent/card" element={<RoleGuard roles={['ADHERENT']}><AdherentCardPage /></RoleGuard>} />
                    <Route path="/adherent/beneficiaries" element={<RoleGuard roles={['ADHERENT']}><AdherentBeneficiariesPage /></RoleGuard>} />
                    <Route path="/adherent/bulletins" element={<RoleGuard roles={['ADHERENT']}><AdherentBulletinsPage /></RoleGuard>} />
                    <Route path="/adherent/consommation" element={<RoleGuard roles={['ADHERENT']}><AdherentConsommationPage /></RoleGuard>} />
                    <Route path="/adherent/providers" element={<RoleGuard roles={['ADHERENT']}><AdherentProvidersPage /></RoleGuard>} />
                    {/* Common routes */}
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/mfa" element={<MfaSetupPage />} />
                    <Route path="/settings/notifications" element={<NotificationsSettingsPage />} />
                  </Routes>
                </Suspense>
              </Layout>
            </PrivateRoute>
          }
        />
        </Routes>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
        <PWAPrompts />
      </AnnouncerProvider>
    </ErrorBoundary>
  );
}

export default App;
