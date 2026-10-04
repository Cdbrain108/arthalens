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

  return <div className={`market-visual ${compact ? 'market-compact' : ''}`}>
    <div className="market-visual-header"><span><ChartNoAxesCombined size={15} /> THE BIGGER PICTURE</span><span className="sample-label">ILLUSTRATIVE DATA</span></div>
    <div className="market-visual-summary"><div><span>Perspective, over time</span><strong>{point === null ? 'See beyond today.' : `Sample index · ${100 + values[point]}`}</strong></div><div className="chart-periods" role="group" aria-label="Illustrative chart time range">{Object.keys(SERIES).map(range => <button type="button" aria-pressed={period === range} key={range} onClick={() => { setPeriod(range); setPoint(null) }}>{range}</button>)}</div></div>
    <svg className="perspective-chart" viewBox="0 0 500 190" role="img" aria-label={`Illustrative ${period} trend, not actual market data`} onPointerLeave={() => setPoint(null)} onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); setPoint(Math.max(0, Math.min(16, Math.round(((event.clientX - bounds.left) / bounds.width * 500 - 18) / 29)))) }}>
      <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9cee69" stopOpacity=".25" /><stop offset="100%" stopColor="#9cee69" stopOpacity="0" /></linearGradient></defs>
      {[40, 85, 130, 175].map(y => <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="#ffffff0b" strokeDasharray="3 5" />)}
      <path key={`${period}-area`} className="chart-area" d={`${line} L482,180 L18,180 Z`} fill={`url(#${id}-fill)`} />
      <path key={period} className="chart-line" d={line} fill="none" stroke="#b1f477" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" pathLength="1" />
      <circle cx="482" cy={coordinates[16][1]} r="4" fill="#c0ff94" />
      {selected && <g><line x1={selected[0]} y1="12" x2={selected[0]} y2="180" stroke="#c0ff9460" strokeDasharray="3 4" /><circle cx={selected[0]} cy={selected[1]} r="5" fill="#c0ff94" stroke="#15251a" strokeWidth="3" /></g>}
    </svg>
    <div className="chart-bottom"><span>ZOOM OUT. CONNECT THE DOTS.</span><ArrowUpRight size={16} /></div>
  </div>
}
