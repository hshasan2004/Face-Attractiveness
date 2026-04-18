import{r as t,j as e}from"./index-DSPdh0hs.js";const b=`-- FACEVALUE DATABASE SCHEMA
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
  for all using (public.is_admin());

alter table celebrity_photos enable row level security;
create policy "public read photos" on celebrity_photos for select using (true);
create policy "admin write photos" on celebrity_photos
  for all using (public.is_admin());

alter table surveys enable row level security;
create policy "public read surveys" on surveys for select using (true);
create policy "admin write surveys" on surveys
  for all using (public.is_admin());

alter table user_profiles enable row level security;
create policy "own profile" on user_profiles for all using (auth.uid() = id);
create policy "admin read profiles" on user_profiles
  for select using (public.is_admin());`,h=`-- Add survey_id to celebrities (required by this app)
alter table celebrities
  add column if not exists survey_id uuid references surveys(id) on delete cascade;

-- Link existing rows to your oldest survey (change if you use multiple surveys)
update celebrities c
set survey_id = (select id from surveys order by created_at asc limit 1)
where c.survey_id is null
  and exists (select 1 from surveys);

-- Optional: require a survey for every celebrity (only after backfill)
-- alter table celebrities alter column survey_id set not null;`,y=`-- Add profile_image to celebrities (used in leaderboard and result cards)
alter table celebrities
  add column if not exists profile_image text;`,f=`-- Backfill profile_image from the first uploaded photo for each celebrity
update celebrities c
set profile_image = (
  select cp.storage_path
  from celebrity_photos cp
  where cp.celebrity_id = c.id
  order by cp.display_order asc, cp.created_at asc
  limit 1
)
where c.profile_image is null;`,g=`-- Enable realtime inserts for ratings so the Results board updates live
alter publication supabase_realtime add table public.ratings;`,x=`-- If surveys is missing status or is_active (schema cache errors)
alter table surveys add column if not exists status text default 'draft';
alter table surveys add column if not exists is_active boolean default false;

update surveys set is_active = (coalesce(status, 'draft') = 'active');
update surveys set status = case
  when is_active then 'active'
  else coalesce(nullif(status, 'active'), 'draft')
end;`,v=`do $$
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
-- alter table surveys drop column if exists celebrity2_id;`,S=`-- Run in Supabase SQL Editor (as project owner / postgres)

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
using (bucket_id = 'celebrity-photos' and auth.role() = 'authenticated');`,w=`-- Requires public.celebrities to exist. If this fails, run the full schema from "Full SQL Schema" above.

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
on public.celebrity_photos for all
using (
  exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin')
);`,j=`-- Add Rewards System (Gamification)

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
$$ language plpgsql security definer;`,q=[{n:1,title:"Create a Supabase Project",desc:"Go to supabase.com → New Project. Choose a region close to your users (e.g. Southeast Asia). Save your database password."},{n:2,title:"Run the SQL Schema",desc:"Go to SQL Editor → New Query. Copy the schema below, paste it in, and click Run.",hasSQL:!0},{n:3,title:"Configure Environment Variables",desc:"Copy your Project URL and anon key from Settings → API. Add them to your .env.local file.",code:`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`},{n:4,title:"Create Storage Bucket",desc:'In Supabase → Storage → New bucket. Name it exactly: celebrity-photos. Enable "Public bucket" toggle. If you use another name, set VITE_STORAGE_BUCKET in .env.local to match.',code:"VITE_STORAGE_BUCKET=celebrity-photos"},{n:5,title:"Enable Email Authentication",desc:"In Supabase → Authentication → Providers → Email → Enable. Optionally disable email confirmation for testing."},{n:6,title:"Create Admin User",desc:'Register at /login. Then in Table Editor → user_profiles → find your row → change the role column to "admin". You can now log in via the Admin tab.'}];function O(){const[s,a]=t.useState(!1),[E,r]=t.useState(!1),[C,n]=t.useState(!1),[k,o]=t.useState(!1),[L,l]=t.useState(!1),[T,c]=t.useState(!1),[R,d]=t.useState(!1),[B,u]=t.useState(!1),[I,p]=t.useState(!1),[N,m]=t.useState(!1);function _(){navigator.clipboard.writeText(b),a(!0),setTimeout(()=>a(!1),2e3)}function A(){navigator.clipboard.writeText(h),r(!0),setTimeout(()=>r(!1),2e3)}function z(){navigator.clipboard.writeText(y),n(!0),setTimeout(()=>n(!1),2e3)}function Q(){navigator.clipboard.writeText(f),o(!0),setTimeout(()=>o(!1),2e3)}function P(){navigator.clipboard.writeText(g),l(!0),setTimeout(()=>l(!1),2e3)}function M(){navigator.clipboard.writeText(x),c(!0),setTimeout(()=>c(!1),2e3)}function F(){navigator.clipboard.writeText(v),d(!0),setTimeout(()=>d(!1),2e3)}function U(){navigator.clipboard.writeText(j),m(!0),setTimeout(()=>m(!1),2e3)}function $(){navigator.clipboard.writeText(S),u(!0),setTimeout(()=>u(!1),2e3)}function G(){navigator.clipboard.writeText(w),p(!0),setTimeout(()=>p(!1),2e3)}return e.jsxs("div",{children:[e.jsx("div",{className:"admin-page-header",children:e.jsxs("div",{children:[e.jsx("h2",{className:"admin-page-title",children:"DB Setup"}),e.jsx("p",{className:"admin-page-subtitle",children:"Step-by-step Supabase configuration guide"})]})}),q.map(i=>e.jsxs("div",{className:"step-card",children:[e.jsx("div",{className:"step-number",children:i.n}),e.jsxs("div",{className:"step-content",style:{flex:1},children:[e.jsx("h4",{children:i.title}),e.jsx("p",{children:i.desc}),i.code&&e.jsx("div",{className:"code-block",style:{marginTop:"12px",fontSize:"0.75rem"},children:i.code}),i.hasSQL&&e.jsx("button",{className:"btn btn-outline btn-sm",onClick:_,style:{marginTop:"12px"},children:s?"✓ Copied!":"⎘ Copy Schema SQL"})]})]},i.n)),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"},children:[e.jsx("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem"},children:"Full SQL Schema"}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:_,children:s?"✓ Copied!":"⎘ Copy"})]}),e.jsx("div",{className:"code-block",children:b})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:["Existing database: missing ",e.jsx("code",{style:{fontSize:"0.85em"},children:"celebrities.survey_id"})]}),e.jsxs("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:["If the Celebrities page shows an error about ",e.jsx("code",{children:"survey_id"})," or the schema cache, run the script below in the Supabase SQL Editor, then wait a few seconds (or refresh the Table Editor) so the API picks up the new column."]}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:A,style:{marginBottom:"12px"},children:E?"✓ Copied!":"⎘ Copy migration SQL"}),e.jsx("div",{className:"code-block",children:h})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:["Existing database: missing ",e.jsx("code",{style:{fontSize:"0.85em"},children:"celebrities.profile_image"})]}),e.jsx("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:"Run this once to store a profile image URL per celebrity. The Results leaderboard uses this value for the circular avatar beside each name."}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:z,style:{marginBottom:"12px"},children:C?"✓ Copied!":"⎘ Copy profile image migration SQL"}),e.jsx("div",{className:"code-block",children:y})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsx("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:"Optional backfill: use the first photo as the avatar"}),e.jsx("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:"If you already uploaded celebrity photos, run this after adding the column to populate avatars automatically."}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:Q,style:{marginBottom:"12px"},children:k?"✓ Copied!":"⎘ Copy profile-image backfill SQL"}),e.jsx("div",{className:"code-block",children:f})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:["Realtime: add ",e.jsx("code",{style:{fontSize:"0.85em"},children:"ratings"})," to ",e.jsx("code",{children:"supabase_realtime"})]}),e.jsx("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:"This is required for live leaderboard refreshes when new ratings are inserted. Run it once in the Supabase SQL Editor if realtime is not already enabled."}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:P,style:{marginBottom:"12px"},children:L?"✓ Copied!":"⎘ Copy realtime enable SQL"}),e.jsx("div",{className:"code-block",children:g})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:["Existing database: missing ",e.jsx("code",{style:{fontSize:"0.85em"},children:"surveys.status"})," or ",e.jsx("code",{children:"surveys.is_active"})]}),e.jsx("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:"The app supports either column. Run the script below to add both and keep them in sync, then reload the app."}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:M,style:{marginBottom:"12px"},children:T?"✓ Copied!":"⎘ Copy surveys migration SQL"}),e.jsx("div",{className:"code-block",children:x})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:["Legacy schema: ",e.jsx("code",{children:"celebrity1_id"})," / ",e.jsx("code",{children:"celebrity2_id"})," NOT NULL on ",e.jsx("code",{children:"surveys"})]}),e.jsxs("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:["If creating a survey fails with a null / not-null error on ",e.jsx("code",{children:"celebrity1_id"})," or ",e.jsx("code",{children:"celebrity2_id"}),", run the script below. This app attaches celebrities per survey via ",e.jsx("code",{children:"celebrities.survey_id"}),", not those two columns."]}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:F,style:{marginBottom:"12px"},children:R?"✓ Copied!":"⎘ Copy legacy celebrity columns fix"}),e.jsx("div",{className:"code-block",children:v})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:["Storage: create ",e.jsx("code",{children:"celebrity-photos"})," bucket (fixes “Bucket not found”)"]}),e.jsxs("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:["Run the script below in the ",e.jsx("strong",{children:"SQL Editor"})," once. It registers the public bucket and policies so logged-in admins can upload and anyone can read images. Then refresh Photo Upload."]}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:$,style:{marginBottom:"12px"},children:B?"✓ Copied!":"⎘ Copy storage bucket SQL"}),e.jsx("div",{className:"code-block",children:S})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsxs("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:["Missing table: ",e.jsx("code",{children:"public.celebrity_photos"})]}),e.jsxs("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:["If Photo Upload or the API says the ",e.jsx("code",{children:"celebrity_photos"})," table is missing from the schema cache, run the script below. You need ",e.jsx("code",{children:"celebrities"})," (and usually ",e.jsx("code",{children:"user_profiles"})," for the admin policy) already present; otherwise run the ",e.jsx("strong",{children:"Full SQL Schema"})," first."]}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:G,style:{marginBottom:"12px"},children:I?"✓ Copied!":"⎘ Copy celebrity_photos table SQL"}),e.jsx("div",{className:"code-block",children:w})]}),e.jsxs("div",{className:"card",style:{marginTop:"24px"},children:[e.jsx("h3",{style:{fontFamily:"'Syne', sans-serif",fontSize:"0.95rem",marginBottom:"8px"},children:"Add Rewards System (Gamification)"}),e.jsx("p",{style:{fontSize:"0.875rem",color:"var(--muted)",marginBottom:"16px",lineHeight:1.6},children:"Enable gamification with points, achievements, and tier progression. Users earn 10 points per rating, unlock badges for milestones (10/50/100/500 ratings), and progress through tiers (Bronze → Silver → Gold → Platinum). Run this SQL to add the rewards system tables, RLS policies, and helper functions."}),e.jsx("button",{className:"btn btn-outline btn-sm",onClick:U,style:{marginBottom:"12px"},children:N?"✓ Copied!":"⎘ Copy rewards system SQL"}),e.jsx("div",{className:"code-block",children:j})]}),"    "]})}export{O as default};
