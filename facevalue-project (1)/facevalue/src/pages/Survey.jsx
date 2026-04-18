import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSurvey } from '../hooks/useSurvey'
import { supabase } from '../supabase/client'
import { CELEBRITY_PHOTOS_BUCKET } from '../config/storage'
import StarRating from '../components/StarRating'
import { awardRatingPoints } from '../utils/rewards'

const BREAK_INTERVAL = 20
const BREAK_DURATION = 120 // seconds
const BREAK_SKIP_AFTER = 10 // seconds

function BreakOverlay({ onDismiss }) {
  const [seconds, setSeconds] = useState(BREAK_DURATION)
  const [canSkip, setCanSkip] = useState(false)

  useEffect(() => {
    const skipTimer = setTimeout(() => setCanSkip(true), 10000)
    const countdown = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(countdown); onDismiss(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { clearTimeout(skipTimer); clearInterval(countdown) }
  }, [])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      backdropFilter: 'blur(12px)', zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '20px', textAlign: 'center', padding: '24px'
    }}>
      <div style={{ fontSize: '4rem' }}>☕</div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '2rem', fontWeight: 800 }}>Take a Break</h2>
      <p style={{ color: 'var(--muted)', maxWidth: '400px', lineHeight: 1.7 }}>
        You've been rating for a while. A short break helps reduce fatigue bias and improves data quality.
      </p>
      <div style={{
        fontFamily: "'Syne', sans-serif", fontSize: '4rem', fontWeight: 800,
        color: 'var(--accent)', letterSpacing: '0.05em', lineHeight: 1
      }}>
        {mm}:{ss}
      </div>
      <button
        className="btn btn-ghost"
        disabled={!canSkip}
        onClick={onDismiss}
        style={{ marginTop: '8px' }}
      >
        {canSkip ? 'Skip Break →' : `Skip available in ${Math.max(0, BREAK_SKIP_AFTER - (BREAK_DURATION - seconds))}s`}
      </button>
    </div>
  )
}

