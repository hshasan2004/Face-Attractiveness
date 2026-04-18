import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { AuthProvider } from './hooks/useAuth'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'

// Eager load critical pages
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import Rules from './pages/Rules'
import Survey from './pages/Survey'
import Done from './pages/Done'
import Rewards from './pages/Rewards'
import CreateSurvey from './pages/admin/CreateSurvey'
import Dashboard from './pages/admin/Dashboard'

// Lazy load admin pages (loaded only when needed)
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const Results = lazy(() => import('./pages/admin/Results'))
const Statistics = lazy(() => import('./pages/admin/Statistics'))
const DBSetup = lazy(() => import('./pages/admin/DBSetup'))

// Loading fallback
function LoadingPage() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      fontSize: '1.5rem',
      color: 'var(--accent)'
    }}>
      🔄 Loading...
    </div>
  )
}

function HomeRedirect() {
  const { user, profile, loading } = useAuth()

  if (loading) return <LoadingPage />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Navigate to="/rules" replace />
}

function LoginRoute() {
  const { user, profile, loading } = useAuth()

  if (loading) return <LoadingPage />
  if (!user) return <Login />
  if (profile?.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Navigate to="/rules" replace />
}

function AdminLoginRoute() {
  const { user, profile, loading, profileLoading } = useAuth()

  if (loading) return <LoadingPage />
  if (!user) return <AdminLogin />
  if (profileLoading) return <LoadingPage />
  if (profile?.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Navigate to="/rules" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/admin-login" element={<AdminLoginRoute />} />

          <Route path="/rules" element={
            <ProtectedRoute role="user"><Rules /></ProtectedRoute>
          } />
          <Route path="/survey" element={
            <ProtectedRoute role="user"><Survey /></ProtectedRoute>
          } />
          <Route path="/done" element={
            <ProtectedRoute role="user"><Done /></ProtectedRoute>
          } />

          <Route path="/rewards" element={
            <ProtectedRoute role="user"><Rewards /></ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute role="admin">
              <Suspense fallback={<LoadingPage />}>
                <AdminLayout />
              </Suspense>
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="create-survey" element={<CreateSurvey />} />
            <Route path="create-survey/:surveyId" element={<CreateSurvey />} />
            <Route path="results" element={<Results />} />
            <Route path="statistics" element={<Statistics />} />
            <Route path="dbsetup" element={<DBSetup />} />
          </Route>

          <Route path="/admin-dashboard" element={
            <ProtectedRoute role="admin">
              <Navigate to="/admin/dashboard" replace />
            </ProtectedRoute>
          } />

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
