-- ============================================
-- PERFORMANCE INDEX & POLICY OPTIMIZATION
-- ============================================
-- Run this in Supabase SQL Editor for production tuning.
-- Safe to run multiple times.

-- Core lookup/index paths used by auth + survey flow
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

CREATE INDEX IF NOT EXISTS idx_survey_assignments_survey_user
  ON public.survey_assignments(survey_id, user_id);
CREATE INDEX IF NOT EXISTS idx_survey_assignments_user_status
  ON public.survey_assignments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_celebrities_survey_id
  ON public.celebrities(survey_id);

CREATE INDEX IF NOT EXISTS idx_celebrity_photos_celebrity_order_created
  ON public.celebrity_photos(celebrity_id, display_order, created_at);

CREATE INDEX IF NOT EXISTS idx_ratings_assignment_photo
  ON public.ratings(assignment_id, photo_id);

CREATE INDEX IF NOT EXISTS idx_responses_survey_user_rated
  ON public.responses(survey_id, user_id, rated_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_user_survey
  ON public.responses(user_id, survey_id);

CREATE INDEX IF NOT EXISTS idx_surveys_active_created
  ON public.surveys(is_active, status, created_at DESC);

-- Make admin check function planner-friendly for repeated RLS evaluation.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- Optional: inspect expensive statements (requires pg_stat_statements extension enabled).
-- SELECT query, calls, total_exec_time, mean_exec_time, rows
-- FROM pg_stat_statements
-- ORDER BY total_exec_time DESC
-- LIMIT 25;
