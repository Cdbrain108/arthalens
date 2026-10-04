import { useCallback, useEffect, useRef, useState } from 'react'
import MarketAnimal from './MarketAnimal'
import Logo from './Logo'

export const INTRO_SESSION_KEY = 'bullseye:intro:v1'

export default function EntryIntro() {
  const [visible, setVisible] = useState(() => {
    try { return sessionStorage.getItem(INTRO_SESSION_KEY) !== 'seen' } catch { return true }
  })
  const [exiting, setExiting] = useState(false)
  const dialog = useRef(null)
  const focusBefore = useRef(null)
  const finish = useCallback(() => {
    try { sessionStorage.setItem(INTRO_SESSION_KEY, 'seen') } catch { /* private browsing */ }
    setExiting(true)
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    const node = dialog.current
    if (!node?.contains(document.activeElement)) focusBefore.current = document.activeElement
    node?.showModal()
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const timer = setTimeout(finish, media.matches ? 220 : 3200)
    const motionChanged = () => { if (media.matches) finish() }
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
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 400)
    return () => clearTimeout(timer)
  }, [exiting])

  useEffect(() => {
    if (visible || !exiting) return undefined
    // Native dialog focus restoration finishes after close; restore app focus
    // after React removes the modal, including under StrictMode.
    const frame = requestAnimationFrame(() => {
      const target = focusBefore.current?.isConnected && focusBefore.current.matches('button, a[href], input, textarea, select, [tabindex="0"]')
        ? focusBefore.current : document.getElementById('research-query')
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [visible, exiting])

  if (!visible) return null
  return <dialog ref={dialog} className={`entry-intro ${exiting ? 'intro-exiting' : ''}`}
    aria-labelledby="intro-title" onCancel={event => { event.preventDefault(); finish() }}>
    <button className="intro-skip" onClick={finish} autoFocus>Skip intro <span aria-hidden="true">↗</span></button>
    <div className="intro-scene" aria-hidden="true">
      <div className="intro-target"><i /><i /><i /></div>
      <svg className="intro-charts" viewBox="0 0 800 300" fill="none">
        <path className="intro-up" d="M20 230L130 190L205 214L290 120L345 149L400 94L500 48" />
        <path className="intro-down" d="M780 62L690 115L615 88L540 184L460 154L400 214L330 252" />
      </svg>
      <div className="intro-bull"><MarketAnimal side="bull" lazy={false} /></div>
      <div className="intro-bear"><MarketAnimal side="bear" lazy={false} /></div>
      <div className="intro-dust"><i /><i /><i /></div>
    </div>
    <div className="intro-resolution"><Logo size={106} /><h1 id="intro-title">Bullseye</h1>
      <p>Two perspectives. One clearer picture.</p></div>
    <span className="intro-caption">THE BULL. THE BEAR. THE EVIDENCE.</span>
  </dialog>
}
