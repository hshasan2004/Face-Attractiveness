import { useState } from 'react'

const SQL_SCHEMA = `-- FACEVALUE DATABASE SCHEMA
-- Run in Supabase SQL Editor

create table surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  images_per_session int default 100,
  evaluators_needed int default 30,
  status text default 'draft',
  is_active boolean default false,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

create table celebrities (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid references surveys on delete cascade,
  name text not null,
  gender text not null,
  profile_image text,
  created_at timestamptz default now()
);

create table celebrity_photos (
  id uuid primary key default gen_random_uuid(),
  celebrity_id uuid references celebrities on delete cascade,
  storage_path text not null,
  display_order int default 0,
  created_at timestamptz default now()
);

create table user_profiles (
  id uuid primary key references auth.users,
  full_name text,
  gender text,
  age int,
  role text default 'user',
  created_at timestamptz default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create table survey_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid references surveys,
  user_id uuid references auth.users,
  image_order jsonb,
  current_index int default 0,
  status text default 'in_progress',
  assigned_at timestamptz default now(),
  completed_at timestamptz,
  unique(survey_id, user_id)
);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references survey_assignments,
  photo_id uuid references celebrity_photos,
  rating int check (rating between 1 and 5),
  rated_at timestamptz default now(),
  unique(assignment_id, photo_id)
);

alter publication supabase_realtime add table ratings;

-- RLS Policies
alter table survey_assignments enable row level security;
create policy "own assignment" on survey_assignments
  for all using (auth.uid() = user_id);

alter table ratings enable row level security;
create policy "own ratings" on ratings
  for all using (
    assignment_id in (select id from survey_assignments where user_id = auth.uid())
  );
create policy "admin all ratings" on ratings
  for all using (
    public.is_admin()
  );

alter table celebrities enable row level security;
create policy "public read celebrities" on celebrities for select using (true);
create policy "admin write celebrities" on celebrities
  for insert with check (public.is_admin());
create policy "admin update celebrities" on celebrities
  for update using (public.is_admin()) with check (public.is_admin());
create policy "admin delete celebrities" on celebrities
  for delete using (public.is_admin());

alter table celebrity_photos enable row level security;
create policy "public read photos" on celebrity_photos for select using (true);
create policy "admin write photos" on celebrity_photos
  for insert with check (public.is_admin());
create policy "admin update photos" on celebrity_photos
  for update using (public.is_admin()) with check (public.is_admin());
create policy "admin delete photos" on celebrity_photos
  for delete using (public.is_admin());

alter table surveys enable row level security;
create policy "public read surveys" on surveys for select using (true);
create policy "admin write surveys" on surveys
  for all using (public.is_admin());

alter table user_profiles enable row level security;
create policy "own profile" on user_profiles for all using (auth.uid() = id);
create policy "admin read profiles" on user_profiles
  for select using (public.is_admin());`

// Run in Supabase SQL Editor if celebrities exists but has no survey_id (PostgREST "schema cache" error).
const SQL_MIGRATE_CELEBRITIES_SURVEY_ID = `-- Add survey_id to celebrities (required by this app)
alter table celebrities
  add column if not exists survey_id uuid references surveys(id) on delete cascade;

-- Link existing rows to your oldest survey (change if you use multiple surveys)
update celebrities c
set survey_id = (select id from surveys order by created_at asc limit 1)
where c.survey_id is null
  and exists (select 1 from surveys);

-- Optional: require a survey for every celebrity (only after backfill)
-- alter table celebrities alter column survey_id set not null;`

const SQL_MIGRATE_CELEBRITIES_PROFILE_IMAGE = `-- Add profile_image to celebrities (used in leaderboard and result cards)
alter table celebrities
  add column if not exists profile_image text;`

