import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Lazy load feature pages for better initial bundle size
const UsersPage = lazy(() => import('@/features/users/pages/UsersPage').then(m => ({ default: m.UsersPage })));
const UserFormPage = lazy(() => import('@/features/users/pages/UserFormPage').then(m => ({ default: m.default })));
const UsersImportPage = lazy(() => import('@/features/users/pages/UsersImportPage').then(m => ({ default: m.default })));
const ProvidersPage = lazy(() => import('@/features/providers/pages/ProvidersPage').then(m => ({ default: m.ProvidersPage })));
const ProviderFormPage = lazy(() => import('@/features/providers/pages/ProviderFormPage').then(m => ({ default: m.default })));
const ProvidersImportPage = lazy(() => import('@/features/providers/pages/ProvidersImportPage').then(m => ({ default: m.default })));
const InsurersPage = lazy(() => import('@/features/insurers/pages/InsurersPage').then(m => ({ default: m.InsurersPage })));
const InsurerFormPage = lazy(() => import('@/features/insurers/pages/InsurerFormPage').then(m => ({ default: m.default })));
const AdherentsPage = lazy(() => import('@/features/adherents/pages/AdherentsPage').then(m => ({ default: m.AdherentsPage })));
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
const MfaVerifyPage = lazy(() => import('@/features/auth/pages/MfaVerifyPage').then(m => ({ default: m.MfaVerifyPage })));
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
const AuditLogsPage = lazy(() => import('@/features/audit/pages/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })));
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
const MedicationsPage = lazy(() => import('@/features/admin/pages/MedicationsPage').then(m => ({ default: m.default })));
// Companies pages
const CompaniesPage = lazy(() => import('@/features/companies/pages/CompaniesPage').then(m => ({ default: m.default })));
// HR Portal pages
const HRDashboardPage = lazy(() => import('@/features/hr-portal/pages/HRDashboardPage').then(m => ({ default: m.default })));
const HRAdherentsPage = lazy(() => import('@/features/hr-portal/pages/HRAdherentsPage').then(m => ({ default: m.default })));
const HRContractsPage = lazy(() => import('@/features/hr-portal/pages/HRContractsPage').then(m => ({ default: m.default })));
const HRClaimsPage = lazy(() => import('@/features/hr-portal/pages/HRClaimsPage').then(m => ({ default: m.default })));
// Bulletins validation (insurer)
const BulletinsValidationPage = lazy(() => import('@/features/bulletins/pages/BulletinsValidationPage').then(m => ({ default: m.default })));
const BulletinsPaymentPage = lazy(() => import('@/features/bulletins/pages/BulletinsPaymentPage').then(m => ({ default: m.default })));
const BulletinsSaisiePage = lazy(() => import('@/features/bulletins/pages/BulletinsSaisiePage').then(m => ({ default: m.default })));

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
          path="/*"
          element={
            <PrivateRoute>
              <Layout>
                <Suspense fallback={<PageSkeleton />}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    {/* Admin routes */}
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/users/new" element={<UserFormPage />} />
                    <Route path="/users/import" element={<UsersImportPage />} />
                    <Route path="/users/:id/edit" element={<UserFormPage />} />
                    <Route path="/providers" element={<ProvidersPage />} />
                    <Route path="/providers/new" element={<ProviderFormPage />} />
                    <Route path="/providers/import" element={<ProvidersImportPage />} />
                    <Route path="/providers/:id/edit" element={<ProviderFormPage />} />
                    <Route path="/insurers" element={<InsurersPage />} />
                    <Route path="/insurers/new" element={<InsurerFormPage />} />
                    <Route path="/insurers/:id/edit" element={<InsurerFormPage />} />
                    {/* Admin - MF & Medications */}
                    <Route path="/admin/mf-verification" element={<MFVerificationPage />} />
                    <Route path="/admin/medications" element={<MedicationsPage />} />
                    {/* Companies routes */}
                    <Route path="/companies" element={<CompaniesPage />} />
                    {/* HR Portal routes */}
                    <Route path="/hr" element={<HRDashboardPage />} />
                    <Route path="/hr/dashboard" element={<HRDashboardPage />} />
                    <Route path="/hr/adherents" element={<HRAdherentsPage />} />
                    <Route path="/hr/contracts" element={<HRContractsPage />} />
                    <Route path="/hr/claims" element={<HRClaimsPage />} />
                    {/* Insurer routes */}
                    <Route path="/insurer/dashboard" element={<InsurerDashboardPage />} />
                    <Route path="/adherents" element={<AdherentsPage />} />
                    <Route path="/adherents/new" element={<AdherentFormPage />} />
                    <Route path="/adherents/import" element={<AdherentsImportPage />} />
                    <Route path="/adherents/:id/edit" element={<AdherentFormPage />} />
                    <Route path="/contracts" element={<ContractsPage />} />
                    <Route path="/contracts/new" element={<ContractFormPage />} />
                    <Route path="/contracts/:id" element={<ContractDetailsPage />} />
                    <Route path="/contracts/:id/edit" element={<ContractFormPage />} />
                    <Route path="/claims/manage" element={<ClaimsManagePage />} />
                    <Route path="/claims/manage/:id/process" element={<ClaimProcessPage />} />
                    <Route path="/bulletins/validation" element={<BulletinsValidationPage />} />
                    <Route path="/bulletins/payments" element={<BulletinsPaymentPage />} />
                    <Route path="/bulletins/saisie" element={<BulletinsSaisiePage />} />
                    <Route path="/reconciliation" element={<ReconciliationPage />} />
                    <Route path="/reconciliation/:id" element={<ReconciliationDetailsPage />} />
                    {/* Provider routes */}
                    <Route path="/claims" element={<ClaimsPage />} />
                    <Route path="/claims/new" element={<ClaimFormPage />} />
                    <Route path="/claims/:id" element={<ClaimDetailsPage />} />
                    <Route path="/eligibility" element={<EligibilityPage />} />
                    <Route path="/bordereaux" element={<BordereauxPage />} />
                    <Route path="/bordereaux/:id" element={<BordereauDetailsPage />} />
                    <Route path="/cards/verify" element={<CardVerificationPage />} />
                    {/* Cards management (insurer) */}
                    <Route path="/cards" element={<CardsManagementPage />} />
                    <Route path="/cards/generate" element={<CardGeneratePage />} />
                    <Route path="/cards/:id" element={<CardDetailsPage />} />
                    {/* SoinFlow routes */}
                    <Route path="/sante/demandes" element={<SanteDemandesPage />} />
                    <Route path="/sante/demandes/:id" element={<SanteDemandeDetailsPage />} />
                    <Route path="/sante/demandes/:id/process" element={<SanteDemandeProcessPage />} />
                    <Route path="/sante/bordereaux" element={<SanteBordereauxPage />} />
                    <Route path="/sante/bordereaux/new" element={<SanteBordereauCreatePage />} />
                    <Route path="/sante/bordereaux/:id" element={<SanteBordereauDetailsPage />} />
                    <Route path="/sante/paiements" element={<SantePaiementsPage />} />
                    <Route path="/sante/paiements/batch" element={<SantePaiementsBatchPage />} />
                    <Route path="/sante/paiements/:id" element={<SantePaiementDetailsPage />} />
                    <Route path="/sante/paiements/:id/process" element={<SantePaiementProcessPage />} />
                    <Route path="/sante/eligibility" element={<SanteEligibilityPage />} />
                    <Route path="/sante/praticiens" element={<SantePraticiensPage />} />
                    <Route path="/sante/praticiens/:id" element={<SantePraticienDetailsPage />} />
                    <Route path="/sante/dashboard" element={<SanteDashboardPage />} />
                    <Route path="/sante/garanties" element={<SanteGarantiesPage />} />
                    <Route path="/sante/workflows" element={<SanteWorkflowsPage />} />
                    <Route path="/sante/analytics" element={<SanteAnalyticsPage />} />
                    <Route path="/sante/documents" element={<SanteDocumentsPage />} />
                    <Route path="/sante/fraud" element={<SanteFraudPage />} />
                    <Route path="/sante/reports" element={<SanteReportsPage />} />
                    <Route path="/sante/contre-visites" element={<SanteContreVisitesPage />} />
                    <Route path="/sante/contre-visites/:id" element={<SanteContreVisiteDetailsPage />} />
                    {/* BI Dashboard */}
                    <Route path="/bi" element={<BIDashboardPage />} />
                    <Route path="/bi/dashboard" element={<BIDashboardPage />} />
                    {/* Analytics & Audit */}
                    <Route path="/analytics" element={<AnalyticsDashboardPage />} />
                    <Route path="/audit" element={<AuditLogsPage />} />
                    {/* Adherent Portal routes */}
                    <Route path="/adherent/profile" element={<AdherentProfilePage />} />
                    <Route path="/adherent/contract" element={<AdherentContractPage />} />
                    <Route path="/adherent/claims" element={<AdherentClaimsPage />} />
                    <Route path="/adherent/card" element={<AdherentCardPage />} />
                    <Route path="/adherent/beneficiaries" element={<AdherentBeneficiariesPage />} />
                    <Route path="/adherent/bulletins" element={<AdherentBulletinsPage />} />
                    <Route path="/adherent/consommation" element={<AdherentConsommationPage />} />
                    <Route path="/adherent/providers" element={<AdherentProvidersPage />} />
                    {/* Common routes */}
                    <Route path="/reports" element={<ReportsPage />} />
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
      <SonnerToaster position="top-right" richColors closeButton />
    </ErrorBoundary>
  );
}

export default App;
