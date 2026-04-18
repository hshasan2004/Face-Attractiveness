-- Fix RLS for public.celebrity_photos
-- Allows authenticated users to read photos and admin users to manage photos.

alter table if exists public.celebrity_photos enable row level security;

-- Clean old policies (legacy names and prior attempts)
drop policy if exists "public read photos" on public.celebrity_photos;
drop policy if exists "admin write photos" on public.celebrity_photos;
drop policy if exists "celebrity_photos_select_authenticated" on public.celebrity_photos;
drop policy if exists "celebrity_photos_insert_admin" on public.celebrity_photos;
drop policy if exists "celebrity_photos_update_admin" on public.celebrity_photos;
drop policy if exists "celebrity_photos_delete_admin" on public.celebrity_photos;

-- Read access for signed-in users (survey users + admin)
create policy "celebrity_photos_select_authenticated"
on public.celebrity_photos
for select
to authenticated
using (true);

-- Write access only for admins
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
