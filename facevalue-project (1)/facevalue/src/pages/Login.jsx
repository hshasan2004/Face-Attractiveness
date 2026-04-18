import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../supabase/client'
import { getReadableAuthError, isRateLimitError, withRetry } from '../utils/authHelpers'

function normalizeEmail(value) {
  return value.trim().toLowerCase()
}

function normalizeText(value) {
  return value.trim()
}

function getPasswordValidationError(password) {
  if (password.length < 10) {
    return 'Password must be at least 10 characters.'
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include uppercase, lowercase, and a number.'
  }

  const lowered = password.toLowerCase()
  const blockedCommonPasswords = new Set([
    'password',
    'password123',
    'admin123',
    'qwerty123',
    'letmein123',
    '12345678',
    '123456789'
  ])

  if (blockedCommonPasswords.has(lowered)) {
    return 'This password is too common. Please choose a stronger one.'
  }

  return ''
}

export default function Login() {
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [registerCooldownSeconds, setRegisterCooldownSeconds] = useState(0)
  const navigate = useNavigate()

  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regGender, setRegGender] = useState('')
  const [regAge, setRegAge] = useState('')

  useEffect(() => {
    if (registerCooldownSeconds <= 0) return undefined

    const timer = setInterval(() => {
      setRegisterCooldownSeconds((current) => {
        if (current <= 1) {
          clearInterval(timer)
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [registerCooldownSeconds])

  async function handleLogin(e) {
    e.preventDefault()

    if (loading) return

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase configuration is missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      }

      const email = loginEmail.trim().toLowerCase()
      const password = loginPassword

      if (!email || !password) {
        setError('Email and password are required.')
        return
      }

      console.info('[auth] user login started', {
        emailDomain: email.split('@')[1] || 'unknown'
      })

      const result = await withRetry(async () => {
        const response = await supabase.auth.signInWithPassword({ email, password })

        if (response.error) {
          throw response.error
        }

        return response
      }, {
        label: 'User login',
        retries: 1,
        timeoutMs: 6000,
        onRetry: ({ attempt, delayMs }) => {
          setError(`Network is unstable. Retrying sign in (${attempt + 1}/2)...`)
          console.warn('[auth] retrying user login', { attempt, delayMs })
        }
      })

      const { error: signInErr } = result

      if (signInErr) throw signInErr

      console.info('[auth] user login succeeded', {
        userId: result?.data?.user?.id,
        hasSession: Boolean(result?.data?.session)
      })

      navigate('/rules', { replace: true })
    } catch (err) {
      console.error('[auth] user login failed', {
        message: err?.message,
        error: err
      })
      setError(getReadableAuthError(err, 'Login failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    
    if (loading) return

    if (registerCooldownSeconds > 0) {
      setError(`Too many attempts right now. Please wait ${registerCooldownSeconds}s and try again.`)
      return
    }
    
    setError('')
    setSuccess('')
    
    const age = parseInt(regAge, 10)
    if (!regName || !regEmail || !regPassword || !regGender || !regAge) {
      setError('All fields are required.')
      return
    }
    if (age < 15 || age > 70) {
      setError('Age must be between 15 and 70.')
      return
    }
    if (!/\S+@\S+\.\S+/.test(regEmail)) {
      setError('Invalid email address.')
      return
    }
    const passwordValidationError = getPasswordValidationError(regPassword)
    if (passwordValidationError) {
      setError(passwordValidationError)
      return
    }
    
    setLoading(true)
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase configuration is missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      }

      const email = normalizeEmail(regEmail)
      const password = regPassword
      const name = normalizeText(regName)

      console.info('[auth] registration started', {
        emailDomain: email.split('@')[1] || 'unknown'
      })

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            gender: regGender,
            age
          }
        }
      })

      if (signUpErr) {
        console.error('Registration: signUp failed', signUpErr)
        throw signUpErr
      }

      const authUser = data?.user
      if (!authUser?.id) {
        throw new Error('Registration failed: Supabase did not return a user id.')
      }

      if (!data?.session) {
        // Email-confirmation projects may return no session at signup time.
        // In that case, profile creation must happen after the user signs in.
        setRegEmail('')
        setRegPassword('')
        setRegName('')
        setRegGender('')
        setRegAge('')
        setSuccess('Registration successful! Please verify your email, then sign in.')
        setTab('login')
        return
      }

      const profilePayload = {
        id: authUser.id,
        full_name: name,
        first_name: name,
        last_name: '',
        email,
        gender: regGender,
        age,
        role: 'user'
      }

      let profileResult = await withRetry(async () => {
        const response = await supabase
          .from('user_profiles')
          .upsert(profilePayload, { onConflict: 'id' })

        if (response.error) {
          throw response.error
        }

        return response
      }, {
        label: 'Create user profile',
        retries: 1,
        timeoutMs: 10000
      })

      let profileErr = profileResult?.error

      if (profileErr?.message?.includes('full_name')) {
        const legacyProfilePayload = {
          id: authUser.id,
          first_name: name,
          last_name: '',
          email,
          gender: regGender,
          age,
          role: 'user'
        }

        const legacyResult = await withRetry(async () => {
          const response = await supabase
            .from('user_profiles')
            .upsert(legacyProfilePayload, { onConflict: 'id' })

          if (response.error) {
            throw response.error
          }

          return response
        }, {
          label: 'Create legacy user profile',
          retries: 1,
          timeoutMs: 10000
        })

        profileErr = legacyResult?.error
      }

      if (profileErr) {
        console.error('Profile insert failed:', profileErr)
        throw profileErr
      }

      setRegEmail('')
      setRegPassword('')
      setRegName('')
      setRegGender('')
      setRegAge('')

      if (data?.session) {
        setSuccess('Registration successful. Redirecting...')
        navigate('/rules', { replace: true })
      } else {
        setSuccess('Registration successful! Please verify your email, then sign in.')
        setTab('login')
      }
    } catch (err) {
      console.error('Registration flow error:', err)
      if (isRateLimitError(err)) {
        const email = normalizeEmail(regEmail)
        const password = regPassword

        try {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          })

          if (!signInError && signInData?.session) {
            setSuccess('Account already exists. Signed in successfully.')
            navigate('/rules', { replace: true })
            return
          }

          const signInMessage = signInError?.message?.toLowerCase() || ''
          if (signInMessage.includes('email not confirmed')) {
            setRegisterCooldownSeconds(300)
            setError('Your account appears to be created, but email confirmation is still pending. Check your inbox and spam folder, then sign in.')
            return
          }
        } catch (signInFallbackError) {
          console.warn('[auth] sign-in fallback after rate limit failed', {
            message: signInFallbackError?.message,
            error: signInFallbackError
          })
        }

        setRegisterCooldownSeconds(300)
        setError('Signup email rate limit is currently active. Please wait a few minutes before trying again.')
        return
      }
      setError(getReadableAuthError(err, 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '3rem', color: 'var(--accent)', marginBottom: '8px' }}>◈</div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '2rem', color: 'var(--accent)', letterSpacing: '0.15em' }}>
            FACEVALUE
          </h1>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: '6px' }}>
            Subjective Beauty Research Platform
          </p>
        </div>

        {/* Tab Toggle */}
        <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '4px', marginBottom: '28px', border: '1px solid var(--border)' }}>
          {['login', 'register'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccess('') }}
              style={{
                flex: 1,
                padding: '9px',
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? '#0a0a0f' : 'var(--muted)',
                border: 'none',
                borderRadius: '8px',
                fontWeight: tab === t ? 700 : 400,
                fontSize: '0.8rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                transition: 'all 0.2s',
                cursor: 'pointer'
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            marginBottom: '20px',
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔄</div>
            <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '8px' }}>Authenticating...</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Please wait while we verify your account</p>
          </div>
        )}

        {!loading && success && (
          <div className="success-msg" style={{ marginBottom: '16px' }}>
            {success}
          </div>
        )}

        {/* Login Tab */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="you@example.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn btn-gold btn-lg" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <span className="spinner" /> : 'Sign In'}
            </button>
          </form>
        )}

        {/* Register Tab */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" type="text" placeholder="Your name" value={regName} onChange={e => setRegName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="you@example.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Minimum 6 characters" value={regPassword} onChange={e => setRegPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <div className="radio-group">
                {['male', 'female'].map(g => (
                  <label key={g} className="radio-option">
                    <input type="radio" name="gender" value={g} checked={regGender === g} onChange={() => setRegGender(g)} />
                    <span className="radio-label">{g === 'male' ? '♂ Male' : '♀ Female'}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Age</label>
              <input className="form-input" type="number" placeholder="15–70" min={15} max={70} value={regAge} onChange={e => setRegAge(e.target.value)} />
            </div>
            {error && <div className="error-msg">{error}</div>}
            {success && <div className="success-msg">{success}</div>}
            <button
              type="submit"
              className="btn btn-gold btn-lg"
              disabled={loading || registerCooldownSeconds > 0}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? <span className="spinner" /> : registerCooldownSeconds > 0 ? `Create Account (${registerCooldownSeconds}s)` : 'Create Account'}
            </button>
          </form>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}
          onClick={() => navigate('/admin-login')}
        >
          Admin Login Page
        </button>
      </div>
    </div>
  )
}
