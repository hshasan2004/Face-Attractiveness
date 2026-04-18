import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import { supabase } from '../../supabase/client'
import { CELEBRITY_PHOTOS_BUCKET } from '../../config/storage'
import { getCroppedImageBlob } from '../../utils/cropImage'

const ASPECT_RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:5', value: 4 / 5 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 }
]

const ADMIN_WIZARD_DRAFT_KEY = 'facevalue_admin_wizard_draft'
const ADMIN_WIZARD_DRAFT_PREFIX = 'facevalue_admin_wizard_draft:'

function columnMissing(err, col) {
  const message = err?.message || ''
  return message.includes(col) && (message.includes('schema cache') || message.includes('Could not find'))
}

function progressText(count) {
  if (count >= 5) return '5 images uploaded - Completed'
  if (count === 1) return '1 image uploaded, 4 remaining'
  return `${count} images uploaded, ${5 - count} remaining`
}

function targetCelebrityCountFromSurvey(row) {
  const byImages = Math.floor((Number(row?.images_per_session) || 0) / 5)
  return Math.max(1, byImages || 1)
}

function asDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function toInputDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseDraft(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function getDraftKey(surveyId = '') {
  return surveyId ? `${ADMIN_WIZARD_DRAFT_PREFIX}${surveyId}` : ADMIN_WIZARD_DRAFT_KEY
}

function safeIso(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

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

async function setCelebrityProfileImage(celebId, value) {
  if (!celebId) return

  let { error } = await supabase
    .from('celebrities')
    .update({ profile_image: value || null })
    .eq('id', celebId)

  // Backward compatible for databases that do not yet have profile_image.
  if (error && columnMissing(error, 'profile_image')) return
  if (error) throw error
}

export default function CreateSurvey() {
  const navigate = useNavigate()
  const { surveyId: routeSurveyId } = useParams()
  const [step, setStep] = useState(1)
  const [surveyId, setSurveyId] = useState('')
  const [surveys, setSurveys] = useState([])
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [isEditMode, setIsEditMode] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ startTime: '', endTime: '' })
  const [overviewCelebrities, setOverviewCelebrities] = useState([])
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [deletingSurvey, setDeletingSurvey] = useState(false)

  const [surveyForm, setSurveyForm] = useState({
    title: '',
    description: '',
    celebrityCount: 1
  })

  const [celebrities, setCelebrities] = useState([])
  const [currentCelebIndex, setCurrentCelebIndex] = useState(0)
  const [photoMap, setPhotoMap] = useState({})

  const [dragOver, setDragOver] = useState(false)
  const [showCrop, setShowCrop] = useState(false)
  const [imageSrc, setImageSrc] = useState('')
  const [replacePhoto, setReplacePhoto] = useState(null)
  const [replaceTargetPhoto, setReplaceTargetPhoto] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState(3 / 4)
  const [croppedArea, setCroppedArea] = useState(null)

  const [savingSurvey, setSavingSurvey] = useState(false)
  const [savingCeleb, setSavingCeleb] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [launching, setLaunching] = useState(false)

  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [bucketError, setBucketError] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [autosaveState, setAutosaveState] = useState('idle')
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null)

  const fileRef = useRef()
  const replaceFileRef = useRef()
  const nameInputRef = useRef()
  const restoredDraftRef = useRef(false)
  const initialHydrationRef = useRef(false)
  const loadingEditSurveyRef = useRef(false)
  const loadedEditSurveyIdRef = useRef('')
  const creatingDraftRef = useRef(false)
  const surveyAutosaveTimerRef = useRef(null)
  const celebrityAutosaveTimerRef = useRef(null)
  const celebrityNameCacheRef = useRef({})

  const currentCelebrity = celebrities[currentCelebIndex] || null
  const currentPhotos = currentCelebrity?.id ? (photoMap[currentCelebrity.id] || []) : []
  const totalImages = useMemo(
    () => Object.values(photoMap).reduce((sum, list) => sum + list.length, 0),
    [photoMap]
  )
  const completedCelebrities = useMemo(
    () => celebrities.filter(c => (photoMap[c.id] || []).length === 5).length,
    [celebrities, photoMap]
  )
  const slotPhotos = useMemo(() => {
    const slots = Array.from({ length: 5 }, (_, i) => currentPhotos[i] || null)
    return slots
  }, [currentPhotos])

  const wizardSteps = [
    { n: 1, label: 'Start' },
    { n: 2, label: 'Survey Details' },
    { n: 3, label: 'Celebrity Interview' },
    { n: 4, label: 'Summary & Launch' }
  ]

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedArea(pixels)
  }, [])

  useEffect(() => {
    loadSurveys()
  }, [])

  useEffect(() => {
    if (restoredDraftRef.current) return
    restoredDraftRef.current = true

    const generalDraft = parseDraft(localStorage.getItem(ADMIN_WIZARD_DRAFT_KEY))
    const draft = generalDraft?.surveyId ? parseDraft(localStorage.getItem(getDraftKey(generalDraft.surveyId))) || generalDraft : generalDraft
    if (!draft) {
      initialHydrationRef.current = true
      return
    }

    if (draft.surveyForm) {
      setSurveyForm(prev => ({
        ...prev,
        ...draft.surveyForm,
        celebrityCount: Math.max(1, Number(draft.surveyForm.celebrityCount) || 1)
      }))
    }

    if (draft.scheduleForm) {
      setScheduleForm(prev => ({ ...prev, ...draft.scheduleForm }))
    }

    // Keep local draft values, but do not auto-jump into a survey workflow.
    if (Number.isInteger(draft.currentCelebIndex) && draft.currentCelebIndex >= 0) {
      setCurrentCelebIndex(draft.currentCelebIndex)
    }

    initialHydrationRef.current = true
  }, [])

  useEffect(() => {
    if (!initialHydrationRef.current) return

    if (!routeSurveyId) {
      if (!surveyId) {
        setStep(1)
        setIsEditMode(false)
      }
      return
    }

    if (loadedEditSurveyIdRef.current === routeSurveyId && surveyId === routeSurveyId) return
    void loadSurveyForEdit(routeSurveyId)
  }, [routeSurveyId, surveyId])

  useEffect(() => {
    if (!initialHydrationRef.current) return

    const draftKey = getDraftKey(surveyId || selectedSurveyId)

    const draft = {
      step,
      surveyId,
      selectedSurveyId,
      isEditMode,
      currentCelebIndex,
      scheduleForm,
      surveyForm,
      updatedAt: new Date().toISOString()
    }

    localStorage.setItem(draftKey, JSON.stringify(draft))
    if (draftKey !== ADMIN_WIZARD_DRAFT_KEY) {
      localStorage.setItem(ADMIN_WIZARD_DRAFT_KEY, JSON.stringify({ surveyId: surveyId || selectedSurveyId, updatedAt: draft.updatedAt }))
    }
  }, [step, surveyId, selectedSurveyId, isEditMode, currentCelebIndex, scheduleForm, surveyForm])

  useEffect(() => {
    if (!initialHydrationRef.current) return

    // Step 1 is survey control mode only; avoid unintended autosave/draft creation here.
    if (step === 1 && !isEditMode) {
      setAutosaveState('idle')
      return
    }

    if (surveyAutosaveTimerRef.current) clearTimeout(surveyAutosaveTimerRef.current)
    setAutosaveState('saving')

    surveyAutosaveTimerRef.current = setTimeout(async () => {
      let targetSurveyId = surveyId
      const count = Math.max(1, Number(surveyForm.celebrityCount) || 1)

      if (!targetSurveyId) {
        const title = surveyForm.title.trim()
        if (!title || creatingDraftRef.current) {
          setAutosaveState('idle')
          return
        }

        creatingDraftRef.current = true
        try {
          const { data: authData } = await supabase.auth.getUser()
          const userId = authData?.user?.id
          const baseDraft = {
            title,
            description: surveyForm.description.trim() || null,
            images_per_session: count * 5,
            evaluators_needed: 30,
            created_by: userId
          }

          let row = null
          let createErr = null

          ;({ data: row, error: createErr } = await supabase
            .from('surveys')
            .insert({ ...baseDraft, status: 'draft', is_active: false })
            .select('*')
            .single())

          if (createErr && columnMissing(createErr, 'status')) {
            ;({ data: row, error: createErr } = await supabase
              .from('surveys')
              .insert({ ...baseDraft, is_active: false })
              .select('*')
              .single())
          }

          if (createErr && columnMissing(createErr, 'is_active')) {
            ;({ data: row, error: createErr } = await supabase
              .from('surveys')
              .insert({ ...baseDraft, status: 'draft' })
              .select('*')
              .single())
          }

          if (createErr && (columnMissing(createErr, 'status') || columnMissing(createErr, 'is_active'))) {
            ;({ data: row, error: createErr } = await supabase
              .from('surveys')
              .insert(baseDraft)
              .select('*')
              .single())
          }

          if (createErr || !row) {
            setAutosaveState('error')
            return
          }

          targetSurveyId = row.id
          setSurveyId(row.id)
          setSelectedSurveyId(row.id)
          await loadSurveys()
        } finally {
          creatingDraftRef.current = false
        }
      }

      const payload = {
        title: surveyForm.title.trim() || 'Untitled Survey',
        description: surveyForm.description.trim() || null,
        images_per_session: count * 5,
        evaluators_needed: 30
      }

      const { error: saveErr } = await supabase
        .from('surveys')
        .update(payload)
        .eq('id', targetSurveyId)

      if (saveErr) {
        setAutosaveState('error')
        return
      }

      const startIso = safeIso(scheduleForm.startTime)
      const endIso = safeIso(scheduleForm.endTime)

      if (startIso || endIso) {
        let { error: scheduleErr } = await supabase
          .from('surveys')
          .update({ start_time: startIso, end_time: endIso })
          .eq('id', targetSurveyId)

        if (scheduleErr && (columnMissing(scheduleErr, 'start_time') || columnMissing(scheduleErr, 'end_time'))) {
          ;({ error: scheduleErr } = await supabase
            .from('surveys')
            .update({ starts_at: startIso, ends_at: endIso })
            .eq('id', targetSurveyId))
        }

        if (scheduleErr) {
          setAutosaveState('error')
          return
        }
      }

      setAutosaveState('saved')
    }, 600)

    return () => {
      if (surveyAutosaveTimerRef.current) clearTimeout(surveyAutosaveTimerRef.current)
    }
  }, [step, isEditMode, surveyId, surveyForm, scheduleForm])

  useEffect(() => {
    if (step !== 3 || !surveyId || !currentCelebrity) return
    const trimmedName = (currentCelebrity.name || '').trim()
    if (!trimmedName) return

    const cacheKey = currentCelebrity.id || `idx:${currentCelebIndex}`
    if (celebrityNameCacheRef.current[cacheKey] === trimmedName) return

    if (celebrityAutosaveTimerRef.current) clearTimeout(celebrityAutosaveTimerRef.current)
    setAutosaveState('saving')

    celebrityAutosaveTimerRef.current = setTimeout(async () => {
      try {
        const celebId = await upsertCurrentCelebrity()
        celebrityNameCacheRef.current[cacheKey] = trimmedName
        celebrityNameCacheRef.current[celebId] = trimmedName
        setAutosaveState('saved')
      } catch {
        setAutosaveState('error')
      }
    }, 600)

    return () => {
      if (celebrityAutosaveTimerRef.current) clearTimeout(celebrityAutosaveTimerRef.current)
    }
  }, [step, surveyId, currentCelebrity, currentCelebIndex])

  useEffect(() => {
    if (!selectedSurveyId) {
      setOverviewCelebrities([])
      setScheduleForm({ startTime: '', endTime: '' })
      return
    }
    loadSurveyOverview(selectedSurveyId)
    if (step === 1 && !isEditMode) {
      const survey = surveys.find(s => s.id === selectedSurveyId)
      if (survey) {
        const startValue = survey.start_time || survey.starts_at || ''
        const endValue = survey.end_time || survey.ends_at || ''
        setScheduleForm({ startTime: toInputDateTime(startValue), endTime: toInputDateTime(endValue) })
      }
    }
  }, [selectedSurveyId, surveys, step, isEditMode])

  useEffect(() => {
    if (!initialHydrationRef.current) return
    if (!selectedSurveyId || !isEditMode) return
    if (surveyId && selectedSurveyId !== surveyId) return
    if (loadingEditSurveyRef.current) return

    const needsHydration = loadedEditSurveyIdRef.current !== selectedSurveyId || celebrities.length === 0
    if (!needsHydration) return

    void loadSurveyForEdit(selectedSurveyId, { silent: true })
  }, [selectedSurveyId, isEditMode, surveyId, celebrities.length])

  function resetMessages() {
    setError('')
    setSuccess('')
    setBucketError(false)
  }

  async function ensureAdminWriteAccess() {
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData?.user) {
      throw new Error('Admin session expired. Please sign out and sign in again.')
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    if (!profile) {
      throw new Error('Admin profile missing. Create your user_profiles row and set role=admin.')
    }

    if (profile.role !== 'admin') {
      throw new Error('This account does not have admin role in user_profiles.')
    }
  }

  async function loadSurveys() {
    const { data } = await supabase
      .from('surveys')
      .select('id, title, description, images_per_session, status, is_active, start_time, end_time, starts_at, ends_at, created_at')
      .order('created_at', { ascending: false })

    setSurveys(data || [])
  }

  async function loadSurveyOverview(id) {
    const { data, error } = await supabase
      .from('celebrities')
      .select('id, name, gender, celebrity_photos(id, storage_path, display_order)')
      .eq('survey_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      setOverviewCelebrities([])
      return
    }

    const mapped = (data || []).map(c => ({
      ...c,
      photos: (c.celebrity_photos || [])
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map(p => ({
          ...p,
          storage_path: normalizeStoragePath(p.storage_path),
          url: storagePathToUrl(p.storage_path)
        }))
    }))

    setOverviewCelebrities(mapped)
  }

  async function applySurveyStatus(active) {
    resetMessages()
    if (!selectedSurveyId) {
      setError('Select a survey first.')
      return
    }

    const startIso = scheduleForm.startTime ? new Date(scheduleForm.startTime).toISOString() : null
    const endIso = scheduleForm.endTime ? new Date(scheduleForm.endTime).toISOString() : null

    if (active) {
      if (!startIso || !endIso) {
        setError('Set both start_time and end_time before activating.')
        return
      }
      if (new Date(endIso) <= new Date(startIso)) {
        setError('end_time must be later than start_time.')
        return
      }
    }

    setSavingSchedule(true)

    if (active) {
      let { error: deactivateErr } = await supabase
        .from('surveys')
        .update({ is_active: false, status: 'closed' })
        .neq('id', selectedSurveyId)
        .eq('is_active', true)

      if (deactivateErr && columnMissing(deactivateErr, 'status')) {
        ;({ error: deactivateErr } = await supabase
          .from('surveys')
          .update({ is_active: false })
          .neq('id', selectedSurveyId)
          .eq('is_active', true))
      }
      if (deactivateErr && columnMissing(deactivateErr, 'is_active')) {
        ;({ error: deactivateErr } = await supabase
          .from('surveys')
          .update({ status: 'closed' })
          .neq('id', selectedSurveyId)
          .eq('status', 'active'))
      }
      if (deactivateErr) {
        setSavingSchedule(false)
        setError(deactivateErr.message || 'Could not deactivate previous active surveys.')
        return
      }
    }

    const statusPayload = active
      ? { is_active: true, status: 'active' }
      : { is_active: false, status: 'closed' }

    let { error } = await supabase
      .from('surveys')
      .update({ ...statusPayload, start_time: startIso, end_time: endIso })
      .eq('id', selectedSurveyId)

    if (error && (columnMissing(error, 'start_time') || columnMissing(error, 'end_time'))) {
      ;({ error } = await supabase
        .from('surveys')
        .update({ ...statusPayload, starts_at: startIso, ends_at: endIso })
        .eq('id', selectedSurveyId))
    }

    if (error && columnMissing(error, 'status')) {
      ;({ error } = await supabase
        .from('surveys')
        .update({ is_active: statusPayload.is_active, start_time: startIso, end_time: endIso })
        .eq('id', selectedSurveyId))
    }

    if (error && columnMissing(error, 'is_active')) {
      ;({ error } = await supabase
        .from('surveys')
        .update({ status: statusPayload.status, start_time: startIso, end_time: endIso })
        .eq('id', selectedSurveyId))
    }

    if (error) {
      setSavingSchedule(false)
      setError(error.message || 'Could not update survey status.')
      return
    }

    setSavingSchedule(false)
    setSuccess(active ? 'Survey activated with time window.' : 'Survey deactivated.')
    await loadSurveys()
  }

  async function saveWindowOnly() {
    resetMessages()
    if (!selectedSurveyId) {
      setError('Select a survey first.')
      return
    }

    const startIso = scheduleForm.startTime ? new Date(scheduleForm.startTime).toISOString() : null
    const endIso = scheduleForm.endTime ? new Date(scheduleForm.endTime).toISOString() : null

    if (!startIso || !endIso) {
      setError('Set both start_time and end_time.')
      return
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setError('end_time must be later than start_time.')
      return
    }

    setSavingSchedule(true)
    let { error } = await supabase
      .from('surveys')
      .update({ start_time: startIso, end_time: endIso })
      .eq('id', selectedSurveyId)

    if (error && (columnMissing(error, 'start_time') || columnMissing(error, 'end_time'))) {
      ;({ error } = await supabase
        .from('surveys')
        .update({ starts_at: startIso, ends_at: endIso })
        .eq('id', selectedSurveyId))
    }

    if (error) {
      setSavingSchedule(false)
      setError(error.message || 'Could not save window.')
      return
    }

    setSavingSchedule(false)
    setSuccess('Survey window saved.')
    await loadSurveys()
  }

  async function deleteSelectedSurvey() {
    resetMessages()
    if (!selectedSurveyId) {
      setError('Select a survey first.')
      return
    }

    const target = surveys.find(s => s.id === selectedSurveyId)
    const targetLabel = target?.title || selectedSurveyId
    const confirmed = window.confirm(`Delete survey "${targetLabel}" and all related celebrities/photos? This cannot be undone.`)
    if (!confirmed) return

    setDeletingSurvey(true)

    try {
      const { data: celebRows, error: celebErr } = await supabase
        .from('celebrities')
        .select('id')
        .eq('survey_id', selectedSurveyId)

      if (celebErr) throw celebErr

      const celebIds = (celebRows || []).map(c => c.id)

      if (celebIds.length) {
        const { data: photoRows, error: photoErr } = await supabase
          .from('celebrity_photos')
          .select('id, storage_path')
          .in('celebrity_id', celebIds)

        if (photoErr) throw photoErr

        const storagePaths = (photoRows || []).map(p => p.storage_path).filter(Boolean)
        if (storagePaths.length) {
          await supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).remove(storagePaths)
        }

        const { error: deletePhotosErr } = await supabase
          .from('celebrity_photos')
          .delete()
          .in('celebrity_id', celebIds)

        if (deletePhotosErr) throw deletePhotosErr

        const { error: deleteCelebErr } = await supabase
          .from('celebrities')
          .delete()
          .eq('survey_id', selectedSurveyId)

        if (deleteCelebErr) throw deleteCelebErr
      }

      const { error: deleteSurveyErr } = await supabase
        .from('surveys')
        .delete()
        .eq('id', selectedSurveyId)

      if (deleteSurveyErr) throw deleteSurveyErr

      localStorage.removeItem(getDraftKey(selectedSurveyId))
      const generalDraft = parseDraft(localStorage.getItem(ADMIN_WIZARD_DRAFT_KEY))
      if (generalDraft?.surveyId === selectedSurveyId) {
        localStorage.removeItem(ADMIN_WIZARD_DRAFT_KEY)
      }

      loadedEditSurveyIdRef.current = ''
      setSurveyId('')
      setSelectedSurveyId('')
      setIsEditMode(false)
      setCelebrities([])
      setPhotoMap({})
      setOverviewCelebrities([])
      setCurrentCelebIndex(0)
      setScheduleForm({ startTime: '', endTime: '' })
      setSurveyForm({ title: '', description: '', celebrityCount: 1 })
      setStep(1)

      await loadSurveys()
      setSuccess('Survey deleted successfully.')
    } catch (e) {
      setError(e.message || 'Could not delete survey.')
    } finally {
      setDeletingSurvey(false)
    }
  }

  async function loadSurveyForEdit(id, options = {}) {
    const { silent = false } = options
    if (!id) return

    if (loadingEditSurveyRef.current) return
    loadingEditSurveyRef.current = true

    if (!silent) resetMessages()

    try {
      const { data: survey, error: surveyErr } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (surveyErr || !survey) {
        setStep(1)
        setError(surveyErr?.message || 'Survey not found. Please select a valid survey from dashboard.')
        return
      }

      const { data: celebRows, error: celebErr } = await supabase
        .from('celebrities')
        .select('*')
        .eq('survey_id', id)
        .order('created_at', { ascending: true })

      if (celebErr) {
        setStep(1)
        setError(celebErr.message || 'Survey data could not be loaded. Please try opening it again.')
        return
      }

      setPhotoMap({})
      const persistedCelebs = (celebRows || []).map((c, i) => ({
        id: c.id,
        name: c.name || '',
        gender: c.gender || 'unknown',
        order: i + 1
      }))

      const celebIds = persistedCelebs.map(c => c.id).filter(Boolean)
      let counts = {}
      if (celebIds.length) {
        const { data: photoRows, error: photosErr } = await supabase
          .from('celebrity_photos')
          .select('*')
          .in('celebrity_id', celebIds)
          .order('display_order', { ascending: true })

        if (photosErr) throw photosErr

        counts = celebIds.reduce((acc, celebId) => {
          acc[celebId] = []
          return acc
        }, {})

        ;(photoRows || []).forEach(p => {
          const celebId = p.celebrity_id
          if (!counts[celebId]) counts[celebId] = []
          counts[celebId].push({
            ...p,
            storage_path: normalizeStoragePath(p.storage_path),
            url: storagePathToUrl(p.storage_path)
          })
        })

        setPhotoMap(prev => ({ ...prev, ...counts }))
      }

      const plannedCount = Math.max(persistedCelebs.length, targetCelebrityCountFromSurvey(survey))
      const placeholderCount = Math.max(0, plannedCount - persistedCelebs.length)
      const placeholders = Array.from({ length: placeholderCount }).map((_, i) => ({
        id: null,
        name: '',
        gender: 'unknown',
        order: persistedCelebs.length + i + 1
      }))
      const restoredCelebs = [...persistedCelebs, ...placeholders]

      let resumeIndex = restoredCelebs.findIndex(c => !c.id || (counts[c.id]?.length || 0) < 5)
      if (resumeIndex < 0) resumeIndex = 0

      setSurveyId(survey.id)
      setSelectedSurveyId(survey.id)
      setIsEditMode(true)

      const startValue = survey.start_time || survey.starts_at || ''
      const endValue = survey.end_time || survey.ends_at || ''
      setScheduleForm({
        startTime: toInputDateTime(startValue),
        endTime: toInputDateTime(endValue)
      })

      setSurveyForm({
        title: survey.title || '',
        description: survey.description || '',
        celebrityCount: plannedCount
      })
      setCelebrities(restoredCelebs)
      setCurrentCelebIndex(resumeIndex)
      setStep(restoredCelebs.length ? 3 : 2)
      setAutosaveState('saved')
      loadedEditSurveyIdRef.current = survey.id

      if (!silent) {
        setSuccess('Edit mode enabled. Survey details are loaded and changes will autosave in real time.')
      }
    } finally {
      loadingEditSurveyRef.current = false
    }
  }

  async function openSurveyForEdit() {
    if (!selectedSurveyId) {
      setError('Select a survey to edit.')
      return
    }
    navigate(`/admin/create-survey/${selectedSurveyId}`)
  }

  function handleSurveySelect(value) {
    setSelectedSurveyId(value)
    if (!value) {
      setIsEditMode(false)
      return
    }
    if (value !== surveyId) {
      setIsEditMode(false)
      loadedEditSurveyIdRef.current = ''
    }
  }

  function startNewSurvey() {
    resetMessages()
    setSurveyId('')
    setSelectedSurveyId('')
    setIsEditMode(false)
    setCelebrities([])
    setPhotoMap({})
    setCurrentCelebIndex(0)
    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    setScheduleForm({ startTime: toInputDateTime(now.toISOString()), endTime: toInputDateTime(in24h.toISOString()) })
    setSurveyForm({ title: '', description: '', celebrityCount: 1 })
    setAutosaveState('idle')
    loadedEditSurveyIdRef.current = ''
    celebrityNameCacheRef.current = {}
    setStep(2)
  }

  function backToSurveyControl() {
    navigate('/admin-dashboard')
    setSuccess('Returned to survey control panel.')
  }

  async function createSurveyDraft() {
    resetMessages()

    const title = surveyForm.title.trim()
    const count = Number(surveyForm.celebrityCount)

    if (!title) {
      setError('Survey name is required.')
      return
    }

    if (!count || count < 1) {
      setError('How many celebrities must be at least 1.')
      return
    }

    setSavingSurvey(true)

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id

    const base = {
      title,
      description: surveyForm.description.trim() || null,
      images_per_session: count * 5,
      evaluators_needed: 30,
      created_by: userId
    }

    let row = null
    let err = null

    if (surveyId) {
      ;({ data: row, error: err } = await supabase
        .from('surveys')
        .update(base)
        .eq('id', surveyId)
        .select('*')
        .maybeSingle())
    } else {
      ;({ data: row, error: err } = await supabase
        .from('surveys')
        .insert({ ...base, status: 'draft', is_active: false })
        .select('*')
        .single())

      if (err && columnMissing(err, 'status')) {
        ;({ data: row, error: err } = await supabase
          .from('surveys')
          .insert({ ...base, is_active: false })
          .select('*')
          .single())
      }

      if (err && columnMissing(err, 'is_active')) {
        ;({ data: row, error: err } = await supabase
          .from('surveys')
          .insert({ ...base, status: 'draft' })
          .select('*')
          .single())
      }

      if (err && (columnMissing(err, 'status') || columnMissing(err, 'is_active'))) {
        ;({ data: row, error: err } = await supabase
          .from('surveys')
          .insert(base)
          .select('*')
          .single())
      }
    }

    if (err) {
      setSavingSurvey(false)
      setError(err.message || 'Failed to create survey draft.')
      return
    }

    const initialCelebs = celebrities.length
      ? celebrities
      : Array.from({ length: count }).map((_, i) => ({
          id: null,
          name: '',
          gender: 'unknown',
          order: i + 1
        }))

    setSurveyId(row.id)
    setSelectedSurveyId(row.id)
    celebrityNameCacheRef.current = {}
    setCelebrities(initialCelebs)
    setCurrentCelebIndex(0)
    if (!celebrities.length) setPhotoMap({})
    setStep(3)
    setSavingSurvey(false)
    setSuccess(isEditMode || surveyId ? 'Survey details updated.' : 'Survey draft created. Start entering celebrity information.')
    await loadSurveys()
  }

  async function upsertCurrentCelebrity() {
    if (!surveyId || !currentCelebrity) throw new Error('Create survey details first.')

    await ensureAdminWriteAccess()

    const name = (currentCelebrity.name || '').trim()
    if (!name) throw new Error('Celebrity name is required before image upload.')

    if (currentCelebrity.id) {
      const { error: updateErr } = await supabase
        .from('celebrities')
        .update({ name, gender: currentCelebrity.gender || 'unknown' })
        .eq('id', currentCelebrity.id)

      if (updateErr) throw updateErr
      return currentCelebrity.id
    }

    const { data, error } = await supabase
      .from('celebrities')
      .insert({
        survey_id: surveyId,
        name,
        gender: currentCelebrity.gender || 'unknown'
      })
      .select('id')
      .single()

    if (error) throw error

    setCelebrities(prev => prev.map((c, i) => i === currentCelebIndex ? { ...c, id: data.id } : c))
    return data.id
  }

  async function loadPhotosForCelebrity(celebId) {
    if (!celebId) return

    const { data, error } = await supabase
      .from('celebrity_photos')
      .select('*')
      .eq('celebrity_id', celebId)
      .order('display_order', { ascending: true })

    if (error) throw error

    const mapped = (data || []).map(p => ({
      ...p,
      storage_path: normalizeStoragePath(p.storage_path),
      url: storagePathToUrl(p.storage_path)
    }))

    setPhotoMap(prev => ({ ...prev, [celebId]: mapped }))
    return mapped
  }

  function setCurrentCelebrityName(value) {
    setCelebrities(prev => prev.map((c, i) => i === currentCelebIndex ? { ...c, name: value } : c))
  }

  async function addCelebrity() {
    resetMessages()
    if (!surveyId) {
      setError('Save the survey details first before adding celebrities.')
      return
    }

    try {
      await ensureAdminWriteAccess()

      const nextOrder = celebrities.length + 1
      const placeholderName = `Untitled Celebrity ${nextOrder}`
      const { data, error } = await supabase
        .from('celebrities')
        .insert({
          survey_id: surveyId,
          name: placeholderName,
          gender: 'unknown'
        })
        .select('id')
        .single()

      if (error) throw error

      setCelebrities(prev => ([
        ...prev,
        {
          id: data.id,
          name: placeholderName,
          gender: 'unknown',
          order: nextOrder
        }
      ]))
      setSurveyForm(prev => ({ ...prev, celebrityCount: nextOrder }))
      setCurrentCelebIndex(nextOrder - 1)
      setPhotoMap(prev => ({ ...prev, [data.id]: [] }))
      setSuccess('New celebrity added. Enter the name and upload photos.')
    } catch (e) {
      setError(e.message || 'Could not add celebrity.')
    }
  }

  async function removeCelebrity(index = currentCelebIndex) {
    resetMessages()

    const target = celebrities[index]
    if (!target) {
      setError('No celebrity selected to remove.')
      return
    }

    if (celebrities.length <= 1) {
      setError('Keep at least one celebrity in the survey.')
      return
    }

    try {
      await ensureAdminWriteAccess()

      if (target.id) {
        const { data: existingPhotos, error: photoErr } = await supabase
          .from('celebrity_photos')
          .select('id, storage_path')
          .eq('celebrity_id', target.id)

        if (photoErr) throw photoErr

        const { error: deleteErr } = await supabase
          .from('celebrities')
          .delete()
          .eq('id', target.id)

        if (deleteErr) throw deleteErr

        const paths = (existingPhotos || []).map(p => p.storage_path).filter(Boolean)
        if (paths.length) {
          await supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).remove(paths)
        }
      }

      setCelebrities(prev => {
        const next = prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, order: i + 1 }))
        return next
      })
      setSurveyForm(prev => ({ ...prev, celebrityCount: Math.max(1, celebrities.length - 1) }))

      setPhotoMap(prev => {
        const next = { ...prev }
        if (target.id) delete next[target.id]
        return next
      })

      celebrityNameCacheRef.current = Object.fromEntries(
        Object.entries(celebrityNameCacheRef.current).filter(([key]) => key !== target.id && key !== `idx:${index}`)
      )

      setCurrentCelebIndex(prev => Math.max(0, Math.min(index, celebrities.length - 2)))
      setSuccess('Celebrity removed. Changes were saved.')
    } catch (e) {
      setError(e.message || 'Could not remove celebrity.')
    }
  }

  function requestRemoveCelebrity(index = currentCelebIndex) {
    setDeleteConfirmIndex(index)
  }

  async function confirmRemoveCelebrity() {
    if (!Number.isFinite(deleteConfirmIndex)) {
      setDeleteConfirmIndex(null)
      return
    }

    const targetIndex = deleteConfirmIndex
    setDeleteConfirmIndex(null)
    await removeCelebrity(targetIndex)
  }

  async function saveCelebrityName() {
    resetMessages()
    setSavingCeleb(true)

    try {
      await upsertCurrentCelebrity()
      setSuccess('Celebrity saved. Now upload exactly 5 images.')
      if (currentCelebrity?.id) {
        await loadPhotosForCelebrity(currentCelebrity.id)
      }
    } catch (e) {
      setError(e.message || 'Failed to save celebrity.')
    } finally {
      setSavingCeleb(false)
    }
  }

  async function openCropFromFile(file, replacingPhoto = null) {
    if (!file) return

    try {
      const src = await asDataUrl(file)
      setImageSrc(src)
      setReplacePhoto(replacingPhoto)
      setZoom(1)
      setCrop({ x: 0, y: 0 })
      setAspect(3 / 4)
      setShowCrop(true)
    } catch {
      setError('Could not read selected image.')
    }
  }

  async function handlePickFile(file) {
    resetMessages()

    if (!currentCelebrity) {
      setError('Please complete survey details first.')
      return
    }

    const currentCount = currentPhotos.length
    if (currentCount >= 5) {
      setError('This celebrity already has 5 images. Use Edit/Replace or Delete.')
      return
    }

    await openCropFromFile(file, null)
  }

  async function handleReplace(photo) {
    resetMessages()
    try {
      const response = await fetch(photo.url)
      const blob = await response.blob()
      const file = new File([blob], 'replace.jpg', { type: blob.type || 'image/jpeg' })
      await openCropFromFile(file, photo)
    } catch {
      setError('Could not load image for re-crop/replace.')
    }
  }

  function requestReplace(photo) {
    setReplaceTargetPhoto(photo)
    replaceFileRef.current?.click()
  }

  async function onReplaceFilePicked(file) {
    if (!file || !replaceTargetPhoto) return
    await openCropFromFile(file, replaceTargetPhoto)
    setReplaceTargetPhoto(null)
  }

  async function handleUploadCropped() {
    if (!croppedArea || !imageSrc || !currentCelebrity) return

    setUploading(true)
    resetMessages()

    try {
      const celebId = await upsertCurrentCelebrity()
      const existing = photoMap[celebId] || []

      if (!replacePhoto && existing.length >= 5) {
        throw new Error('This celebrity already has 5 images.')
      }

      const blob = await getCroppedImageBlob(imageSrc, croppedArea)
      const path = `${celebId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const uploadedUrl = storagePathToUrl(path)

      const { error: storageErr } = await supabase.storage
        .from(CELEBRITY_PHOTOS_BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false })

      if (storageErr) {
        if (/bucket not found|not found/i.test(storageErr.message)) {
          throw new Error(`BUCKET_MISSING:${CELEBRITY_PHOTOS_BUCKET}`)
        }
        throw storageErr
      }

      if (replacePhoto) {
        const { error: updateErr } = await supabase
          .from('celebrity_photos')
          .update({ storage_path: path })
          .eq('id', replacePhoto.id)

        if (updateErr) throw updateErr

        if (Number(replacePhoto.display_order) === 0) {
          try {
            await setCelebrityProfileImage(celebId, uploadedUrl)
          } catch (profileImageErr) {
            console.warn('[admin] profile_image update skipped after replace', {
              celebId,
              message: profileImageErr?.message,
              error: profileImageErr
            })
          }
        }

        await supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).remove([normalizeStoragePath(replacePhoto.storage_path)])
      } else {
        const { error: insertErr } = await supabase
          .from('celebrity_photos')
          .insert({
            celebrity_id: celebId,
            storage_path: path,
            display_order: existing.length
          })

        if (insertErr) throw insertErr

        if (!existing.length) {
          try {
            await setCelebrityProfileImage(celebId, uploadedUrl)
          } catch (profileImageErr) {
            console.warn('[admin] profile_image update skipped after first upload', {
              celebId,
              message: profileImageErr?.message,
              error: profileImageErr
            })
          }
        }
      }

      await loadPhotosForCelebrity(celebId)
      setShowCrop(false)
      setImageSrc('')
      setReplacePhoto(null)
      setSuccess(replacePhoto ? 'Image updated.' : 'Image uploaded.')
    } catch (e) {
      const message = e?.message || 'Image upload failed.'
      const detail = [e?.code, e?.details, e?.hint].filter(Boolean).join(' | ')
      if (message.startsWith('BUCKET_MISSING:')) {
        setBucketError(true)
        setError(`Storage bucket "${message.slice('BUCKET_MISSING:'.length)}" is missing in Supabase.`)
      } else if (/Admin session expired|does not have admin role|Admin profile missing/i.test(message)) {
        setError(message)
      } else if (/storage\.objects|for table "objects"|bucket/i.test(message) && /row-level security|violates row-level security/i.test(message)) {
        setError(`Storage RLS blocked upload. Open Admin > DB Setup and run the "storage celebrity-photos bucket" SQL block, then retry.${detail ? ` (${detail})` : ''}`)
      } else if (/row-level security policy/i.test(message) || /violates row-level security/i.test(message)) {
        setError(`Database RLS blocked the save. Open Admin > DB Setup and run the "admin content RLS" SQL block, then retry.${detail ? ` (${detail})` : ''}`)
      } else {
        setError(message)
      }
    } finally {
      setUploading(false)
    }
  }

  async function deletePhoto(photo) {
    resetMessages()
    try {
      const { error: dbErr } = await supabase.from('celebrity_photos').delete().eq('id', photo.id)
      if (dbErr) throw dbErr

      await supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).remove([normalizeStoragePath(photo.storage_path)])
      if (currentCelebrity?.id) {
        const refreshed = await loadPhotosForCelebrity(currentCelebrity.id)
        await setCelebrityProfileImage(currentCelebrity.id, refreshed?.[0]?.url || null)
      }
      setSuccess('Image deleted.')
    } catch (e) {
      setError(e.message || 'Could not delete image.')
    }
  }

  async function nextCelebrity() {
    resetMessages()

    try {
      const celebId = await upsertCurrentCelebrity()
      const freshPhotos = await loadPhotosForCelebrity(celebId)
      const freshCount = freshPhotos?.length || 0

      if (freshCount !== 5) {
        setError(`You need exactly 5 images before continuing. Current: ${freshCount}`)
        return
      }

      if (currentCelebIndex + 1 >= celebrities.length) {
        setStep(4)
        setSuccess('Image collection for this celebrity is complete.')
        return
      }

      setCurrentCelebIndex(prev => prev + 1)
      setSuccess('Image collection for this celebrity is complete. Moving to next celebrity.')

      const nextCeleb = celebrities[currentCelebIndex + 1]
      if (nextCeleb?.id) {
        await loadPhotosForCelebrity(nextCeleb.id)
      }
    } catch (e) {
      setError(e.message || 'Could not continue to next celebrity.')
    }
  }

  async function goToCelebrity(index) {
    if (!Number.isFinite(index)) return
    if (index < 0 || index >= celebrities.length) return

    setCurrentCelebIndex(index)
    const targetCeleb = celebrities[index]
    if (targetCeleb?.id) {
      try {
        await loadPhotosForCelebrity(targetCeleb.id)
      } catch {
        // Non-blocking: UI still navigates even if photo refresh fails.
      }
    }
  }

  async function launchSurvey() {
    resetMessages()
    setLaunching(true)

    try {
      if (!surveyId) throw new Error('Survey draft not found.')

      const counts = {}
      for (let i = 0; i < celebrities.length; i++) {
        const c = celebrities[i]
        if (!(c.name || '').trim()) {
          throw new Error(`Celebrity ${i + 1} name is missing.`)
        }

        if (c.id) {
          const fresh = await loadPhotosForCelebrity(c.id)
          counts[c.id] = fresh?.length || 0
        }
      }

      const incomplete = celebrities.find(c => !c.id || counts[c.id] !== 5)
      if (incomplete) {
        throw new Error('Every celebrity must have exactly 5 images before launch.')
      }

      const payload = {
        title: surveyForm.title.trim(),
        description: surveyForm.description.trim() || null,
        images_per_session: celebrities.length * 5,
        evaluators_needed: 30,
        status: 'active',
        is_active: true
      }

      const startsAt = scheduleForm.startTime ? new Date(scheduleForm.startTime) : new Date()
      const endsAt = scheduleForm.endTime ? new Date(scheduleForm.endTime) : new Date(startsAt.getTime() + 24 * 60 * 60 * 1000)

      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
        throw new Error('Invalid start_time or end_time.')
      }
      if (endsAt <= startsAt) {
        throw new Error('end_time must be later than start_time.')
      }

      let { error } = await supabase
        .from('surveys')
        .update({
          ...payload,
          start_time: startsAt.toISOString(),
          end_time: endsAt.toISOString()
        })
        .eq('id', surveyId)

      if (error && columnMissing(error, 'status')) {
        ;({ error } = await supabase
          .from('surveys')
          .update({
            title: payload.title,
            description: payload.description,
            images_per_session: payload.images_per_session,
            evaluators_needed: payload.evaluators_needed,
            is_active: true,
            start_time: startsAt.toISOString(),
            end_time: endsAt.toISOString()
          })
          .eq('id', surveyId))
      }

      if (error && columnMissing(error, 'is_active')) {
        ;({ error } = await supabase
          .from('surveys')
          .update({
            title: payload.title,
            description: payload.description,
            images_per_session: payload.images_per_session,
            evaluators_needed: payload.evaluators_needed,
            status: 'active',
            start_time: startsAt.toISOString(),
            end_time: endsAt.toISOString()
          })
          .eq('id', surveyId))
      }

      if (error && (columnMissing(error, 'start_time') || columnMissing(error, 'end_time'))) {
        ;({ error } = await supabase
          .from('surveys')
          .update({ ...payload, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
          .eq('id', surveyId))
      }

      if (error) throw error

      // Make this the single running survey (fallback-safe across legacy schemas).
      let { error: deactivateErr } = await supabase
        .from('surveys')
        .update({ is_active: false, status: 'closed' })
        .neq('id', surveyId)
        .eq('is_active', true)

      if (deactivateErr && columnMissing(deactivateErr, 'status')) {
        ;({ error: deactivateErr } = await supabase
          .from('surveys')
          .update({ is_active: false })
          .neq('id', surveyId)
          .eq('is_active', true))
      }

      if (deactivateErr && columnMissing(deactivateErr, 'is_active')) {
        ;({ error: deactivateErr } = await supabase
          .from('surveys')
          .update({ status: 'closed' })
          .neq('id', surveyId)
          .eq('status', 'active'))
      }

      if (deactivateErr) throw deactivateErr

      setSuccess(`Survey launched successfully. It will run until ${endsAt.toLocaleString()}.`)
      localStorage.removeItem(ADMIN_WIZARD_DRAFT_KEY)
      localStorage.removeItem(getDraftKey(surveyId))
      await loadSurveys()
    } catch (e) {
      setError(e.message || 'Launch failed.')
    } finally {
      setLaunching(false)
    }
  }

  const percentForCurrent = Math.min(100, (currentPhotos.length / 5) * 100)

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Create Survey Wizard</h2>
          <p className="admin-page-subtitle">A guided interview-style flow for consistent celebrity image uploads</p>
          {isEditMode && selectedSurveyId && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pill pill-success">Edit Mode</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                Survey ID: {selectedSurveyId}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <div className={`pill ${isEditMode ? 'pill-success' : 'pill-muted'}`}>
            {isEditMode ? 'Edit Mode' : 'Create Mode'}
          </div>
          {step !== 1 && (
            <button className="btn btn-outline btn-sm" type="button" onClick={backToSurveyControl}>
              Back to Survey Control
            </button>
          )}
          <button className="btn btn-gold btn-sm" type="button" onClick={startNewSurvey}>
            Create New Survey
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--muted)' }}>Draft progress is auto-saved</span>
          <span className={`pill ${autosaveState === 'error' ? 'pill-danger' : autosaveState === 'saved' ? 'pill-success' : 'pill-muted'}`}>
            {autosaveState === 'saving' ? 'Autosave: Saving...' : autosaveState === 'saved' ? 'Autosave: Saved' : autosaveState === 'error' ? 'Autosave: Retry needed' : 'Autosave: Idle'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {wizardSteps.map(s => (
            <button key={s.n} type="button" onClick={() => setStep(s.n)} style={{
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: step >= s.n ? 'rgba(200,169,110,0.14)' : 'transparent',
              textAlign: 'center',
              fontSize: '0.8rem',
              cursor: 'pointer',
              color: 'inherit'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Step {s.n}</div>
              <div style={{ color: 'var(--muted)' }}>{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="card">
          <h3 style={{ fontFamily: "'Syne', sans-serif", marginBottom: '12px' }}>Start Survey Creation</h3>
          <p style={{ color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.65 }}>
            Select a survey from admin list, configure start_time and end_time, activate/deactivate, and review joined celebrities/photos in one view.
          </p>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Select Survey (Admin Control)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '10px' }}>
                <select className="form-input" value={selectedSurveyId} onChange={e => handleSurveySelect(e.target.value)}>
                  <option value="">Select survey...</option>
                  {surveys.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title}{(s.status === 'active' || s.is_active === true) ? ' (ACTIVE)' : ''}
                    </option>
                  ))}
                </select>
                <button className="btn btn-outline" onClick={openSurveyForEdit}>Open</button>
                <button className="btn btn-outline" onClick={openSurveyForEdit} disabled={deletingSurvey || !selectedSurveyId}>Edit</button>
                <button className="btn btn-danger" onClick={deleteSelectedSurvey} disabled={deletingSurvey || !selectedSurveyId}>
                  {deletingSurvey ? <span className="spinner" /> : 'Delete'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">start_time</label>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={scheduleForm.startTime}
                  onChange={e => setScheduleForm(prev => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">end_time</label>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={scheduleForm.endTime}
                  onChange={e => setScheduleForm(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-outline" onClick={saveWindowOnly} disabled={savingSchedule || !selectedSurveyId}>
                  Save Window
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn btn-gold" onClick={() => applySurveyStatus(true)} disabled={savingSchedule || !selectedSurveyId}>
                {savingSchedule ? <span className="spinner" /> : 'Activate Survey'}
              </button>
              <button className="btn btn-danger" onClick={() => applySurveyStatus(false)} disabled={savingSchedule || !selectedSurveyId}>
                {savingSchedule ? <span className="spinner" /> : 'Deactivate Survey'}
              </button>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
              <h4 style={{ margin: 0, marginBottom: '10px', fontSize: '0.9rem', fontFamily: "'Syne', sans-serif" }}>
                Survey Overview (surveys → celebrities → photos)
              </h4>
              {selectedSurveyId ? (
                overviewCelebrities.length > 0 ? (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {overviewCelebrities.map(c => (
                      <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <strong>{c.name}</strong>
                          <span className="pill pill-muted">{(c.photos || []).length} photos</span>
                        </div>
                        {(c.photos || []).length === 0 ? (
                          <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No photos uploaded.</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: '8px' }}>
                            {c.photos.map(photo => (
                              <img key={photo.id} src={photo.url} alt={c.name} style={{ width: '100%', height: '78px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: '0.84rem' }}>No related celebrities found for this survey yet.</div>
                )
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: '0.84rem' }}>Select a survey to load joined entities.</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-gold" onClick={startNewSurvey}>Create New Survey</button>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>Quick Start</button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3 style={{ fontFamily: "'Syne', sans-serif", marginBottom: '12px' }}>Survey Details</h3>
          {isEditMode && (
            <div className="pill pill-success" style={{ marginBottom: '12px', display: 'inline-flex' }}>
              Editing an existing survey
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Survey Name</label>
            <input
              className="form-input"
              value={surveyForm.title}
              onChange={e => setSurveyForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Celebrity Face Rating - Wave 1"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              value={surveyForm.description}
              onChange={e => setSurveyForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Short survey description"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">How many celebrities do you want to add?</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={surveyForm.celebrityCount}
              onChange={e => setSurveyForm(prev => ({ ...prev, celebrityCount: Number(e.target.value) || 0 }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">start_time</label>
              <input
                className="form-input"
                type="datetime-local"
                value={scheduleForm.startTime}
                onChange={e => setScheduleForm(prev => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">end_time</label>
              <input
                className="form-input"
                type="datetime-local"
                value={scheduleForm.endTime}
                onChange={e => setScheduleForm(prev => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px' }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-gold" onClick={createSurveyDraft} disabled={savingSurvey}>
              {savingSurvey ? <span className="spinner" /> : (isEditMode ? 'Save Changes' : 'Continue')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && surveyId && (
        <div className="card upload-wizard-card">
          <div className="upload-wizard-badge">
            CELEBRITY {Math.min(currentCelebIndex + 1, Math.max(1, celebrities.length))} OF {Math.max(1, celebrities.length)} - {(currentCelebrity?.name || 'UNTITLED').toUpperCase()}
          </div>
          <h3 className="upload-wizard-title">Upload 5 images</h3>

          {!currentCelebrity && (
            <div style={{ marginBottom: '16px', color: 'var(--muted)', lineHeight: 1.6 }}>
              No celebrity is selected yet. Add one below to start uploading photos.
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <button className="btn btn-outline btn-sm" type="button" onClick={addCelebrity}>
              + Add Celebrity
            </button>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              onClick={() => requestRemoveCelebrity(currentCelebIndex)}
              disabled={!currentCelebrity}
            >
              Remove Current Celebrity
            </button>
          </div>

          {celebrities.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '8px' }}>
                All celebrities in this survey (click to edit)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                {celebrities.map((celeb, idx) => {
                  const count = celeb?.id ? (photoMap[celeb.id]?.length || 0) : 0
                  const selected = idx === currentCelebIndex
                  const thumbUrl = celeb?.id ? (photoMap[celeb.id]?.[0]?.url || '') : ''
                  return (
                    <button
                      key={`celeb-nav-${celeb.id || idx}`}
                      type="button"
                      onClick={() => goToCelebrity(idx)}
                      style={{
                        textAlign: 'left',
                        padding: '10px',
                        borderRadius: '8px',
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                        background: selected ? 'rgba(200,169,110,0.14)' : 'transparent',
                        color: 'inherit',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={celeb.name || `Celebrity ${idx + 1}`}
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '6px',
                              objectFit: 'cover',
                              border: '1px solid var(--border)',
                              flexShrink: 0
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--muted)',
                              fontSize: '0.75rem',
                              flexShrink: 0
                            }}
                          >
                            {(celeb.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {idx + 1}. {celeb.name || `Untitled Celebrity ${idx + 1}`}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                            {count}/5 images
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="form-group upload-name-group">
            <label className="form-label">Celebrity Name</label>
            <div className="upload-name-row">
              <input
                ref={nameInputRef}
                className="form-input"
                value={currentCelebrity?.name || ''}
                disabled={!currentCelebrity}
                onChange={e => setCurrentCelebrityName(e.target.value)}
                placeholder="Enter celebrity name"
              />
              <button className="btn btn-outline btn-sm" onClick={saveCelebrityName} disabled={savingCeleb || !currentCelebrity}>
                {savingCeleb ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>

          <div className="upload-progress-head">
            <span>Upload 5 images to continue</span>
            <strong>{currentPhotos.length}/5</strong>
          </div>
          <div className="upload-progress-track">
            <div className="upload-progress-fill" style={{ width: `${percentForCurrent}%` }} />
          </div>
          <div className="upload-progress-copy">{progressText(currentPhotos.length)}</div>

          <div className="upload-slot-row">
            {slotPhotos.map((photo, i) => (
              <div key={`slot-${i}`} className={`upload-slot ${photo ? 'filled' : ''}`}>
                {photo ? (
                  <>
                    <img src={photo.url} alt={`slot ${i + 1}`} className="upload-slot-thumb" />
                    <div className="upload-slot-actions">
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleReplace(photo)}>Edit</button>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => requestReplace(photo)}>Replace</button>
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => deletePhoto(photo)}>Delete</button>
                    </div>
                  </>
                ) : (
                  <div className="upload-slot-empty">
                    <div className="upload-slot-index">{i + 1}</div>
                    <div className="upload-slot-plus">+</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!showCrop && (
            <div
              className={`drop-zone upload-drop-zone ${dragOver ? 'drag-over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) handlePickFile(file)
              }}
              onDragOver={e => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
            >
              <div className="drop-zone-icon">↥</div>
              <div className="drop-zone-text">Drop images here or click to browse</div>
              <div className="drop-zone-hint">Select up to {Math.max(0, 5 - currentPhotos.length)} more images</div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handlePickFile(e.target.files?.[0])}
              />
              <input
                ref={replaceFileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => onReplaceFilePicked(e.target.files?.[0])}
              />
            </div>
          )}

          {showCrop && imageSrc && (
            <div style={{ marginTop: '14px' }}>
              <div className="crop-controls" style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ASPECT_RATIOS.map(r => (
                  <button
                    key={r.label}
                    className={`btn btn-sm ${aspect === r.value ? 'btn-gold' : 'btn-ghost'}`}
                    type="button"
                    onClick={() => setAspect(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="cropper-wrapper">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  objectFit="contain"
                  restrictPosition
                  minZoom={1}
                  maxZoom={3}
                />
              </div>

              <div className="crop-slider-group" style={{ marginTop: '10px', marginBottom: '12px' }}>
                <span className="crop-slider-label">Zoom</span>
                <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
                <span className="crop-slider-val">{zoom.toFixed(1)}x</span>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setShowCrop(false)
                    setImageSrc('')
                    setReplacePhoto(null)
                  }}
                >
                  Cancel
                </button>
                <button className="btn btn-gold" type="button" disabled={uploading || !croppedArea} onClick={handleUploadCropped}>
                  {uploading ? <span className="spinner" /> : (replacePhoto ? 'Apply Re-crop' : 'Apply Crop & Upload')}
                </button>
              </div>
            </div>
          )}

          <div className="upload-bottom-actions">
            <button
              className="btn btn-ghost upload-edit-info"
              onClick={() => {
                nameInputRef.current?.focus()
                setShowCrop(false)
              }}
            >
              ← Edit info
            </button>
            <button
              className="btn btn-outline"
              onClick={() => goToCelebrity(currentCelebIndex - 1)}
              disabled={currentCelebIndex <= 0}
            >
              ← Previous celebrity
            </button>
            <button
              className="btn upload-next-btn"
              onClick={nextCelebrity}
              disabled={!currentCelebrity || currentPhotos.length !== 5}
            >
              {currentCelebIndex + 1 < celebrities.length ? 'Save & next celebrity →' : 'Save & continue →'}
            </button>
          </div>

          {bucketError && (
            <p style={{ marginTop: '12px', color: 'var(--muted)', fontSize: '0.84rem' }}>
              Storage bucket is missing. Create the configured bucket in Supabase Storage.
            </p>
          )}
        </div>
      )}

      {step === 3 && !surveyId && (
        <div className="card">
          <h3 style={{ fontFamily: "'Syne', sans-serif", marginBottom: '10px' }}>Survey Not Selected</h3>
          <p style={{ color: 'var(--muted)', marginBottom: '14px' }}>
            Please select or create a survey to begin.
          </p>
          <button className="btn btn-gold" onClick={() => navigate('/admin-dashboard')}>Go to Dashboard</button>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3 style={{ fontFamily: "'Syne', sans-serif", marginBottom: '12px' }}>Final Survey Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Total Celebrities</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{celebrities.length}</div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Completed Celebrities</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{completedCelebrities}</div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Total Images Uploaded</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{totalImages}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => setShowAllPhotos(v => !v)}>
              {showAllPhotos ? 'Hide All Uploaded Photos' : 'View All Uploaded Photos'}
            </button>
            <button className="btn btn-gold" onClick={launchSurvey} disabled={launching}>
              {launching ? <span className="spinner" /> : 'Launch Survey'}
            </button>
            <button className="btn btn-ghost" onClick={() => setStep(3)}>Back to Celebrity Steps</button>
          </div>

          {showAllPhotos && (
            <div style={{ marginTop: '16px' }}>
              {celebrities.map((c, idx) => {
                const list = c.id ? (photoMap[c.id] || []) : []
                return (
                  <div key={`summary-${idx}`} style={{ marginBottom: '14px' }}>
                    <h4 style={{ margin: 0, marginBottom: '8px', fontSize: '0.9rem' }}>
                      {c.name || `Celebrity ${idx + 1}`} ({list.length}/5)
                    </h4>
                    {list.length === 0 ? (
                      <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No images uploaded.</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                        {list.map(photo => (
                          <img key={photo.id} src={photo.url} alt="summary" style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {(error || success) && (
        <div style={{ marginTop: '14px' }}>
          {error && <div className="error-msg">{error}</div>}
          {success && <div className="success-msg">{success}</div>}
        </div>
      )}

      {deleteConfirmIndex !== null && celebrities[deleteConfirmIndex] && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 8, 18, 0.7)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setDeleteConfirmIndex(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '460px', width: '100%', borderColor: 'rgba(224,85,85,0.35)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '10px', fontFamily: "'Syne', sans-serif" }}>Delete Celebrity?</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
              Delete {celebrities[deleteConfirmIndex].name || `Celebrity ${deleteConfirmIndex + 1}`} and all related photos? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-ghost" type="button" onClick={() => setDeleteConfirmIndex(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" onClick={confirmRemoveCelebrity}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
