import { useState, useEffect, createContext, useContext, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { getReadableAuthError, withRetry } from '../utils/authHelpers'

const AuthContext = createContext(null)
const AUTH_LOADING_WATCHDOG_MS = 7000
const PROFILE_LOADING_WATCHDOG_MS = 8000
const AUTH_REQUEST_TIMEOUT_MS = 6000
const PROFILE_REQUEST_TIMEOUT_MS = 7000

const PROFILE_SELECT_FIELDS = 'id, email, role, full_name, first_name, last_name, age, gender, avatar_url'
const LEGACY_PROFILE_SELECT_FIELDS = 'id, email, role, first_name, last_name, age, gender, avatar_url'

function normalizeProfile(profile) {
  if (!profile) return null

  const fullName = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || null

  return {
    ...profile,
    full_name: fullName
  }
}

async function readProfileById(userId, fields) {
  return await withRetry(async () => {
    const response = await supabase
      .from('user_profiles')
      .select(fields)
      .eq('id', userId)
      .single()

    if (response.error) {
      throw response.error
    }

    return response.data
  }, {
    label: 'Load profile',
    retries: 1,
    timeoutMs: PROFILE_REQUEST_TIMEOUT_MS
  })
}

async function readProfileByEmail(userEmail, fields) {
  return await withRetry(async () => {
    const response = await supabase
      .from('user_profiles')
      .select(fields)
      .eq('email', userEmail)
      .maybeSingle()

    if (response.error) {
      throw response.error
    }

    return response.data
  }, {
    label: 'Load profile by email',
    retries: 1,
    timeoutMs: PROFILE_REQUEST_TIMEOUT_MS
  })
}

async function createProfileForUser(user) {
  const fullName = user?.user_metadata?.full_name || null
  const gender = user?.user_metadata?.gender || null
  const ageRaw = user?.user_metadata?.age
  const age = Number.isFinite(Number(ageRaw)) ? Number(ageRaw) : null

  const basePayload = {
    id: user.id,
    email: user.email,
    role: 'user',
    full_name: fullName,
    first_name: fullName || user.email?.split('@')[0] || 'User',
    last_name: '',
    gender,
    age
  }

  return await withRetry(async () => {
    const response = await supabase
      .from('user_profiles')
      .upsert(basePayload, { onConflict: 'id' })

    if (response.error) {
      const message = response.error?.message || ''

      if (message.includes('full_name')) {
        const legacyPayload = {
          id: user.id,
          email: user.email,
          role: 'user',
          first_name: fullName || user.email?.split('@')[0] || 'User',
          last_name: '',
          gender,
          age
        }

        const legacyResponse = await supabase
          .from('user_profiles')
          .upsert(legacyPayload, { onConflict: 'id' })

        if (legacyResponse.error) {
          throw legacyResponse.error
        }

        return legacyResponse
      }

      throw response.error
    }

    return response
  }, {
    label: 'Create missing profile',
    retries: 1,
    timeoutMs: PROFILE_REQUEST_TIMEOUT_MS
  })
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const isMounted = useRef(true)
  const profileRequestIdRef = useRef(0)
  const lastAppliedUserIdRef = useRef(null)

  const fetchProfile = useCallback(async (userId, userEmail = null) => {
    const requestId = profileRequestIdRef.current + 1
    profileRequestIdRef.current = requestId

    if (isMounted.current) {
      setProfileLoading(true)
    }

    try {
      console.info('[auth] loading profile', { userId, hasEmailFallback: Boolean(userEmail) })

      try {
        const profileData = await readProfileById(userId, PROFILE_SELECT_FIELDS)

        if (profileData && isMounted.current && profileRequestIdRef.current === requestId) {
          setProfile(normalizeProfile(profileData))
        }

        return profileData
      } catch (primaryError) {
        const message = primaryError?.message || ''

        if (!message.includes('full_name')) {
          throw primaryError
        }

        const legacyProfileData = await readProfileById(userId, LEGACY_PROFILE_SELECT_FIELDS)

        if (legacyProfileData && isMounted.current && profileRequestIdRef.current === requestId) {
          setProfile(normalizeProfile(legacyProfileData))
        }

        return legacyProfileData
      }
    } catch (error) {
      console.error('[auth] profile fetch error', {
        userId,
        message: error?.message,
        error
      })

      if (userEmail) {
        try {
          const emailProfile = await readProfileByEmail(userEmail, PROFILE_SELECT_FIELDS)

          if (emailProfile && isMounted.current && profileRequestIdRef.current === requestId) {
            setProfile(normalizeProfile(emailProfile))
          }

          return emailProfile
        } catch (emailError) {
          const message = emailError?.message || ''

          if (message.includes('full_name')) {
            try {
              const legacyEmailProfile = await readProfileByEmail(userEmail, LEGACY_PROFILE_SELECT_FIELDS)

              if (legacyEmailProfile && isMounted.current && profileRequestIdRef.current === requestId) {
                setProfile(normalizeProfile(legacyEmailProfile))
              }

              return legacyEmailProfile
            } catch (legacyEmailError) {
              console.error('[auth] legacy email profile fallback failed', {
                userId,
                userEmail,
                message: legacyEmailError?.message,
                error: legacyEmailError
              })
            }
          }

          console.error('[auth] email profile fallback failed', {
            userId,
            userEmail,
            message,
            error: emailError
          })
        }
      }

      if (isMounted.current && profileRequestIdRef.current === requestId) {
        setProfile(null)
      }

      return null
    } finally {
      if (isMounted.current && profileRequestIdRef.current === requestId) {
        setProfileLoading(false)
      }
    }
  }, [])

  const applySession = useCallback(async (session, source) => {
    const nextUserId = session?.user?.id ?? null

    if (lastAppliedUserIdRef.current === nextUserId) {
      if (isMounted.current) {
        setLoading(false)
      }

      return
    }

    lastAppliedUserIdRef.current = nextUserId

    if (!isMounted.current) {
      return
    }

    setUser(session?.user ?? null)
    setLoading(false)

    if (session?.user) {
      console.info('[auth] session applied', { source, userId: session.user.id })
      let profileData = await fetchProfile(session.user.id, session.user.email)

      if (!profileData) {
        try {
          console.info('[auth] creating missing profile', { userId: session.user.id })
          await createProfileForUser(session.user)
          profileData = await fetchProfile(session.user.id, session.user.email)
        } catch (profileCreateError) {
          console.warn('[auth] could not create missing profile', {
            userId: session.user.id,
            message: profileCreateError?.message,
            error: profileCreateError
          })
        }
      }

      return
    }

    console.info('[auth] session cleared', { source })
    setProfile(null)
    setProfileLoading(false)
  }, [fetchProfile])

  const refetchProfile = useCallback(() => {
    if (user) {
      return fetchProfile(user.id, user.email)
    }

    return Promise.resolve(null)
  }, [user, fetchProfile])

  useEffect(() => {
    if (!loading) return undefined

    const timer = setTimeout(() => {
      if (isMounted.current) {
        console.warn('[auth] auth loading watchdog triggered; releasing loading state.')
        setLoading(false)
      }
    }, AUTH_LOADING_WATCHDOG_MS)

    return () => clearTimeout(timer)
  }, [loading])

  useEffect(() => {
    if (!profileLoading) return undefined

    const timer = setTimeout(() => {
      if (isMounted.current) {
        console.warn('[auth] profile loading watchdog triggered; releasing profile loading state.')
        setProfileLoading(false)
      }
    }, PROFILE_LOADING_WATCHDOG_MS)

    return () => clearTimeout(timer)
  }, [profileLoading])

  useEffect(() => {
    isMounted.current = true
    let cancelled = false

    const bootstrapSession = async () => {
      try {
        console.info('[auth] bootstrap session check started')

        const sessionData = await withRetry(async () => {
          const response = await supabase.auth.getSession()

          if (response.error) {
            throw response.error
          }

          return response.data
        }, {
          label: 'Session check',
          retries: 1,
          timeoutMs: AUTH_REQUEST_TIMEOUT_MS
        })

        if (!cancelled && isMounted.current) {
          await applySession(sessionData?.session ?? null, 'bootstrap')
        }
      } catch (error) {
        console.error('[auth] bootstrap session check failed', {
          message: error?.message,
          friendlyMessage: getReadableAuthError(error, 'Could not load your session.'),
          error
        })

        if (!cancelled && isMounted.current) {
          setUser(null)
          setProfile(null)
          setProfileLoading(false)
          setLoading(false)
        }
      } finally {
        if (!cancelled && isMounted.current) {
          setLoading(false)
        }
      }
    }

    void bootstrapSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      void applySession(session, 'auth-state-change')
    })

    return () => {
      cancelled = true
      isMounted.current = false
      subscription?.unsubscribe()
    }
  }, [applySession])

  const value = useMemo(() => ({
    user,
    profile,
    profileLoading,
    loading,
    signOut: async () => {
      return await withRetry(async () => {
        const response = await supabase.auth.signOut()

        if (response.error) {
          throw response.error
        }

        lastAppliedUserIdRef.current = null
        if (isMounted.current) {
          setUser(null)
          setProfile(null)
          setProfileLoading(false)
        }
      }, {
        label: 'Sign out',
        retries: 1,
        timeoutMs: AUTH_REQUEST_TIMEOUT_MS
      })
    },
    refetchProfile
  }), [user, profile, profileLoading, loading, refetchProfile])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
