import { useState, memo } from 'react'

function StarRating({ value, onChange, size = 'lg', readonly = false, disabled = false, onHoverChange = null }) {
  const [hovered, setHovered] = useState(0)
  const effectiveValue = hovered || value
  const blocked = readonly || disabled

  return (
    <div className={`stars ${blocked ? 'stars-disabled' : ''}`} role="radiogroup" aria-label="Rate image from 1 to 5 stars">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          type="button"
          key={n}
          className={`star ${size === 'sm' ? 'star-sm' : ''} ${effectiveValue >= n ? 'active' : ''}`}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-checked={value === n}
          role="radio"
          disabled={blocked}
          onMouseEnter={() => {
            if (blocked) return
            setHovered(n)
            if (onHoverChange) onHoverChange(n)
          }}
          onMouseLeave={() => {
            if (blocked) return
            setHovered(0)
            if (onHoverChange) onHoverChange(0)
          }}
          onClick={() => !blocked && onChange && onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default memo(StarRating)
