import { useId, useState } from 'react'
import { ArrowUpRight, ChartNoAxesCombined } from 'lucide-react'

const SERIES = {
  '1M': [24, 31, 27, 39, 32, 44, 40, 49, 38, 46, 58, 53, 67, 62, 78, 72, 88],
  '6M': [15, 23, 20, 37, 31, 26, 41, 35, 51, 48, 43, 61, 56, 72, 66, 84, 93],
  '1Y': [10, 18, 14, 23, 21, 38, 29, 44, 38, 53, 48, 65, 54, 71, 68, 81, 96],
}

export default function MarketVisual({ compact = false }) {
  const [period, setPeriod] = useState('6M')
  const [point, setPoint] = useState(null)
  const id = useId().replace(/:/g, '')
  const values = SERIES[period]
  const coordinates = values.map((value, index) => [18 + index * 29, 166 - value * 1.4])
  const line = coordinates.map(([x, y], index) => `${index ? 'L' : 'M'}${x},${y}`).join(' ')
  const selected = point === null ? null : coordinates[point]

  return (
    <div className={`w-full flex flex-col gap-3 font-sans ${compact ? 'max-w-md' : ''}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold tracking-wider text-[11px] uppercase">
          <ChartNoAxesCombined size={14} className="text-emerald-400 shrink-0" />
          <span>The Bigger Picture</span>
        </div>
        <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
          Illustrative Data
        </span>
      </div>

      {/* Summary value & Period selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
            Perspective, over time
          </span>
          <strong className="text-sm sm:text-base font-semibold text-white tracking-tight">
            {point === null ? 'See beyond today.' : `Sample index · ${100 + values[point]}`}
          </strong>
        </div>

        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10" role="group" aria-label="Illustrative chart time range">
          {Object.keys(SERIES).map(range => (
            <button
              type="button"
              aria-pressed={period === range}
              key={range}
              onClick={() => { setPeriod(range); setPoint(null) }}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                period === range
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Chart */}
      <div className="relative w-full rounded-xl bg-black/30 border border-white/5 p-2 overflow-hidden">
        <svg
          className="w-full h-auto max-h-[180px] overflow-visible select-none"
          viewBox="0 0 500 190"
          role="img"
          aria-label={`Illustrative ${period} trend, not actual market data`}
          onPointerLeave={() => setPoint(null)}
          onPointerMove={event => {
            const bounds = event.currentTarget.getBoundingClientRect()
            setPoint(Math.max(0, Math.min(16, Math.round(((event.clientX - bounds.left) / bounds.width * 500 - 18) / 29))))
          }}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.32" />
              <stop offset="60%" stopColor="#22c55e" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#22c55e" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Grid lines */}
          {[40, 85, 130, 175].map(y => (
            <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="#ffffff0d" strokeDasharray="3 5" />
          ))}

          {/* Area Fill */}
          <path
            key={`${period}-area`}
            className="transition-all duration-300"
            d={`${line} L482,180 L18,180 Z`}
            fill={`url(#${id}-fill)`}
          />

          {/* Line Path */}
          <path
            key={period}
            d={line}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={`url(#${id}-glow)`}
          />

          {/* End point dot */}
          <circle cx="482" cy={coordinates[16][1]} r="4" fill="#4ade80" stroke="#0a0b0e" strokeWidth="2" />

          {/* Interactive cursor */}
          {selected && (
            <g>
              <line x1={selected[0]} y1="12" x2={selected[0]} y2="180" stroke="#22c55e80" strokeDasharray="3 4" strokeWidth="1.5" />
              <circle cx={selected[0]} cy={selected[1]} r="5" fill="#4ade80" stroke="#064e3b" strokeWidth="2.5" />
            </g>
          )}
        </svg>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] font-mono text-slate-400">
        <span className="tracking-wider text-[10px] text-slate-400">ZOOM OUT. CONNECT THE DOTS.</span>
        <div className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition text-[11px]">
          <span>Grounded Math</span>
          <ArrowUpRight size={14} />
        </div>
      </div>
    </div>
  )
}
