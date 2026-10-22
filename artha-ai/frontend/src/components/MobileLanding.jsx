import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  PieChart,
  TrendingUp,
  Newspaper,
  Layers,
  AlertTriangle,
  Users,
  Globe,
  FileText,
  FileCheck,
  CheckCircle2,
  ChevronDown,
  Menu,
  X,
  Compass,
  ArrowUpRight,
  Zap,
  SlidersHorizontal,
  Bot,
  MessageSquare
} from 'lucide-react'
import Logo from './Logo'

const AUTO_HIDE_DELAY_MS = 1000

const MOBILE_SECTIONS = [
  { id: 'm-hero', label: 'Artha AI Copilot', short: 'Research', icon: Sparkles },
  { id: 'm-specialists', label: 'Multi-Agent Graph', short: 'Agents', icon: Bot },
  { id: 'm-dual-thesis', label: 'Dual-Thesis Engine', short: 'Thesis', icon: TrendingUp },
  { id: 'm-copilot', label: 'Intelligence Dossier', short: 'Dossier', icon: FileText },
  { id: 'm-faq', label: 'Audited Governance', short: 'Governance', icon: ShieldCheck },
]

const MOBILE_TICKERS = [
  { name: 'NVIDIA', ticker: 'NVDA', exchange: 'NASDAQ', color: '#10b981', tag: '+3.8%', tagClass: 'green' },
  { name: 'TCS', ticker: 'TCS', exchange: 'NSE', color: '#06b6d4', tag: 'DCF', tagClass: 'blue' },
  { name: 'Reliance', ticker: 'RELIANCE', exchange: 'NSE', color: '#8b5cf6', tag: '5-Yr', tagClass: 'purple' },
  { name: 'Apple', ticker: 'AAPL', exchange: 'NASDAQ', color: '#3b82f6', tag: '+1.4%', tagClass: 'blue' },
  { name: 'Tesla', ticker: 'TSLA', exchange: 'NASDAQ', color: '#f59e0b', tag: 'Momentum', tagClass: 'amber' },
  { name: 'Tata Motors', ticker: 'TATAMOTORS', exchange: 'NSE', color: '#10b981', tag: '+2.1%', tagClass: 'green' },
]

const SPECIALISTS = [
  { id: 'financial', name: 'Financial Health', icon: BarChart3, desc: 'Balance sheet, debt maturities & multi-year cash flows', tag: 'P&L' },
  { id: 'valuation', name: 'Valuation Multiples', icon: PieChart, desc: 'Historical & peer multiples, EV/EBITDA, P/E & DCF', tag: 'Multiples' },
  { id: 'market', name: 'Market Momentum', icon: TrendingUp, desc: 'Computed price trends, volume & 52-week ranges', tag: 'Momentum' },
  { id: 'news', name: 'News & Catalysts', icon: Newspaper, desc: 'Verified corporate actions, earnings & SEC/BSE events', tag: 'Catalysts' },
  { id: 'growth', name: 'Growth Engine', icon: Layers, desc: 'Capacity expansion, segment CAGR & capex plans', tag: 'Growth' },
  { id: 'risk', name: 'Risk Diligence', icon: AlertTriangle, desc: 'Downside vectors, litigation & debt vulnerabilities', tag: 'Guardrails' },
  { id: 'document', name: 'Filings & Doc RAG', icon: FileText, desc: 'Ground-truth regulatory filings & audited citations', tag: 'Filings' },
  { id: 'social', name: 'Public Sentiment', icon: MessageSquare, desc: 'Qualitative public discussions & retail sentiment', tag: 'Sentiment' },
  { id: 'workforce', name: 'Workforce & Talent', icon: Users, desc: 'Talent velocity, hiring headcount & attrition', tag: 'Human Cap' },
  { id: 'industry', name: 'Industry & Moats', icon: Globe, desc: 'Sector tailwinds, cyclical positioning & moats', tag: 'Moats' },
  { id: 'management', name: 'Management & Governance', icon: ShieldCheck, desc: 'Promoter pledging, capital allocation & board audit', tag: 'Governance' },
]

const SIMPLE_TAGLINES = [
  'Research any stock in 60 seconds with 11 specialized AI agents.',
  '11 AI agents read real company filings so you don\'t have to.',
  'Checks if a stock is cheap, expensive, or fairly priced.',
  'Spots hidden debt, red flags & risks before you invest.',
  'Shows both sides — why to buy and why to be cautious in plain English.',
]

