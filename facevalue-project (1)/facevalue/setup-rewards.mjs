import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://svvltnrmatvatayzneax.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrZGhwbHdqdWF6Y3F6a293c2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTcyOTIsImV4cCI6MjA5MTY3MzI5Mn0.s8-7cLIy2x3rzhOPrHJkxmYzreOI5WJHHa-og2YFXco'

const SQL_REWARDS_SCHEMA = `-- Add Rewards System (Gamification)

-- Reward tiers (Bronze, Silver, Gold, Platinum)
create table if not exists reward_tiers (
  id serial primary key,
  name text not null unique,
  min_points int not null,
  max_points int,
  badge_color text default '#8B7355',
  description text,
  created_at timestamptz default now()
);

-- Insert default tiers
insert into reward_tiers (name, min_points, max_points, badge_color, description) values
  ('Bronze', 0, 999, '#CD7F32', 'Entry level evaluator'),
  ('Silver', 1000, 4999, '#C0C0C0', 'Experienced evaluator'),
  ('Gold', 5000, 9999, '#FFD700', 'Expert evaluator'),
  ('Platinum', 10000, null, '#E5E4E1', 'Master evaluator')
on conflict (name) do nothing;

-- User rewards tracking
create table if not exists user_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade unique,
  total_points int default 0,
  current_tier text default 'Bronze' references reward_tiers(name),
  total_ratings int default 0,
  total_surveys_completed int default 0,
  current_streak int default 0,
  best_streak int default 0,
  last_rating_date timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Achievement definitions
create table if not exists achievements (
  id serial primary key,
  slug text not null unique,
  title text not null,
  description text,
  icon text,
  points_reward int default 50,
  condition text,
  created_at timestamptz default now()
);

-- Insert default achievements
insert into achievements (slug, title, description, icon, points_reward, condition) values
  ('first_rate', 'First Rating', 'Complete your first rating', '⭐', 10, 'First rating submitted'),
  ('rate_10', '10 Ratings', 'Submit 10 ratings', '🔟', 50, 'total_ratings >= 10'),
  ('rate_50', '50 Ratings', 'Submit 50 ratings', '5️⃣0️⃣', 100, 'total_ratings >= 50'),
  ('rate_100', '100 Ratings', 'Submit 100 ratings', '💯', 150, 'total_ratings >= 100'),
  ('rate_500', '500 Ratings', 'Submit 500 ratings', '5️⃣', 300, 'total_ratings >= 500'),
  ('survey_complete', 'Survey Master', 'Complete an entire survey', '🏆', 200, 'survey completed'),
  ('streak_7', '7-Day Streak', 'Rate photos on 7 consecutive days', '🔥', 100, 'streak >= 7'),
  ('streak_30', '30-Day Streak', 'Rate photos on 30 consecutive days', '⚡', 300, 'streak >= 30'),
  ('consistent_rater', 'Consistent Rater', 'Average 4+ rating per session', '✓', 120, 'avg_rating >= 4'),
  ('speed_demon', 'Speed Demon', 'Submit 100 ratings in one session', '⚡', 250, 'session_ratings >= 100')
on conflict (slug) do nothing;

-- User achievement tracking
create table if not exists user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  achievement_id int not null references achievements on delete cascade,
  earned_at timestamptz default now(),
  unique(user_id, achievement_id)
);

-- Reward transaction log
create table if not exists reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  points int not null,
  transaction_type text not null default 'rating', -- rating, survey_complete, achievement, bonus
  related_id uuid,
  description text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table user_rewards enable row level security;
alter table user_achievements enable row level security;
alter table reward_transactions enable row level security;
alter table achievements enable row level security;
alter table reward_tiers enable row level security;

-- RLS Policies
drop policy if exists "own rewards" on user_rewards;
drop policy if exists "admin view all rewards" on user_rewards;
drop policy if exists "own achievements" on user_achievements;
drop policy if exists "admin view achievements" on user_achievements;
drop policy if exists "own transactions" on reward_transactions;
drop policy if exists "admin view transactions" on reward_transactions;
drop policy if exists "public read achievements" on achievements;
drop policy if exists "public read tiers" on reward_tiers;

create policy "own rewards" on user_rewards
  for all using (auth.uid() = user_id);
create policy "admin view all rewards" on user_rewards
  for select using (public.is_admin());

create policy "own achievements" on user_achievements
  for all using (auth.uid() = user_id);
create policy "admin view achievements" on user_achievements
  for select using (public.is_admin());

create policy "own transactions" on reward_transactions
  for select using (auth.uid() = user_id);
create policy "admin view transactions" on reward_transactions
  for select using (public.is_admin());

create policy "public read achievements" on achievements
  for select using (true);

create policy "public read tiers" on reward_tiers
  for select using (true);

-- Helper function to update tier based on points
create or replace function update_user_tier()
returns trigger as $$
begin
  update user_rewards
  set current_tier = (
    select name from reward_tiers
    where min_points <= new.total_points
    order by min_points desc
    limit 1
  )
  where user_id = new.user_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_update_tier on user_rewards;
create trigger trigger_update_tier
after update on user_rewards
for each row
execute function update_user_tier();

-- Helper function to add points and create transaction
create or replace function add_reward_points(
  p_user_id uuid,
  p_points int,
  p_type text default 'rating',
  p_description text default null,
  p_related_id uuid default null
)
returns void as $$
begin
  -- Ensure user_rewards record exists
  insert into user_rewards (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  
  -- Add points
  update user_rewards
  set total_points = total_points + p_points,
      updated_at = now()
  where user_id = p_user_id;
  
  -- Log transaction
  insert into reward_transactions (user_id, points, transaction_type, description, related_id)
  values (p_user_id, p_points, p_type, p_description, p_related_id);
end;
$$ language plpgsql security definer;

-- Helper function to record a rating for points
create or replace function record_rating_points(p_user_id uuid)
returns void as $$
begin
  perform add_reward_points(p_user_id, 10, 'rating', 'Points for rating a photo');
  
  update user_rewards
  set total_ratings = total_ratings + 1,
      last_rating_date = now()
  where user_id = p_user_id;
end;
$$ language plpgsql security definer;`

