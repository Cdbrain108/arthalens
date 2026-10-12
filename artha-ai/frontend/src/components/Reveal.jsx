import { useEffect, useRef, useState } from 'react'

/**
 * Scroll-reveal wrapper.
 * Fades/slides children in when the element enters the viewport.
 * - `variant`: 'up' | 'fade' | 'scale' | 'stagger' (stagger animates direct children)
 * - `delay`: ms delay before this element animates
 * - Respects prefers-reduced-motion (renders visible immediately).
 * - Falls back to visible when IntersectionObserver is unavailable.
 */
export default function Reveal({
  as: Tag = 'div',
  variant = 'up',
  delay = 0,
  className = '',
  children,
  ...rest
}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const classes = [
    'be-reveal',
    visible ? 'is-visible' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag
      ref={ref}
      className={classes}
      data-variant={variant}
      style={delay ? { '--be-reveal-delay': `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}
