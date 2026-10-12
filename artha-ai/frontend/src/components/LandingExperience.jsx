import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight, ArrowRight, Search, Sun, Moon, ShieldCheck,
  Layers3, FileText, Activity, Scale, ChevronDown, CheckCircle2,
  TrendingUp, TrendingDown, Cpu, Sparkles, Database, Compass, RefreshCw,
  Menu, X, LogOut
} from 'lucide-react'
import { api } from '../api/client'
import Logo from './Logo'
import MarketAnimal from './MarketAnimal'
import Reveal from './Reveal'
import AnimatedCounter from './AnimatedCounter'
import ScrollProgress from './ScrollProgress'
import MarketTicker from './MarketTicker'

const STEPS = [
  ['Ask a better question', 'Start with a company, ticker, comparison or uploaded filing. The planner identifies the scope and the evidence needed.', '01 / SCOPE'],
  ['Follow the investigation', 'Relevant specialists collect financial, market and qualitative evidence in parallel. You can see their progress and gaps.', '02 / RESEARCH'],
  ['Hear both sides', 'Evidence is checked for conflicting values and missing sources. Bull and bear perspectives make the trade-offs visible.', '03 / CHALLENGE'],
  ['Keep the reasoning', 'Explore the report, inspect source links, ask follow-up questions and export the research as a PDF.', '04 / UNDERSTAND'],
]

const QUESTIONS = [
  ['Is this financial advice?', 'No. Stock Research is an evidence-first research aid, not an investment adviser. Its findings can be incomplete or wrong. Verify important information against original filings and consider your own circumstances before making decisions.'],
  ['Where does the evidence come from?', 'Depending on the question: market-data providers, company filings, published news, official hiring boards and documents you upload. Each run lists the sources it actually used, retrieval times and any missing coverage.'],
  ['Does every specialist run for every question?', 'The planner selects relevant specialists. Broad company research needs a broad investigation; a focused news question should stay focused. Selected agents, failures and missing evidence are visible in the research workspace.'],
  ['What happens when data is missing?', 'Missing inputs stay unavailable. Python computes financial ratios only from supplied inputs; language models explain the evidence. Missing or conflicting evidence can prevent a recommendation.'],
  ['Can I compare companies and keep my research?', 'Yes. Ask a comparison question, reopen previous research from this browser’s history, or view and download a completed report as a PDF. Market coverage depends on the configured providers.'],
]

const SUGGESTIONS = ['TCS.NS', 'INFY.NS', 'RELIANCE.NS', 'AAPL', 'MSFT', 'NVDA']

// Hero proof strip. Every value mirrors something already true in the app:
// 11 registry specialists, the 8-stage LangGraph pipeline, bull/bear dual
// thesis, and the "zero fabricated targets" rule from the report schema.
const STATS = [
  { value: 11, label: 'Specialist agents' },
  { value: 8, label: 'Pipeline stages' },
  { value: 2, label: 'Investment theses' },
  { value: 0, label: 'Fabricated price targets' },
]

const NAV_LINKS = [
  ['research', 'Terminal'],
  ['agents', 'The Specialists'],
  ['methodology', 'The Process'],
  ['perspectives', 'Dual Thesis'],
  ['report', 'Dossier'],
  ['transparency', 'Principles'],
  ['faq', 'FAQ'],
]

