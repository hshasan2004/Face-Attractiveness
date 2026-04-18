import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://svvltnrmatvatayzneax.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dmx0bnJtYXR2YXRheXpuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDg2ODUsImV4cCI6MjA5MjAyNDY4NX0.w1rDevY0ctQ1YeIJ30LUUvo-Ms_cxv0sJvljmUg2NJI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const profileId = 'f37365ce-9451-4c7e-ac79-46132da977f3';
  console.log('Attempting to update profile ' + profileId + ' to admin...');
  
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ role: 'admin' })
    .eq('id', profileId)
    .select();

  if (error) {
    console.log('Update Error:', error.message);
  } else {
    console.log('Successfully updated profile:', data);
  }
}

run();