const SQL_BACKFILL_CELEBRITIES_PROFILE_IMAGE = `-- Backfill profile_image from the first uploaded photo for each celebrity
update celebrities c
set profile_image = (
  select cp.storage_path
  from celebrity_photos cp
  where cp.celebrity_id = c.id
  order by cp.display_order asc, cp.created_at asc
  limit 1
)
where c.profile_image is null;`

const SQL_ENABLE_RATINGS_REALTIME = `-- Enable realtime inserts for ratings so the Results board updates live
alter publication supabase_realtime add table public.ratings;`

const SQL_MIGRATE_SURVEYS_COLUMNS = `-- If surveys is missing status or is_active (schema cache errors)
alter table surveys add column if not exists status text default 'draft';
alter table surveys add column if not exists is_active boolean default false;

update surveys set is_active = (coalesce(status, 'draft') = 'active');
update surveys set status = case
  when is_active then 'active'
  else coalesce(nullif(status, 'active'), 'draft')
end;`

// Old schemas required celebrity1_id + celebrity2_id on every survey row. This app does not use them.
const SQL_MIGRATE_SURVEYS_LEGACY_CELEBRITY_IDS = `do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'surveys' and column_name = 'celebrity1_id'
  ) then
    execute 'alter table surveys alter column celebrity1_id drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'surveys' and column_name = 'celebrity2_id'
  ) then
    execute 'alter table surveys alter column celebrity2_id drop not null';
  end if;
end $$;

-- Optional: drop the unused columns after the above (uncomment if you want a cleaner table)
-- alter table surveys drop column if exists celebrity1_id;
-- alter table surveys drop column if exists celebrity2_id;`

// Creates bucket + RLS policies (fixes "Bucket not found" without using the Storage UI).
const SQL_STORAGE_CELEBRITY_PHOTOS_BUCKET = `-- Run in Supabase SQL Editor (as project owner / postgres)

insert into storage.buckets (id, name, public)
values ('celebrity-photos', 'celebrity-photos', true)
on conflict (id) do update set public = excluded.public, name = excluded.name;

drop policy if exists "celebrity_photos_public_read" on storage.objects;
drop policy if exists "celebrity_photos_auth_insert" on storage.objects;
drop policy if exists "celebrity_photos_auth_update" on storage.objects;
drop policy if exists "celebrity_photos_auth_delete" on storage.objects;

create policy "celebrity_photos_public_read"
on storage.objects for select
using (bucket_id = 'celebrity-photos');

create policy "celebrity_photos_auth_insert"
on storage.objects for insert
with check (bucket_id = 'celebrity-photos' and auth.role() = 'authenticated');

create policy "celebrity_photos_auth_update"
on storage.objects for update
using (bucket_id = 'celebrity-photos' and auth.role() = 'authenticated');

create policy "celebrity_photos_auth_delete"
on storage.objects for delete
using (bucket_id = 'celebrity-photos' and auth.role() = 'authenticated');`

// Missing celebrity_photos table (PostgREST "schema cache" / table not found).
const SQL_MIGRATE_CELEBRITY_PHOTOS_TABLE = `-- Requires public.celebrities to exist. If this fails, run the full schema from "Full SQL Schema" above.

create table if not exists public.celebrity_photos (
  id uuid primary key default gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  storage_path text not null,
  display_order int default 0,
  created_at timestamptz default now()
);

alter table public.celebrity_photos enable row level security;

drop policy if exists "public read photos" on public.celebrity_photos;
drop policy if exists "admin write photos" on public.celebrity_photos;

create policy "public read photos"
on public.celebrity_photos for select
using (true);

create policy "admin write photos"
on public.celebrity_photos for insert
with check (
  exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin update photos"
on public.celebrity_photos for update
using (
  exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin delete photos"
on public.celebrity_photos for delete
using (
  exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin')
);`

