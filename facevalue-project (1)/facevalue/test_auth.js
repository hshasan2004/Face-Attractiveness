import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val.length > 0) acc[key.trim()] = val.join('=').trim();
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

const email = 'hshasan2004@gmail.com';
const password = 'admin123';

async function run() {
    console.log('Attempting SignIn...');
    let { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        console.log('SignIn failed:', error.message);
        if (error.message.includes('Invalid login credentials') || error.message.includes('Email not confirmed')) {
            console.log('Attempting SignUp...');
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ 
                email, 
                password,
                options: { data: { full_name: 'Hasan' } }
            });

            if (signUpError) {
                console.error('SignUp failed:', signUpError.message);
                process.exit(1);
            }
            
            if (signUpData.user && signUpData.session === null) {
                console.log('SignUp initiated, but email confirmation is required.');
                process.exit(1);
            }

            console.log('SignUp successful. Waiting for a few seconds...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            console.log('Retrying SignIn...');
            const retry = await supabase.auth.signInWithPassword({ email, password });
            if (retry.error) {
                console.error('Retry SignIn failed:', retry.error.message);
                process.exit(1);
            }
            data = retry.data;
        } else {
            process.exit(1);
        }
    }

    const user = data.user;
    console.log('Signed in as:', user.id);

    console.log('Upserting profile...');
    const { error: upsertError } = await supabase
        .from('user_profiles')
        .upsert({
            id: user.id,
            email: user.email,
            role: 'admin',
            full_name: 'Hasan',
            first_name: 'Hasan',
            last_name: ''
        });

    if (upsertError) {
        console.error('Upsert failed:', upsertError.message);
        process.exit(1);
    }

    console.log('Reading back profile...');
    const { data: profile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('id, email, role')
        .eq('id', user.id)
        .single();

    if (fetchError) {
        console.error('Fetch failed:', fetchError.message);
        process.exit(1);
    }

    console.log('SUCCESS');
    console.log('Profile Data:', JSON.stringify(profile));
}

run();