const SAMPLE_INQUIRIES = [
  'Should I buy TCS stocks now?',
  'Is Reliance safe for a 5-year hold?',
  'Is NVIDIA overvalued after earnings?',
  'Compare TCS and Infosys on operating margins',
  'What are the key risks in Apple AAPL?',
]

/** Types out each simple explainer phrase, pauses, deletes, and cycles smoothly */
function useTypewriter(phrases, { typingSpeed = 38, deletingSpeed = 20, pauseDelay = 2200 } = {}) {
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [text, setText] = useState(phrases[0] || '')

  useEffect(() => {
    if (reduced || !phrases.length) return undefined

    let phraseIdx = 0
    let charIdx = phrases[0].length
    let isDeleting = true
    let timer = null

    const tick = () => {
      const currentPhrase = phrases[phraseIdx]
      if (isDeleting) {
        charIdx = Math.max(0, charIdx - 1)
        setText(currentPhrase.slice(0, charIdx))
        if (charIdx === 0) {
          isDeleting = false
          phraseIdx = (phraseIdx + 1) % phrases.length
          timer = setTimeout(tick, 300)
          return
        }
        timer = setTimeout(tick, deletingSpeed)
      } else {
        charIdx = Math.min(currentPhrase.length, charIdx + 1)
        setText(currentPhrase.slice(0, charIdx))
        if (charIdx === currentPhrase.length) {
          isDeleting = true
          timer = setTimeout(tick, pauseDelay)
          return
        }
        timer = setTimeout(tick, typingSpeed)
      }
    }

    timer = setTimeout(tick, pauseDelay)
    return () => clearTimeout(timer)
  }, [phrases, reduced, typingSpeed, deletingSpeed, pauseDelay])

  return text
}

