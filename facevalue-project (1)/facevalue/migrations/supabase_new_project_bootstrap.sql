-- =============================================================
-- FACEVALUE NEW SUPABASE PROJECT BOOTSTRAP
-- =============================================================
-- Purpose:
-- 1) Preserve current SQL stack in one place.
-- 2) Recreate core schema + dynamic survey support + performance indexes.
-- 3) Safe for re-run using IF NOT EXISTS where possible.
--
-- Run order:
-- A) Execute this full file in Supabase SQL Editor.
-- B) In Supabase Dashboard, create Storage bucket: celebrity-photos (public).
-- C) Set app env vars to new project URL/key and redeploy.

-- -------------------------------------------------------------
-- Core schema
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  full_name VARCHAR(255),
  avatar_url TEXT,
  age INTEGER,
  gender VARCHAR(20),
  country VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.celebrities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  profile_image TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  bio TEXT,
  birth_date DATE,
  gender VARCHAR(20),
  profession VARCHAR(100),
  survey_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  celebrity1_id UUID REFERENCES public.celebrities(id) ON DELETE CASCADE,
  celebrity2_id UUID REFERENCES public.celebrities(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  status TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  total_votes INTEGER DEFAULT 0,
  images_per_session INTEGER DEFAULT 100,
  evaluators_needed INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.survey_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_order UUID[] DEFAULT '{}',
  current_index INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress',
  has_resumed BOOLEAN DEFAULT FALSE,
  resumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (survey_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.celebrity_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  celebrity_id UUID NOT NULL REFERENCES public.celebrities(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.survey_assignments(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES public.celebrity_photos(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, photo_id)
);

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  selected_celebrity_id UUID NOT NULL REFERENCES public.celebrities(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comments TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL UNIQUE REFERENCES public.surveys(id) ON DELETE CASCADE,
  celebrity1_votes INTEGER DEFAULT 0,
  celebrity2_votes INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  percentage_1 DECIMAL(5, 2) DEFAULT 0,
  percentage_2 DECIMAL(5, 2) DEFAULT 0,
  winner_id UUID REFERENCES public.celebrities(id) ON DELETE SET NULL,
  confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  title VARCHAR(255),
  message TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  target_table VARCHAR(50),
  target_id UUID,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- Dynamic survey support (responses table + helper RPC)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES public.celebrity_photos(id) ON DELETE CASCADE,
  rating INT CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  assignment_id UUID REFERENCES public.survey_assignments(id) ON DELETE CASCADE,
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(survey_id, user_id, photo_id)
);

CREATE OR REPLACE FUNCTION public.unrated_photo_count(p_survey_id UUID, p_user_id UUID)
RETURNS INT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM public.celebrity_photos cp
  JOIN public.celebrities c ON cp.celebrity_id = c.id
  WHERE c.survey_id = p_survey_id
    AND NOT EXISTS (
      SELECT 1 FROM public.responses r
      WHERE r.survey_id = p_survey_id
        AND r.user_id = p_user_id
        AND r.photo_id = cp.id
    );
$$;

CREATE OR REPLACE FUNCTION public.unrated_photos(p_survey_id UUID, p_user_id UUID)
RETURNS TABLE (
  id UUID,
  celebrity_id UUID,
  storage_path TEXT,
  display_order INT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.id, cp.celebrity_id, cp.storage_path, cp.display_order, cp.created_at
  FROM public.celebrity_photos cp
  JOIN public.celebrities c ON cp.celebrity_id = c.id
  WHERE c.survey_id = p_survey_id
    AND NOT EXISTS (
      SELECT 1 FROM public.responses r
      WHERE r.survey_id = p_survey_id
        AND r.user_id = p_user_id
        AND r.photo_id = cp.id
    )
  ORDER BY cp.display_order ASC, cp.created_at ASC;
$$;

-- -------------------------------------------------------------
-- RLS and role helper
-- -------------------------------------------------------------
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

ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own responses" ON public.responses;
CREATE POLICY "own responses" ON public.responses
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin read responses" ON public.responses;
CREATE POLICY "admin read responses" ON public.responses
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "admin delete responses" ON public.responses;
CREATE POLICY "admin delete responses" ON public.responses
  FOR DELETE USING (public.is_admin());

GRANT EXECUTE ON FUNCTION public.unrated_photo_count(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unrated_photos(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- -------------------------------------------------------------
-- Performance indexes
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_id_role ON public.user_profiles(id, role);

CREATE INDEX IF NOT EXISTS idx_celebrities_category_id ON public.celebrities(category_id);
CREATE INDEX IF NOT EXISTS idx_celebrities_is_active ON public.celebrities(is_active);
CREATE INDEX IF NOT EXISTS idx_celebrities_survey_id ON public.celebrities(survey_id);

CREATE INDEX IF NOT EXISTS idx_celebrity_photos_celebrity_order_created
  ON public.celebrity_photos(celebrity_id, display_order, created_at);

CREATE INDEX IF NOT EXISTS idx_surveys_is_active ON public.surveys(is_active);
CREATE INDEX IF NOT EXISTS idx_surveys_active_created ON public.surveys(is_active, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_surveys_created_by ON public.surveys(created_by);

CREATE INDEX IF NOT EXISTS idx_survey_assignments_survey_user
  ON public.survey_assignments(survey_id, user_id);
CREATE INDEX IF NOT EXISTS idx_survey_assignments_user_status
  ON public.survey_assignments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_ratings_assignment_photo ON public.ratings(assignment_id, photo_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON public.survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_user_id ON public.survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_created_at ON public.survey_responses(created_at);

CREATE INDEX IF NOT EXISTS idx_responses_survey_id ON public.responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_responses_user_id ON public.responses(user_id);
CREATE INDEX IF NOT EXISTS idx_responses_photo_id ON public.responses(photo_id);
CREATE INDEX IF NOT EXISTS idx_responses_survey_user ON public.responses(survey_id, user_id);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON public.responses(created_at);
CREATE INDEX IF NOT EXISTS idx_responses_survey_user_rated ON public.responses(survey_id, user_id, rated_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_user_survey ON public.responses(user_id, survey_id);

CREATE INDEX IF NOT EXISTS idx_results_survey_id ON public.results(survey_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON public.admin_logs(admin_id);

-- -------------------------------------------------------------
-- Realtime tables
-- -------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ratings;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.responses;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;
