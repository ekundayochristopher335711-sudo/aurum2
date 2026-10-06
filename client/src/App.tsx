import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { lazy, Suspense } from 'react'
import { PageLoader } from './components/ui/LogoSpinner'
import LandingPage from './pages/marketing/LandingPage'

const Layout = lazy(() => import('./components/layout/Layout'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const AcceptInvitationPage = lazy(() => import('./pages/invitations/AcceptInvitationPage'))
const DocumentsPage = lazy(() => import('./pages/documents/DocumentsPage'))
const DrawingsPage = lazy(() => import('./pages/drawings/DrawingsPage'))
const UsersPage = lazy(() => import('./pages/admin/UsersPage'))
const NotificationsPage = lazy(() => import('./pages/settings/NotificationsPage'))
const MyActionsPage = lazy(() => import('./pages/home/MyActionsPage'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'))
const EarlyWarningsPage = lazy(() => import('./pages/early-warnings/EarlyWarningsPage'))
const RisksPage = lazy(() => import('./pages/risks/RisksPage'))
const CompensationEventsPage = lazy(() => import('./pages/compensation-events/CompensationEventsPage'))
const NoticesPage = lazy(() => import('./pages/notices/NoticesPage'))
const AuditLogPage = lazy(() => import('./pages/audit/AuditLogPage'))
const CEWhatIfPage = lazy(() => import('./pages/ce-whatif/CEWhatIfPage'))
const RequestQuotePage = lazy(() => import('./pages/marketing/RequestQuotePage'))
const PaymentPage = lazy(() => import('./pages/marketing/PaymentPage'))
const LegalPage = lazy(() => import('./pages/marketing/LegalPage'))
const JobsDashboardPage = lazy(() => import('./pages/jobs/JobsDashboardPage'))
const JobDetailPage = lazy(() => import('./pages/jobs/JobDetailPage'))
const FeeProposalPage = lazy(() => import('./pages/jobs/FeeProposalPage'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />

        {/* Public marketing site */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/request-quote" element={<RequestQuotePage />} />
        <Route path="/payment/:invoiceNumber" element={<PaymentPage />} />
        <Route path="/legal/:type" element={<LegalPage />} />

        {/* The application itself - layout route, children resolve from root */}
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route path="home" element={<MyActionsPage />} />
          <Route path="jobs" element={<JobsDashboardPage />} />
          <Route path="jobs/:id" element={<JobDetailPage />} />
          <Route path="jobs/:id/proposal" element={<FeeProposalPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="admin/users" element={<UsersPage />} />
          <Route path="settings/notifications" element={<NotificationsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="projects/:projectId/early-warnings" element={<EarlyWarningsPage />} />
          <Route path="projects/:projectId/risks" element={<RisksPage />} />
          <Route path="projects/:projectId/compensation-events" element={<CompensationEventsPage />} />
          <Route path="projects/:projectId/notices" element={<NoticesPage />} />
          <Route path="projects/:projectId/documents" element={<DocumentsPage />} />
          <Route path="projects/:projectId/drawings" element={<DrawingsPage />} />
          <Route path="projects/:projectId/audit" element={<AuditLogPage />} />
          <Route path="projects/:projectId/dashboard" element={<DashboardPage />} />
          <Route path="projects/:projectId/ce-whatif" element={<CEWhatIfPage />} />
        </Route>

        {/* Unknown address - send people somewhere useful */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
