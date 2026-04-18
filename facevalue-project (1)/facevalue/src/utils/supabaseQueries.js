import { supabase } from '../supabase/client'
import { isSurveyActive } from './surveyHelpers'

const CACHE_TTL_MS = 5 * 60 * 1000

const queryCache = new Map()

function getCacheKey(type, id) {
  return `${type}:${id}`
}

function getFromCache(key) {
  const cached = queryCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }
  queryCache.delete(key)
  return null
}

function setCache(key, data) {
  queryCache.set(key, { data, timestamp: Date.now() })
}

// Optimized queries with caching
export async function getCelebrities(limit = 50) {
  const key = getCacheKey('celebrities', limit)
  const cached = getFromCache(key)
  if (cached) return cached

  try {
    const { data, error } = await supabase
      .from('celebrities')
      .select('id, name, image_url, category_id')
      .eq('is_active', true)
      .limit(limit)

    if (error) throw error
    setCache(key, data)
    return data
  } catch (err) {
    console.error('getCelebrities error:', err)
    return []
  }
}

export async function getSurveys(limit = 20) {
  const key = getCacheKey('surveys', limit)
  const cached = getFromCache(key)
  if (cached) return cached

  try {
    const { data: rows, error } = await supabase
      .from('surveys')
      .select('id, title, status, is_active, starts_at, ends_at, created_at, images_per_session')
      .order('created_at', { ascending: false })
      .limit(Math.max(limit * 5, 50))

    if (error) throw error
    const data = (rows || []).filter(isSurveyActive).slice(0, limit)
    setCache(key, data)
    return data
  } catch (err) {
    console.error('getSurveys error:', err)
    return []
  }
}

export async function getCategoriesWithCount() {
  const key = getCacheKey('categories', 'all')
  const cached = getFromCache(key)
  if (cached) return cached

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, description')

    if (error) throw error
    setCache(key, data)
    return data
  } catch (err) {
    console.error('getCategories error:', err)
    return []
  }
}

export async function getUserProfile(userId) {
  const key = getCacheKey('profile', userId)
  const cached = getFromCache(key)
  if (cached) return cached

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, role, full_name, first_name, last_name, age, gender, avatar_url')
      .eq('id', userId)
      .single()

    if (error) throw error
    setCache(key, data)
    return data
  } catch (err) {
    console.error('getUserProfile error:', err)
    return null
  }
}

export async function getSurveyResults(surveyId) {
  const key = getCacheKey('results', surveyId)
  const cached = getFromCache(key)
  if (cached) return cached

  try {
    const { data, error } = await supabase
      .from('results')
      .select('survey_id, winner_id, confidence, created_at')
      .eq('survey_id', surveyId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    setCache(key, data)
    return data || null
  } catch (err) {
    console.error('getSurveyResults error:', err)
    return null
  }
}

export async function getResponses(surveyId, limit = 100) {
  try {
    const { data, error } = await supabase
      .from('survey_responses')
      .select('id, selected_celebrity_id, rating, created_at')
      .eq('survey_id', surveyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data
  } catch (err) {
    console.error('getResponses error:', err)
    return []
  }
}

export async function submitResponse(surveyId, userId, celebrityId, rating = null) {
  try {
    const { error } = await supabase
      .from('survey_responses')
      .insert({
        survey_id: surveyId,
        user_id: userId,
        selected_celebrity_id: celebrityId,
        rating
      })

    if (error) throw error
    
    // Clear cache for this survey
    queryCache.delete(getCacheKey('results', surveyId))
    
    return true
  } catch (err) {
    console.error('submitResponse error:', err)
    return false
  }
}

// Clear all cache
export function clearCache() {
  queryCache.clear()
}

// Clear specific cache
export function clearCacheForKey(key) {
  queryCache.delete(key)
}
