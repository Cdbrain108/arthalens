import { useEffect, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'

export default function TopBanner() {
  const [visible, setVisible] = useState(true)
  const [closing, setClosing] = useState(false)
  const timer = useRef(null)

  // Dismiss with a fade/slide-out before unmounting.
  const dismiss = () => {
    setClosing(true)
    timer.current = setTimeout(() => setVisible(false), 260)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  if (!visible) return null
  return (
    <div
      className={`relative flex items-center justify-center gap-2 border-b border-line bg-panel/60 px-3 py-1.5 text-[11.5px] text-muted backdrop-blur-md transition-all duration-300 ease-out-expo sm:gap-3 sm:text-[12px] ${
        closing ? '-translate-y-2 opacity-0' : 'translate-y-0 opacity-100'
      }`}>
      <Info size={13} className="hidden shrink-0 text-accent sm:block" />
      <span className="truncate">
        Bullseye is a research aid — not investment advice.
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss notice"
        className="btn-press flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-primary hover:border-accent/40 hover:bg-line/60">
        Dismiss <X size={12} />
      </button>
    </div>
  )
}
