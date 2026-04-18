import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import { supabase } from '../supabase/client'
import { isSurveyActive } from '../utils/surveyHelpers'
import { getReadableAuthError, withRetry } from '../utils/authHelpers'

const baseRules = [
  { icon: '📸', title: 'Frontal View Only', body: 'Rate only direct frontal photos. Report any non-frontal image to the research team.' },
  { icon: '🎯', title: 'Rate Independently', body: 'Rate each photo on its own merit, not relative to others you have seen.' },
  { icon: '⭐', title: 'Use the Full Scale', body: '1 = very low, 3 = average, 5 = highly attractive. Avoid defaulting to 3 every time.' },
  { icon: '🔒', title: 'Keep It Confidential', body: 'All ratings are anonymous and used solely for academic research purposes.' },
  { icon: '🚫', title: 'No Bias', body: 'Rate purely on appearance. Fame, recognition, or personal feelings must not influence your score.' },
  { icon: '⏸️', title: 'Mandatory Break', body: 'A 2-minute break appears after every 20 photos to reduce fatigue. Skippable after 10 seconds.' },
  { icon: '💾', title: 'Progress is Saved', body: 'You can exit and return at any time. The survey will resume from your last photo.' }
]

export default function Rules() {
  const navigate = useNavigate()
  const [requiredPhotos, setRequiredPhotos] = useState(null)
  const [hasActiveSurvey, setHasActiveSurvey] = useState(false)
  const [loadingSurvey, setLoadingSurvey] = useState(true)
  const [surveyError, setSurveyError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function run() {
      await loadSurveyTargets(cancelled)
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [])

  async function loadSurveyTargets(cancelled = false) {
    setLoadingSurvey(true)
    setSurveyError('')
    try {
      const { data: surveyRows, error } = await withRetry(async () => {
        return await supabase
          .from('surveys')
          .select('id, images_per_session, status, is_active, starts_at, ends_at, created_at')
          .or('is_active.eq.true,status.eq.active')
          .order('created_at', { ascending: false })
          .limit(12)
      }, {
        label: 'Load active survey preview',
        retries: 1,
        timeoutMs: 6000
      })

      if (error) throw error

      if (cancelled) return

      const activeSurvey = (surveyRows || []).find(isSurveyActive)
      setHasActiveSurvey(Boolean(activeSurvey))
      const photos = Number(activeSurvey?.images_per_session)
      if (photos > 0) {
        setRequiredPhotos(photos)
      }
    } catch (error) {
      if (cancelled) return
      setHasActiveSurvey(false)
      setSurveyError(getReadableAuthError(error, 'Could not check active survey status right now.'))
      console.error('[rules] loadSurveyTargets failed', error)
    } finally {
      if (!cancelled) {
        setLoadingSurvey(false)
      }
    }
  }

  const rules = [
    ...baseRules,
    {
      icon: '✅',
      title: requiredPhotos ? `Complete All ${requiredPhotos} Photos` : 'Complete All Assigned Photos',
      body: 'Partial submissions are excluded from final analysis. Please complete all assigned photos.'
    }
  ]

  return (
    <div style={{ minHeight: '100vh' }}>
      <TopNav />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span className="pill pill-gold" style={{ marginBottom: '16px' }}>BEFORE YOU BEGIN</span>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '2.5rem', margin: '16px 0 12px' }}>
            Participation Guidelines
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '1rem', maxWidth: '540px', margin: '0 auto', lineHeight: 1.7 }}>
            This research studies subjective attractiveness perceptions among Bangladeshi evaluators. 
            Please read and follow these guidelines to ensure data quality.
          </p>
        </div>

        {/* Rules Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '16px',
          marginBottom: '48px'
        }}>
          {rules.map((rule, i) => (
            <div key={i} className="card" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{rule.icon}</span>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '6px' }}>{rule.title}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>{rule.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Card */}
        <div className="card" style={{ textAlign: 'center', padding: '40px', background: 'linear-gradient(135deg, var(--surface) 0%, rgba(200,169,110,0.06) 100%)', border: '1px solid rgba(200,169,110,0.2)' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.5rem', marginBottom: '10px' }}>Ready to begin?</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
            You will rate photos from the currently active survey selected by the admin.
          </p>
          {!hasActiveSurvey && (
            <p style={{ color: 'var(--danger)', marginBottom: '16px', fontSize: '0.9rem' }}>
              {surveyError || 'No active survey is available right now. Please ask admin to activate one.'}
            </p>
          )}
          <button
            className="btn btn-gold btn-lg"
            onClick={() => navigate('/survey')}
            disabled={!hasActiveSurvey || loadingSurvey}
          >
            {loadingSurvey ? 'Checking Survey...' : 'Start Survey →'}
          </button>
        </div>
      </div>
    </div>
  )
}
