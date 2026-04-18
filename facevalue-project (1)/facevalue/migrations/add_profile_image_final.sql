-- Migration Script: Add profile_image Column
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/svvltnrmatvatayzneax/sql/new

-- ========================================
-- STEP 1: Add profile_image column
-- ========================================
ALTER TABLE IF EXISTS celebrities
ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- ========================================
-- STEP 2: Add documentation comment
-- ========================================
COMMENT ON COLUMN celebrities.profile_image 
IS 'URL of the celebrity profile image - typically the first uploaded photo';

-- ========================================
-- STEP 3: Create index for performance
-- ========================================
CREATE INDEX IF NOT EXISTS idx_celebrities_profile_image 
ON celebrities(profile_image) 
WHERE profile_image IS NOT NULL;

-- ========================================
-- STEP 4: Backfill with existing photos
-- ========================================
-- This automatically assigns the first photo of each celebrity
-- to their profile_image field
UPDATE celebrities c
SET profile_image = (
  SELECT cp.storage_path
  FROM celebrity_photos cp
  WHERE cp.celebrity_id = c.id
  ORDER BY cp.display_order ASC, cp.created_at ASC
  LIMIT 1
)
WHERE c.profile_image IS NULL
AND EXISTS (
  SELECT 1 FROM celebrity_photos cp 
  WHERE cp.celebrity_id = c.id
);

-- ========================================
-- STEP 5: Verify the migration
-- ========================================
-- Run this to see results
SELECT 
  name,
  gender,
  profile_image,
  CASE WHEN profile_image IS NOT NULL THEN 'HAS IMAGE' ELSE 'NO IMAGE' END as status
FROM celebrities
ORDER BY created_at DESC
LIMIT 20;
