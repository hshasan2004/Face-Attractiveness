import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://svvltnrmatvatayzneax.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dmx0bnJtYXR2YXRheXpuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDg2ODUsImV4cCI6MjA5MjAyNDY4NX0.w1rDevY0ctQ1YeIJ30LUUvo-Ms_cxv0sJvljmUg2NJI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const timestamp = Date.now();
    const email = 'test' + timestamp + '@example.com';
    const password = 'Test123456!';

    console.log('--- Step 1: Sign Up ---');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: 'Test User',
                gender: 'male',
                age: 25
            }
        }
    });

    console.log('Has User:', !!signUpData?.user);
    console.log('Has Session:', !!signUpData?.session);
    if (signUpError) {
        console.log('Sign Up Error:', signUpError.message, '(Status: ' + signUpError.status + ')');
    }

    if (signUpData?.user) {
        console.log('--- Step 2: Upsert Profile ---');
        const profilePayload = {
            id: signUpData.user.id,
            full_name: 'Test User',
            first_name: 'Test User',
            last_name: '',
            email: email,
            gender: 'male',
            age: 25,
            role: 'user'
        };

        const { error: upsertError } = await supabase
            .from('user_profiles')
            .upsert(profilePayload, { onConflict: 'id' });

        if (upsertError) {
            console.log('Upsert Error Message:', upsertError.message);
            console.log('Upsert Error Code:', upsertError.code);
            console.log('Upsert Error Details:', upsertError.details);
        } else {
            console.log('Upsert successful');
        }
    }
}

run().catch(err => console.error('Script Error:', err));
