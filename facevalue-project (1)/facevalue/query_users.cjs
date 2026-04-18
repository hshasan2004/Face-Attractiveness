const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local because dotenv doesn't usually load .local by default
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase URL or Anon Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function queryUsers() {
  const emails = ['hshasan2004@gmail.com', 'tanjim77@gmail.com'];
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, role')
    .in('email', emails);

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  console.log('Results:');
  console.log(JSON.stringify(data, null, 2));
}

queryUsers();
