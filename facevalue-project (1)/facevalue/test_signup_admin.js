import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://svvltnrmatvatayzneax.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dmx0bnJtYXR2YXRheXpuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDg2ODUsImV4cCI6MjA5MjAyNDY4NX0.w1rDevY0ctQ1YeIJ30LUUvo-Ms_cxv0sJvljmUg2NJI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'hshasan2004@gmail.com';
  const password = 'admin123';

  console.log('Attempting signInWithPassword...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.log('SignIn Error:', signInError.message, signInError.status || '');
    
    if (signInError.message === 'Invalid login credentials') {
        console.log('Trying signUp again in case user is not created...');
        const { error: signUpErr } = await supabase.auth.signUp({ email, password });
        if (signUpErr) console.log('SignUp also failed:', signUpErr.message);
    }
    return;
  }

  const user = signInData.user;
  console.log('SignIn successful. User ID:', user.id);

  console.log('Attempting to upsert user_profiles...');
  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert({ id: user.id, role: 'admin' });

  if (profileError) {
    console.log('Upsert Error:', profileError.message);
  } else {
    console.log('Successfully upserted admin role for user.');
  }
}

run();
