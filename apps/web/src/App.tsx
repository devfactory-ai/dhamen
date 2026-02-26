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
const ProvidersPage = lazy(() => import('@/features/providers/pages/ProvidersPage').then(m => ({ default: m.ProvidersPage })));
const InsurersPage = lazy(() => import('@/features/insurers/pages/InsurersPage').then(m => ({ default: m.InsurersPage })));
const AdherentsPage = lazy(() => import('@/features/adherents/pages/AdherentsPage').then(m => ({ default: m.AdherentsPage })));
const ContractsPage = lazy(() => import('@/features/contracts/pages/ContractsPage').then(m => ({ default: m.ContractsPage })));
const ClaimsPage = lazy(() => import('@/features/claims/pages/ClaimsPage').then(m => ({ default: m.ClaimsPage })));
const ClaimsManagePage = lazy(() => import('@/features/claims/pages/ClaimsManagePage').then(m => ({ default: m.ClaimsManagePage })));
const EligibilityPage = lazy(() => import('@/features/eligibility/pages/EligibilityPage').then(m => ({ default: m.EligibilityPage })));
const BordereauxPage = lazy(() => import('@/features/bordereaux/pages/BordereauxPage').then(m => ({ default: m.BordereauxPage })));
const ReconciliationPage = lazy(() => import('@/features/reconciliation/pages/ReconciliationPage').then(m => ({ default: m.ReconciliationPage })));
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const MfaVerifyPage = lazy(() => import('@/features/auth/pages/MfaVerifyPage').then(m => ({ default: m.MfaVerifyPage })));
const SanteDemandesPage = lazy(() => import('@/features/sante/pages/SanteDemandesPage').then(m => ({ default: m.SanteDemandesPage })));
const SanteBordereauxPage = lazy(() => import('@/features/sante/pages/SanteBordereauxPage').then(m => ({ default: m.SanteBordereauxPage })));
const SantePaiementsPage = lazy(() => import('@/features/sante/pages/SantePaiementsPage').then(m => ({ default: m.SantePaiementsPage })));
const SanteEligibilityPage = lazy(() => import('@/features/sante/pages/SanteEligibilityPage'));
const SantePraticiensPage = lazy(() => import('@/features/sante/pages/SantePraticiensPage'));

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
                    <Route path="/providers" element={<ProvidersPage />} />
                    <Route path="/insurers" element={<InsurersPage />} />
                    {/* Insurer routes */}
                    <Route path="/adherents" element={<AdherentsPage />} />
                    <Route path="/contracts" element={<ContractsPage />} />
                    <Route path="/claims/manage" element={<ClaimsManagePage />} />
                    <Route path="/reconciliation" element={<ReconciliationPage />} />
                    {/* Provider routes */}
                    <Route path="/claims" element={<ClaimsPage />} />
                    <Route path="/eligibility" element={<EligibilityPage />} />
                    <Route path="/bordereaux" element={<BordereauxPage />} />
                    {/* SoinFlow routes */}
                    <Route path="/sante/demandes" element={<SanteDemandesPage />} />
                    <Route path="/sante/bordereaux" element={<SanteBordereauxPage />} />
                    <Route path="/sante/paiements" element={<SantePaiementsPage />} />
                    <Route path="/sante/eligibility" element={<SanteEligibilityPage />} />
                    <Route path="/sante/praticiens" element={<SantePraticiensPage />} />
                    {/* Common routes */}
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
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
