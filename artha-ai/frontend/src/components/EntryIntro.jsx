import { useCallback, useEffect, useRef, useState } from 'react'
import Logo from './Logo'

export const INTRO_SESSION_KEY = 'arthalens:intro:v2'

export default function EntryIntro() {
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(INTRO_SESSION_KEY) !== 'seen'
    } catch {
      return true
    }
  })
  const [exiting, setExiting] = useState(false)
  const dialog = useRef(null)
  const focusBefore = useRef(null)

  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, 'seen')
    } catch {
      /* private browsing */
    }
    setExiting(true)
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    const node = dialog.current
    if (!node?.contains(document.activeElement)) {
      focusBefore.current = document.activeElement
    }
    node?.showModal()

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    // 2.7s lets the full bull-bear clash & ArthaLens AI logo resolution play smoothly
    const timer = setTimeout(finish, media.matches ? 150 : 2700)
    const motionChanged = () => {
      if (media.matches) finish()
    }
    media.addEventListener('change', motionChanged)

    return () => {
      clearTimeout(timer)
      media.removeEventListener('change', motionChanged)
      node?.close()
    }
  }, [visible, finish])

  useEffect(() => {
    if (!exiting) return undefined
    const timer = setTimeout(() => {
      dialog.current?.close()
      setVisible(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [exiting])

  useEffect(() => {
    if (visible || !exiting) return undefined
    const frame = requestAnimationFrame(() => {
      const target =
        focusBefore.current?.isConnected &&
        focusBefore.current.matches('button, a[href], input, textarea, select, [tabindex="0"]')
          ? focusBefore.current
          : document.getElementById('research-query')
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [visible, exiting])

  if (!visible) return null

  return (
    <dialog
      ref={dialog}
      className={`entry-intro ${exiting ? 'intro-exiting' : ''}`}
      aria-labelledby="intro-title"
      onCancel={(event) => {
        event.preventDefault()
        finish()
      }}
    >
      <button className="intro-skip" onClick={finish} autoFocus aria-label="Skip introduction animation">
        Skip intro <span aria-hidden="true">↗</span>
      </button>

      {/* Main Clash Scene: Bull & Bear with Golden Banana Market Trajectories */}
      <div className="intro-scene" aria-hidden="true">
        <div className="intro-google-glow" />
        <div className="intro-target">
          <i />
          <i />
          <i />
        </div>

        {/* Dynamic Dual Trajectory Curves */}
        <svg className="intro-charts" viewBox="0 0 800 300" fill="none">
          <path className="intro-up" d="M30 220 L140 180 L210 210 L300 120 L350 150 L400 90 L510 50" />
          <path className="intro-down" d="M770 70 L680 120 L600 90 L520 180 L450 150 L400 210 L320 250" />
        </svg>

        {/* Charging Emerald Bull */}
        <div className="intro-bull">
          <img src="/brand/bull.svg" alt="Bull" className="intro-animal-svg" />
          <div className="intro-node-core green" />
        </div>

        {/* Rearing Crimson Bear */}
        <div className="intro-bear">
          <img src="/brand/bear.svg" alt="Bear" className="intro-animal-svg" />
          <div className="intro-node-core red" />
        </div>

        {/* Kinetic Energy Sparks */}
        <div className="intro-dust">
          <i />
          <i />
          <i />
        </div>
      </div>

      {/* Resolution Stage: Resolves into the ArthaLens AI Emblem & Pure Title */}
      <div className="intro-resolution">
        <div className="intro-logo-wrap">
          <Logo size={80} />
        </div>
        <h1 id="intro-title" className="intro-brand-heading">
          ArthaLens <span className="intro-ai-badge">AI</span>
        </h1>
        <p className="intro-tagline">Evidence-First Financial Intelligence · Bull & Bear Synthesized</p>
      </div>

      <span className="intro-caption">CANONICAL MULTI-AGENT EQUITY INTELLIGENCE</span>
    </dialog>
  )
}