async function setupRewards() {
  try {
    console.log('🔗 Connecting to Supabase...')
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    })

    console.log('📊 Running rewards schema SQL...')
    const { error } = await supabase.rpc('sql_exec', { 
      sql: SQL_REWARDS_SCHEMA 
    }).catch(async () => {
      // If rpc doesn't work, we need to use a different approach
      console.log('⚠️ RPC method not available, using direct query...')
      
      // Split into individual statements and execute
      const statements = SQL_REWARDS_SCHEMA.split(';').filter(s => s.trim())
      
      for (const statement of statements) {
        if (!statement.trim()) continue
        
        try {
          const { error } = await supabase
            .from('_internal')
            .select('1')
            .then(() => ({ error: null }))
            .catch(e => ({ error: e }))
          
          // Can't execute arbitrary SQL this way, need auth.admin
          console.warn('Cannot execute arbitrary SQL with anon key')
          break
        } catch (e) {
          console.error('Error:', e.message)
        }
      }
      
      return { error: new Error('Need service role key to execute SQL') }
    })

    if (error) {
      throw error
    }

    console.log('✅ Rewards schema created successfully!')
    console.log('🎉 Database setup complete!')
    console.log('\n📋 Created tables:')
    console.log('  - reward_tiers (Bronze, Silver, Gold, Platinum)')
    console.log('  - user_rewards (tracks points, tier, streaks)')
    console.log('  - achievements (10 built-in achievements)')
    console.log('  - user_achievements (user achievement tracking)')
    console.log('  - reward_transactions (activity log)')
    console.log('\n⚙️ Helper functions:')
    console.log('  - add_reward_points()')
    console.log('  - record_rating_points()')
    console.log('  - update_user_tier()')

  } catch (error) {
    console.error('❌ Error setting up rewards:', error.message)
    console.log('\n⚠️ Anon key limitation detected.')
    console.log('Please use the Supabase dashboard to run the SQL manually.')
  }
}

setupRewards()
