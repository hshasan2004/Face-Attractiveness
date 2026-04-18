import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../supabase/client'
import { getReadableAuthError, withRetry } from '../utils/authHelpers'

function normalizeEmail(value) {
  return value.trim().toLowerCase()
}

function normalizeText(value) {
  return value.trim()
}

export default function AdminLogin() {
  const navigate = useNavigate()
  const isMounted = useRef(true)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    isMounted.current = true

    return () => {
      isMounted.current = false
    }
  }, [])

  async function validateAdminInBackground(userId) {
    try {
      const profileById = await withRetry(async () => {
        const response = await supabase
          .from('user_profiles')
          .select('id, role')
          .eq('id', userId)
          .maybeSingle()

        if (response.error) {
          throw response.error
        }

        return response.data
      }, {
        label: 'Validate admin profile',
        retries: 1,
        timeoutMs: 10000
      })

      if (!profileById || profileById.role !== 'admin') {
        await supabase.auth.signOut()
        navigate('/admin-login', { replace: true })
      }
    } catch (error) {
      console.warn('[auth] admin validation skipped after login', {
        message: error?.message,
        error
      })
      // Fail safe: keep user signed in and let ProtectedRoute/useAuth role checks decide.
    }
  }

  async function handleAdminLogin(e) {
    e.preventDefault()
    if (loading) return

    setError('')
    setLoading(true)

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase configuration is missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      }

      const email = normalizeEmail(adminEmail)
      const password = adminPassword

      if (!email || !password) {
        setError('Email and password are required.')
        return
      }

      console.info('[auth] admin login started', {
        emailDomain: email.split('@')[1] || 'unknown'
      })

      const { data } = await withRetry(async () => {
        const response = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (response.error) {
          throw response.error
        }

        return response
      }, {
        label: 'Admin login',
        retries: 1,
        timeoutMs: 6000,
        onRetry: ({ attempt, delayMs }) => {
          setError(`Network is unstable. Retrying sign in (${attempt + 1}/2)...`)
          console.warn('[auth] retrying admin login', { attempt, delayMs })
        }
      })

      console.info('[auth] admin login succeeded', {
        userId: data?.user?.id,
        hasSession: Boolean(data?.session)
      })

      // Instant perceived response: route immediately after successful auth.
      navigate('/admin/dashboard', { replace: true })

      // Role check runs in background with a single lightweight query.
      void validateAdminInBackground(data.user.id)
    } catch (err) {
      console.error('[auth] admin login failed', {
        message: err?.message,
        error: err
      })
      if (isMounted.current) {
        setError(getReadableAuthError(err, 'Admin login failed.'))
      }
    } finally {
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '3rem', color: 'var(--accent)', marginBottom: '8px' }}>◈</div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '2rem', color: 'var(--accent)', letterSpacing: '0.15em' }}>
            FACEVALUE
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '6px' }}>
            Admin Login
          </p>
        </div>

        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '28px 20px',
            marginBottom: '20px',
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔄</div>
            <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '8px' }}>Authenticating admin...</p>
          </div>
        )}

        <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Admin Email</label>
            <input className="form-input" type="email" placeholder="admin@example.com" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="btn btn-gold btn-lg" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? <span className="spinner" /> : 'Admin Login'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/login')} style={{ width: '100%', justifyContent: 'center' }}>
            Back to User Login
          </button>
        </form>
      </div>
    </div>
  )
}
