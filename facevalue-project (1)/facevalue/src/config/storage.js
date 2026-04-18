/** Supabase Storage bucket for celebrity images (must match bucket name in dashboard). */
export const CELEBRITY_PHOTOS_BUCKET =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STORAGE_BUCKET?.trim()) ||
  'celebrity-photos'
