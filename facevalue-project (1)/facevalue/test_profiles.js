import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://svvltnrmatvatayzneax.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dmx0bnJtYXR2YXRheXpuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDg2ODUsImV4cCI6MjA5MjAyNDY4NX0.w1rDevY0ctQ1YeIJ30LUUvo-Ms_cxv0sJvljmUg2NJI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'hshasan2004@gmail.com';

  console.log('Fetching user_profiles for email (if possible)...');
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id')
    .limit(1);

  if (error) {
    console.log('Error fetching user_profiles:', error.message);
  } else {
    console.log('User profiles sample data:', data);
  }
}

run();
