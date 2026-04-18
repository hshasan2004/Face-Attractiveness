import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../supabase/client'
import { CELEBRITY_PHOTOS_BUCKET } from '../../config/storage'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

function normalizeStoragePath(value) {
  if (!value) return ''
  const raw = String(value)

  if (/^https?:\/\//i.test(raw)) {
    const publicMarker = `/object/public/${CELEBRITY_PHOTOS_BUCKET}/`
    const signedMarker = `/object/sign/${CELEBRITY_PHOTOS_BUCKET}/`
    const marker = raw.includes(publicMarker) ? publicMarker : (raw.includes(signedMarker) ? signedMarker : '')
    if (!marker) return raw
    return raw.split(marker)[1]?.split('?')[0] || raw
  }

  const cleaned = raw.replace(/^\/+/, '')
  const bucketPrefix = `${CELEBRITY_PHOTOS_BUCKET}/`
  return cleaned.startsWith(bucketPrefix) ? cleaned.slice(bucketPrefix.length) : cleaned
}

function storagePathToUrl(value) {
  if (!value) return ''
  if (/^https?:\/\//i.test(String(value))) return String(value)
  const normalized = normalizeStoragePath(value)
  return supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).getPublicUrl(normalized).data.publicUrl
}

/**
 * Calculate average rating, safe handling of empty arrays
 * Returns numeric value for sorting, string for display
 */
function formatRating(ratings) {
  if (!ratings || ratings.length === 0) return 0
  const sum = ratings.reduce((a, b) => a + b, 0)
  return sum / ratings.length
}

