import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../supabase/client'
import { withRetry } from '../utils/authHelpers'

export default function Done() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [summary, setSummary] = useState({
    rated: 0,
    status: 'submitted',
    completedAt: null
  })

  useEffect(() => {
    if (!user?.id) return
    loadSummary(user.id)
  }, [user?.id])

  async function loadSummary(userId) {
    try {
      const { count: ratedCount } = await withRetry(async () => {
        return await supabase
          .from('responses')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
      }, {
        label: 'Done summary count',
        retries: 1,
        timeoutMs: 6000
      })

      setSummary({
        rated: ratedCount || 0,
        status: 'completed',
        completedAt: new Date().toISOString()
      })
    } catch (error) {
      console.error('Error in loadSummary:', error)
    }
  }

  async function handleHome() {
    await signOut()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🎉</div>
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '2.2rem',
            color: 'var(--accent)',
            marginBottom: '16px'
          }}
        >
          Survey Complete!
        </h1>
        <p
          style={{
            color: 'var(--muted)',
            lineHeight: 1.7,
            marginBottom: '32px',
            fontSize: '0.95rem'
          }}
        >
          Thank you for participating in the FaceValue research project. Your ratings have been recorded and will
          contribute to our analysis of subjective beauty perceptions.
        </p>

        {/* Summary card */}
        <div className="card" style={{ marginBottom: '28px', textAlign: 'left' }}>
          <h3
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '0.875rem',
              color: 'var(--muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '16px'
            }}
          >
            Your Submission Summary
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Ratings Submitted</span>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'var(--accent)' }}>
                {summary.rated}
              </span>
            </div>
            <div style={{ height: '1px', background: 'var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Status</span>
              <span className="pill pill-success">Submitted ✓</span>
            </div>
            <div style={{ height: '1px', background: 'var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Date</span>
              <span style={{ fontSize: '0.875rem' }}>
                {new Date(summary.completedAt || Date.now()).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>

        <button
          className="btn btn-outline btn-lg"
          onClick={handleHome}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Return to Home
        </button>
      </div>
    </div>
  )
}
