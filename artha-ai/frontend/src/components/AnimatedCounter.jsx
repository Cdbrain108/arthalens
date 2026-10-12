import { useEffect, useRef, useState } from 'react'

/**
 * Counts up from 0 to `to` when scrolled into view.
 * Accessibility: the animated <span> is aria-hidden — pair it with an
 * sr-only text that always carries the final value (see `.be-stat`).
 * Respects prefers-reduced-motion by jumping straight to the final number.
 */
export default function AnimatedCounter({ to = 0, duration = 1100, className = '' }) {
  const ref = useRef(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setValue(to)
      return undefined
    }

    let frame = 0
    let start = 0

    const tick = now => {
      if (!start) start = now
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setValue(Math.round(to * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect()
          frame = requestAnimationFrame(tick)
        }
      },
      { threshold: 0.4 }
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [to, duration])

  return (
    <span ref={ref} className={`be-counter ${className}`} aria-hidden="true">
      {value}
    </span>
  )
}
