-- Fix RLS for admin content creation in existing surveys.
-- This covers both celebrities and celebrity_photos.

alter table if exists public.celebrities enable row level security;
alter table if exists public.celebrity_photos enable row level security;

-- Celebrities policies
drop policy if exists "public read celebrities" on public.celebrities;
drop policy if exists "admin write celebrities" on public.celebrities;
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
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrities_update_admin"
on public.celebrities
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrities_delete_admin"
on public.celebrities
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

-- Celebrity photos policies
drop policy if exists "public read photos" on public.celebrity_photos;
drop policy if exists "admin write photos" on public.celebrity_photos;
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
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrity_photos_update_admin"
on public.celebrity_photos
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "celebrity_photos_delete_admin"
on public.celebrity_photos
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);
