import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://svvltnrmatvatayzneax.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dmx0bnJtYXR2YXRheXpuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDg2ODUsImV4cCI6MjA5MjAyNDY4NX0.w1rDevY0ctQ1YeIJ30LUUvo-Ms_cxv0sJvljmUg2NJI'

const supabase = createClient(supabaseUrl, supabaseKey)

async function runTest() {
  const timestamp = Date.now()
  const email = \	est+\@example.com\
  const password = 'Test123456!'

  console.log(\Signing up with email: \\)
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })

  console.log('--- Sign Up Result ---')
  console.log('Has User:', !!signUpData.user)
  console.log('Has Session:', !!signUpData.session)
  if (signUpError) {
    console.log('Error Message:', signUpError.message)
    console.log('Status:', signUpError.status)
    return
  }

  const user = signUpData.user
  const profileData = {
    id: user.id,
    full_name: 'Test User',
    first_name: 'Test',
    last_name: 'User',
    email: user.email,
    gender: 'Other',
    age: 25,
    role: 'user'
  }

  console.log('--- Upserting User Profile ---')
  const { error: upsertError } = await supabase
    .from('user_profiles')
    .upsert(profileData)

  console.log('--- Upsert Result ---')
  if (upsertError) {
    console.log('Error Message:', upsertError.message)
    console.log('Code:', upsertError.code)
    console.log('Details:', upsertError.details)
  } else {
    console.log('Upsert successful')
  }
}

runTest().catch(err => console.error('Caught error:', err))