export default function MobileLanding({
  onRun,
  job,
  running,
  submitting,
  query = '',
  onQueryChange,
  sessions = [],
  onSelectSession,
  onDeleteSession,
  onResume,
  user,
  onOpenAuth,
}) {
  const [localQuery, setLocalQuery] = useState(query)
  const [navOpen, setNavOpen] = useState(false)
  const [activeSpecialist, setActiveSpecialist] = useState(0)
  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const activeRef = useRef(0)
  const [taskbarVisible, setTaskbarVisible] = useState(true)
  const taskbarVisibleRef = useRef(true)
  const taskbarHideTimerRef = useRef(null)
  const containerRef = useRef(null)
  const progressRef = useRef(null)
  const typedTagline = useTypewriter(SIMPLE_TAGLINES)

  const [sampleQIdx, setSampleQIdx] = useState(0)
  const [reportBannerDismissed, setReportBannerDismissed] = useState(false)

  useEffect(() => {
    setLocalQuery(query)
  }, [query])

  // Cycle specialist highlights for dynamic feel
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSpecialist((prev) => (prev + 1) % SPECIALISTS.length)
    }, 2800)
    return () => clearInterval(timer)
  }, [])

  // Auto-rotate sample inquiry question below running ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setSampleQIdx((prev) => (prev + 1) % SAMPLE_INQUIRIES.length)
    }, 3200)
    return () => clearInterval(timer)
  }, [])

  // Auto-hide taskbar state & robust ref tracking (Argus reference architecture)
  const showTaskbar = useCallback((autoHideDelayMs = 0) => {
    if (!taskbarVisibleRef.current) {
      taskbarVisibleRef.current = true
      setTaskbarVisible(true)
    }
    if (taskbarHideTimerRef.current) {
      clearTimeout(taskbarHideTimerRef.current)
      taskbarHideTimerRef.current = null
    }
    if (autoHideDelayMs > 0) {
      taskbarHideTimerRef.current = setTimeout(() => {
        hideTaskbar()
      }, autoHideDelayMs)
    }
  }, [])

  const hideTaskbar = useCallback(() => {
    if (taskbarHideTimerRef.current) {
      clearTimeout(taskbarHideTimerRef.current)
      taskbarHideTimerRef.current = null
    }
    // Never hide taskbar while navigation drawer is open
    if (navOpen) return
    // Never hide taskbar when resting at the very top of the first page
    const root = containerRef.current
    const isAtTop = root ? root.scrollTop < 20 : activeRef.current === 0
    if (activeRef.current === 0 && isAtTop) return

    if (taskbarVisibleRef.current) {
      taskbarVisibleRef.current = false
      setTaskbarVisible(false)
    }
  }, [navOpen])

  // 1. Initial land on very first page: permanent visible, no auto-hide
  useEffect(() => {
    showTaskbar(0)
    return () => {
      if (taskbarHideTimerRef.current) clearTimeout(taskbarHideTimerRef.current)
    }
  }, [showTaskbar])

  // 2. When active section changes:
  // On very first page: keep visible. On all other sections: visible for 1s then hides smoothly
  useEffect(() => {
    const isFirstPage = activeSectionIdx === 0 && (!containerRef.current || containerRef.current.scrollTop < 20)
    showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
  }, [activeSectionIdx, showTaskbar])

  // 3. User interaction & mobile touch: reveal on movement/scroll, auto-hide after 1s on other sections
  useEffect(() => {
    const root = containerRef.current
    if (!root) return undefined

    let lastScrollTop = root.scrollTop

    const handleScrollActivity = () => {
      const currentScroll = root.scrollTop
      const scrollDiff = currentScroll - lastScrollTop
      if (Math.abs(scrollDiff) < 6) return
      lastScrollTop = currentScroll
      const isFirstPage = activeRef.current === 0 && root.scrollTop < 20
      showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    }

    const handleTouchStart = () => {
      const isFirstPage = activeRef.current === 0 && (!root || root.scrollTop < 20)
      showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    }

    const handleTouchMove = () => {
      const isFirstPage = activeRef.current === 0 && (!root || root.scrollTop < 20)
      showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    }

    const handlePointerTop = (e) => {
      const y = e.touches ? e.touches[0].clientY : e.clientY
      if (y <= 55) {
        const isFirstPage = activeRef.current === 0 && (!root || root.scrollTop < 20)
        showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
      }
    }

    root.addEventListener('scroll', handleScrollActivity, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('pointermove', handlePointerTop, { passive: true })

    return () => {
      root.removeEventListener('scroll', handleScrollActivity)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('pointermove', handlePointerTop)
    }
  }, [showTaskbar])

  // 4. Active section tracking & hairline progress paint (Argus fast offset calculation, zero layout thrashing)
  useEffect(() => {
    const root = containerRef.current
    if (!root) return undefined

    const elements = MOBILE_SECTIONS.map((p) => root.querySelector(`#${p.id}`))
    let ticking = false

    const updateActive = () => {
      ticking = false
      const currentScroll = root.scrollTop + root.clientHeight * 0.35
      let current = 0
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i]
        if (el && el.offsetTop <= currentScroll) {
          current = i
          break
        }
      }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 50) {
        current = MOBILE_SECTIONS.length - 1
      }
      if (current !== activeRef.current) {
        activeRef.current = current
        setActiveSectionIdx(current)
      }
      if (progressRef.current) {
        const max = root.scrollHeight - root.clientHeight
        const p = max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0
        progressRef.current.style.transform = `scaleX(${p})`
      }
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(updateActive)
      }
    }

    updateActive()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [])

  const goToSection = (id) => {
    const root = containerRef.current
    const target = root?.querySelector(`#${id}`)
    if (!root || !target) return
    const isFirstPage = id === 'm-hero'
    showTaskbar(isFirstPage ? 0 : AUTO_HIDE_DELAY_MS)
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = (e) => {
    e?.preventDefault()
    const trimmed = (localQuery || '').trim()
    if (!trimmed || running || submitting) return
    onQueryChange?.(trimmed)
    onRun?.(trimmed)
  }

  const handleQuickSelect = (ticker) => {
    setLocalQuery(ticker)
    onQueryChange?.(ticker)
    onRun?.(ticker)
  }

  return (
    <div
      ref={containerRef}
      className="mobile-landing-container"
    >
      {/* Top scroll-progress hairline (Argus pattern, ref-painted) */}
      <div className="mp-scroll-progress" aria-hidden="true">
        <i ref={progressRef} />
      </div>

      {/* ── Fixed Smart Auto-Hiding Taskbar (Argus Pattern) ──────────────── */}
      <nav
        className={`arg-nav ${!taskbarVisible ? 'is-taskbar-hidden' : ''}`}
        onClick={() => {
          if (!taskbarVisible) {
            showTaskbar(activeRef.current === 0 && (!containerRef.current || containerRef.current.scrollTop < 20) ? 0 : AUTO_HIDE_DELAY_MS)
          }
        }}
        onMouseEnter={() => showTaskbar(0)}
        onMouseLeave={() => showTaskbar(activeRef.current === 0 && (!containerRef.current || containerRef.current.scrollTop < 20) ? 0 : AUTO_HIDE_DELAY_MS)}
      >
        <a
          className="arg-nav-brand"
          href="#m-hero"
          onClick={(e) => {
            e.preventDefault()
            goToSection('m-hero')
            setNavOpen(false)
          }}
        >
          <Logo size={22} />
          <div className="arg-nav-brand-text">
            <span className="arg-nav-word">Artha AI</span>
            <span className="arg-nav-tagline">Multi-Agent Stock Research</span>
          </div>
        </a>

        {/* Dynamic Current Page Name Indicator (Argus ergonomics) OR Active Workspace Button */}
        {running || submitting ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onResume?.()
            }}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500/25 to-teal-500/20 border border-emerald-500/60 px-2.5 py-1 text-[11px] font-bold text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.35)] hover:brightness-125 transition active:scale-95 cursor-pointer animate-pulse"
            title="Research is in progress · Tap to return to workspace"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="tracking-tight">Back to Workspace</span>
            <ArrowRight size={12} className="text-emerald-400" />
          </button>
        ) : (
          <div
            className="arg-nav-mobile-page-pill"
            aria-live="polite"
            onClick={(e) => {
              e.stopPropagation()
              goToSection(MOBILE_SECTIONS[activeSectionIdx]?.id || 'm-hero')
            }}
          >
            <span className="mobile-page-dot" />
            <span className="mobile-page-name">
              {MOBILE_SECTIONS[activeSectionIdx]?.short || 'Research'}
            </span>
          </div>
        )}

        {/* Mobile Hamburger Toggle & User Status */}
        <div className="arg-nav-mobile-right flex items-center gap-2">
          {user && !user.guest && (
            <button
              type="button"
              onClick={onResume}
              className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 shadow-sm hover:scale-105 active:scale-95 transition cursor-pointer"
              title={`Signed in as ${user.displayName || user.name || user.email || 'Researcher'} · Tap to return to workspace`}
              aria-label={`Signed in as ${user.displayName || user.name || user.email || 'Researcher'}`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span>{(user.displayName || user.name || user.email || 'A').trim().charAt(0).toUpperCase()}</span>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-[#0b0f19]" />
            </button>
          )}
          <button
            type="button"
            className="arg-nav-toggle"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            onClick={(e) => {
              e.stopPropagation()
              setNavOpen((open) => {
                const next = !open
                if (next) showTaskbar(0)
                return next
              })
            }}
          >
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        <div className={navOpen ? 'arg-nav-drawer open' : 'arg-nav-drawer'}>
          <div className="arg-nav-mobile-header">
            <div className="mobile-brand">
              <Logo size={20} />
              <span>Artha AI Platform</span>
            </div>
            <button
              type="button"
              className="mobile-close"
              onClick={(e) => {
                e.stopPropagation()
                setNavOpen(false)
              }}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          <div className="arg-nav-mobile-list">
            {MOBILE_SECTIONS.map(({ id, label, icon: Icon }, idx) => (
              <a
                className={`arg-nav-link ${activeSectionIdx === idx ? 'active' : ''}`}
                href={`#${id}`}
                key={id}
                onClick={(e) => {
                  e.preventDefault()
                  setNavOpen(false)
                  goToSection(id)
                }}
              >
                <div className="mobile-link-title">
                  <Icon size={16} className="mobile-link-icon" />
                  <span>{label}</span>
                </div>
                <ArrowRight size={14} className="mobile-link-arrow" />
              </a>
            ))}
          </div>

          <div className="arg-nav-mobile-actions">
            {(running || submitting) && (
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/50 p-3 mb-2 text-emerald-300 font-bold text-[12px] hover:bg-emerald-500/30 transition shadow-lg active:scale-95 cursor-pointer animate-pulse"
                onClick={() => {
                  setNavOpen(false)
                  onResume?.()
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Research in Progress · Return</span>
                </div>
                <ArrowRight size={14} className="text-emerald-400" />
              </button>
            )}
            {user && !user.guest ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className="mobile-demo-btn"
                  onClick={() => {
                    setNavOpen(false)
                    onResume?.()
                  }}
                >
                  <span>Workspace ({user.displayName?.split(' ')[0] || user.name?.split(' ')[0] || user.email?.split('@')[0] || 'User'})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNavOpen(false)
                    onLogout?.()
                  }}
                  className="w-full text-center text-xs text-rose-400/80 hover:text-rose-300 py-1"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mobile-demo-btn"
                onClick={() => {
                  setNavOpen(false)
                  onOpenAuth?.()
                }}
              >
                Sign In to Workspace
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Scrim overlay for drawer */}
      {navOpen && (
        <div
          className="arg-nav-scrim"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ════ PAGE 1: MOBILE HERO & COMMAND CENTER ════ */}
      <section className="mobile-page-section hero-page" id="m-hero">
        {/* Prominent Active Research Prompt Banner */}
        {(running || submitting) && (
          <div
            onClick={onResume}
            className="w-full flex items-center justify-between gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-950/85 via-[#132822] to-emerald-950/85 border border-emerald-500/50 p-3.5 shadow-[0_4px_24px_rgba(16,185,129,0.3)] backdrop-blur-xl cursor-pointer active:scale-98 transition animate-pulse mb-3 text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold text-white tracking-tight truncate">
                  Artha AI is actively working!
                </p>
                <p className="text-[11px] text-emerald-300 truncate">
                  Your report is getting generated... Tap to return to workspace
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 rounded-lg bg-emerald-500/25 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              <span>Return</span>
              <ArrowRight size={13} />
            </div>
          </div>
        )}

        {/* Prominent Generated Report Ready Banner with View Report & Ask */}
        {!reportBannerDismissed && job && !running && !submitting && job.status === 'succeeded' && Boolean(job.report) && (
          <div
            className="w-full flex flex-col gap-2 rounded-2xl bg-gradient-to-r from-[#0d2820]/95 via-[#0a1f19]/95 to-[#081713]/95 border border-emerald-500/40 p-3 shadow-[0_4px_24px_rgba(16,185,129,0.25)] backdrop-blur-xl mb-3 text-left"
          >
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Sparkles size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-white tracking-tight truncate">
                    Your Research Report is Ready!
                  </p>
                  <p className="text-[11px] text-emerald-300 truncate">
                    Synthesis ready for{' '}
                    <span className="font-semibold text-white">
                      {job?.report?.company?.name || job?.entities?.[0]?.name || (job?.query ? (job.query.length > 24 ? job.query.slice(0, 24) + '...' : job.query) : 'your inquiry')}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReportBannerDismissed(true)}
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition cursor-pointer"
                title="Dismiss banner"
                aria-label="Dismiss banner"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onResume}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold shadow-sm active:scale-95 transition cursor-pointer"
                style={{ backgroundColor: '#34d399', color: '#04120c' }}
              >
                <FileText size={13} />
                <span>View Report</span>
              </button>
              <button
                type="button"
                onClick={onResume}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 py-2 px-3 text-xs font-semibold text-white active:scale-95 transition cursor-pointer"
              >
                <Sparkles size={13} className="text-emerald-400" />
                <span>Ask Copilot</span>
              </button>
            </div>
          </div>
        )}

        <div className="mobile-hero-badge">
          <span className="live-pulse" />
          <span>AUTONOMOUS MULTI-AGENT PLATFORM</span>
        </div>

        <h1 className="mobile-hero-title">
          Artha AI — Powerful <span className="highlight-text">Multi-Agent</span> Stock Research Platform
        </h1>

        <p className="mobile-hero-subtitle" aria-live="polite">
          <span className="mobile-typed-icon" aria-hidden="true">✦</span>
          <span className="mobile-typed-text">{typedTagline}</span>
          <span className="mobile-typed-caret" aria-hidden="true" />
        </p>

        {/* 3-Pill Institutional Metric Bar */}
        <div className="mobile-hero-stats">
          <div className="mobile-hero-stat-pill">
            <span className="mobile-hero-stat-val">11 AI Agents</span>
            <span className="mobile-hero-stat-lbl">Reads All Filings</span>
          </div>
          <div className="mobile-hero-stat-pill">
            <span className="mobile-hero-stat-val">60 Seconds</span>
            <span className="mobile-hero-stat-lbl">Full Stock Report</span>
          </div>
          <div className="mobile-hero-stat-pill">
            <span className="mobile-hero-stat-val">Zero Guesswork</span>
            <span className="mobile-hero-stat-lbl">100% Real Math</span>
          </div>
        </div>

        {/* Mobile Action Card: Start Research / Active Research */}
        <div className="mobile-search-card">
          {running || submitting ? (
            <div className="w-full space-y-2 animate-fade-in text-left">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider font-mono">
                    Research Active
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">11 Specialists Running</span>
              </div>

              <button
                type="button"
                onClick={() => onResume?.()}
                className="mobile-cta-running group cursor-pointer active:scale-98 transition-transform"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="mobile-cta-icon-box relative">
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                  <span className="mobile-cta-title text-white font-bold text-[13.5px] truncate">
                    Research Running · Tap to View Live
                  </span>
                </div>
                <ArrowRight size={15} className="text-white shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          ) : (
            <div className="w-full space-y-2.5 animate-fade-in text-left">
              {/* Sleek Ergonomic Start Research CTA Button */}
              <button
                type="button"
                onClick={() => onResume?.()}
                className="mobile-cta-primary group cursor-pointer active:scale-98 transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0 z-10">
                  <div className="mobile-cta-icon-box relative">
                    <Bot size={17} className="text-white" />
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
                    </span>
                  </div>
                  <span className="mobile-cta-title text-white font-bold text-[14px] tracking-tight">
                    Start Stock Research
                  </span>
                  <span className="rounded-full bg-white/20 border border-white/25 px-1.5 py-0.5 text-[9px] font-mono font-bold text-white uppercase tracking-wider">
                    Studio
                  </span>
                </div>
                <div className="mobile-cta-arrow group-hover:translate-x-0.5 transition-transform z-10">
                  <ArrowRight size={15} />
                </div>
              </button>

              {/* Running Ticker Diligence Track */}
              <div className="mobile-ticker-header">
                <div className="mobile-ticker-header-lbl">
                  <TrendingUp size={11} className="text-emerald-400" />
                  <span>Live Market Stream</span>
                </div>
                <div className="mobile-ticker-badge-live">
                  <span className="live-pulse" />
                  <span>TAP TICKER</span>
                </div>
              </div>

              <div className="mobile-ticker-marquee" title="Touch or hover to pause ticker">
                <div className="mobile-ticker-track">
                  {[...MOBILE_TICKERS, ...MOBILE_TICKERS].map((t, idx) => (
                    <button
                      key={`${t.ticker}-${idx}`}
                      type="button"
                      onClick={() => onRun?.(t.name)}
                      className="mobile-ticker-chip group cursor-pointer"
                    >
                      <span className="ticker-dot group-hover:scale-125 transition-transform" style={{ backgroundColor: t.color, color: t.color }} />
                      <span className="ticker-name group-hover:text-emerald-300 transition-colors">{t.name}</span>
                      <span className={`ticker-tag ${t.tagClass}`}>{t.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sample Actionable Question Bar */}
              <div className="mobile-sample-prompt-bar">
                <button
                  type="button"
                  onClick={() => onRun?.(SAMPLE_INQUIRIES[sampleQIdx])}
                  className="mobile-sample-prompt-btn group cursor-pointer"
                  title="Tap to run this sample research inquiry"
                >
                  <div className="mobile-sample-prompt-left">
                    <span className="sample-sparkle-icon">💡</span>
                    <span className="sample-prompt-prefix">Try:</span>
                    <span className="sample-prompt-text truncate" key={sampleQIdx}>
                      "{SAMPLE_INQUIRIES[sampleQIdx]}"
                    </span>
                  </div>
                  <div className="mobile-sample-prompt-badge">
                    <span>Ask</span>
                    <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform text-emerald-400" />
                  </div>
                </button>
              </div>

              {/* Micro footer guarantee */}
              <div className="flex items-center justify-center gap-1.5 text-[10px] font-mono text-slate-400 pt-0.5">
                <Sparkles size={11} className="text-emerald-400 shrink-0" />
                <span>11 Autonomous Agents · SEC &amp; NSE Filings · Deterministic Math</span>
              </div>
            </div>
          )}
        </div>

        {/* Scroll Indicator */}
        <div className="mobile-scroll-hint">
          <span>Swipe up to explore agent graph</span>
          <ChevronDown size={13} className="animate-bounce" />
        </div>
      </section>

      {/* ════ PAGE 2: 11 AUTONOMOUS AGENTS (MULTI-AGENT ENGINE) ════ */}
      <section className="mobile-page-section" id="m-specialists">
        <div className="mobile-section-header">
          <div className="section-pill">
            <Layers size={13} />
            <span>Parallel Coordination</span>
          </div>
          <h2 className="section-title">11 Autonomous Specialists</h2>
          <p className="section-sub">
            Dispatched concurrently to ingest primary disclosures, compute ratios, and eliminate hallucinations.
          </p>
        </div>

        {/* Active Specialist Live Showcase Card */}
        <div className="mobile-highlight-agent-card">
          {(() => {
            const spec = SPECIALISTS[activeSpecialist]
            const Icon = spec.icon
            return (
              <div className="flex items-start gap-3">
                <div className="agent-icon-box">
                  <Icon size={22} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-[15px]">{spec.name}</h3>
                    <span className="active-agent-badge">Live Track</span>
                  </div>
                  <p className="text-slate-300 text-[12px] mt-1 leading-snug">{spec.desc}</p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="agent-meta-tag">AST Math Runtime</span>
                    <span className="agent-meta-tag">Verified Filings</span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* 11 Specialists Balanced Cockpit Grid */}
        <div className="mobile-agents-grid">
          {SPECIALISTS.map((spec, idx) => {
            const Icon = spec.icon
            const isSelected = activeSpecialist === idx
            const isLast = idx === SPECIALISTS.length - 1
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => setActiveSpecialist(idx)}
                className={`mobile-agent-pill ${isSelected ? 'is-selected' : ''} ${isLast ? 'is-featured-span' : ''}`}
              >
                <Icon size={14} className={isSelected ? 'text-emerald-400' : 'text-slate-400'} />
                <span className="agent-pill-name">{spec.name}</span>
              </button>
            )
          })}
        </div>

        <div className="mobile-guardrail-callout">
          <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-slate-300 leading-relaxed">
            <strong className="text-white">Zero Mathematical Fabrication:</strong> Multiples and margins are computed by isolated Python code, never inferred by LLMs.
          </p>
        </div>
      </section>

      {/* ════ PAGE 3: ADVERSARIAL BULL VS. BEAR STRESS TESTING ════ */}
      <section className="mobile-page-section" id="m-dual-thesis">
        <div className="mobile-section-header">
          <div className="section-pill amber">
            <Zap size={13} />
            <span>Adversarial Stress Test</span>
          </div>
          <h2 className="section-title">Bull vs. Bear Dual Thesis</h2>
          <p className="section-sub">
            Every stock is challenged simultaneously from upside and downside perspectives before synthesis.
          </p>
        </div>

        <div className="mobile-thesis-cards">
          {/* Bull Thesis Card */}
          <div className="mobile-thesis-box bull">
            <div className="thesis-header">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[13px]">
                <TrendingUp size={16} />
                <span>Bullish Catalysts</span>
              </div>
              <span className="evidence-cite-badge">[ev_grounded]</span>
            </div>
            <ul className="thesis-list">
              <li>Defensible operational margins supported by audited cash reserves.</li>
              <li>Compounding enterprise pricing power across core revenue lines.</li>
              <li>Disciplined capital expenditure with sustained ROCE expansion.</li>
            </ul>
          </div>

          {/* Bear Thesis Card */}
          <div className="mobile-thesis-box bear">
            <div className="thesis-header">
              <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[13px]">
                <AlertTriangle size={16} />
                <span>Bearish Headwinds &amp; Risks</span>
              </div>
              <span className="evidence-cite-badge">[ev_audited]</span>
            </div>
            <ul className="thesis-list">
              <li>Valuation multiples elevated relative to 5-year historical medians.</li>
              <li>Downside risk from input cost inflation or cyclical customer spending.</li>
              <li>Regulatory changes or execution delays on major capital projects.</li>
            </ul>
          </div>
        </div>

        <div className="mobile-audit-stat-bar">
          <div className="stat-item">
            <span className="stat-num">95.2%</span>
            <span className="stat-label">Evidence Grounding</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-num">0</span>
            <span className="stat-label">Math Inventions</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-num">100%</span>
            <span className="stat-label">Primary Citations</span>
          </div>
        </div>
      </section>

      {/* ════ PAGE 4: INSTANT DOSSIER PDF & ARTHA COPILOT ════ */}
      <section className="mobile-page-section" id="m-copilot">
        <div className="mobile-section-header">
          <div className="section-pill purple">
            <Bot size={13} />
            <span>Interactive Intelligence</span>
          </div>
          <h2 className="section-title">Audit Dossier &amp; Copilot</h2>
          <p className="section-sub">
            Read the comprehensive brief, download the official PDF, and interrogate the evidence in natural language.
          </p>
        </div>

        {/* Feature Preview Card */}
        <div className="mobile-copilot-preview-card">
          <div className="preview-top">
            <div className="flex items-center gap-2">
              <FileCheck size={18} className="text-emerald-400" />
              <span className="font-bold text-white text-[13px]">Vector PDF Dossier</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
              Ready in 60s
            </span>
          </div>
          <p className="text-[12px] text-slate-300 mt-2 leading-relaxed">
            Complete with executive summary, audited key financial tables, balance sheet health scores, and full regulatory citation references.
          </p>

          <div className="preview-divider" />

          <div className="preview-chat-bubble">
            <span className="chat-avatar">AI</span>
            <div className="chat-content">
              <p className="font-semibold text-white text-[11.5px]">Artha Copilot Grounding:</p>
              <p className="text-slate-300 text-[11px] mt-0.5">
                "Operating cash flows for NVIDIA increased to $28.09B, supported by 75% gross margins in data center products [ev_10]."
              </p>
            </div>
          </div>
        </div>

        {/* Action Button to launch Workspace */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="mobile-workspace-cta"
          >
            <Compass size={18} />
            <span>Open ArthaLens Workspace</span>
            <ArrowUpRight size={16} />
          </button>

          <p className="text-center text-[11px] text-slate-500">
            SEC EDGAR · BSE / NSE India · Real-Time AST AST Runtimes
          </p>
        </div>
      </section>

      {/* ════ PAGE 5: TRUST, DATA PROVENANCE & DILIGENCE PROTOCOL ════ */}
      <section className="mobile-page-section" id="m-faq">
        <div className="mobile-section-header">
          <div className="section-pill emerald">
            <ShieldCheck size={13} />
            <span>Audited Governance</span>
          </div>
          <h2 className="section-title">Institutional Provenance</h2>
          <p className="section-sub">
            Direct regulatory primary disclosures with zero mathematical fabrication.
          </p>
        </div>

        {/* Audit Pillars */}
        <div className="space-y-2.5 my-3">
          <div className="mobile-audit-pillar">
            <div className="pillar-header">
              <span className="pillar-dot blue" />
              <span className="font-semibold text-white text-[12.5px]">Primary Disclosures Only</span>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-1 leading-relaxed">
              SEC EDGAR (10-K, 10-Q), BSE &amp; NSE filings, earnings transcripts. Linked to original regulatory sources with timestamps.
            </p>
          </div>

          <div className="mobile-audit-pillar">
            <div className="pillar-header">
              <span className="pillar-dot green" />
              <span className="font-semibold text-white text-[12.5px]">Isolated Python AST Math</span>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-1 leading-relaxed">
              Multiples, margins, and CAGR rates computed strictly in isolated Python runtimes. LLMs never invent financial figures.
            </p>
          </div>

          <div className="mobile-audit-pillar">
            <div className="pillar-header">
              <span className="pillar-dot amber" />
              <span className="font-semibold text-white text-[12.5px]">Non-Advisory Aid Guarantee</span>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-1 leading-relaxed">
              Factual synthesis engine, not an investment adviser or broker-dealer. Verify all figures before making capital decisions.
            </p>
          </div>
        </div>

        {/* Mobile Footer Dock */}
        <footer className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white font-medium">SEC EDGAR Live</span>
            </div>
            <span>© 2026 ArthaLens AI</span>
          </div>
          <p className="text-[10px] text-slate-500 text-center leading-normal">
            Evidence-first equity research aid · Not financial advice · Always verify against original filings
          </p>
        </footer>
      </section>
    </div>
  )
}
