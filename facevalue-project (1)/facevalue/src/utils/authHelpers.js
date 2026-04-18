const DEFAULT_TIMEOUT_MS = 7000
const DEFAULT_RETRIES = 1
const RETRY_BASE_DELAY_MS = 300

function getErrorMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return error.message || error.msg || String(error)
}

function getStatusCode(error) {
  return Number(error?.status ?? error?.statusCode ?? error?.code ?? 0)
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function isTimeoutError(error) {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('timeout') || message.includes('timed out') || message.includes('request timeout')
}

export function isNetworkError(error) {
  const message = getErrorMessage(error).toLowerCase()
  const statusCode = getStatusCode(error)

  if ([408, 502, 503, 504, 522, 523, 524].includes(statusCode)) {
    return true
  }

  return [
    'failed to fetch',
    'networkerror',
    'fetch failed',
    'load failed',
    'the internet connection appears to be offline',
    'network request failed',
    'aborterror',
    'cors'
  ].some((token) => message.includes(token))
}

export function isRateLimitError(error) {
  const message = getErrorMessage(error).toLowerCase()
  const statusCode = getStatusCode(error)

  if (statusCode === 429) {
    return true
  }

  return [
    'over_email_send_rate_limit',
    'rate limit',
    'too many requests',
    'email rate limit'
  ].some((token) => message.includes(token))
}

export function isRetryableAuthError(error) {
  return isOffline() || isTimeoutError(error) || isNetworkError(error)
}

export function getReadableAuthError(error, fallback = 'Something went wrong. Please try again.') {
  const message = getErrorMessage(error)
  const lowerMessage = message.toLowerCase()
  const statusCode = getStatusCode(error)

  if (isOffline() || lowerMessage.includes('offline')) {
    return 'You appear to be offline. Check your connection and try again.'
  }

  if (isTimeoutError(error)) {
    return 'The request took too long. Please try again.'
  }

  if ([522, 523, 524].includes(statusCode) || lowerMessage.includes('error code: 522')) {
    return 'The auth server is temporarily unreachable. Please try again in a moment.'
  }

  if (isRateLimitError(error)) {
    return 'Too many attempts right now. Please wait a minute and try again.'
  }

  if (isNetworkError(error)) {
    return 'Could not reach the server. Please check your connection and try again.'
  }

  if (lowerMessage.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }

  if (lowerMessage.includes('invalid login credentials')) {
    return 'The email or password is incorrect.'
  }

  if (lowerMessage.includes('no admin profile found')) {
    return 'Admin profile is missing for this account.'
  }

  if (lowerMessage.includes('user_profiles.role is not admin')) {
    return 'This account does not have admin access.'
  }

  if (lowerMessage.includes('supabase') && lowerMessage.includes('missing')) {
    return 'Supabase configuration is missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  }

  return message || fallback
}

export async function withTimeout(operation, timeoutMs = DEFAULT_TIMEOUT_MS, label = 'Request') {
  let timerId

  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timerId) clearTimeout(timerId)
  }
}

export async function withRetry(operation, options = {}) {
  const {
    retries = DEFAULT_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    label = 'Request',
    onRetry
  } = options

  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) {
        console.info('[auth] retrying request', {
          label,
          attempt: attempt + 1,
          totalAttempts: retries + 1
        })
      }

      return await withTimeout(operation, timeoutMs, label)
    } catch (error) {
      lastError = error
      const retryable = isRetryableAuthError(error)
      const canRetry = retryable && attempt < retries

      console.warn('[auth] request failed', {
        label,
        attempt: attempt + 1,
        totalAttempts: retries + 1,
        retryable,
        message: getErrorMessage(error)
      })

      if (!canRetry) {
        throw error
      }

      const delayMs = RETRY_BASE_DELAY_MS * (attempt + 1)
      onRetry?.({ attempt: attempt + 1, delayMs, error })
      await sleep(delayMs)
    }
  }

  throw lastError || new Error(`${label} failed`)
}
