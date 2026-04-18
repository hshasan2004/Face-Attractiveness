import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase/client'

function average(values) {
  if (!values?.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function fullName(profile, userId) {
  if (!profile) return userId ? `User ${String(userId).slice(0, 8)}` : 'Unknown'
  if (profile.full_name) return profile.full_name
  const composed = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  return composed || profile.email || (userId ? `User ${String(userId).slice(0, 8)}` : 'Unknown')
}

function normalizeGender(value) {
  const v = String(value || '').trim().toLowerCase()
  return v === 'male' || v === 'female' ? v : 'unknown'
}

function UserBar({ value, max }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0
  return (
    <div style={{ width: '100%', maxWidth: '180px', height: '8px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
    </div>
  )
}

export default function Statistics() {
  const [surveys, setSurveys] = useState([])
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profileWarning, setProfileWarning] = useState('')
  const channelRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    loadSurveys()
  }, [])

  useEffect(() => {
    if (!selectedSurveyId) return
    loadStats(selectedSurveyId)
  }, [selectedSurveyId])

  useEffect(() => {
    if (!selectedSurveyId) return undefined

    const scheduleRefresh = (payloadSurveyId = null) => {
      if (payloadSurveyId && payloadSurveyId !== selectedSurveyId) return
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        loadStats(selectedSurveyId)
      }, 300)
    }

    channelRef.current = supabase
      .channel(`statistics-live-${selectedSurveyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responses' },
        payload => {
          const surveyId = payload?.new?.survey_id || payload?.old?.survey_id
          scheduleRefresh(surveyId)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'survey_responses' },
        payload => {
          const surveyId = payload?.new?.survey_id || payload?.old?.survey_id
          scheduleRefresh(surveyId)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'survey_assignments' },
        payload => {
          const surveyId = payload?.new?.survey_id || payload?.old?.survey_id
          scheduleRefresh(surveyId)
        }
      )
      // ratings payload does not include survey_id, so refresh and let query scope by selected survey.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ratings' },
        () => {
          scheduleRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        () => {
          scheduleRefresh()
        }
      )
      .subscribe()

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [selectedSurveyId])

  async function loadSurveys() {
    try {
      const { data, error: surveysError } = await supabase
        .from('surveys')
        .select('id, title, status, is_active, created_at')
        .order('created_at', { ascending: false })

      if (surveysError) throw surveysError

      setSurveys(data || [])
      if (data?.length) {
        const activeSurvey = data.find(s => s.is_active === true || s.status === 'active')
        setSelectedSurveyId((activeSurvey || data[0]).id)
      }
    } catch (err) {
      console.error('Statistics: loadSurveys failed', err)
      setError(err?.message || 'Failed to load surveys.')
    }
  }

  async function fetchProfilesByUserIds(userIds) {
    if (!userIds.length) return {}

    let result = await supabase
      .from('user_profiles')
      .select('id, email, gender, age, full_name, first_name, last_name')
      .in('id', userIds)

    if (result.error?.message?.includes('full_name')) {
      result = await supabase
        .from('user_profiles')
        .select('id, email, gender, age, first_name, last_name')
        .in('id', userIds)
    }

    if (result.error) throw result.error

    return Object.fromEntries((result.data || []).map(p => [p.id, p]))
  }

  async function loadStats(surveyId) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    setProfileWarning('')

    try {
      const assignmentsRes = await supabase
        .from('survey_assignments')
        .select('id, user_id')
        .eq('survey_id', surveyId)

      if (assignmentsRes.error) throw assignmentsRes.error

      const assignments = assignmentsRes.data || []
      const assignmentIds = assignments.map(a => a.id)
      const assignmentToUser = Object.fromEntries(assignments.map(a => [a.id, a.user_id]))
      const assignedUserIds = [...new Set(assignments.map(a => a.user_id).filter(Boolean))]

      let normalizedRatings = []

      const responseRes = await supabase
        .from('responses')
        .select('user_id, rating')
        .eq('survey_id', surveyId)
        .not('user_id', 'is', null)

      if (!responseRes.error) {
        normalizedRatings = (responseRes.data || [])
          .map(row => ({ user_id: row.user_id, rating: Number(row.rating) }))
          .filter(row => !!row.user_id && Number.isFinite(row.rating) && row.rating >= 1 && row.rating <= 5)
      } else {
        console.warn('Statistics: responses lookup failed, fallback to ratings+assignments', responseRes.error)
      }

      if (normalizedRatings.length === 0 && assignmentIds.length) {
        const ratingsRes = await supabase
          .from('ratings')
          .select('assignment_id, rating')
          .in('assignment_id', assignmentIds)

        if (ratingsRes.error) throw ratingsRes.error

        normalizedRatings = (ratingsRes.data || [])
          .map(row => ({
            user_id: assignmentToUser[row.assignment_id],
            rating: Number(row.rating)
          }))
          .filter(row => !!row.user_id && Number.isFinite(row.rating) && row.rating >= 1 && row.rating <= 5)
      }

      // Legacy fallback for deployments that still persist into survey_responses.
      if (normalizedRatings.length === 0) {
        const legacyRes = await supabase
          .from('survey_responses')
          .select('user_id, rating')
          .eq('survey_id', surveyId)
          .not('user_id', 'is', null)

        if (!legacyRes.error) {
          normalizedRatings = (legacyRes.data || [])
            .map(row => ({ user_id: row.user_id, rating: Number(row.rating) }))
            .filter(row => !!row.user_id && Number.isFinite(row.rating) && row.rating >= 1 && row.rating <= 5)
        }
      }

      const grouped = {}
      for (const row of normalizedRatings) {
        const userId = row.user_id
        const rating = Number(row.rating)
        if (!userId || !Number.isFinite(rating) || rating < 1 || rating > 5) continue
        if (!grouped[userId]) grouped[userId] = []
        grouped[userId].push(rating)
      }

      const userIds = [...new Set([...assignedUserIds, ...Object.keys(grouped)])]
      const profilesById = await fetchProfilesByUserIds(userIds)

      if (userIds.length > 0 && Object.keys(profilesById).length === 0) {
        setProfileWarning('Participant profile details are hidden by current RLS policy. IDs are shown as fallback.')
      }

      const computed = userIds
        .map(userId => {
          const ratings = grouped[userId]
          const profile = profilesById[userId]
          return {
            userId,
            name: fullName(profile, userId),
            email: profile?.email || '',
            gender: normalizeGender(profile?.gender),
            age: profile?.age || 'N/A',
            ratingCount: ratings?.length || 0,
            avgRating: average(ratings || []),
            ratings: ratings || []
          }
        })
        .sort((a, b) => {
          if (b.ratingCount !== a.ratingCount) return b.ratingCount - a.ratingCount
          return b.avgRating - a.avgRating
        })

      console.log('Statistics: loaded survey data', {
        surveyId,
        rows: computed.length,
        ratings: normalizedRatings.length
      })

      if (requestId === requestIdRef.current) {
        setRows(computed)
      }
    } catch (err) {
      console.error('Statistics: loadStats failed', err)
      if (requestId === requestIdRef.current) {
        setError(err?.message || 'Failed to load statistics.')
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  const totals = useMemo(() => {
    const totalRatings = rows.reduce((sum, r) => sum + r.ratingCount, 0)
    const avg = totalRatings ? rows.reduce((sum, r) => sum + r.avgRating * r.ratingCount, 0) / totalRatings : 0
    const maleCount = rows.filter(r => r.gender === 'male').length
    const femaleCount = rows.filter(r => r.gender === 'female').length
    return {
      participants: rows.length,
      totalRatings,
      avgRating: avg,
      maleCount,
      femaleCount
    }
  }, [rows])

  const maxCount = useMemo(() => {
    if (!rows.length) return 1
    return Math.max(...rows.map(r => r.ratingCount), 1)
  }, [rows])

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">User Rating Statistics</h2>
          <p className="admin-page-subtitle">Detailed participant-wise rating performance by survey</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Survey</label>
          <select
            className="form-input"
            value={selectedSurveyId}
            onChange={(e) => setSelectedSurveyId(e.target.value)}
            style={{ width: 'auto', minWidth: '240px' }}
          >
            {surveys.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(224,85,85,0.45)' }}>
          <div className="error-msg">{error}</div>
        </div>
      )}

      {profileWarning && !error && (
        <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(232,168,56,0.45)' }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>⚠️ {profileWarning}</div>
        </div>
      )}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Participants</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{totals.participants}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Total Ratings</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)' }}>{totals.totalRatings}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Weighted Avg Rating</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{totals.avgRating.toFixed(2)} ★</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Gender Split</div>
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{totals.maleCount} male / {totals.femaleCount} female</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User</th>
              <th>Gender</th>
              <th>Age</th>
              <th>Total Ratings</th>
              <th>Avg Rating</th>
              <th>Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                  No user rating statistics found for this survey.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.userId}>
                  <td style={{ width: '40px', textAlign: 'center', color: 'var(--muted)' }}>{index + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{row.email || row.userId}</div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{row.gender}</td>
                  <td>{row.age}</td>
                  <td style={{ fontWeight: 700 }}>{row.ratingCount}</td>
                  <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{row.avgRating.toFixed(2)} ★</td>
                  <td>
                    <UserBar value={row.ratingCount} max={maxCount} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
