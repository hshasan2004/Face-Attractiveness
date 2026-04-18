/** True if this survey should be offered to participants (supports legacy `is_active` or `status`). */
export function isSurveyActive(row) {
  if (!row) return false

  const flaggedActive = row.status === 'active' || row.is_active === true
  if (!flaggedActive) return false

  // Optional time window support (new schema). If columns are absent/null, fallback to active flag only.
  const now = new Date()
  const startValue = row.start_time || row.starts_at || null
  const endValue = row.end_time || row.ends_at || null
  const start = startValue ? new Date(startValue) : null
  const end = endValue ? new Date(endValue) : null

  if (start && Number.isFinite(start.getTime()) && now < start) return false
  if (end && Number.isFinite(end.getTime()) && now > end) return false

  return true
}

/** UI status: draft | active | closed (legacy rows may only have is_active). */
export function normalizeSurveyStatus(row) {
  if (!row) return 'draft'
  if (row.status === 'active' || row.is_active === true) return 'active'
  if (row.status === 'closed') return 'closed'
  if (row.status === 'draft') return 'draft'
  return 'draft'
}
