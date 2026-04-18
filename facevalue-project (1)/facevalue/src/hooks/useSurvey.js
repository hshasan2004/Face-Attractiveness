import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase/client'
import { isSurveyActive } from '../utils/surveyHelpers'
import { getReadableAuthError, withRetry } from '../utils/authHelpers'

const QUERY_TIMEOUT_MS = 8000

function shuffleWithConstraint(photos) {
  let shuffled = [...photos]
  let attempts = 0

  do {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    attempts++
  } while (hasConsecutiveSameCeleb(shuffled) && attempts < 1000)

  return shuffled
}

function hasConsecutiveSameCeleb(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i].celebrity_id === arr[i + 1].celebrity_id) return true
    if (i + 2 < arr.length && arr[i].celebrity_id === arr[i + 2].celebrity_id) return true
  }
  return false
}

export function useSurvey(userId, preferredSurveyId = null) {
  const [assignment, setAssignment] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [photos, setPhotos] = useState([])
  const [ratings, setRatings] = useState({}) // photo_id -> rating value
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isResume, setIsResume] = useState(false) // Track if this is a resuming user
  const [totalPhotoCount, setTotalPhotoCount] = useState(0) // Total photos in survey
  const [ratedPhotoCount, setRatedPhotoCount] = useState(0) // Photos already rated
  const initInFlightRef = useRef(false)

  const timed = useCallback(async (label, operation) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const result = await operation()
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const durationMs = Math.round(endedAt - startedAt)
    if (durationMs > 1200) {
      console.warn('[survey] slow query', { label, durationMs })
    } else {
      console.info('[survey] query', { label, durationMs })
    }
    return result
  }, [])

  const runQuery = useCallback(async (label, operation) => {
    return await withRetry(async () => {
      return await timed(label, operation)
    }, {
      label,
      retries: 1,
      timeoutMs: QUERY_TIMEOUT_MS
    })
  }, [timed])

  const persistProgress = useCallback(async (assignmentId, nextIndex, ratingData = null) => {
    if (!assignmentId) return { ok: false, error: new Error('Missing assignment') }

    const jobs = []

    if (Number.isFinite(nextIndex)) {
      jobs.push(
        supabase
          .from('survey_assignments')
          .update({ current_index: Math.max(0, nextIndex) })
          .eq('id', assignmentId)
          .then(({ error: assignmentErr }) => {
            if (assignmentErr) {
              console.warn('Warning saving assignment progress:', assignmentErr)
            }
          })
      )
    }

    if (ratingData && assignment) {
      // Save to the new responses table (survey + user + photo level)
      const responsePayload = {
        ...ratingData,
        survey_id: assignment.survey_id,
        user_id: userId
      }

      jobs.push(
        supabase
          .from('responses')
          .upsert(responsePayload, { onConflict: 'survey_id,user_id,photo_id' })
          .then(({ error: responseErr }) => {
            if (responseErr) {
              console.warn('Warning saving to responses table:', responseErr)
              // Don't fail - this table may not exist on all deployments
            }
          })
      )

      // Also save to legacy ratings table for backwards compatibility
      const legacyRating = {
        assignment_id: assignmentId,
        photo_id: ratingData.photo_id,
        rating: ratingData.rating
      }
      jobs.push(
        supabase
          .from('ratings')
          .upsert(legacyRating, { onConflict: 'assignment_id,photo_id' })
          .then(({ error: legacyErr }) => {
            if (legacyErr) {
              console.warn('Warning saving to ratings table:', legacyErr)
            }
          })
      )
    }

    await Promise.all(jobs)

    return { ok: true }
  }, [assignment, userId])

  const delay = useCallback((ms) => new Promise(resolve => setTimeout(resolve, ms)), [])

  const initSurvey = useCallback(async () => {
    if (initInFlightRef.current) {
      return
    }

    initInFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      // Load a minimal survey payload first to reduce DB and network load under concurrency.
      let survey = null

      if (preferredSurveyId) {
        const { data: preferredSurvey, error: preferredErr } = await runQuery('survey.preferred', async () => {
          return await supabase
            .from('surveys')
            .select('id, is_active, status, created_at, start_time, end_time, starts_at, ends_at')
            .eq('id', preferredSurveyId)
            .maybeSingle()
        })

        if (preferredErr) throw new Error(preferredErr.message || 'Could not load selected survey')
        if (!preferredSurvey || !isSurveyActive(preferredSurvey)) {
          throw new Error('Selected survey is no longer active. Please choose another survey.')
        }
        survey = preferredSurvey
      } else {
        const { data: surveyRows, error: surveyErr } = await runQuery('survey.active-list', async () => {
          return await supabase
            .from('surveys')
            .select('id, is_active, status, created_at, start_time, end_time, starts_at, ends_at')
            .or('is_active.eq.true,status.eq.active')
            .order('created_at', { ascending: false })
            .limit(10)
        })
        if (surveyErr) throw new Error(surveyErr.message || 'Could not load surveys')

        const activeSurveys = (surveyRows || [])
          .filter(isSurveyActive)
          .sort((a, b) => {
            const aStrict = a.is_active === true && a.status === 'active' ? 1 : 0
            const bStrict = b.is_active === true && b.status === 'active' ? 1 : 0
            if (aStrict !== bStrict) return bStrict - aStrict

            const aFlag = a.is_active === true || a.status === 'active' ? 1 : 0
            const bFlag = b.is_active === true || b.status === 'active' ? 1 : 0
            if (aFlag !== bFlag) return bFlag - aFlag

            const ta = new Date(a.created_at || 0).getTime()
            const tb = new Date(b.created_at || 0).getTime()
            return tb - ta
          })

        survey = activeSurveys[0] || null
      }

      if (!survey) throw new Error('No active survey found')

      // Load progress and response history in parallel.
      const [existingAssignmentResult, existingResponsesResult, celebRowsResult] = await Promise.all([
        runQuery('survey.assignment', async () => {
          return await supabase
            .from('survey_assignments')
            .select('id, survey_id, user_id, image_order, current_index, status, has_resumed')
            .eq('survey_id', survey.id)
            .eq('user_id', userId)
            .maybeSingle()
        }),
        runQuery('survey.responses', async () => {
          return await supabase
            .from('responses')
            .select('photo_id, rating')
            .eq('survey_id', survey.id)
            .eq('user_id', userId)
        }),
        runQuery('survey.celebrities', async () => {
          return await supabase
            .from('celebrities')
            .select('id')
            .eq('survey_id', survey.id)
        })
      ])

      const existing = existingAssignmentResult?.data || null
      const existingResponses = existingResponsesResult?.data || []
      const responsesErr = existingResponsesResult?.error || null
      const celebRows = celebRowsResult?.data || []
      const celebErr = celebRowsResult?.error || null

      if (celebErr) throw celebErr
      const celebIds = celebRows.map(c => c.id)
      if (!celebIds.length) throw new Error('No celebrities found for this survey')

      // DYNAMIC: Always fetch the CURRENT list of photos from the database.
      const { data: allCurrentPhotos, error: photosErr } = await runQuery('survey.photos', async () => {
        return await supabase
          .from('celebrity_photos')
          .select('id, celebrity_id, storage_path, display_order, created_at')
          .in('celebrity_id', celebIds)
          .order('display_order')
          .order('created_at')
      })

      if (photosErr) throw photosErr
      if (!allCurrentPhotos?.length) throw new Error('No photos found for this survey')

      setTotalPhotoCount(allCurrentPhotos.length)

      const isResuming = !!existing

      if (responsesErr) {
        console.warn('Note: responses table not yet set up, falling back to ratings table...')
      }

      const ratedPhotoIds = new Set((existingResponses || []).map(r => r.photo_id))
      setRatedPhotoCount(ratedPhotoIds.size)

      // FILTER: Show only unrated photos
      const unratedPhotos = allCurrentPhotos.filter(p => !ratedPhotoIds.has(p.id))

      let assign = existing
      let orderedPhotoIds
      let resumeIndex = 0

      if (!isResuming) {
        // NEW assignment: shuffle unrated photos
        const shuffled = shuffleWithConstraint(unratedPhotos)
        orderedPhotoIds = shuffled.map(p => p.id)

        const { data: newAssign, error: assignErr } = await runQuery('survey.assignment.insert', async () => {
          return await supabase
            .from('survey_assignments')
            .insert({
              survey_id: survey.id,
              user_id: userId,
              image_order: orderedPhotoIds,
              current_index: 0,
              status: 'in_progress',
              has_resumed: false
            })
            .select('id, survey_id, user_id, image_order, current_index, status, has_resumed')
            .single()
        })

        if (assignErr) {
          // Handle rare race where assignment was just created in another tab/session
          const { data: retryAssign, error: retryErr } = await runQuery('survey.assignment.retry', async () => {
            return await supabase
              .from('survey_assignments')
              .select('id, survey_id, user_id, image_order, current_index, status, has_resumed')
              .eq('survey_id', survey.id)
              .eq('user_id', userId)
              .maybeSingle()
          })

          if (retryErr || !retryAssign) throw assignErr
          assign = retryAssign
          orderedPhotoIds = retryAssign.image_order
        } else {
          assign = newAssign
        }
        setIsResume(false)
      } else {
        // RESUMING assignment: continue from stored order/index and append any new photos.
        setIsResume(true)

        // Mark as resumed if this is the first time they're coming back
        if (!existing.has_resumed) {
          await runQuery('survey.assignment.mark-resumed', async () => {
            return await supabase
              .from('survey_assignments')
              .update({ has_resumed: true, resumed_at: new Date().toISOString() })
              .eq('id', existing.id)
          })
        }

        const photoMap = Object.fromEntries((allCurrentPhotos || []).map(p => [p.id, p]))
        const existingOrder = Array.isArray(existing.image_order) ? existing.image_order : []

        // Keep old order but only for currently valid photos.
        orderedPhotoIds = existingOrder.filter(id => !!photoMap[id])

        // Append any unrated photos not already in the saved order (newly added photos).
        const orderedSet = new Set(orderedPhotoIds)
        const newUnrated = unratedPhotos.filter(p => !orderedSet.has(p.id))
        if (newUnrated.length > 0) {
          const shuffledNew = shuffleWithConstraint(newUnrated).map(p => p.id)
          orderedPhotoIds = [...orderedPhotoIds, ...shuffledNew]
          await runQuery('survey.assignment.extend-order', async () => {
            return await supabase
              .from('survey_assignments')
              .update({ image_order: orderedPhotoIds })
              .eq('id', existing.id)
          })
        }

        // Derive resume index from stored progress; fallback to first unrated item.
        const storedIndex = Number(existing.current_index)
        if (Number.isFinite(storedIndex) && storedIndex >= 0) {
          resumeIndex = Math.min(storedIndex, Math.max(orderedPhotoIds.length - 1, 0))
        } else {
          resumeIndex = 0
        }

        if (resumeIndex > 0 && orderedPhotoIds[resumeIndex] && ratedPhotoIds.has(orderedPhotoIds[resumeIndex])) {
          const firstUnratedIndex = orderedPhotoIds.findIndex(id => !ratedPhotoIds.has(id))
          resumeIndex = firstUnratedIndex >= 0 ? firstUnratedIndex : orderedPhotoIds.length
        }

        if (!orderedPhotoIds.length || resumeIndex >= orderedPhotoIds.length) {
          throw new Error('No new photos to rate. Survey complete!')
        }
      }

      // Re-order by image_order
      const photoMap = Object.fromEntries((allCurrentPhotos ?? []).map(p => [p.id, p]))
      const orderedPhotos = orderedPhotoIds.map(id => photoMap[id]).filter(Boolean)

      // Load existing ratings
      const ratingMap = Object.fromEntries((existingResponses || []).map(r => [r.photo_id, r.rating]))

      setAssignment(assign)
      setPhotos(orderedPhotos)
      setCurrentIndex(isResuming ? resumeIndex : 0)
      setRatings(ratingMap)

      console.log(`📊 Survey: ${isResuming ? 'RESUME' : 'NEW'} | Total: ${allCurrentPhotos.length} | Rated: ${ratedPhotoIds.size} | To rate: ${unratedPhotos.length}`)
    } catch (err) {
      setError(getReadableAuthError(err, 'Failed to load survey. Please try again.'))
      console.error('Survey init error:', err)
    } finally {
      initInFlightRef.current = false
      setLoading(false)
    }
  }, [userId, preferredSurveyId, runQuery])

  useEffect(() => {
    if (!userId) return
    initSurvey()
  }, [userId, initSurvey])

  async function submitRating(photoId, rating, options = {}) {
    if (!assignment) return 'error'
    const transitionMs = Number(options.transitionMs) > 0 ? Number(options.transitionMs) : 0
    const newIndex = currentIndex + 1
    const ratedPhoto = photos.find(p => p.id === photoId)
    const ratingData = {
      photo_id: photoId,
      rating,
      celebrity_id: ratedPhoto?.celebrity_id || null,
    }
    const savePromise = persistProgress(assignment.id, newIndex, ratingData)
    savePromise.then((result) => {
      if (!result.ok) {
        setError(result.error.message || 'Could not save progress')
      }
    }).catch((saveErr) => {
      setError(saveErr?.message || 'Could not save progress')
    })

    setRatings(prev => ({ ...prev, [photoId]: rating }))
    setAssignment(prev => ({ ...prev, current_index: newIndex }))
    setRatedPhotoCount(prev => prev + 1)

    if (transitionMs) {
      await delay(transitionMs)
    }

    setCurrentIndex(newIndex)

    if (newIndex >= photos.length) {
      return 'completed'
    }
    return 'ok'
  }

  async function updateRating(photoId, rating) {
    if (!assignment) return false
    const ratedPhoto = photos.find(p => p.id === photoId)
    const ratingData = {
      photo_id: photoId,
      rating,
      celebrity_id: ratedPhoto?.celebrity_id || null,
    }
    const result = await persistProgress(assignment.id, currentIndex, ratingData)
    if (!result.ok) {
      setError(result.error.message || 'Could not update rating')
      return false
    }
    setRatings(prev => ({ ...prev, [photoId]: rating }))
    return true
  }

  function goTo(index) {
    if (index >= 0 && index < photos.length) {
      setCurrentIndex(index)
      if (assignment?.id) {
        void persistProgress(assignment.id, index)
      }
    }
  }

  return {
    assignment,
    photos,
    currentIndex,
    ratings,
    loading,
    error,
    isResume,
    totalPhotoCount,
    ratedPhotoCount,
    submitRating,
    updateRating,
    goTo
  }
}
