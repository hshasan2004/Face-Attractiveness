import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children, role }) {
  const { user, profile, loading, profileLoading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  if (!user) return <Navigate to={role === 'admin' ? '/admin-login' : '/login'} replace />

  if (role === 'admin' && profileLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  if (role === 'admin' && profile?.role !== 'admin') {
    return <Navigate to="/admin-login" replace />
  }

  if (role === 'user' && profile?.role === 'admin') {
    return <Navigate to="/admin-dashboard" replace />
  }

  return children
}
