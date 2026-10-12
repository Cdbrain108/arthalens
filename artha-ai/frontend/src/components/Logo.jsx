import { useState } from 'react'

/**
 * Stock Research Brand Logo
 * Features:
 * - Master visual identity: Green bull & red bear facing central golden target with market charts & globe
 * - Seamless responsive rendering from 16px to 128px
 * - Graceful fallback to crisp vector SVG mark
 */
export default function Logo({ size = 32, className = '', label = '', variant = 'emblem' }) {
  const [imgError, setImgError] = useState(false)
  const id = `logo-mark-${size}`

  if (variant !== 'vector' && !imgError) {
    return (
      <img
        src="/brand/stock-research-emblem.png"
        alt={label || 'Stock Research'}
        width={size}
        height={size}
        onError={() => setImgError(true)}
        draggable={false}
        className={`inline-block shrink-0 rounded-full object-cover shadow-sm transition-transform duration-200 hover:scale-105 ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          aspectRatio: '1 / 1',
        }}
      />
    )
  }

  // Precision Companion Vector Mark (Green Bull, Red Bear, Gold Target Reticle)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-label={label || 'Stock Research emblem'}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`shrink-0 rounded-full ${className}`}
    >
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#131720" />
          <stop offset="85%" stopColor="#0a0c10" />
          <stop offset="100%" stopColor="#050608" />
        </radialGradient>
        <linearGradient id={`gold-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        <linearGradient id={`green-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <linearGradient id={`red-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      {/* Dark Outer Shield Ring with Gold Accents */}
      <circle cx="32" cy="32" r="31" fill={`url(#bg-${id})`} stroke={`url(#gold-${id})`} strokeWidth="1.5" />
      <circle cx="32" cy="32" r="27.5" stroke="#3b82f6" strokeWidth="0.75" strokeDasharray="2 2" opacity="0.6" />

      {/* Globe Lat/Long grid background */}
      <ellipse cx="32" cy="32" rx="27" ry="14" stroke="#1d4ed8" strokeWidth="0.5" opacity="0.4" />
      <line x1="32" y1="4" x2="32" y2="60" stroke="#1d4ed8" strokeWidth="0.5" opacity="0.4" />

      {/* Candlestick charts subtle backdrop */}
      <g opacity="0.35">
        <line x1="22" y1="12" x2="22" y2="24" stroke="#22c55e" strokeWidth="1" />
        <rect x="20.5" y="15" width="3" height="6" fill="#22c55e" rx="0.5" />
        <line x1="28" y1="10" x2="28" y2="22" stroke="#22c55e" strokeWidth="1" />
        <rect x="26.5" y="13" width="3" height="5" fill="#22c55e" rx="0.5" />
        <line x1="36" y1="11" x2="36" y2="23" stroke="#ef4444" strokeWidth="1" />
        <rect x="34.5" y="14" width="3" height="6" fill="#ef4444" rx="0.5" />
        <line x1="42" y1="13" x2="42" y2="25" stroke="#ef4444" strokeWidth="1" />
        <rect x="40.5" y="16" width="3" height="5" fill="#ef4444" rx="0.5" />
      </g>

      {/* Left: Green Bull Silhouette & Arrow Vector */}
      <g>
        {/* Charging Bull body contour */}
        <path
          d="M13 36 C 14 31, 18 29, 23 30 C 26 31, 28 34, 28 38 C 26 41, 23 43, 19 44 C 15 44, 13 41, 13 36 Z"
          fill={`url(#green-${id})`}
          opacity="0.9"
        />
        {/* Bull Horns & Head */}
        <path
          d="M21 28 C 22 25, 25 24, 27 26 C 26 28, 24 29, 22 30 Z"
          fill="#86efac"
        />
        {/* Bull Upward Momentum Arrow */}
        <path
          d="M11 41 L 18 31 L 21 34 L 27 26"
          stroke="#4ade80"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="27,24 29,28 25,27" fill="#4ade80" />
      </g>

      {/* Right: Red Bear Silhouette & Claw Vector */}
      <g>
        {/* Rearing Bear body contour */}
        <path
          d="M51 36 C 50 31, 46 29, 41 30 C 38 31, 36 34, 36 38 C 38 41, 41 43, 45 44 C 49 44, 51 41, 51 36 Z"
          fill={`url(#red-${id})`}
          opacity="0.9"
        />
        {/* Bear Ears & Head */}
        <circle cx="43" cy="27" r="3" fill="#fca5a5" />
        {/* Bear Downward Trend Arrow */}
        <path
          d="M53 26 L 46 34 L 43 31 L 37 41"
          stroke="#f87171"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="37,43 35,39 39,40" fill="#f87171" />
      </g>

      {/* Central Golden Bullseye Target Reticle */}
      <circle cx="32" cy="32" r="10" stroke={`url(#gold-${id})`} strokeWidth="1.5" />
      <circle cx="32" cy="32" r="6" stroke={`url(#gold-${id})`} strokeWidth="1" strokeDasharray="1.5 1.5" />
      <circle cx="32" cy="32" r="2.2" fill={`url(#gold-${id})`} />

      {/* Target Reticle Crosshair ticks */}
      <line x1="32" y1="18" x2="32" y2="22" stroke={`url(#gold-${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="32" y1="42" x2="32" y2="46" stroke={`url(#gold-${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="18" y1="32" x2="22" y2="32" stroke={`url(#gold-${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="42" y1="32" x2="46" y2="32" stroke={`url(#gold-${id})`} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
