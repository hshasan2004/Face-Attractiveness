import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isBrowser = typeof window !== 'undefined'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
} else {
  const keyPreview = `${String(supabaseAnonKey).slice(0, 8)}...`
  console.log('Supabase client initialized', { url: supabaseUrl, keyPreview })
}

if (supabaseUrl === 'https://placeholder.supabase.co' || supabaseAnonKey === 'placeholder') {
  console.error('Supabase client is using placeholder credentials. Authentication requests will fail.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
      storage: isBrowser ? window.localStorage : undefined
    }
  }
)