function DistBar({ value, max }) {
  const pct = max ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', width: '30px', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function Results() {
  const [surveys, setSurveys] = useState([])
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [results, setResults] = useState([])
  const [filterCeleb, setFilterCeleb] = useState('')
  const [filterGender, setFilterGender] = useState('all')
  const [distChart, setDistChart] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingError, setLoadingError] = useState('')
  const [realtimeError, setRealtimeError] = useState('')
  const [brokenImages, setBrokenImages] = useState({})

  const refreshTimerRef = useRef(null)
  const requestIdRef = useRef(0)
  const channelRef = useRef(null)
  const pollTimerRef = useRef(null)

  // Load surveys on mount
  useEffect(() => { loadSurveys() }, [])

  // When survey selection changes, reset state and reload
  useEffect(() => {
    if (!selectedSurveyId) return
    
    // Reset filters and state for new survey
    setResults([])
    setDistChart(null)
    setFilterCeleb('')
    setFilterGender('all')
    setBrokenImages({})
    console.log('🔄 Survey changed:', selectedSurveyId)

    setRealtimeError('')
    loadResults({ showLoading: true })

    pollTimerRef.current = setInterval(() => {
      loadResults({ showLoading: false })
    }, 8000)

    // Subscribe to new responses
    channelRef.current = supabase
      .channel(`results-live-${selectedSurveyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responses' },
        payload => {
          const surveyId = payload?.new?.survey_id || payload?.old?.survey_id
          if (!surveyId || surveyId !== selectedSurveyId) return

          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = setTimeout(() => {
            loadResults({ showLoading: false })
          }, 250)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'survey_responses' },
        payload => {
          const surveyId = payload?.new?.survey_id || payload?.old?.survey_id
          if (!surveyId || surveyId !== selectedSurveyId) return

          // Debounce the refresh
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = setTimeout(() => {
            loadResults({ showLoading: false })
          }, 350)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'celebrities' },
        payload => {
          const surveyId = payload?.new?.survey_id || payload?.old?.survey_id
          if (!surveyId || surveyId !== selectedSurveyId) return

          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = setTimeout(() => {
            loadResults({ showLoading: false })
          }, 250)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'celebrity_photos' },
        () => {
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = setTimeout(() => {
            loadResults({ showLoading: false })
          }, 250)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        () => {
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = setTimeout(() => {
            loadResults({ showLoading: false })
          }, 250)
        }
      )
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeError('Live updates disconnected. Auto-refreshing every 8s.')
        }
        if (status === 'SUBSCRIBED') {
          setRealtimeError('')
        }
      })

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [selectedSurveyId])

  async function loadSurveys() {
    try {
      const { data } = await supabase
        .from('surveys')
        .select('id, title')
        .order('created_at', { ascending: false })
        .limit(50)
      setSurveys(data || [])
      if (data?.length) setSelectedSurveyId(data[0].id)
    } catch (error) {
      console.error('Error loading surveys:', error)
    }
  }

  /**
   * Fetch all response data and aggregate statistics
   */
  async function loadResults({ showLoading = true } = {}) {
    const requestId = ++requestIdRef.current
    if (showLoading) setLoading(true)
    setLoadingError('')

    try {
      // Step 1: Get celebrities for THIS survey (not all celebrities)
      const { data: celebs, error: celebsError } = await supabase
        .from('celebrities')
        .select('id, name, gender, profile_image')
        .eq('survey_id', selectedSurveyId)

      if (celebsError) throw celebsError

      if (!celebs?.length) {
        console.log('ℹ️ No celebrities found for survey:', selectedSurveyId)
        if (requestId === requestIdRef.current) {
          setResults([])
          setDistChart(null)
          setBrokenImages({})
        }
        return
      }

      const celebIds = celebs.map(c => c.id)

      const { data: photos, error: photosError } = await supabase
        .from('celebrity_photos')
        .select('id, celebrity_id')
        .in('celebrity_id', celebIds)

      if (photosError) throw photosError

      const photoIdToCelebId = Object.fromEntries((photos || []).map(photo => [photo.id, photo.celebrity_id]))
      console.log('📌 Loading survey data', {
        selectedSurveyId,
        celebritiesCount: celebIds.length,
        celebrityIds: celebIds
      })

      // Step 2: Get responses for THIS survey with user gender info
      // Try responses first, fall back to survey_responses if needed
      let responses = []
      let responsesError = null

      const { data: data1, error: err1 } = await supabase
        .from('responses')
        .select('id, rating, celebrity_id, photo_id, survey_id, user_id')
        .eq('survey_id', selectedSurveyId)

      if (!err1) {
        responses = data1 || []
      } else if (err1?.message?.includes('relation')) {
        // Fallback for deployments still using survey_responses
        const { data: data2, error: err2 } = await supabase
          .from('survey_responses')
          .select('id, rating, selected_celebrity_id, survey_id, user_id')
          .eq('survey_id', selectedSurveyId)

        if (!err2) {
          responses = data2 || []
        } else {
          responsesError = err2
        }
      } else {
        responsesError = err1
      }

      if (responsesError && responses.length === 0) {
        console.warn('Could not fetch responses:', responsesError)
      }

      // Normalize both table variants to a single shape.
      let normalizedRatings = (responses || [])
        .map(r => ({
          celebrity_id: r.celebrity_id || r.selected_celebrity_id || photoIdToCelebId[r.photo_id],
          user_id: r.user_id,
          rating: Number(r.rating)
        }))
        .filter(r => Boolean(r.celebrity_id) && Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5)

      // Fallback path: some deployments store data only in ratings + survey_assignments.
      if (normalizedRatings.length === 0) {
        const { data: assignments, error: assignmentsErr } = await supabase
          .from('survey_assignments')
          .select('id, user_id')
          .eq('survey_id', selectedSurveyId)

        if (assignmentsErr) {
          console.warn('Could not fetch assignments fallback for results:', assignmentsErr)
        } else {
          const assignmentIds = (assignments || []).map(a => a.id)
          const assignmentUserById = Object.fromEntries((assignments || []).map(a => [a.id, a.user_id]))

          if (assignmentIds.length) {
            const { data: ratingsRows, error: ratingsErr } = await supabase
              .from('ratings')
              .select('assignment_id, photo_id, rating')
              .in('assignment_id', assignmentIds)

            if (ratingsErr) {
              console.warn('Could not fetch ratings fallback for results:', ratingsErr)
            } else {
              normalizedRatings = (ratingsRows || [])
                .map(r => ({
                  celebrity_id: photoIdToCelebId[r.photo_id],
                  user_id: assignmentUserById[r.assignment_id],
                  rating: Number(r.rating)
                }))
                .filter(r => Boolean(r.celebrity_id) && Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5)
            }
          }
        }
      }

      // Step 2.5: Resolve user genders in one compact query (avoids repeated nested joins)
      const uniqueUserIds = [...new Set((normalizedRatings || []).map(r => r.user_id).filter(Boolean))]
      let userGenderById = {}

      if (uniqueUserIds.length) {
        const { data: profilesData, error: profilesErr } = await supabase
          .from('user_profiles')
          .select('id, gender')
          .in('id', uniqueUserIds)

        if (profilesErr) {
          console.warn('Could not fetch profile genders for results:', profilesErr)
        } else {
          userGenderById = Object.fromEntries((profilesData || []).map(profile => [profile.id, String(profile.gender || '').toLowerCase()]))
        }
      }

      // Step 3: Aggregate ratings by celebrity and gender
      const celebStats = {}
      celebs.forEach(c => {
        celebStats[c.id] = {
          id: c.id,
          name: c.name,
          gender: c.gender,
          profile_image: c.profile_image,
          profileUrl: c.profile_image ? storagePathToUrl(c.profile_image) : '',
          allRatings: [],
          maleRatings: [],
          femaleRatings: []
        }
      })

      // Populate rating arrays with detailed logging
      let validResponses = 0
      ;(normalizedRatings || []).forEach(r => {
        if (celebStats[r.celebrity_id]) {
          celebStats[r.celebrity_id].allRatings.push(r.rating)
          validResponses++

          const userGender = userGenderById[r.user_id]
          if (userGender === 'male') {
            celebStats[r.celebrity_id].maleRatings.push(r.rating)
          } else if (userGender === 'female') {
            celebStats[r.celebrity_id].femaleRatings.push(r.rating)
          }
        }
      })

      console.log('📊 Results fetched', {
        selectedSurveyId,
        totalResponses: normalizedRatings.length,
        validResponses,
        matchedCelebrities: Object.values(celebStats).filter(c => c.allRatings.length > 0).length
      })

      // Step 4: Calculate stats for each celebrity and format numbers
      const res = Object.values(celebStats)
        .map(c => {
          const avg = c.allRatings.length > 0 ? (c.allRatings.reduce((a, b) => a + b, 0) / c.allRatings.length).toFixed(1) : '0'
          const maleAvg = c.maleRatings.length > 0 ? (c.maleRatings.reduce((a, b) => a + b, 0) / c.maleRatings.length).toFixed(1) : '0'
          const femaleAvg = c.femaleRatings.length > 0 ? (c.femaleRatings.reduce((a, b) => a + b, 0) / c.femaleRatings.length).toFixed(1) : '0'

          return {
            ...c,
            avg: parseFloat(avg),
            avgStr: avg,
            maleAvg: parseFloat(maleAvg),
            maleAvgStr: maleAvg,
            femaleAvg: parseFloat(femaleAvg),
            femaleAvgStr: femaleAvg,
            count: c.allRatings.length
          }
        })
        .sort((a, b) => {
          // Primary sort: by average rating descending
          if (b.avg !== a.avg) return b.avg - a.avg
          // Secondary sort: by evaluation count descending
          if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0)
          // Tertiary sort: stable name ordering for ties
          return String(a.name || '').localeCompare(String(b.name || ''))
        })

      console.log(`✅ Aggregated ${res.length} celebrities`)

      // Step 5: Build rating distribution chart
      const dist = [0, 0, 0, 0, 0]
      ;(normalizedRatings || []).forEach(r => {
        const rating = parseInt(r.rating, 10)
        if (rating >= 1 && rating <= 5) {
          dist[rating - 1]++
        }
      })

      if (requestId === requestIdRef.current) {
        setResults(res)
        setDistChart({
          labels: ['1★', '2★', '3★', '4★', '5★'],
          datasets: [{
            data: dist,
            backgroundColor: [
              'rgba(224,85,85,0.7)',
              'rgba(232,168,56,0.7)',
              'rgba(136,136,136,0.7)',
              'rgba(91,141,238,0.7)',
              'rgba(94,196,138,0.7)'
            ],
            borderRadius: 4
          }]
        })
      }
    } catch (error) {
      console.error('❌ Error loading results:', error)
      if (requestId === requestIdRef.current) {
        setLoadingError(error?.message || 'Failed to load results. Please try again.')
      }
    } finally {
      if (showLoading && requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  async function downloadCSV() {
    if (!selectedSurveyId) return

    const { data: celebs, error: celebsError } = await supabase
      .from('celebrities')
      .select('id')
      .eq('survey_id', selectedSurveyId)

    if (celebsError || !celebs?.length) return

    const { data: photos, error: photosError } = await supabase
      .from('celebrity_photos')
      .select('id, storage_path, display_order, celebrity_id')
      .in('celebrity_id', celebs.map(c => c.id))
      .order('celebrity_id', { ascending: true })
      .order('display_order', { ascending: true })

    if (photosError || !photos?.length) return

    const photoIdSet = new Set(photos.map(photo => photo.id))
    let ratingRows = []
    let participantUserIds = []

    const { data: assignments, error: assignmentsError } = await supabase
      .from('survey_assignments')
      .select('id, user_id, created_at')
      .eq('survey_id', selectedSurveyId)
      .order('created_at', { ascending: true })

    if (!assignmentsError && assignments?.length) {
      participantUserIds = [...new Set(assignments.map(assignment => assignment.user_id).filter(Boolean))]
      const assignmentUserById = Object.fromEntries(assignments.map(assignment => [assignment.id, assignment.user_id]))
      const assignmentIds = assignments.map(assignment => assignment.id)

      const { data: ratingsData, error: ratingsError } = await supabase
        .from('ratings')
        .select('assignment_id, photo_id, rating')
        .in('assignment_id', assignmentIds)

      if (!ratingsError && ratingsData?.length) {
        ratingRows = ratingsData
          .filter(row => photoIdSet.has(row.photo_id))
          .map(row => ({
            user_id: assignmentUserById[row.assignment_id],
            photo_id: row.photo_id,
            rating: Number(row.rating)
          }))
          .filter(row => row.user_id && Number.isFinite(row.rating))
      }
    }

    // Fallback for projects storing survey ratings in responses.
    if (!ratingRows.length) {
      const { data: responsesData, error: responsesError } = await supabase
        .from('responses')
        .select('user_id, photo_id, rating')
        .eq('survey_id', selectedSurveyId)

      if (!responsesError && responsesData?.length) {
        ratingRows = responsesData
          .filter(row => photoIdSet.has(row.photo_id))
          .map(row => ({
            user_id: row.user_id,
            photo_id: row.photo_id,
            rating: Number(row.rating)
          }))
          .filter(row => row.user_id && Number.isFinite(row.rating))
      }
    }

    const ratingUserIds = [...new Set(ratingRows.map(row => row.user_id).filter(Boolean))]
    const userIds = participantUserIds.length
      ? [...new Set([...participantUserIds, ...ratingUserIds])]
      : ratingUserIds

    if (!userIds.length) return

    const userColumnById = Object.fromEntries(userIds.map((userId, index) => [userId, `User${index + 1} Rating`]))
    const headers = ['Images', ...userIds.map(userId => userColumnById[userId]), 'Average']

    const ratingByPhotoAndUser = {}
    ratingRows.forEach(row => {
      const key = `${row.photo_id}::${row.user_id}`
      ratingByPhotoAndUser[key] = row.rating
    })

    const rows = photos.map(photo => {
      const rawFileName = String(photo.storage_path || '').split('/').pop() || ''
      const fileName = rawFileName || 'image.jpg'
      const userRatings = userIds.map(userId => {
        const key = `${photo.id}::${userId}`
        return ratingByPhotoAndUser[key] ?? ''
      })

      const validRatings = userRatings.filter(value => Number.isFinite(Number(value))).map(Number)
      const avg = validRatings.length ? (validRatings.reduce((sum, value) => sum + value, 0) / validRatings.length) : ''
      const avgFormatted = avg === '' ? '' : Number(avg.toFixed(9)).toString()

      return [fileName, ...userRatings, avgFormatted]
    })

    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `facevalue-image-user-ratings-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = useMemo(() => {
    return results.filter(r => {
      if (filterCeleb && !r.name.toLowerCase().includes(filterCeleb.toLowerCase())) return false
      if (filterGender !== 'all' && r.gender !== filterGender) return false
      return true
    })
  }, [results, filterCeleb, filterGender])

  const maxCount = useMemo(
    () => (filtered.length ? Math.max(...filtered.map(r => r.count), 1) : 1),
    [filtered]
  )

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">📊 Results & Leaderboard</h2>
          <p className="admin-page-subtitle">Live rating analysis and data export with real-time updates</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {surveys.length > 0 && (
            <select
              className="form-input"
              value={selectedSurveyId}
              onChange={e => setSelectedSurveyId(e.target.value)}
              style={{ width: 'auto' }}
            >
              {surveys.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-outline" onClick={downloadCSV} disabled={!filtered.length}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {(loadingError || realtimeError) && (
        <div
          className="card"
          style={{
            marginBottom: '16px',
            borderColor: loadingError ? 'var(--danger)' : 'var(--border)',
            backgroundColor: loadingError ? 'rgba(255,0,0,0.05)' : 'rgba(255,165,0,0.05)'
          }}
        >
          {loadingError && (
            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: realtimeError ? '6px' : 0 }}>
              ❌ {loadingError}
            </div>
          )}
          {realtimeError && (
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              ⚠️ {realtimeError}
            </div>
          )}
        </div>
      )}

      {/* Summary Stats */}
      {!loading && results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>Total Evaluations</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>
              {results.reduce((sum, r) => sum + (r.count || 0), 0)}
            </div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>Celebrities Rated</div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{results.filter(r => r.count > 0).length}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>Highest Rated</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
              {results.length > 0 && results[0].count > 0 ? `${results[0].avgStr} ★` : '—'}
            </div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>Average Rating</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {results.length > 0
                ? (results.reduce((sum, r) => sum + r.avg, 0) / results.length).toFixed(1)
                : '0'} ★
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder="🔍 Filter by celebrity name..."
          value={filterCeleb}
          onChange={e => setFilterCeleb(e.target.value)}
          style={{ flex: 1, minWidth: '180px' }}
        />
        <select
          className="form-input"
          value={filterGender}
          onChange={e => setFilterGender(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="all">All Genders</option>
          <option value="male">Male Celebrities</option>
          <option value="female">Female Celebrities</option>
        </select>
      </div>

      {/* Results Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Celebrity</th>
              <th>Avg Rating</th>
              <th>Male Avg</th>
              <th>Female Avg</th>
              <th>Evaluations</th>
              <th>Distribution</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </td>
              </tr>
            ) : !surveys.length ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                  No surveys available.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                  {results.length === 0 ? '📭 No ratings yet for this survey.' : '🔍 No celebrities match your filter.'}
                </td>
              </tr>
            ) : (
              filtered.map((r, idx) => (
                <tr
                  key={r.id}
                  style={{
                    background:
                      idx === 0
                        ? 'linear-gradient(90deg, rgba(200,169,110,0.18), transparent 65%)'
                        : idx === 1
                        ? 'linear-gradient(90deg, rgba(166,166,166,0.14), transparent 65%)'
                        : idx === 2
                        ? 'linear-gradient(90deg, rgba(205,127,80,0.14), transparent 65%)'
                        : 'transparent'
                  }}
                >
                  <td
                    style={{
                      fontWeight: 700,
                      color: idx < 3 ? 'var(--accent)' : 'var(--muted)',
                      width: '44px',
                      textAlign: 'center'
                    }}
                  >
                    {idx < 3 ? (idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉') : idx + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {r.profileUrl && !brokenImages[r.id] ? (
                        <img
                          src={r.profileUrl}
                          alt={r.name}
                          width={40}
                          height={40}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid var(--accent)',
                            backgroundColor: 'rgba(102,126,234,0.1)'
                          }}
                          onError={() => setBrokenImages(prev => ({ ...prev, [r.id]: true }))}
                        />
                      ) : (
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, rgba(200,169,110,0.3), rgba(42,42,58,0.9))',
                            border: '2px solid var(--border)',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            color: 'var(--muted)',
                            flexShrink: 0
                          }}
                        >
                          {(r.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>{r.name || 'Unknown'}</div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color:
                              r.gender === 'male'
                                ? 'var(--male)'
                                : r.gender === 'female'
                                ? 'var(--female)'
                                : 'var(--muted)',
                            textTransform: 'capitalize'
                          }}
                        >
                          {r.gender || 'unknown'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    style={{
                      fontFamily: "'Syne', sans-serif",
                      fontWeight: 700,
                      color: 'var(--accent)',
                      fontSize: '1.1rem'
                    }}
                  >
                    {r.avgStr || '0'} ★
                  </td>
                  <td>
                    <span style={{ color: 'var(--male)', fontSize: '0.875rem', fontWeight: 600 }}>
                      {r.maleAvgStr || '0'} ★
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--female)', fontSize: '0.875rem', fontWeight: 600 }}>
                      {r.femaleAvgStr || '0'} ★
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)', fontWeight: 600 }}>{r.count || 0}</td>
                  <td style={{ minWidth: '120px' }}>
                    <DistBar value={r.count} max={maxCount} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Distribution Chart */}
      {distChart && results.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">📊 Global Rating Distribution (1★–5★)</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '16px' }}>
            This shows the overall distribution of ratings across all celebrities. A balanced distribution indicates fair evaluations.
          </p>
          <Bar
            data={distChart}
            options={{
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { color: 'rgba(42,42,58,0.8)' }, ticks: { color: '#888' } },
                y: { grid: { color: 'rgba(42,42,58,0.8)' }, ticks: { color: '#888' } }
              }
            }}
            height={120}
          />
        </div>
      )}
    </div>
  )
}