const SQL_FIX_CELEBRITY_PHOTOS_RLS = `-- Fix "new row violates row-level security policy" on public.celebrity_photos

alter table if exists public.celebrity_photos enable row level security;

drop policy if exists "public read photos" on public.celebrity_photos;
drop policy if exists "admin write photos" on public.celebrity_photos;
drop policy if exists "celebrity_photos_select_authenticated" on public.celebrity_photos;
drop policy if exists "celebrity_photos_insert_admin" on public.celebrity_photos;
drop policy if exists "celebrity_photos_update_admin" on public.celebrity_photos;
drop policy if exists "celebrity_photos_delete_admin" on public.celebrity_photos;

create policy "celebrity_photos_select_authenticated"
on public.celebrity_photos for select
to authenticated
using (true);

create policy "celebrity_photos_insert_admin"
on public.celebrity_photos for insert
to authenticated
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrity_photos_update_admin"
on public.celebrity_photos for update
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrity_photos_delete_admin"
on public.celebrity_photos for delete
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);`

const SQL_FIX_ADMIN_CONTENT_RLS = `-- Fix admin inserts on both public.celebrities and public.celebrity_photos

alter table if exists public.celebrities enable row level security;
alter table if exists public.celebrity_photos enable row level security;

drop policy if exists "public read celebrities" on public.celebrities;
drop policy if exists "admin write celebrities" on public.celebrities;
drop policy if exists "admin update celebrities" on public.celebrities;
drop policy if exists "admin delete celebrities" on public.celebrities;
drop policy if exists "celebrities_select_authenticated" on public.celebrities;
drop policy if exists "celebrities_insert_admin" on public.celebrities;
drop policy if exists "celebrities_update_admin" on public.celebrities;
drop policy if exists "celebrities_delete_admin" on public.celebrities;

create policy "celebrities_select_authenticated"
on public.celebrities
for select
to authenticated
using (true);

create policy "celebrities_insert_admin"
on public.celebrities
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrities_update_admin"
on public.celebrities
for update
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrities_delete_admin"
on public.celebrities
for delete
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

drop policy if exists "public read photos" on public.celebrity_photos;
drop policy if exists "admin write photos" on public.celebrity_photos;
drop policy if exists "admin update photos" on public.celebrity_photos;
drop policy if exists "admin delete photos" on public.celebrity_photos;
drop policy if exists "celebrity_photos_select_authenticated" on public.celebrity_photos;
drop policy if exists "celebrity_photos_insert_admin" on public.celebrity_photos;
drop policy if exists "celebrity_photos_update_admin" on public.celebrity_photos;
drop policy if exists "celebrity_photos_delete_admin" on public.celebrity_photos;

create policy "celebrity_photos_select_authenticated"
on public.celebrity_photos
for select
to authenticated
using (true);

create policy "celebrity_photos_insert_admin"
on public.celebrity_photos
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrity_photos_update_admin"
on public.celebrity_photos
for update
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrity_photos_delete_admin"
on public.celebrity_photos
for delete
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);`

// Rewards system tables for gamification
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

const steps = [
  { n: 1, title: 'Create a Supabase Project', desc: 'Go to supabase.com → New Project. Choose a region close to your users (e.g. Southeast Asia). Save your database password.' },
  { n: 2, title: 'Run the SQL Schema', desc: 'Go to SQL Editor → New Query. Copy the schema below, paste it in, and click Run.', hasSQL: true },
  { n: 3, title: 'Configure Environment Variables', desc: 'Copy your Project URL and anon key from Settings → API. Add them to your .env.local file.', code: 'VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key' },
  { n: 4, title: 'Create Storage Bucket', desc: 'In Supabase → Storage → New bucket. Name it exactly: celebrity-photos. Enable "Public bucket" toggle. If you use another name, set VITE_STORAGE_BUCKET in .env.local to match.', code: 'VITE_STORAGE_BUCKET=celebrity-photos' },
  { n: 5, title: 'Enable Email Authentication', desc: 'In Supabase → Authentication → Providers → Email → Enable. Optionally disable email confirmation for testing.' },
  { n: 6, title: 'Create Admin User', desc: 'Register at /login. Then in Table Editor → user_profiles → find your row → change the role column to "admin". You can now log in via the Admin tab.' },
]

