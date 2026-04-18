import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://svvltnrmatvatayzneax.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dmx0bnJtYXR2YXRheXpuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDg2ODUsImV4cCI6MjA5MjAyNDY4NX0.w1rDevY0ctQ1YeIJ30LUUvo-Ms_cxv0sJvljmUg2NJI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Testing Upsert with a dummy user ID...');
    const dummyId = '00000000-0000-0000-0000-000000000000';
    const profile = {
        id: dummyId,
        full_name: 'Test Project',
        first_name: 'Test',
        last_name: 'Project',
        email: 'test@example.com',
        gender: 'Other',
        age: 30,
        role: 'user'
    };
    const { data, error } = await supabase.from('user_profiles').upsert(profile);
    console.log('Upsert Error:', JSON.stringify(error, null, 2));
    if (!error) console.log('Upsert successful');
}
run();