export default function Survey() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { photos, currentIndex, ratings, loading, error, submitRating, updateRating, goTo, isResume, totalPhotoCount, ratedPhotoCount } = useSurvey(user?.id)
  const [isPhone, setIsPhone] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 768px)').matches
  })
  const [isSlowMobile, setIsSlowMobile] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showBreak, setShowBreak] = useState(false)
  const [showResumeNotice, setShowResumeNotice] = useState(false)
  const [viewIndex, setViewIndex] = useState(null)
  const [selectedRating, setSelectedRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const displayIndex = viewIndex !== null ? viewIndex : currentIndex
  const currentPhoto = photos[displayIndex]
  const imageTransform = useMemo(() => {
    if (isSlowMobile) {
      return { width: 540, quality: 50, resize: 'cover' }
    }
    if (isPhone) {
      return { width: 720, quality: 62, resize: 'cover' }
    }
    return { width: 1200, quality: 78, resize: 'cover' }
  }, [isPhone, isSlowMobile])

  const imageUrl = useMemo(() => {
    if (!currentPhoto?.storage_path) return ''
    return supabase
      .storage
      .from(CELEBRITY_PHOTOS_BUCKET)
      .getPublicUrl(currentPhoto.storage_path, { transform: imageTransform }).data.publicUrl
  }, [currentPhoto?.storage_path, imageTransform])
  const nextPhoto = photos[currentIndex + 1]
  const nextImageUrl = useMemo(() => {
    if (!nextPhoto?.storage_path) return ''
    return supabase
      .storage
      .from(CELEBRITY_PHOTOS_BUCKET)
      .getPublicUrl(nextPhoto.storage_path, { transform: imageTransform }).data.publicUrl
  }, [nextPhoto?.storage_path, imageTransform])
  const currentRating = currentPhoto ? ratings[currentPhoto.id] : null
  const total = photos.length
  const progress = total > 0 ? Math.round((currentIndex / total) * 100) : 0

  useEffect(() => {
    setShowBreak(currentIndex > 0 && currentIndex % BREAK_INTERVAL === 0 && currentIndex < total)
  }, [currentIndex, total])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const media = window.matchMedia('(max-width: 768px)')
    const onChange = () => setIsPhone(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent || ''
    const isAndroid = /Android/i.test(ua)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    const effectiveType = conn?.effectiveType || ''
    const saveData = Boolean(conn?.saveData)
    const slowNetwork = /2g|3g/i.test(effectiveType) || saveData
    setIsSlowMobile(isAndroid && (isPhone || slowNetwork))
  }, [isPhone])

  // Show resume notice on first load
  useEffect(() => {
    if (isResume && ratedPhotoCount > 0 && !showResumeNotice) {
      setShowResumeNotice(true)
      const timer = setTimeout(() => setShowResumeNotice(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [isResume, ratedPhotoCount, showResumeNotice])

  // Reset viewIndex when advancing
  useEffect(() => {
    setViewIndex(null)
    setImageLoaded(false)
    setSelectedRating(0)
    setHoverRating(0)
    setIsTransitioning(false)
  }, [currentIndex])

  // Preload the next image to reduce visible loading between ratings.
  useEffect(() => {
    if (!nextImageUrl) return
    const img = new Image()
    img.src = nextImageUrl
  }, [nextImageUrl])

  async function handleRating(rating) {
    if (!currentPhoto || isTransitioning) return

    setSelectedRating(rating)

    if (viewIndex !== null && viewIndex < currentIndex) {
      // Updating a previous rating
      await updateRating(currentPhoto.id, rating)
      return
    }

    setIsTransitioning(true)
    const result = await submitRating(currentPhoto.id, rating, { transitionMs: 0 })
    if (result === 'error') {
      setIsTransitioning(false)
      return
    }

    // Award points for new rating
    if (result === 'ok' || result === 'completed') {
      void awardRatingPoints(user.id).catch((error) => {
        console.warn('Error awarding points:', error)
      })
    }
    if (result === 'completed') {
      setTimeout(() => navigate('/done'), 800)
    }
  }

  async function handleSignOutMidSurvey() {
    try {
      await signOut()
    } finally {
      navigate('/login')
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
      <div className="spinner spinner-lg" />
      <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Loading your survey...</p>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px', padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <h2 style={{ fontFamily: "'Syne', sans-serif" }}>Survey Unavailable</h2>
      <p style={{ color: 'var(--muted)' }}>{error}</p>
      <button className="btn btn-ghost" onClick={() => navigate('/rules')}>← Back to Rules</button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      {showBreak && <BreakOverlay onDismiss={() => setShowBreak(false)} />}

      {/* Resume Notice */}
      {showResumeNotice && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', 
          background: 'var(--accent)', color: 'white', padding: '12px 24px', 
          borderRadius: '8px', zIndex: 400, fontSize: '0.9rem', fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: '90%', textAlign: 'center', animation: 'slideIn 0.3s ease-out'
        }}>
          ✨ New photos added! You've rated {ratedPhotoCount} of {totalPhotoCount}. Continue rating →
        </div>
      )}

      {/* Top Nav */}
      <nav className="top-nav">
        <div className="nav-logo">
          <span className="nav-logo-icon">◈</span>
          FACEVALUE
        </div>
        <div className="nav-right">
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'var(--accent)', fontSize: '0.95rem' }}>
            {Math.min(currentIndex + 1, total)} / {total}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rules')}>Exit</button>
          <button className="btn btn-ghost btn-sm" onClick={handleSignOutMidSurvey}>Sign Out</button>
        </div>
      </nav>

      {/* Progress bar */}
      <div className="progress-bar-container">
        <div className="progress-info">
          <span>Photo {Math.min(displayIndex + 1, total)} of {total}</span>
          <span>{progress}% complete</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '32px 16px' }}>
        {currentPhoto && (
          <>
            {/* Photo card */}
            <div style={{ position: 'relative', marginBottom: '24px' }}>
              {!imageLoaded && (
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 'var(--radius)' }} />
              )}
              <img
                key={currentPhoto.id}
                src={imageUrl}
                alt="Rate this photo"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onLoad={() => setImageLoaded(true)}
                style={{
                  width: '100%',
                  aspectRatio: '3/4',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  display: imageLoaded ? 'block' : 'none'
                }}
              />
              {/* Already rated badge */}
              {ratings[currentPhoto.id] && (
                <div style={{
                  position: 'absolute', top: '12px', right: '12px',
                  background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                  padding: '6px 12px', borderRadius: '100px',
                  fontSize: '0.8rem', color: 'var(--accent)',
                  border: '1px solid rgba(200,169,110,0.3)'
                }}>
                  {'★'.repeat(ratings[currentPhoto.id])}{'☆'.repeat(5 - ratings[currentPhoto.id])} {ratings[currentPhoto.id]}/5
                </div>
              )}
            </div>

            {/* Star rating */}
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.825rem', marginBottom: '16px', letterSpacing: '0.04em' }}>
                Tap a star to rate this photo
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <StarRating
                  value={selectedRating || currentRating || 0}
                  onChange={handleRating}
                  onHoverChange={setHoverRating}
                  disabled={isTransitioning}
                />
              </div>
              <div style={{ marginTop: '12px', minHeight: '22px' }}>
                {isTransitioning ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '0.8rem' }}>
                    <span className="spinner" />
                    Saving rating and loading next image...
                  </div>
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {(hoverRating || selectedRating || currentRating) ? `Selected: ${hoverRating || selectedRating || currentRating}/5` : 'Choose 1-5 stars'}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-ghost"
                disabled={isTransitioning || displayIndex === 0}
                onClick={() => setViewIndex(Math.max(0, displayIndex - 1))}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                ← Previous
              </button>
              <button
                className="btn btn-ghost"
                disabled={isTransitioning || displayIndex >= currentIndex || displayIndex >= total - 1}
                onClick={() => setViewIndex(Math.min(currentIndex, displayIndex + 1))}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