export default function DBSetup() {
  const [copied, setCopied] = useState(false)
  const [copiedMigrate, setCopiedMigrate] = useState(false)
  const [copiedProfileImageMigrate, setCopiedProfileImageMigrate] = useState(false)
  const [copiedBackfillProfileImage, setCopiedBackfillProfileImage] = useState(false)
  const [copiedRatingsRealtime, setCopiedRatingsRealtime] = useState(false)
  const [copiedSurveysMigrate, setCopiedSurveysMigrate] = useState(false)
  const [copiedLegacyCelebMigrate, setCopiedLegacyCelebMigrate] = useState(false)
  const [copiedStorageSql, setCopiedStorageSql] = useState(false)
  const [copiedCelebPhotosTable, setCopiedCelebPhotosTable] = useState(false)
  const [copiedCelebPhotosRls, setCopiedCelebPhotosRls] = useState(false)
  const [copiedAdminContentRls, setCopiedAdminContentRls] = useState(false)
  const [copiedRewardsSql, setCopiedRewardsSql] = useState(false)

  function copySQL() {
    navigator.clipboard.writeText(SQL_SCHEMA)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyMigrateSQL() {
    navigator.clipboard.writeText(SQL_MIGRATE_CELEBRITIES_SURVEY_ID)
    setCopiedMigrate(true)
    setTimeout(() => setCopiedMigrate(false), 2000)
  }

  function copyProfileImageMigrateSQL() {
    navigator.clipboard.writeText(SQL_MIGRATE_CELEBRITIES_PROFILE_IMAGE)
    setCopiedProfileImageMigrate(true)
    setTimeout(() => setCopiedProfileImageMigrate(false), 2000)
  }

  function copyBackfillProfileImageSQL() {
    navigator.clipboard.writeText(SQL_BACKFILL_CELEBRITIES_PROFILE_IMAGE)
    setCopiedBackfillProfileImage(true)
    setTimeout(() => setCopiedBackfillProfileImage(false), 2000)
  }

  function copyRatingsRealtimeSQL() {
    navigator.clipboard.writeText(SQL_ENABLE_RATINGS_REALTIME)
    setCopiedRatingsRealtime(true)
    setTimeout(() => setCopiedRatingsRealtime(false), 2000)
  }

  function copySurveysMigrateSQL() {
    navigator.clipboard.writeText(SQL_MIGRATE_SURVEYS_COLUMNS)
    setCopiedSurveysMigrate(true)
    setTimeout(() => setCopiedSurveysMigrate(false), 2000)
  }

  function copyLegacyCelebMigrateSQL() {
    navigator.clipboard.writeText(SQL_MIGRATE_SURVEYS_LEGACY_CELEBRITY_IDS)
    setCopiedLegacyCelebMigrate(true)
    setTimeout(() => setCopiedLegacyCelebMigrate(false), 2000)
  }

  function copyRewardsSQL() {
    navigator.clipboard.writeText(SQL_REWARDS_SCHEMA)
    setCopiedRewardsSql(true)
    setTimeout(() => setCopiedRewardsSql(false), 2000)
  }

  function copyStorageBucketSQL() {
    navigator.clipboard.writeText(SQL_STORAGE_CELEBRITY_PHOTOS_BUCKET)
    setCopiedStorageSql(true)
    setTimeout(() => setCopiedStorageSql(false), 2000)
  }

  function copyCelebPhotosTableSQL() {
    navigator.clipboard.writeText(SQL_MIGRATE_CELEBRITY_PHOTOS_TABLE)
    setCopiedCelebPhotosTable(true)
    setTimeout(() => setCopiedCelebPhotosTable(false), 2000)
  }

  function copyCelebPhotosRlsSQL() {
    navigator.clipboard.writeText(SQL_FIX_CELEBRITY_PHOTOS_RLS)
    setCopiedCelebPhotosRls(true)
    setTimeout(() => setCopiedCelebPhotosRls(false), 2000)
  }

  function copyAdminContentRlsSQL() {
    navigator.clipboard.writeText(SQL_FIX_ADMIN_CONTENT_RLS)
    setCopiedAdminContentRls(true)
    setTimeout(() => setCopiedAdminContentRls(false), 2000)
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">DB Setup</h2>
          <p className="admin-page-subtitle">Step-by-step Supabase configuration guide</p>
        </div>
      </div>

      {steps.map(step => (
        <div key={step.n} className="step-card">
          <div className="step-number">{step.n}</div>
          <div className="step-content" style={{ flex: 1 }}>
            <h4>{step.title}</h4>
            <p>{step.desc}</p>
            {step.code && <div className="code-block" style={{ marginTop: '12px', fontSize: '0.75rem' }}>{step.code}</div>}
            {step.hasSQL && (
              <button className="btn btn-outline btn-sm" onClick={copySQL} style={{ marginTop: '12px' }}>
                {copied ? '✓ Copied!' : '⎘ Copy Schema SQL'}
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem' }}>Full SQL Schema</h3>
          <button className="btn btn-outline btn-sm" onClick={copySQL}>{copied ? '✓ Copied!' : '⎘ Copy'}</button>
        </div>
        <div className="code-block">{SQL_SCHEMA}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Existing database: missing <code style={{ fontSize: '0.85em' }}>celebrities.survey_id</code></h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          If the Celebrities page shows an error about <code>survey_id</code> or the schema cache, run the script below in the Supabase SQL Editor, then wait a few seconds (or refresh the Table Editor) so the API picks up the new column.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyMigrateSQL} style={{ marginBottom: '12px' }}>
          {copiedMigrate ? '✓ Copied!' : '⎘ Copy migration SQL'}
        </button>
        <div className="code-block">{SQL_MIGRATE_CELEBRITIES_SURVEY_ID}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Existing database: missing <code style={{ fontSize: '0.85em' }}>celebrities.profile_image</code></h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          Run this once to store a profile image URL per celebrity. The Results leaderboard uses this value for the circular avatar beside each name.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyProfileImageMigrateSQL} style={{ marginBottom: '12px' }}>
          {copiedProfileImageMigrate ? '✓ Copied!' : '⎘ Copy profile image migration SQL'}
        </button>
        <div className="code-block">{SQL_MIGRATE_CELEBRITIES_PROFILE_IMAGE}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Optional backfill: use the first photo as the avatar</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          If you already uploaded celebrity photos, run this after adding the column to populate avatars automatically.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyBackfillProfileImageSQL} style={{ marginBottom: '12px' }}>
          {copiedBackfillProfileImage ? '✓ Copied!' : '⎘ Copy profile-image backfill SQL'}
        </button>
        <div className="code-block">{SQL_BACKFILL_CELEBRITIES_PROFILE_IMAGE}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Realtime: add <code style={{ fontSize: '0.85em' }}>ratings</code> to <code>supabase_realtime</code></h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          This is required for live leaderboard refreshes when new ratings are inserted. Run it once in the Supabase SQL Editor if realtime is not already enabled.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyRatingsRealtimeSQL} style={{ marginBottom: '12px' }}>
          {copiedRatingsRealtime ? '✓ Copied!' : '⎘ Copy realtime enable SQL'}
        </button>
        <div className="code-block">{SQL_ENABLE_RATINGS_REALTIME}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Existing database: missing <code style={{ fontSize: '0.85em' }}>surveys.status</code> or <code>surveys.is_active</code></h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          The app supports either column. Run the script below to add both and keep them in sync, then reload the app.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copySurveysMigrateSQL} style={{ marginBottom: '12px' }}>
          {copiedSurveysMigrate ? '✓ Copied!' : '⎘ Copy surveys migration SQL'}
        </button>
        <div className="code-block">{SQL_MIGRATE_SURVEYS_COLUMNS}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Legacy schema: <code>celebrity1_id</code> / <code>celebrity2_id</code> NOT NULL on <code>surveys</code></h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          If creating a survey fails with a null / not-null error on <code>celebrity1_id</code> or <code>celebrity2_id</code>, run the script below. This app attaches celebrities per survey via <code>celebrities.survey_id</code>, not those two columns.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyLegacyCelebMigrateSQL} style={{ marginBottom: '12px' }}>
          {copiedLegacyCelebMigrate ? '✓ Copied!' : '⎘ Copy legacy celebrity columns fix'}
        </button>
        <div className="code-block">{SQL_MIGRATE_SURVEYS_LEGACY_CELEBRITY_IDS}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Storage: create <code>celebrity-photos</code> bucket (fixes “Bucket not found”)</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          Run the script below in the <strong>SQL Editor</strong> once. It registers the public bucket and policies so logged-in admins can upload and anyone can read images. Then refresh Photo Upload.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyStorageBucketSQL} style={{ marginBottom: '12px' }}>
          {copiedStorageSql ? '✓ Copied!' : '⎘ Copy storage bucket SQL'}
        </button>
        <div className="code-block">{SQL_STORAGE_CELEBRITY_PHOTOS_BUCKET}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Missing table: <code>public.celebrity_photos</code></h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          If Photo Upload or the API says the <code>celebrity_photos</code> table is missing from the schema cache, run the script below. You need <code>celebrities</code> (and usually <code>user_profiles</code> for the admin policy) already present; otherwise run the <strong>Full SQL Schema</strong> first.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyCelebPhotosTableSQL} style={{ marginBottom: '12px' }}>
          {copiedCelebPhotosTable ? '✓ Copied!' : '⎘ Copy celebrity_photos table SQL'}
        </button>
        <div className="code-block">{SQL_MIGRATE_CELEBRITY_PHOTOS_TABLE}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Admin content fix for existing surveys</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          If adding a celebrity or its photos in an existing survey fails, run this block first. It replaces legacy policies and ensures both celebrity and photo inserts use <code>WITH CHECK</code> for admins.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyAdminContentRlsSQL} style={{ marginBottom: '12px' }}>
          {copiedAdminContentRls ? '✓ Copied!' : '⎘ Copy admin content RLS SQL'}
        </button>
        <div className="code-block">{SQL_FIX_ADMIN_CONTENT_RLS}</div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Fix RLS: <code>new row violates row-level security policy</code> on <code>celebrity_photos</code></h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          If photo upload fails with an RLS policy violation, run this SQL in Supabase SQL Editor. It allows authenticated users to read photos and only admin users to insert/update/delete photo rows.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyCelebPhotosRlsSQL} style={{ marginBottom: '12px' }}>
          {copiedCelebPhotosRls ? '✓ Copied!' : '⎘ Copy celebrity_photos RLS fix SQL'}
        </button>
        <div className="code-block">{SQL_FIX_CELEBRITY_PHOTOS_RLS}</div>
      </div>
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '8px' }}>Add Rewards System (Gamification)</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
          Enable gamification with points, achievements, and tier progression. Users earn 10 points per rating, unlock badges for milestones (10/50/100/500 ratings), and progress through tiers (Bronze → Silver → Gold → Platinum). Run this SQL to add the rewards system tables, RLS policies, and helper functions.
        </p>
        <button className="btn btn-outline btn-sm" onClick={copyRewardsSQL} style={{ marginBottom: '12px' }}>
          {copiedRewardsSql ? '✓ Copied!' : '⎘ Copy rewards system SQL'}
        </button>
        <div className="code-block">{SQL_REWARDS_SCHEMA}</div>
      </div>    </div>
  )
}
