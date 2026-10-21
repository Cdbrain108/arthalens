import { useEffect, useRef } from 'react'

/**
 * Ultra-lightweight Google-gradient reading-progress bar pinned to nav.
 * Paints via direct ref transform (zero React re-renders per frame, 120fps smooth).
 */
export default function ScrollProgress({ scrollContainerRef }) {
  const barRef = useRef(null)

  useEffect(() => {
    let frame = 0
    const el = scrollContainerRef?.current

    const update = () => {
      frame = 0
      const current = (el && el.scrollTop > 0)
        ? el.scrollTop
        : (window.scrollY || document.documentElement.scrollTop || 0)
      const max = (el && el.scrollTop > 0)
        ? (el.scrollHeight - el.clientHeight)
        : (document.documentElement.scrollHeight - window.innerHeight)
      const ratio = max > 8 ? Math.min(1, Math.max(0, current / max)) : 0
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${ratio})`
      }
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    if (el) el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (el) el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [scrollContainerRef])

  return (
    <div className="be-scroll-progress" aria-hidden="true">
      <span
        ref={barRef}
        style={{
          transform: 'scaleX(0)',
          transformOrigin: 'left center',
          willChange: 'transform',
          width: '100%',
          display: 'block',
        }}
      />
    </div>
  )
}
