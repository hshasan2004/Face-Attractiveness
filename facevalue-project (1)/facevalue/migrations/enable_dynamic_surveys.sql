-- ============================================
-- ENABLE DYNAMIC SURVEY SUPPORT
-- ============================================
-- This migration enhances the survey system to support adding photos
-- after a user has started or completed a survey.
-- 
-- Key changes:
-- 1. Add photo-level response tracking via responses table
-- 2. Enable resume logic by comparing user's rated photos with all current photos
-- 3. Maintain backwards compatibility with existing survey_assignments + ratings

-- Create responses table for granular photo-level tracking
-- This supplements the existing ratings table with survey-level context
CREATE TABLE IF NOT EXISTS responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES celebrity_photos(id) ON DELETE CASCADE,
  rating INT CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  assignment_id UUID REFERENCES survey_assignments(id) ON DELETE CASCADE,
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(survey_id, user_id, photo_id)
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_responses_survey_id ON responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses(user_id);
CREATE INDEX IF NOT EXISTS idx_responses_photo_id ON responses(photo_id);
CREATE INDEX IF NOT EXISTS idx_responses_survey_user ON responses(survey_id, user_id);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON responses(created_at);

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE responses;

-- Add column to track if assignment has been resumed
-- (useful to show "new photos added" message)
ALTER TABLE survey_assignments ADD COLUMN IF NOT EXISTS has_resumed BOOLEAN DEFAULT FALSE;
ALTER TABLE survey_assignments ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ;

-- RLS Policies for responses table
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own responses
CREATE POLICY "own responses" ON responses
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all responses
CREATE POLICY "admin read responses" ON responses
  FOR SELECT USING (public.is_admin());

-- Admins can delete responses
CREATE POLICY "admin delete responses" ON responses
  FOR DELETE USING (public.is_admin());

-- Helper function to count unrated photos for a user in a survey
CREATE OR REPLACE FUNCTION unrated_photo_count(p_survey_id UUID, p_user_id UUID)
RETURNS INT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM celebrity_photos cp
  JOIN celebrities c ON cp.celebrity_id = c.id
  WHERE c.survey_id = p_survey_id
    AND NOT EXISTS (
      SELECT 1 FROM responses r
      WHERE r.survey_id = p_survey_id
        AND r.user_id = p_user_id
        AND r.photo_id = cp.id
    );
$$;

-- Helper function to get unrated photos for a user in a survey  
CREATE OR REPLACE FUNCTION unrated_photos(p_survey_id UUID, p_user_id UUID)
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
  FROM celebrity_photos cp
  JOIN celebrities c ON cp.celebrity_id = c.id
  WHERE c.survey_id = p_survey_id
    AND NOT EXISTS (
      SELECT 1 FROM responses r
      WHERE r.survey_id = p_survey_id
        AND r.user_id = p_user_id
        AND r.photo_id = cp.id
    )
  ORDER BY cp.display_order ASC, cp.created_at ASC;
$$;

-- Drop existing functions if they exist (for idempotency)
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- Recreate is_admin function with proper error handling
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION unrated_photo_count(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unrated_photos(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
