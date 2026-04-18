# Supabase Project Shift Plan

This project now has a saved SQL bootstrap bundle so you can shift to a new Supabase project safely.

## Saved SQL Bundle

- [migrations/supabase_new_project_bootstrap.sql](migrations/supabase_new_project_bootstrap.sql)

## Existing SQL Sources (kept intact)

- [database_setup.sql](database_setup.sql)
- [migrations/enable_dynamic_surveys.sql](migrations/enable_dynamic_surveys.sql)
- [migrations/optimize_performance_indexes.sql](migrations/optimize_performance_indexes.sql)

## Shift Steps

1. Create a new Supabase project.
2. Open SQL Editor and run [migrations/supabase_new_project_bootstrap.sql](migrations/supabase_new_project_bootstrap.sql).
3. In Storage, create bucket celebrity-photos as a public bucket.
4. In Authentication, enable Email provider.
5. Add your admin user in user_profiles by setting role=admin.
6. Update environment variables in .env.local:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
7. Deploy app again with npm run deploy.
8. Smoke test:
   - User login
   - Admin login
   - Survey load
   - Submit rating
   - Results page

## Notes

- The SQL bundle uses IF NOT EXISTS for safer re-runs.
- If a policy already exists, the script drops and recreates known response policies.
- If your existing project data must be migrated, export/import data table by table after schema creation.
