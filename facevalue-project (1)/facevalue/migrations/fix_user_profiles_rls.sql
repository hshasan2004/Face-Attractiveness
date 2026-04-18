-- user_profiles RLS policies for auth flows
-- Run this in Supabase SQL Editor for environments with RLS enabled.

alter table if exists public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
drop policy if exists "user_profiles_update_own" on public.user_profiles;
drop policy if exists "Allow insert own profile" on public.user_profiles;

create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Requested policy name variant for compatibility with external setup docs.
create policy "Allow insert own profile"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);
