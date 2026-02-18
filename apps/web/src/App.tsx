import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/toaster';

// Lazy load feature pages
import { UsersPage } from '@/features/users/pages/UsersPage';
import { ProvidersPage } from '@/features/providers/pages/ProvidersPage';
import { InsurersPage } from '@/features/insurers/pages/InsurersPage';
import { AdherentsPage } from '@/features/adherents/pages/AdherentsPage';
import { ContractsPage } from '@/features/contracts/pages/ContractsPage';
import { ClaimsPage } from '@/features/claims/pages/ClaimsPage';
import { ClaimsManagePage } from '@/features/claims/pages/ClaimsManagePage';
import { EligibilityPage } from '@/features/eligibility/pages/EligibilityPage';
import { BordereauxPage } from '@/features/bordereaux/pages/BordereauxPage';
import { ReconciliationPage } from '@/features/reconciliation/pages/ReconciliationPage';
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';

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
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout>
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
                  {/* Common routes */}
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
