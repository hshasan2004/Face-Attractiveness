import { Suspense } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const navItems = [
  { id: 'dashboard', icon: '◎', label: 'Dashboard', path: '/admin/dashboard' },
  { id: 'create-survey', icon: '◬', label: 'Create Survey', path: '/admin/create-survey' },
  { id: 'results', icon: '◈', label: 'Results', path: '/admin/results' },
  { id: 'statistics', icon: '▦', label: 'Statistics', path: '/admin/statistics' },
  { id: 'dbsetup', icon: '⚙', label: 'DB Setup', path: '/admin/dbsetup' },
]

export default function AdminLayout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="sidebar-logo">
          <div className="logo-main">
            <span>◈</span> FACEVALUE
          </div>
          <div className="logo-sub">Admin Panel</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => {
            const isActive = location.pathname.startsWith(item.path)
            return (
              <button
                key={item.id}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-admin-info">{user?.email}</div>
          <button className="btn btn-ghost btn-sm" onClick={handleSignOut} style={{ width: '100%', justifyContent: 'center' }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="admin-main">
        <Suspense fallback={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '240px' }}>
            <div className="spinner spinner-lg" />
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
