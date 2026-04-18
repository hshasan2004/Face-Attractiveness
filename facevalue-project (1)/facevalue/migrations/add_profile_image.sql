-- Migration: Add profile_image column to celebrities table
-- Date: 2026-04-17
-- Description: Add profile_image column to store celebrity profile pictures

-- Add profile_image column if it doesn't exist
ALTER TABLE IF EXISTS celebrities
ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- Add comment for documentation
COMMENT ON COLUMN celebrities.profile_image IS 'URL of the celebrity profile image (e.g., first uploaded photo)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_celebrities_profile_image ON celebrities(profile_image) WHERE profile_image IS NOT NULL;

-- Optional: Backfill profile_image with first available photo for existing celebrities
-- This query uses window functions to get the first photo per celebrity
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
  SELECT 1 FROM celebrity_photos cp WHERE cp.celebrity_id = c.id
);

-- Verify the changes
SELECT id, name, profile_image FROM celebrities LIMIT 10;
