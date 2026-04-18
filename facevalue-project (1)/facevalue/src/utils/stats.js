/** Average rating for display (2 decimal places) or "N/A". */
export function meanRating(arr) {
  if (!arr?.length) return 'N/A'
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)
}

/** Numeric mean for chart series; 0 when empty. */
export function meanNumber(arr) {
  if (!arr?.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}
