import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function TopNav({ progress, onExit }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="top-nav">
      <div className="nav-logo">
        <span className="nav-logo-icon">◈</span>
        FACEVALUE
      </div>
      <div className="nav-right">
        {progress && (
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'var(--accent)', fontSize: '0.95rem' }}>
            {progress.current} / {progress.total}
          </span>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rules')} style={{ marginRight: '8px' }}>
          Rules
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/survey')} style={{ marginRight: '8px' }}>
          Survey
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rewards')} style={{ marginRight: '8px' }}>
          🏆 Rewards
        </button>
        <span className="nav-welcome">
          {profile?.full_name || profile?.email || ''}
        </span>
        {onExit ? (
          <button className="btn btn-ghost btn-sm" onClick={onExit}>Exit</button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>Sign Out</button>
        )}
      </div>
    </nav>
  )
}