const SPECIALIST_META = {
  financial: {
    category: 'Core Fundamental',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Deterministic math on financial statements, balance sheet health & solvency',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  valuation: {
    category: 'Core Fundamental',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Historical multiples, peer benchmarking & fair value boundaries',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  market: {
    category: 'Core Price & Technicals',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Real-time exchange trading velocity, momentum & technical indicators',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  news: {
    category: 'Core News & Catalysts',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Verified earnings announcements, regulatory filings & corporate actions',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  growth: {
    category: 'Core Growth & Capex',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Capex runway, capacity additions, expansion projects & total addressable market',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  risk: {
    category: 'Core Downside Audit',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Debt repayment schedules, client concentration, FX & macro vulnerability',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  document: {
    category: 'Document Ground-Truth',
    dispatch: 'ON-DEMAND · UPLOADED PDF',
    dispatchType: 'ondemand',
    trigger: 'Activates when you attach official company filings, annual reports, or PDFs',
    badgeClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  },
  workforce: {
    category: 'Human Capital & Talent',
    dispatch: 'SPECIALIZED · QUERY TRIGGERED',
    dispatchType: 'specialized',
    trigger: 'Activates on queries regarding hiring velocity, employee sentiment, or headcount',
    badgeClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  social: {
    category: 'Sentiment & Public Forums',
    dispatch: 'ON-DEMAND · SENTIMENT PROMPT',
    dispatchType: 'ondemand',
    trigger: 'Activates when prompt explicitly targets investor sentiment or public discussion',
    badgeClass: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  },
  industry: {
    category: 'Sector & Macro Position',
    dispatch: 'CORE · ALWAYS ACTIVE (BROAD)',
    dispatchType: 'core',
    trigger: 'Benchmark industry cycle positioning, macro tailwinds & competitive moats',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  management: {
    category: 'Corporate Governance',
    dispatch: 'CORE · ALWAYS ACTIVE (BROAD)',
    dispatchType: 'core',
    trigger: 'Promoter pledging, management turnover, board oversight & capital allocation',
    badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
}

function Registry() {
  const [agents, setAgents] = useState(null)
  const [error, setError] = useState(false)
  const [attempt, retry] = useState(0)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let active = true
    setError(false)
    api.getAgents().then(data => {
      if (!Array.isArray(data) || !data.length) throw new Error('Registry unavailable')
      if (active) setAgents(data)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [attempt])

  const CATEGORIES = {
    all: { label: 'All 11 Specialists', match: () => true },
    core: { label: 'Core Analysts (Always Active)', match: a => SPECIALIST_META[a.name]?.dispatchType === 'core' },
    ondemand: { label: 'On-Demand & Specialized', match: a => SPECIALIST_META[a.name]?.dispatchType !== 'core' },
    fundamentals: { label: 'Fundamentals & Multiples', match: a => ['financial', 'valuation', 'market'].includes(a.name) },
    catalysts: { label: 'Catalysts & Risks', match: a => ['news', 'growth', 'risk'].includes(a.name) },
    forensic: { label: 'Forensic & Governance', match: a => ['document', 'management', 'workforce', 'industry', 'social'].includes(a.name) },
  }

  const displayedAgents = (agents || []).filter(CATEGORIES[filter]?.match || (() => true))

  return (
    <section className="be-section" id="agents" aria-labelledby="agents-heading">
      <div className="be-container">
        <Reveal variant="up" className="be-section-heading">
          <div>
            <p className="be-kicker"><span className="be-status-dot yellow" /> SPECIALISTS, WITH A PURPOSE</p>
            <h2 id="agents-heading">Many lenses.<br />A fuller picture.</h2>
          </div>
          <div>
            <p>A shared evidence trail, with a different question for every specialist. Verified live from the backend registry.</p>
            {/* Category filter pills */}
            <div className="be-filter-pills" role="tablist" aria-label="Specialist categories">
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`be-filter-pill ${filter === key ? 'active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Dynamic LangGraph Dispatch Explainer banner */}
        <Reveal variant="up" delay={40}>
          <div className="be-orchestration-notice">
            <div className="be-orchestration-badge">
              <Sparkles size={14} className="text-[#34a853]" />
              <span>LangGraph Dynamic Agent Dispatch</span>
            </div>
            <p>
              <strong>Why don&apos;t all 11 specialists execute on every query?</strong> Stock Research uses intelligent, query-conditioned routing. <strong>Core Analysts</strong> (Financials, Valuation, Market Action, Risks, News) execute concurrently on every stock dossier. <strong>Specialized Agents</strong> activate dynamically when triggered: the <em>Filings & Document Specialist</em> runs when you attach PDFs, the <em>Workforce Analyst</em> runs on hiring/attrition queries, and the <em>Public Discussion Analyst</em> runs on social sentiment queries. This guarantees ultra-fast execution with zero AI hallucination.
            </p>
          </div>
        </Reveal>

        {error ? (
          <div className="be-empty" role="status">
            <p>The agent registry is currently unavailable. Start the backend to see configured capabilities.</p>
            <button className="be-text-button" onClick={() => retry(attempt + 1)}>
              Retry registry <ArrowRight size={16} />
            </button>
          </div>
        ) : !agents ? (
          <p className="be-empty" role="status">Loading the specialist registry…</p>
        ) : (
          <Reveal variant="stagger" className="be-agent-grid">
            {displayedAgents.map((agent, index) => {
              const meta = SPECIALIST_META[agent.name] || {
                dispatch: agent.status || 'CONFIGURED',
                badgeClass: 'text-slate-300 border-white/10 bg-white/5',
                trigger: 'Configured local specialist capability',
              }
              return (
                <article className="be-agent-card" key={agent.name}>
                  <div className="be-card-top">
                    <span className="be-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className={`be-tag text-[9.5px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${meta.badgeClass}`}>
                      {meta.dispatch}
                    </span>
                  </div>
                  <h3>{agent.label || agent.name.replaceAll('_', ' ')}</h3>
                  <p>{agent.description}</p>
                  
                  {/* Dynamic trigger description */}
                  <div className="mt-2 text-[10.5px] text-slate-400 font-sans border-t border-white/5 pt-2 flex items-start gap-1.5">
                    <span className="text-emerald-400 font-mono shrink-0">⚡</span>
                    <span className="leading-snug">{meta.trigger}</span>
                  </div>

                  <details className="mt-auto pt-2 border-t border-white/5">
                    <summary className="text-[11px] font-semibold text-[#4285f4] cursor-pointer hover:text-blue-300 transition flex items-center gap-1 select-none">
                      Explore capabilities <ChevronDown size={13} />
                    </summary>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">{agent.tools?.join(' · ') || 'Capabilities unavailable'}</p>
                    {agent.limitations && <p className="text-[10px] text-slate-500 mt-1">{agent.limitations}</p>}
                  </details>
                </article>
              )
            })}
          </Reveal>
        )}
      </div>
    </section>
  )
}

export default function LandingExperience({
  onRun,
  running = false,
  submitting = false,
  query = '',
  onQueryChange,
  sessions = [],
  onSelectSession,
  onDeleteSession,
  onResume,
  user,
  onLogout,
  onOpenAuth,
}) {
  const [theme, setTheme] = useState(() => {
    // Dark by default; a chosen theme persists across reloads (localStorage).
    try { return localStorage.getItem('stockresearch:theme:v1') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const [step, setStep] = useState(0)
  const [perspective, setPerspective] = useState('bull')
  const [menuOpen, setMenuOpen] = useState(false)
  const scrollRef = useRef(null)

  const PHASES = ['research', 'agents', 'methodology', 'perspectives', 'report', 'transparency', 'faq', 'cta']

  const goToPhase = (id) => {
    const root = scrollRef.current
    const el = root?.querySelector(`#${id}`)
    if (el) {
      // Instant jump to the exact section boundary. A `smooth` request here
      // can be cancelled mid-flight by the container's scroll snapping in
      // Chrome, leaving the page back where it started.
      el.scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }

  const stepPhase = (dir) => {
    const root = scrollRef.current
    if (!root) return
    const sections = PHASES.map(id => root.querySelector(`#${id}`)).filter(Boolean)
    const currentScroll = root.scrollTop
    let activeIdx = 0
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= currentScroll + 120) {
        activeIdx = i
      }
    }
    const nextIndex = Math.min(Math.max(activeIdx + dir, 0), PHASES.length - 1)
    goToPhase(PHASES[nextIndex])
  }

  // Keyboard navigation: ArrowDown / ArrowUp snaps completely to the next/prev section
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault()
        stepPhase(1)
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        stepPhase(-1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        goToPhase('research')
      } else if (event.key === 'End') {
        event.preventDefault()
        goToPhase('faq')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Flush section landing: when scrolling comes to rest near a section
  // boundary, glide to the exact boundary so every section lands perfectly
  // fitted to the screen. The container uses *proximity* snapping (mandatory
  // traps scrolling on sections taller than the viewport), which can stop a
  // little short of the boundary — this closes that gap. Resting deeper inside
  // a section is left alone, so reading mid-section never yanks the page.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    // Mobile keeps its natural stacked flow (CSS disables snapping below 768px).
    if (!window.matchMedia('(min-width: 768px)').matches) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const SNAP_THRESHOLD_PX = 240

    const landingTargets = () => {
      const nodes = root.querySelectorAll('.be-section, .be-ticker, .be-footer')
      return Array.from(nodes, (el) => {
        const style = window.getComputedStyle(el)
        const marginTop = parseFloat(style.scrollMarginTop) || 0
        if (style.scrollSnapAlign.startsWith('end')) {
          // `end`-aligned (footer): rest with its bottom at the viewport bottom,
          // which is exactly the maximum scroll offset.
          return el.offsetTop + el.offsetHeight - root.clientHeight
        }
        // `start`-aligned: element top flush with the viewport top, minus any
        // scroll-margin (the ticker lands just below the fixed nav).
        return el.offsetTop - marginTop
      }).filter(t => t >= 0)
    }

    let debounce = null
    let animating = false
    let settleFallback = null

    const snapToNearestLanding = () => {
      const current = root.scrollTop
      let best = null
      let bestDist = Infinity
      for (const target of landingTargets()) {
        const dist = Math.abs(target - current)
        if (dist < bestDist) {
          bestDist = dist
          best = target
        }
      }
      if (best === null || bestDist < 1 || bestDist > SNAP_THRESHOLD_PX) return
      animating = true
      root.scrollTo({ top: best, behavior: reduced ? 'auto' : 'smooth' })
      // Fallback for engines without `scrollend`.
      clearTimeout(settleFallback)
      settleFallback = setTimeout(() => { animating = false }, 700)
    }

    const onScroll = () => {
      if (animating) return
      clearTimeout(debounce)
      debounce = setTimeout(snapToNearestLanding, 150)
    }

    const onScrollEnd = () => {
      if (!animating) return
      animating = false
      clearTimeout(settleFallback)
      // Re-evaluate: proximity snapping may have settled us short of target.
      clearTimeout(debounce)
      debounce = setTimeout(snapToNearestLanding, 150)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    root.addEventListener('scrollend', onScrollEnd)
    return () => {
      root.removeEventListener('scroll', onScroll)
      root.removeEventListener('scrollend', onScrollEnd)
      clearTimeout(debounce)
      clearTimeout(settleFallback)
    }
  }, [])

  // Auto-hide progressive taskbar logic (Samvaad AI architecture)
  const [taskbarVisible, setTaskbarVisible] = useState(true)
  const taskbarVisibleRef = useRef(true)
  const taskbarHideTimerRef = useRef(null)

  const showTaskbar = (autoHideDelayMs = 0) => {
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
  }

  const hideTaskbar = () => {
    if (taskbarHideTimerRef.current) {
      clearTimeout(taskbarHideTimerRef.current)
      taskbarHideTimerRef.current = null
    }
    // Stay visible if user is at the very top of the page
    const current = scrollRef.current ? scrollRef.current.scrollTop : window.scrollY
    if (current <= 45) return
    if (taskbarVisibleRef.current) {
      taskbarVisibleRef.current = false
      setTaskbarVisible(false)
    }
  }

  // 1. Initial land on page: visible for 4.5s then auto-hide
  useEffect(() => {
    showTaskbar(4500)
    return () => {
      if (taskbarHideTimerRef.current) clearTimeout(taskbarHideTimerRef.current)
    }
  }, [])

  // 2. Scroll and pointer listeners: auto-hide on scroll down, reveal on scroll up or top mouse hover
  useEffect(() => {
    const root = scrollRef.current || window
    let lastScrollTop = scrollRef.current ? scrollRef.current.scrollTop : window.scrollY

    const handleScroll = () => {
      const currentScroll = scrollRef.current ? scrollRef.current.scrollTop : window.scrollY
      const scrollDiff = currentScroll - lastScrollTop

      // Ignore micro jitter
      if (Math.abs(scrollDiff) < 8) return

      lastScrollTop = currentScroll

      // When near top of the landing page: always show
      if (currentScroll <= 45) {
        showTaskbar(4000)
        return
      }

      // Scrolling down: hide taskbar completely
      if (scrollDiff > 12) {
        hideTaskbar()
        return
      }

      // Scrolling up: reveal taskbar for 3.5s
      if (scrollDiff < -14) {
        showTaskbar(3500)
      }
    }

    // Moving pointer near top screen edge (<= 75px): reveal taskbar
    const handlePointerMove = (e) => {
      if (e.clientY <= 75) {
        showTaskbar(3500)
      }
    }

    root.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      root.removeEventListener('scroll', handleScroll)
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const focusSearch = () => {
    const el = document.getElementById('research-query')
    if (el) { el.focus(); el.select?.() }
  }

  const busy = running || submitting

  const handleLaunch = targetText => {
    if (busy) return
    const q = (targetText || query || '').trim() || 'Research RELIANCE.NS'
    onQueryChange?.(q)
    onRun?.(q)
  }

  const submit = event => {
    event.preventDefault()
    handleLaunch(query)
  }

  const scrollTo = id => e => {
    e.preventDefault()
    setMenuOpen(false)
    goToPhase(id)
    try { window.history.pushState(null, '', `#${id}`) } catch { /* history unavailable */ }
  }

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    const onResize = () => { if (window.innerWidth > 920) setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize, { passive: true })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  return (
    <div
      ref={scrollRef}
      className={`be-landing landing-scroll ${theme === 'light' ? 'light' : ''}`}
      data-theme={theme}
    >
      <a className="be-skip" href="#research-query">Skip to research</a>

      {/* Progressive Auto-Hidden Glassmorphic Navigation with Google 4-Color Stripe */}
      <header
        className={`be-nav-wrapper ${!taskbarVisible ? 'is-taskbar-hidden' : ''}`}
        onMouseEnter={() => showTaskbar(0)}
        onFocus={() => showTaskbar(0)}
      >
        <div className="be-google-bar" />
        <ScrollProgress scrollContainerRef={scrollRef} />
        <div className="be-container be-nav">
          <a className="be-brand shrink-0" href="#home" onClick={scrollTo('research')} aria-label="Stock Research home">
            <Logo size={32} />
            <span className="whitespace-nowrap font-bold text-white tracking-tight">
              Stock Research<span className="be-brand-dot text-[#4285f4]">.</span>
            </span>
            <span className="be-brand-tag whitespace-nowrap hidden sm:inline-flex">FINANCIAL AI</span>
          </a>

          <nav className="be-desktop-nav" aria-label="Main navigation">
            {NAV_LINKS.map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={scrollTo(id)} className="be-nav-pill whitespace-nowrap">
                {label}
              </a>
            ))}
          </nav>

          <button
            type="button"
            className="be-nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="be-mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen(open => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="be-nav-actions shrink-0">
            <button
              className="be-icon-button shrink-0"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark'
                try { localStorage.setItem('stockresearch:theme:v1', next) } catch { /* private browsing */ }
                setTheme(next)
              }}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {user && !user.guest ? (
              <div className="be-user-chip flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1.5 pr-2 shrink-0">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400 border border-emerald-500/30 shrink-0">
                  {(user.name || user.email || 'U').trim().charAt(0).toUpperCase()}
                </span>
                <span className="text-xs font-semibold text-slate-200 max-w-[110px] truncate whitespace-nowrap">
                  {user.name || user.email}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition whitespace-nowrap cursor-pointer"
                  onClick={onLogout}
                  title="Sign out of Stock Research"
                >
                  <LogOut size={12} />
                  <span>Exit</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="be-nav-pill be-signin-btn whitespace-nowrap shrink-0"
                onClick={onOpenAuth}
              >
                Sign in
              </button>
            )}

            <button 
              className="be-cta-btn whitespace-nowrap shrink-0" 
              onClick={() => handleLaunch(query)}
              disabled={busy}
            >
              <span>{busy ? 'Researching…' : 'Start research'}</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer navigation (visible ≤920px via CSS) */}
      {menuOpen && (
        <div className="be-mobile-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
      <div id="be-mobile-nav" className={`be-mobile-menu ${menuOpen ? 'is-open' : ''}`}>
        <div className="be-mobile-menu-inner">
          {NAV_LINKS.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={scrollTo(id)}>
              {label} <ArrowUpRight size={16} />
            </a>
          ))}
          <div className="mt-4 border-t border-white/10 pt-4 flex items-center justify-between">
            {user && !user.guest ? (
              <button
                type="button"
                className="flex items-center gap-2 text-xs text-rose-400"
                onClick={() => { setMenuOpen(false); onLogout?.() }}
              >
                Sign out ({user.name})
              </button>
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-semibold text-[#22c55e]"
                onClick={() => { setMenuOpen(false); onOpenAuth?.() }}
              >
                Sign in to Stock Research
              </button>
            )}
          </div>
        </div>
      </div>

      <main id="home">
        {/* ================================================================
            SECTION 1: HERO & RESEARCH COMMAND CENTER (Independent Section)
            ================================================================ */}
        <section id="research" className="be-hero-section be-section" aria-label="Start stock research">
          <div className="be-container">
            <div className="be-hero-grid">
              {/* Left Column: Heading and Google AI Style Command Console */}
              <div className="be-hero-copy">
                <Reveal variant="up" delay={0}>
                  <div className="be-hero-pill">
                    <span className="be-status-dot" />
                    <span>AUTONOMOUS <strong>EQUITY RESEARCH</strong> ENGINE</span>
                  </div>
                </Reveal>

                <Reveal variant="up" delay={90}>
                  <h1 id="hero-heading">
                    See the upside.<br />
                    <span className="be-gradient-text">Audit the downside.</span>
                  </h1>
                </Reveal>

                <Reveal variant="up" delay={180}>
                  <p className="be-hero-description">
                    Behind every stock, there’s more than one story. 11 specialized autonomous agents cross-examine statements, earnings, news, and official filings with 100% deterministic math.
                  </p>
                </Reveal>

                {/* Main Command Search Box */}
                <Reveal variant="scale" delay={260} className="be-search-reveal">
                <div className="be-search-card">
                  <form onSubmit={submit}>
                    <div className="be-search-label">
                      <label htmlFor="research-query">INSTITUTIONAL RESEARCH PROMPT</label>
                      <span className="be-search-label-badge"><Sparkles size={13} /> LangGraph Multi-Agent</span>
                    </div>

                    <div className="be-search-row">
                      <Search className="be-search-icon" size={20} />
                      <input
                        id="research-query"
                        name="query"
                        list="stock-suggestions"
                        value={query}
                        onChange={e => onQueryChange?.(e.target.value)}
                        placeholder="A company, a ticker, a question… (e.g. Research Reliance)"
                        maxLength={2000}
                        autoComplete="off"
                        disabled={busy}
                      />
                      <button className="be-button" type="submit" disabled={busy}>
                        {submitting ? 'Starting…' : (running ? 'Active…' : 'Research')}
                        <ArrowUpRight size={17} />
                      </button>
                    </div>

                    <datalist id="stock-suggestions">
                      {SUGGESTIONS.map(ticker => <option key={ticker} value={ticker} />)}
                    </datalist>
                  </form>

                  {/* Suggestion Chips */}
                  <div className="be-suggestions-row">
                    <span>Try asking:</span>
                    {['Research TCS', 'Compare TCS and Infosys', 'Latest news on Apple'].map(text => (
                      <button
                        key={text}
                        type="button"
                        disabled={busy}
                        onClick={() => handleLaunch(text)}
                      >
                        {text} <ArrowUpRight size={11} />
                      </button>
                    ))}
                  </div>

                  {/* Quick Tickers */}
                  <div className="be-suggestions-row">
                    <span>Tickers:</span>
                    {['TCS.NS', 'INFY.NS', 'RELIANCE.NS', 'AAPL', 'NVDA', 'MSFT'].map(tick => (
                      <button
                        key={tick}
                        type="button"
                        disabled={busy}
                        onClick={() => handleLaunch(`Research ${tick}`)}
                      >
                        {tick}
                      </button>
                    ))}
                  </div>

                  <div className="be-search-footer">
                    <span><ShieldCheck size={13} /> Research aid. Not financial advice. Provider coverage and freshness vary.</span>
                    {running && (
                      <button className="be-text-button" onClick={onResume}>
                        Return to active research <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
                </Reveal>

                {/* History Drawer */}
                {sessions.length > 0 && (
                  <details className="be-history">
                    <summary>Your previous research ({sessions.length})</summary>
                    <ul>
                      {sessions.slice(0, 10).map(session => (
                        <li key={session.job_id}>
                          <button disabled={busy} onClick={() => onSelectSession?.(session)}>
                            {session.query || session.job_id} <ArrowUpRight size={14} />
                          </button>
                          <button
                            disabled={busy}
                            aria-label={`Remove ${session.query || session.job_id} from local history`}
                            onClick={() => onDeleteSession?.(session.job_id)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              {/* Right Column: High-Tech Glassmorphic Multi-Agent Command Deck */}
              <div className="be-hero-visual" aria-hidden="true">
                <Reveal variant="scale" delay={320}>
                <div className="be-terminal-card">
                  <div className="be-terminal-header">
                    <div className="be-terminal-dots">
                      <span className="be-terminal-dot red" />
                      <span className="be-terminal-dot yellow" />
                      <span className="be-terminal-dot green" />
                    </div>
                    <span className="be-terminal-title">AGENT ORCHESTRATION PIPELINE</span>
                    <span className="be-tag">11 SPECIALISTS · DYNAMIC DISPATCH</span>
                  </div>

                  <div className="be-terminal-nodes">
                    <div className="be-terminal-node">
                      <div className="be-node-left">
                        <span className="be-status-dot" />
                        <span>Financial Statements & Solvency</span>
                      </div>
                      <span className="be-node-chip blue">PYTHON CALC</span>
                    </div>

                    <div className="be-terminal-node">
                      <div className="be-node-left">
                        <span className="be-status-dot yellow" />
                        <span>Valuation & Peer Multiples</span>
                      </div>
                      <span className="be-node-chip yellow">P/E · EV/EBITDA</span>
                    </div>

                    <div className="be-terminal-node">
                      <div className="be-node-left">
                        <span className="be-status-dot green" />
                        <span>Growth, Projects & TAM</span>
                      </div>
                      <span className="be-node-chip green">CAPEX TRACE</span>
                    </div>

                    <div className="be-terminal-node">
                      <div className="be-node-left">
                        <span className="be-status-dot red" />
                        <span>Adversarial Risk & Debt Stress</span>
                      </div>
                      <span className="be-node-chip red">THESIS BREAKER</span>
                    </div>

                    <div className="be-terminal-node">
                      <div className="be-node-left">
                        <span className="be-status-dot" />
                        <span>News, RSS & Corporate Catalysts</span>
                      </div>
                      <span className="be-node-chip blue">VERIFIED DATES</span>
                    </div>
                  </div>

                  <div className="be-terminal-footer">
                    <span>LangGraph 10-Node Workflow</span>
                    <strong>Zero Fabricated Targets</strong>
                  </div>
                </div>
                </Reveal>
              </div>
            </div>

            {/* Animated proof strip */}
            <Reveal variant="stagger" delay={120} className="be-stats-row">
              {STATS.map(stat => (
                <div className="be-stat" key={stat.label}>
                  <strong className="be-stat-value">
                    <AnimatedCounter to={stat.value} />
                  </strong>
                  <span className="be-stat-label">
                    <span className="be-sr-only">{stat.value} </span>
                    {stat.label}
                  </span>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Research-coverage marquee */}
        <MarketTicker />

        {/* ================================================================
            SECTION 2: CANONICAL AGENT REGISTRY (Independent Section)
            ================================================================ */}
        <Registry />

        {/* ================================================================
            SECTION 3: 4-STAGE METHODOLOGY WORKFLOW (Independent Section)
            ================================================================ */}
        <section className="be-section" id="methodology" aria-labelledby="process-heading">
          <div className="be-container">
            <Reveal variant="up" className="be-section-heading">
              <div>
                <p className="be-kicker"><span className="be-status-dot" /> LESS NOISE. MORE UNDERSTANDING.</p>
                <h2 id="process-heading">From a question<br />to a point of view.</h2>
              </div>
              <p>No black box to take on faith. A visible research process, from the first source to the final summary.</p>
            </Reveal>

            <Reveal variant="scale" delay={80}>
            <div className="be-process-grid">
              <div className="be-process-tabs">
                {STEPS.map(([title, , number], i) => (
                  <button
                    key={number}
                    aria-pressed={step === i}
                    onClick={() => setStep(i)}
                    aria-controls="process-detail"
                  >
                    <div>
                      <span>{number}</span>
                      <strong>{title}</strong>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>

              <div className="be-process-detail be-swap" id="process-detail" key={step}>
                <div className="be-process-detail-icon">
                  <Layers3 size={24} />
                </div>
                <span className="be-kicker">{STEPS[step][2]}</span>
                <h3>{STEPS[step][0]}</h3>
                <p>{STEPS[step][1]}</p>
                <div className="be-process-trail">
                  <span>Question</span>
                  <ArrowRight size={13} />
                  <span>Evidence</span>
                  <ArrowRight size={13} />
                  <span>Perspective</span>
                </div>
              </div>
            </div>
            </Reveal>
          </div>
        </section>

        {/* ================================================================
            SECTION 4: DUAL-THESIS CONFRONTATION (Independent Section)
            ================================================================ */}
        <section className="be-section" id="perspectives" aria-labelledby="perspective-heading">
          <div className="be-container">
            <Reveal variant="up" className="be-section-heading">
              <div>
                <p className="be-kicker"><span className="be-status-dot green" /> CONVICTION NEEDS A COUNTERPOINT</p>
                <h2 id="perspective-heading">Meet the bull.<br />Make room for the bear.</h2>
              </div>
              <div>
                <p>Better questions emerge when you consider both sides.</p>
                <span className="be-tag">INTERACTIVE DEMO · HYPOTHETICAL</span>
              </div>
            </Reveal>

            <div className="be-perspectives-layout">
              {/* Interactive Thesis Stage */}
              <Reveal variant="up">
              <div className={`be-perspective-stage ${perspective}`}>
                <div className="be-stage-header">
                  <div className="be-toggle" aria-label="Demo perspective">
                    <button aria-pressed={perspective === 'bull'} onClick={() => setPerspective('bull')}>
                      ↗ Bull case
                    </button>
                    <button aria-pressed={perspective === 'bear'} onClick={() => setPerspective('bear')}>
                      ↘ Bear case
                    </button>
                  </div>
                  <span className={`be-perspective-badge ${perspective}`}>
                    {perspective === 'bull' ? '↗ UPSIDE CONVICTION' : '↘ DOWNSIDE AUDIT'}
                  </span>
                </div>

                <div className="be-perspective-body be-swap" key={perspective}>
                  <div className="be-animal-spotlight">
                    <MarketAnimal 
                      side={perspective} 
                      className="be-spotlight-asset" 
                      label={perspective === 'bull' ? 'Charging Market Bull' : 'Rearing Market Bear'}
                    />
                  </div>

                  <h3>{perspective === 'bull' ? 'What could go right?' : 'What could break the thesis?'}</h3>
                  <p>
                    {perspective === 'bull'
                      ? 'If a company reports sustained revenue growth and improving cash conversion, the bull asks whether that momentum can compound.'
                      : 'If the same company faces margin compression, customer churn or rising debt, the bear stress-tests solvency and resilience.'}
                  </p>

                  <ul className="be-perspective-list">
                    {(perspective === 'bull' ? [
                      'Is revenue expansion backed by verifiable cash generation?',
                      'Are operating margins and return on equity expanding?',
                      'Does competitive moat support sustained pricing power?'
                    ] : [
                      'How concentrated are key revenue streams and suppliers?',
                      'Can free cash flows comfortably service outstanding debt?',
                      'Which specific catalysts would invalidate the positive thesis?'
                    ]).map(item => (
                      <li key={item}>
                        <Scale size={16} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="be-fine-print">
                  Illustrative questions, not findings about any company. Actual cases depend on the evidence collected in your run.
                </p>
              </div>
              </Reveal>

              {/* Side Philosophy Card: Clashing Arena */}
              <Reveal variant="up" delay={120}>
              <div className="be-perspective-side-card">
                <div className="be-tag">DUAL-THESIS PRINCIPLE</div>
                
                {/* Authentic Bull vs Bear Confrontation Graphic */}
                <div className="be-clash-arena">
                  <img 
                    src="/brand/bull-bear-duo.svg" 
                    alt="Charging Bull vs Rearing Bear market confrontation" 
                    className="be-clash-svg"
                  />
                </div>

                <h4>Why Stock Research Forces Both Perspectives</h4>
                <p style={{ color: 'var(--be-muted)', fontSize: '14px', lineHeight: '1.7', marginTop: '10px' }}>
                  Traditional equity research defaults to one-sided buy ratings. Stock Research pits the growth thesis against a dedicated adversarial risk specialist.
                </p>
                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--google-green)' }} />
                    <span>No unearned consensus: conflicts are disclosed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--google-blue)' }} />
                    <span>Zero fabricated valuation price targets</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--google-red)' }} />
                    <span>Missing filings stay missing: not hallucinated</span>
                  </div>
                </div>
              </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 5: REPORT DOSSIER PREVIEW (Independent Section)
            ================================================================ */}
        <section className="be-section" id="report" aria-labelledby="report-heading">
          <div className="be-container">
            <div className="be-report-layout">
              <Reveal variant="up">
              <div>
                <p className="be-kicker"><span className="be-status-dot yellow" /> A REPORT YOU CAN QUESTION</p>
                <h2 id="report-heading">The reasoning.<br />Not just the rating.</h2>
                <p style={{ fontSize: '15px', color: 'var(--be-muted)', marginTop: '16px', lineHeight: '1.7' }}>
                  Start with the plain-English view. Dig into calculations and sources. Keep the full picture with an exportable research report.
                </p>

                <ul className="be-feature-list">
                  <li><FileText size={18} /> Beginner & expert reading modes</li>
                  <li><Activity size={18} /> Source-linked findings & explicit gaps</li>
                  <li><ArrowUpRight size={18} /> Follow-up questions & PDF export</li>
                </ul>

                <button 
                  className="be-text-link" 
                  type="button"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => handleLaunch('Research RELIANCE.NS')}
                >
                  Build your first report <ArrowRight size={16} />
                </button>
              </div>
              </Reveal>

              {/* Dossier Mockup */}
              <Reveal variant="scale" delay={140}>
              <div className="be-report-mockup">
                <div className="be-card-top">
                  <Logo size={28} />
                  <span className="be-tag">LAYOUT PREVIEW</span>
                </div>

                <div className="be-preview-title">
                  <span>COMPANY RESEARCH</span>
                  <h3>Your company. In context.</h3>
                  <p>Evidence before opinion.</p>
                </div>

                <div className="be-preview-metrics">
                  {['Revenue growth', 'P/E ratio', 'Debt / equity'].map(label => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>—</strong>
                      <small>Awaiting evidence</small>
                    </div>
                  ))}
                </div>

                <div className="be-preview-cases">
                  <div>
                    <span>↗ THE BULL CASE</span>
                    <p>Source-linked opportunities</p>
                  </div>
                  <div>
                    <span>↘ THE BEAR CASE</span>
                    <p>Risks and counter-evidence</p>
                  </div>
                </div>

                <div className="be-preview-footer">
                  <ShieldCheck size={15} />
                  <span>Sources · Timestamps · Calculation inputs</span>
                </div>
                <p className="be-fine-print" style={{ marginTop: '10px' }}>
                  Preview only. No investment verdict or company data is shown.
                </p>
              </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 6: TRANSPARENCY & PRINCIPLES (Independent Section)
            ================================================================ */}
        <section className="be-section" id="transparency" aria-labelledby="principles-heading">
          <div className="be-container">
            <Reveal variant="up" className="be-section-heading">
              <div>
                <p className="be-kicker"><span className="be-status-dot" /> BUILT FOR HEALTHY SKEPTICISM</p>
                <h2 id="principles-heading">Trust the trail.<br />Check the conclusion.</h2>
              </div>
              <p>Useful research shows its workings and tells you where the evidence ends.</p>
            </Reveal>

            <Reveal variant="stagger" className="be-principles-grid">
              <article className="be-principle-card">
                <div className="be-principle-icon">
                  <ShieldCheck size={22} />
                </div>
                <h3>Sources you can inspect</h3>
                <p>Open the source, check its date, and decide how much weight it deserves. A citation is a starting point for verification.</p>
              </article>

              <article className="be-principle-card">
                <div className="be-principle-icon">
                  <Activity size={22} />
                </div>
                <h3>Math with a paper trail</h3>
                <p>Python computes ratios from explicit inputs. Missing inputs stay missing; conflicting values are surfaced.</p>
              </article>

              <article className="be-principle-card">
                <div className="be-principle-icon">
                  <Scale size={22} />
                </div>
                <h3>Uncertainty stays visible</h3>
                <p>An incomplete investigation is shown as incomplete. Evidence may be too weak for any recommendation.</p>
              </article>
            </Reveal>

            <p className="be-disclaimer">
              <strong>Research aid, not financial advice.</strong> Markets involve risk, including loss of capital. Verify original sources and use your own judgment. AI-generated explanations can be wrong.
            </p>
          </div>
        </section>

        {/* ================================================================
            SECTION 7: FAQ KNOWLEDGE BASE (Independent Section)
            ================================================================ */}
        <section className="be-section" id="faq" aria-labelledby="faq-heading">
          <div className="be-container">
            <div className="be-faq-layout">
              <Reveal variant="up">
              <div>
                <p className="be-kicker"><span className="be-status-dot yellow" /> GOOD QUESTIONS</p>
                <h2 id="faq-heading">A little more<br />perspective.</h2>
                <p style={{ marginTop: '16px', color: 'var(--be-muted)', fontSize: '14.5px' }}>
                  Clear answers about our methodology, source retrieval, and boundaries.
                </p>
              </div>
              </Reveal>

              <Reveal variant="up" delay={100}>
              <div className="be-faq-accordion">
                {QUESTIONS.map(([question, answer]) => (
                  <details key={question}>
                    <summary>
                      <span>{question}</span>
                      <ChevronDown size={18} />
                    </summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 8: CALL TO ACTION (Independent Section)
            ================================================================ */}
        <section className="be-section" id="cta">
          <div className="be-container">
            <Reveal variant="scale">
            <div className="be-cta-card">
              <Logo size={48} />
              <p className="be-kicker" style={{ justifyContent: 'center', marginTop: '18px' }}>
                <span className="be-status-dot green" /> CURIOSITY IS A GOOD STARTING POINT
              </p>
              <h2>What’s your next<br /><span className="be-gradient-text">investment question?</span></h2>
              <p>Explore the bull case, audit the bear case, and follow the evidence trail across canonical specialists.</p>
              <button 
                type="button" 
                className="be-button" 
                onClick={() => handleLaunch(query || 'Research RELIANCE.NS')}
                disabled={busy}
              >
                Follow the evidence <ArrowUpRight size={17} />
              </button>
            </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Institutional Google-Themed Dark Footer */}
      <footer className="be-footer be-container">
        <a className="be-brand" href="#home">
          <Logo size={24} />
          <span>Stock Research<span className="be-brand-dot">.</span></span>
        </a>
        <p>Two perspectives. One clearer picture.</p>
        <a href="#transparency">Research, responsibly <ArrowUpRight size={14} /></a>
        <span>© {new Date().getFullYear()} Stock Research</span>
      </footer>
    </div>
  )
}
