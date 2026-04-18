import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { CELEBRITY_PHOTOS_BUCKET } from '../../config/storage'
import { meanRating, meanNumber } from '../../utils/stats'
import { isSurveyActive } from '../../utils/surveyHelpers'
import { Bar, Chart } from 'react-chartjs-2'
import { Chart as ChartJS, registerables } from 'chart.js'

// Register all built-in controllers/elements so mixed charts (bar + line) never crash at runtime.
ChartJS.register(...registerables)

const CHART_DEFAULTS = {
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: 'rgba(42,42,58,0.8)' }, ticks: { color: '#888', font: { size: 11 } } },
    y: { grid: { color: 'rgba(42,42,58,0.8)' }, ticks: { color: '#888', font: { size: 11 } } }
  }
}

function columnMissing(err, col) {
  const message = err?.message || ''
  return message.includes(col) && (message.includes('schema cache') || message.includes('Could not find'))
}

function normalizeGender(value) {
  const v = String(value || '').trim().toLowerCase()
  if (['male', 'm', 'man', 'boy'].includes(v)) return 'male'
  if (['female', 'f', 'woman', 'girl'].includes(v)) return 'female'
  return 'unknown'
}

function validRating(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 && n <= 5
}

function validAge(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 15 && n <= 100
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ participants: 0, male: 0, female: 0, ratings: 0 })
  const [targets, setTargets] = useState({ participants: 0, ratings: 0 })
  const [surveysList, setSurveysList] = useState([])
  const [surveyPhotoCounts, setSurveyPhotoCounts] = useState({})
  const [lastSurveyId, setLastSurveyId] = useState('')
  const [actionBusyId, setActionBusyId] = useState('')
  const [genderChart, setGenderChart] = useState(null)
  const [ageChart, setAgeChart] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [expandedCeleb, setExpandedCeleb] = useState(null)
  const [loading, setLoading] = useState(true)
  const dashRef = useRef(null)
  const channelRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    loadData()

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
  }, [])

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        loadData({ showLoading: false })
      }, 300)
    }

    channelRef.current = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surveys' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_assignments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'celebrities' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'celebrity_photos' }, scheduleRefresh)
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
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('facevalue_admin_wizard_draft')
      const parsed = raw ? JSON.parse(raw) : null
      setLastSurveyId(parsed?.surveyId || '')
    } catch {
      setLastSurveyId('')
    }
  }, [])

  async function loadData({ showLoading = true } = {}) {
    const requestId = ++requestIdRef.current
    if (showLoading) setLoading(true)
    try {
      let { data: surveyRows } = await supabase
        .from('surveys')
        .select('id, title, status, is_active, start_time, end_time, starts_at, ends_at, images_per_session, evaluators_needed, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      const activeRows = (surveyRows || []).filter(isSurveyActive)
      if (activeRows.length > 1) {
        const keeper = activeRows[0]
        await deactivateOtherSurveys(keeper.id)
        const { data: refreshed } = await supabase
          .from('surveys')
          .select('id, title, status, is_active, start_time, end_time, starts_at, ends_at, images_per_session, evaluators_needed, created_at')
          .order('created_at', { ascending: false })
          .limit(50)
        surveyRows = refreshed || surveyRows
      }

      const activeSurvey = (surveyRows || []).find(isSurveyActive) || null
      if (requestId !== requestIdRef.current) return
      setSurveysList(surveyRows || [])

      const surveyIds = (surveyRows || []).map(s => s.id).filter(Boolean)
      let photoCountBySurveyId = {}

      if (surveyIds.length) {
        const { data: surveyCelebs } = await supabase
          .from('celebrities')
          .select('id, survey_id')
          .in('survey_id', surveyIds)

        const celebToSurvey = Object.fromEntries((surveyCelebs || []).map(c => [c.id, c.survey_id]))
        const celebIds = Object.keys(celebToSurvey)

        if (celebIds.length) {
          const { data: surveyPhotos } = await supabase
            .from('celebrity_photos')
            .select('celebrity_id')
            .in('celebrity_id', celebIds)

          photoCountBySurveyId = (surveyPhotos || []).reduce((acc, photo) => {
            const surveyId = celebToSurvey[photo.celebrity_id]
            if (surveyId) {
              acc[surveyId] = (acc[surveyId] || 0) + 1
            }
            return acc
          }, {})
        }
      }

      if (requestId !== requestIdRef.current) return
      setSurveyPhotoCounts(photoCountBySurveyId)

      const targetParticipants = Number(activeSurvey?.evaluators_needed) || 0
      const imagesPerSession = Number(activeSurvey?.images_per_session) || 0
      const targetRatings = targetParticipants > 0 && imagesPerSession > 0
        ? targetParticipants * imagesPerSession
        : 0

      if (requestId !== requestIdRef.current) return
      setTargets({ participants: targetParticipants, ratings: targetRatings })

      const { data: assignments } = activeSurvey
        ? await supabase
            .from('survey_assignments')
            .select('id, user_id')
            .eq('survey_id', activeSurvey.id)
        : { data: [] }

      const assignmentIds = (assignments || []).map(a => a.id)
      const participantIds = [...new Set((assignments || []).map(a => a.user_id).filter(Boolean))]
      const assignmentToUser = Object.fromEntries((assignments || []).map(a => [a.id, a.user_id]))

      const { data: profiles } = participantIds.length
        ? await supabase.from('user_profiles').select('id, gender, age, role').in('id', participantIds)
        : { data: [] }
      const profileById = Object.fromEntries((profiles || []).map(profile => [profile.id, profile]))

      const male = profiles?.filter(p => normalizeGender(p.gender) === 'male').length || 0
      const female = profiles?.filter(p => normalizeGender(p.gender) === 'female').length || 0

      const { count: ratingsCount } = assignmentIds.length
        ? await supabase
            .from('ratings')
            .select('*', { count: 'exact', head: true })
            .in('assignment_id', assignmentIds)
        : { count: 0 }

      if (requestId !== requestIdRef.current) return
      setStats({ participants: participantIds.length || 0, male, female, ratings: ratingsCount || 0 })

      const { data: celebs } = activeSurvey
        ? await supabase.from('celebrities').select('id, name, gender').eq('survey_id', activeSurvey.id)
        : { data: [] }
      if (!celebs?.length) {
        if (requestId !== requestIdRef.current) return
        setLeaderboard([])
        setGenderChart(null)
        setAgeChart(null)
        return
      }

      const { data: photos } = await supabase
        .from('celebrity_photos')
        .select('id, celebrity_id')
        .in('celebrity_id', celebs.map(c => c.id))
      const photoIds = photos?.map(p => p.id) ?? []
      const photoIdToCelebId = Object.fromEntries((photos || []).map(photo => [photo.id, photo.celebrity_id]))

      const { data: allRatings } = photoIds.length
        ? await supabase
            .from('ratings')
            .select('rating, assignment_id, photo_id')
            .in('photo_id', photoIds)
            .in('assignment_id', assignmentIds)
        : { data: [] }

      if (celebs && allRatings) {
        // Build leaderboard data
        const celebStats = {}
        celebs.forEach(c => {
          celebStats[c.id] = { ...c, ratings: [], maleRatings: [], femaleRatings: [] }
        })

        allRatings.forEach(r => {
          if (!validRating(r.rating)) return
          const celebId = photoIdToCelebId[r.photo_id]
          if (!celebId || !celebStats[celebId]) return
          const evaluatorUserId = assignmentToUser[r.assignment_id]
          const evaluatorGender = normalizeGender(profileById[evaluatorUserId]?.gender)
          celebStats[celebId].ratings.push(r.rating)
          if (evaluatorGender === 'male') celebStats[celebId].maleRatings.push(r.rating)
          if (evaluatorGender === 'female') celebStats[celebId].femaleRatings.push(r.rating)
        })

        const lb = Object.values(celebStats)
          .map(c => ({
            ...c,
            avg: meanRating(c.ratings),
            maleAvg: meanRating(c.maleRatings),
            femaleAvg: meanRating(c.femaleRatings),
            count: c.ratings.length
          }))
          .filter(c => c.count > 0)
          .sort((a, b) => {
            const av = a.avg === 'N/A' ? -Infinity : parseFloat(a.avg)
            const bv = b.avg === 'N/A' ? -Infinity : parseFloat(b.avg)
            return bv - av
          })

        if (requestId !== requestIdRef.current) return
        setLeaderboard(lb)

        // Gender chart data
        const topCelebs = lb.slice(0, 10)
        if (requestId !== requestIdRef.current) return
        setGenderChart({
          labels: topCelebs.map(c => c.name.split(' ')[0]),
          datasets: [
            {
              label: 'Male Avg',
              data: topCelebs.map(c => parseFloat(c.maleAvg) || 0),
              backgroundColor: 'rgba(91,141,238,0.7)',
              borderRadius: 4
            },
            {
              label: 'Female Avg',
              data: topCelebs.map(c => parseFloat(c.femaleAvg) || 0),
              backgroundColor: 'rgba(212,83,126,0.7)',
              borderRadius: 4
            }
          ]
        })

        // Age group chart
        const ageBrackets = ['15-20', '21-25', '26-30', '31-35', '36-40', '41+']
        const ageCounts = Array(6).fill(0)
        const ageRatings = Array.from({ length: 6 }, () => [])

        // Count participants once per user for the left Y axis.
        participantIds.forEach(userId => {
          const age = Number(profileById[userId]?.age)
          if (!validAge(age)) return
          const idx = age <= 20 ? 0 : age <= 25 ? 1 : age <= 30 ? 2 : age <= 35 ? 3 : age <= 40 ? 4 : 5
          ageCounts[idx]++
        })

        // Keep rating aggregation separate for the Avg Rating line.
        allRatings.forEach(r => {
          if (!validRating(r.rating)) return
          const evaluatorUserId = assignmentToUser[r.assignment_id]
          const age = Number(profileById[evaluatorUserId]?.age)
          if (!validAge(age)) return
          const idx = age <= 20 ? 0 : age <= 25 ? 1 : age <= 30 ? 2 : age <= 35 ? 3 : age <= 40 ? 4 : 5
          ageRatings[idx].push(r.rating)
        })

        if (requestId !== requestIdRef.current) return
        setAgeChart({
          labels: ageBrackets,
          datasets: [
            {
              type: 'bar',
              label: 'Participants',
              data: ageCounts,
              backgroundColor: 'rgba(147,100,220,0.6)',
              borderRadius: 4,
              yAxisID: 'y'
            },
            {
              type: 'line',
              label: 'Avg Rating',
              data: ageRatings.map(arr => (arr.length ? meanNumber(arr).toFixed(2) : 0)),
              borderColor: '#e8a838',
              backgroundColor: 'rgba(232,168,56,0.1)',
              pointBackgroundColor: '#e8a838',
              tension: 0.4,
              yAxisID: 'y2'
            }
          ]
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (showLoading && requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  async function deactivateOtherSurveys(keepId) {
    let { error } = await supabase
      .from('surveys')
      .update({ is_active: false, status: 'closed' })
      .neq('id', keepId)
      .eq('is_active', true)

    if (error && columnMissing(error, 'status')) {
      ;({ error } = await supabase
        .from('surveys')
        .update({ is_active: false })
        .neq('id', keepId)
        .eq('is_active', true))
    }

    if (error && columnMissing(error, 'is_active')) {
      ;({ error } = await supabase
        .from('surveys')
        .update({ status: 'closed' })
        .neq('id', keepId)
        .eq('status', 'active'))
    }

    return error
  }

  function openSurveyWizard(id) {
    if (!id) return
    navigate(`/admin/create-survey/${id}`)
  }

  async function toggleSurveyActive(survey) {
    if (!survey?.id) return
    setActionBusyId(survey.id)
    try {
      const shouldActivate = !(survey.is_active === true || survey.status === 'active')

      if (shouldActivate) {
        const deactivateErr = await deactivateOtherSurveys(survey.id)
        if (deactivateErr) throw deactivateErr
      }

      const payload = shouldActivate
        ? { is_active: true, status: 'active' }
        : { is_active: false, status: 'closed' }

      let { error } = await supabase.from('surveys').update(payload).eq('id', survey.id)
      if (error) {
        await supabase.from('surveys').update({ is_active: payload.is_active }).eq('id', survey.id)
      }
      await loadData()
    } finally {
      setActionBusyId('')
    }
  }

  async function deleteSurveyFromDashboard(survey) {
    if (!survey?.id) return
    const confirmed = window.confirm(`Delete survey "${survey.title}" and all related celebrities/photos? This cannot be undone.`)
    if (!confirmed) return

    setActionBusyId(survey.id)
    try {
      const { data: celebRows } = await supabase.from('celebrities').select('id').eq('survey_id', survey.id)
      const celebIds = (celebRows || []).map(c => c.id)

      if (celebIds.length) {
        const { data: photoRows } = await supabase.from('celebrity_photos').select('storage_path').in('celebrity_id', celebIds)
        const paths = (photoRows || []).map(p => p.storage_path).filter(Boolean)
        if (paths.length) {
          await supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).remove(paths)
        }

        await supabase.from('celebrity_photos').delete().in('celebrity_id', celebIds)
        await supabase.from('celebrities').delete().eq('survey_id', survey.id)
      }

      await supabase.from('surveys').delete().eq('id', survey.id)
      await loadData()
    } finally {
      setActionBusyId('')
    }
  }

  async function downloadPDF() {
    const el = dashRef.current
    if (!el) return
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ])
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#0a0a0f' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('landscape', 'mm', 'a4')
    pdf.addImage(imgData, 'PNG', 10, 10, 277, 190)
    pdf.save(`facevalue-report-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  async function downloadCSV() {
    const { data: celebs } = await supabase.from('celebrities').select('id')
    if (!celebs?.length) return
    const { data: photos } = await supabase
      .from('celebrity_photos')
      .select('id')
      .in('celebrity_id', celebs.map(c => c.id))
    const photoIds = photos?.map(p => p.id) ?? []
    if (!photoIds.length) return

    const { data } = await supabase
      .from('ratings')
      .select('rating, rated_at, photo_id, celebrity_photos(celebrity_id, celebrities(name)), survey_assignments(user_id, user_profiles(gender, age))')
      .in('photo_id', photoIds)
    if (!data) return
    const headers = ['celebrity_name', 'photo_id', 'evaluator_id', 'gender', 'age', 'rating', 'rated_at']
    const rows = data.map(r => [
      r.celebrity_photos?.celebrities?.name || '',
      r.photo_id,
      r.survey_assignments?.user_id || '',
      r.survey_assignments?.user_profiles?.gender || '',
      r.survey_assignments?.user_profiles?.age || '',
      r.rating,
      r.rated_at
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'facevalue-ratings.csv'; a.click()
  }

  function starsDisplay(avg) {
    const n = Math.round(parseFloat(avg))
    return '★'.repeat(n) + '☆'.repeat(5 - n)
  }

  return (
    <div ref={dashRef} id="dashboard-content">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Dashboard</h2>
          <p className="admin-page-subtitle">Welcome back — research overview</p>
        </div>
        <span className="live-badge"><span className="live-dot" /> LIVE</span>
      </div>

      <div className="card" style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif" }}>Survey Control</h3>
          {lastSurveyId && (
            <button className="btn btn-outline btn-sm" onClick={() => openSurveyWizard(lastSurveyId)}>
              Resume Last Survey
            </button>
          )}
        </div>
        {surveysList.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No surveys found.</div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {surveysList.map(s => {
              const active = s.is_active === true || s.status === 'active'
              const busy = actionBusyId === s.id
              return (
                <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.title}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                      {active ? 'Active' : 'Inactive'} · {surveyPhotoCounts[s.id] || 0} uploaded images
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => openSurveyWizard(s.id)}>Open</button>
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => toggleSurveyActive(s)}>{active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => deleteSurveyFromDashboard(s)}>{busy ? 'Working...' : 'Delete'}</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Participants</div>
          <div className="stat-value">{stats.participants}</div>
          <div className="stat-sub">
            {targets.participants > 0 ? `of ${targets.participants} target` : 'target not set in survey'}
          </div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${targets.participants > 0 ? Math.min(100, (stats.participants / targets.participants) * 100) : 0}%`, background: 'var(--accent)' }} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Male Users</div>
          <div className="stat-value" style={{ color: 'var(--male)' }}>{stats.male}</div>
          <div className="stat-sub">{stats.participants ? Math.round((stats.male / stats.participants) * 100) : 0}% of total</div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${stats.participants ? (stats.male / stats.participants) * 100 : 0}%`, background: 'var(--male)' }} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Female Users</div>
          <div className="stat-value" style={{ color: 'var(--female)' }}>{stats.female}</div>
          <div className="stat-sub">{stats.participants ? Math.round((stats.female / stats.participants) * 100) : 0}% of total</div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${stats.participants ? (stats.female / stats.participants) * 100 : 0}%`, background: 'var(--female)' }} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ratings Collected</div>
          <div className="stat-value">{stats.ratings.toLocaleString()}</div>
          <div className="stat-sub">
            {targets.ratings > 0 ? `of ${targets.ratings.toLocaleString()} needed` : 'ratings target not set in survey'}
          </div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${targets.ratings > 0 ? Math.min(100, (stats.ratings / targets.ratings) * 100) : 0}%`, background: 'var(--success)' }} /></div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">Male vs Female Rating Comparison</div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: 'var(--male)' }} />Male avg</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: 'var(--female)' }} />Female avg</span>
          </div>
          {genderChart ? (
            <Bar data={genderChart} options={{ ...CHART_DEFAULTS, scales: { ...CHART_DEFAULTS.scales, y: { ...CHART_DEFAULTS.scales.y, min: 0, max: 5 } } }} height={200} />
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </div>
        <div className="chart-card">
          <div className="chart-title">Age Group Distribution</div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(147,100,220,0.6)' }} />Participants</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#e8a838', borderRadius: '50%' }} />Avg rating</span>
          </div>
          {ageChart ? (
            <Chart type="bar" data={ageChart} options={{
              ...CHART_DEFAULTS,
              scales: {
                x: CHART_DEFAULTS.scales.x,
                y: {
                  ...CHART_DEFAULTS.scales.y,
                  position: 'left',
                  beginAtZero: true,
                  ticks: { ...CHART_DEFAULTS.scales.y.ticks, stepSize: 10 },
                  title: { display: true, text: 'Participants', color: '#888', font: { size: 10 } }
                },
                y2: { ...CHART_DEFAULTS.scales.y, position: 'right', min: 0, max: 5, grid: { drawOnChartArea: false }, title: { display: true, text: 'Avg Rating', color: '#888', font: { size: 10 } } }
              }
            }} height={200} />
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="leaderboard-card" style={{ marginBottom: '28px' }}>
        <div className="leaderboard-header">Celebrity Leaderboard — click any row to expand</div>
        {loading ? (
          <div style={{ padding: '24px' }}><div className="spinner" /></div>
        ) : leaderboard.length === 0 ? (
          <div style={{ padding: '24px', color: 'var(--muted)', fontSize: '0.875rem' }}>No ratings yet.</div>
        ) : (
          leaderboard.map((celeb, i) => (
            <div key={celeb.id}>
              <div
                className="leaderboard-row"
                onClick={() => setExpandedCeleb(expandedCeleb === celeb.id ? null : celeb.id)}
              >
                <span className={`rank-badge ${i < 3 ? `rank-${i + 1}` : 'rank-other'}`}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div className="lb-name">{celeb.name}</div>
                  <div className="lb-evals">{celeb.count} evaluations</div>
                </div>
                <span className="lb-stars">{starsDisplay(celeb.avg)}</span>
                <span className="lb-score">{celeb.avg}</span>
                <div className="lb-chips">
                  <span className="lb-chip chip-male">♂ {celeb.maleAvg}</span>
                  <span className="lb-chip chip-female">♀ {celeb.femaleAvg}</span>
                </div>
                <span className={`lb-expand ${expandedCeleb === celeb.id ? 'open' : ''}`}>›</span>
              </div>
              {expandedCeleb === celeb.id && <CelebDetail celeb={celeb} />}
            </div>
          ))
        )}
      </div>

      {/* Download */}
      <div className="download-card">
        <h3>Download Report</h3>
        <div className="download-btns">
          <button className="btn btn-outline" onClick={downloadPDF}>↓ Full PDF Report</button>
          <button className="btn btn-outline" onClick={downloadCSV}>↓ Raw Ratings CSV</button>
          <button className="btn btn-ghost" onClick={downloadPDF}>↓ Executive Summary</button>
        </div>
      </div>
    </div>
  )
}

function CelebDetail({ celeb }) {
  const [photos, setPhotos] = useState([])
  const [photoRatings, setPhotoRatings] = useState({})

  useEffect(() => {
    async function load() {
      const { data: ps } = await supabase.from('celebrity_photos').select('*').eq('celebrity_id', celeb.id).order('display_order')
      if (!ps) return
      setPhotos(ps)
      const { data: rs } = await supabase.from('ratings').select('photo_id, rating').in('photo_id', ps.map(p => p.id))
      const map = {}
      rs?.forEach(r => {
        if (!map[r.photo_id]) map[r.photo_id] = []
        map[r.photo_id].push(r.rating)
      })
      const avgMap = Object.fromEntries(
        Object.entries(map).map(([pid, arr]) => [pid, meanNumber(arr).toFixed(2)])
      )
      setPhotoRatings(avgMap)
    }
    load()
  }, [celeb.id])

  function getUrl(path) {
    const { data } = supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  return (
    <div className="celeb-detail-panel">
      <div className="celeb-detail-header">
        <div>
          <div className="celeb-detail-title">{celeb.name}</div>
          <div className="celeb-detail-subtitle">{celeb.count} evaluations · {celeb.gender}</div>
        </div>
      </div>
      <div className="celeb-photos-row">
        {photos.map((p, i) => (
          <div key={p.id} className="celeb-photo-item">
            <img src={getUrl(p.storage_path)} alt={`Photo ${i + 1}`} className="celeb-photo-thumb" />
            <div className="celeb-photo-label">Photo {i + 1}</div>
            <div className="celeb-photo-rating">★ {photoRatings[p.id] || 'N/A'}</div>
          </div>
        ))}
      </div>
      <div className="celeb-summary-bar">
        <div className="summary-item"><span className="summary-item-label">Overall</span><span className="summary-item-val" style={{ color: 'var(--accent)' }}>{celeb.avg}</span></div>
        <div className="summary-item"><span className="summary-item-label">Male Avg</span><span className="summary-item-val" style={{ color: 'var(--male)' }}>{celeb.maleAvg}</span></div>
        <div className="summary-item"><span className="summary-item-label">Female Avg</span><span className="summary-item-val" style={{ color: 'var(--female)' }}>{celeb.femaleAvg}</span></div>
        <div className="summary-item"><span className="summary-item-label">Evals</span><span className="summary-item-val">{celeb.count}</span></div>
      </div>
    </div>
  )
}
