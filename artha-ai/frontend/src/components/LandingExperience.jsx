import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Compass, Cpu, Database, FileText, Layers3, LogOut, Menu, Moon, RefreshCw, Scale, Search,
  ShieldAlert, ShieldCheck, Sparkles, Sun, Trash2, TrendingDown, TrendingUp, X,
} from 'lucide-react'
import { api } from '../api/client'
import Logo from './Logo'
import MarketAnimal from './MarketAnimal'
import Reveal from './Reveal'
import AnimatedCounter from './AnimatedCounter'
import ScrollProgress from './ScrollProgress'
import MarketTicker from './MarketTicker'

const THEME_KEY = 'stockresearch:theme:v1'

const STEPS = [
  ['Ask a better question', 'Start with a company, ticker, comparison or uploaded filing. The planner identifies the scope and the evidence needed.', '01 / SCOPE'],
  ['Follow the investigation', 'Relevant specialists collect financial, market and qualitative evidence in parallel. You can see their progress and gaps.', '02 / RESEARCH'],
  ['Hear both sides', 'Evidence is checked for conflicting values and missing sources. Bull and bear perspectives make the trade-offs visible.', '03 / CHALLENGE'],
  ['Keep the reasoning', 'Explore the report, inspect source links, ask follow-up questions and export the research as a PDF.', '04 / UNDERSTAND'],
]

const QUESTIONS = [
  {
    category: 'GOVERNANCE',
    q: 'Is this financial advice?',
    badge: 'Non-Advisory Aid',
    badgeType: 'amber',
    answer: 'No. ArthaLens AI is an evidence-first equity intelligence engine and research aid, not an investment adviser or broker-dealer. Its outputs synthesize public disclosures and deterministically computed models. Verify critical figures against original regulatory filings and consult a licensed fiduciary before making decisions.',
    pills: ['Factual synthesis only', 'Zero buy/sell recommendations', 'Verify against original filings']
  },
  {
    category: 'DATA PROVENANCE',
    q: 'Where does the evidence come from?',
    badge: 'Primary Regulators',
    badgeType: 'emerald',
    answer: 'Directly from authoritative primary sources: SEC EDGAR (10-K, 10-Q, 8-K), BSE & NSE regulatory disclosures, audited earnings call transcripts, official corporate press releases, and user-uploaded diligence packets. Every datapoint links to original filings with retrieval timestamps.',
    pills: ['SEC EDGAR 10-K/Q live', 'BSE & NSE disclosures', 'Audited earnings transcripts']
  },
  {
    category: 'ORCHESTRATION',
    q: 'Does every specialist run for every question?',
    badge: 'Dynamic DAG Routing',
    badgeType: 'cyan',
    answer: 'No. The Lead Planner analyzes user query scope and dynamically compiles a targeted Directed Acyclic Graph (DAG). A focused margin inquiry executes only valuation and financial statement specialists, while a deep diligence probe activates all 11 specialists in parallel.',
    pills: ['Planner DAG compiler', 'Parallel isolated execution', 'Minimal latency & zero hallucination']
  },
  {
    category: 'INTEGRITY GUARANTEE',
    q: 'What happens when data is missing?',
    badge: 'Zero Math Fabrication',
    badgeType: 'purple',
    answer: 'Missing data remains missing. Mathematical ratios, margins, and multiples are computed strictly in isolated Python 3.11 AST runtimes from confirmed filing tables. LLMs never invent or estimate missing financial figures; coverage gaps are explicitly surfaced in the audit matrix.',
    pills: ['Python AST math runtime', 'Zero generative hallucination', 'Explicit gap notification']
  },
  {
    category: 'WORKFLOW & PERSISTENCE',
    q: 'Can I compare companies and keep my research?',
    badge: 'Cross-Peer & Vector PDF',
    badgeType: 'blue',
    answer: 'Yes. Execute side-by-side comparative analyses across peers (e.g. NVDA vs AMD or TCS vs INFY), inspect historical research sessions preserved in local workspace storage, and export comprehensive institutional-grade vector PDF research dossiers with complete citation appendices.',
    pills: ['Multi-company side-by-side', 'Local audit persistence', 'Audited PDF dossier export']
  }
]

const SUGGESTIONS = ['TCS.NS', 'INFY.NS', 'RELIANCE.NS', 'AAPL', 'MSFT', 'NVDA']

const PROMPT_SUGGESTIONS = [
  'Compare TCS and Infosys on margins',
  'What are the risks in RELIANCE.NS?',
  'Is NVDA expensive versus its own history?',
]

const TYPEWRITER_PHRASES = [
  'read like an analyst.',
  'show both sides.',
  'cite every number.',
  'admit what is missing.',
]

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
  ['research', 'Research'],
  ['agents', 'Specialists'],
  ['engine', 'Dual-Thesis Engine'],
  ['report', 'Dossier Preview'],
  ['faq', 'FAQ'],
]

const DOSSIER_SAMPLE_TICKERS = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    exchange: 'NASDAQ',
    period: 'FY25 Q3 Filing Audit',
    growth: '+94.2%',
    growthPeriod: 'YoY Revenue Growth',
    margin: '62.1%',
    marginDetail: '+420 bps Op. Margin',
    debt: '0.1x',
    debtDetail: 'Net Debt / EBITDA',
    target: 'None',
    targetDetail: 'Bias-Free Synthesis',
    bullPoint: 'Data center GPU demand up +112% YoY; hyperscaler capex pipeline contracted through FY26.',
    bullCitation: 'Form 10-Q (p. 42)',
    bearPoint: 'Top 3 hyperscaler clients account for 38% of sales; chip export restrictions remain an overhang.',
    bearCitation: 'Item 1A Risk Factors',
    evidenceCount: '24 Sources verified',
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    period: 'FY24 10-K Filing Audit',
    growth: '+6.1%',
    growthPeriod: 'YoY Revenue Growth',
    margin: '31.2%',
    marginDetail: 'Services Record Margin',
    debt: '0.6x',
    debtDetail: 'Fortress Cash Cushion',
    target: 'None',
    targetDetail: 'Zero Fabricated Targets',
    bullPoint: 'Services revenue hit all-time record $24.2B with 74% gross margin; active device base > 2.2B.',
    bullCitation: 'Form 10-K (p. 28)',
    bearPoint: 'Greater China revenue contracted -6.5% YoY amidst domestic smartphone competition.',
    bearCitation: 'Form 10-K (MD&A)',
    evidenceCount: '31 Sources verified',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    exchange: 'NASDAQ',
    period: 'FY25 Q1 Filing Audit',
    growth: '+16.0%',
    growthPeriod: 'YoY Revenue Growth',
    margin: '44.6%',
    marginDetail: 'Cloud Scale Operating Margin',
    debt: '0.3x',
    debtDetail: 'AAA Liquidity Balance',
    target: 'None',
    targetDetail: 'Unbiased Algorithmic Model',
    bullPoint: 'Azure cloud revenue grew +29% in constant currency; enterprise AI Copilot seats expanded 4x YoY.',
    bullCitation: 'Form 10-Q (p. 31)',
    bearPoint: 'CapEx accelerated to $19.0B in single quarter, pressuring near-term free cash flow yield.',
    bearCitation: 'Cash Flows Statement',
    evidenceCount: '28 Sources verified',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    exchange: 'NASDAQ',
    period: 'FY24 Q3 Filing Audit',
    growth: '+7.8%',
    growthPeriod: 'YoY Revenue Growth',
    margin: '10.8%',
    marginDetail: 'Storage Margin Expansion',
    debt: '-0.4x',
    debtDetail: 'Net Cash $29.1B Balance',
    target: 'None',
    targetDetail: 'Zero Speculation Rule',
    bullPoint: 'Megapack energy storage deployments up +125% YoY; auto gross margins stabilized ex-credits.',
    bullCitation: 'Form 10-Q (Energy Div)',
    bearPoint: 'Global automotive ASP compression and promotional financing subsidies pressure near-term margins.',
    bearCitation: 'Item 2 MD&A',
    evidenceCount: '22 Sources verified',
  },
  {
    symbol: 'RELIANCE.NS',
    name: 'Reliance Industries',
    exchange: 'NSE',
    period: 'Q2 FY25 Results Audit',
    growth: '+9.9%',
    growthPeriod: 'YoY Consolidated Rev',
    margin: '17.8%',
    marginDetail: 'Retail & Jio EBITDA Drive',
    debt: '0.8x',
    debtDetail: 'De-leveraged Balance Sheet',
    target: 'None',
    targetDetail: 'Evidence-First Synthesis',
    bullPoint: 'Jio ARPU increased to ₹195.1 post-tariff revision; retail footprint exceeded 18,800 stores.',
    bullCitation: 'BSE/NSE Filing (p. 18)',
    bearPoint: 'O2C segment downstream margins subdued by global refining crack spreads.',
    bearCitation: 'O2C Segmental Audit',
    evidenceCount: '26 Sources verified',
  },
]

const PIPELINE_STAGES = [
  {
    id: 'plan',
    step: '01',
    name: 'Plan',
    desc: 'Query DAG Decomposition',
    icon: Compass,
    accent: 'blue',
    agentName: 'Planner Specialist',
    agentRole: 'LangGraph Orchestrator',
    badge: '8 STAGES',
    tone: 'ok',
    action: 'Decomposing research query into deterministic sub-tasks',
    log: 'planner.compile_dag(ticker="TCS.NS", verify_filings=True)',
    evidence: 'Zero-hallucination constraint active · 4 specialists scheduled',
    metric: '18ms latency',
  },
  {
    id: 'collect',
    step: '02',
    name: 'Collect',
    desc: 'SEC & BSE Ingestion',
    icon: Database,
    accent: 'green',
    agentName: 'Evidence Ingestion Specialist',
    agentRole: 'Regulatory Data Retrieval',
    badge: '26 SOURCES',
    tone: 'ok',
    action: 'Streaming FY24 10-K & BSE audited financial tables',
    log: 'filing_ingest.extract_tables(source="BSE/NSE", p=22)',
    evidence: 'Audited tables verified: Operating Cash Flow $3,842M',
    metric: '100% cited spans',
  },
  {
    id: 'compute',
    step: '03',
    name: 'Compute',
    desc: 'Python AST Math',
    icon: Cpu,
    accent: 'yellow',
    agentName: 'Python Math Specialist',
    agentRole: 'Deterministic AST Sandbox',
    badge: '0 HALLUCINATIONS',
    tone: 'ok',
    action: 'Computing financial ratios in isolated Python 3.11 AST',
    log: 'python_sandbox.eval("FCF = CFO ($3842M) - Capex ($720M)") -> $3,122M',
    evidence: 'ROIC 24.6% · Operating Margin 24.8% vs 5-yr median 24.1%',
    metric: 'Python 3.11 AST',
  },
  {
    id: 'challenge',
    step: '04',
    name: 'Challenge',
    desc: 'Bear Stress-Test',
    icon: Scale,
    accent: 'red',
    agentName: 'Adversarial Risk Specialist',
    agentRole: "Devil's Advocate Audit",
    badge: '2 RISKS FLAGGED',
    tone: 'warn',
    action: 'Probing debt maturities, covenant headroom & margin risks',
    log: 'risk_agent.stress_test(headwind="banking_spend_drop_4.2%")',
    evidence: 'Discretionary North America IT spend flagged for bear case',
    metric: 'Audited headroom',
  },
  {
    id: 'report',
    step: '05',
    name: 'Report',
    desc: 'Dual-Thesis Synthesis',
    icon: FileText,
    accent: 'blue',
    agentName: 'Dual-Thesis Synthesis',
    agentRole: 'Balanced Dossier Compiler',
    badge: 'BULL · BEAR',
    tone: 'ok',
    action: 'Compiling concurrent Bull and Bear memo with audit trails',
    log: 'dossier.synthesize(bull_case, bear_case, footnotes_cited)',
    evidence: 'Zero fabricated targets · Fully cited analyst memo produced',
    metric: 'Audited report',
  },
]

const THESES = {
  bull: {
    label: 'Bull case',
    conviction: 'Evidence-backed',
    points: [
      'Free cash flow conversion holds above the five-year median.',
      'Order book and capex guidance both point to capacity being used.',
      'Net debt to EBITDA leaves room before covenants bite.',
    ],
    momentum: 'Momentum +',
  },
  bear: {
    label: 'Bear case',
    conviction: 'Stress-tested',
    points: [
      'Top-five client concentration carries a single-contract shock.',
      'Margin cover thins if input costs stay where they are.',
      'Multiple already sits above the sector median on forward earnings.',
    ],
    momentum: 'Momentum −',
  },
}

const SPECIALIST_META = {
  financial: {
    category: 'Core Fundamental',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Deterministic math on financial statements, balance sheet health & solvency',
    tags: ['Balance Sheet Audit', 'Free Cash Flow', 'Working Capital', 'Solvency Ratios'],
    source: 'SEC 10-K / 10-Q & BSE/NSE Filings',
    bullets: [
      'Audits trailing FCF conversion against net income',
      'Calculates interest coverage under rate shocks',
    ],
  },
  valuation: {
    category: 'Core Fundamental',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Historical multiples, peer benchmarking & fair value boundaries',
    tags: ['DCF Modeling', 'P/E & EV/EBITDA', 'Peer Benchmarking', 'Fair Value Bands'],
    source: 'Historical Financials & Peer Multiples',
    bullets: [
      'Compares 5-year median multiples vs trading peer group',
      'Determines mathematical fair value band bounds',
    ],
  },
  market: {
    category: 'Core Price & Technicals',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Real-time exchange trading velocity, momentum & technical indicators',
    tags: ['Trading Velocity', '52-Week Range', 'RSI & MACD', 'Volume Profile'],
    source: 'Real-time Exchange Market Feeds',
    bullets: [
      'Tracks moving average crossovers and institutional volume',
      'Audits RSI overbought & oversold risk boundaries',
    ],
  },
  news: {
    category: 'Core News & Catalysts',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Verified earnings announcements, regulatory filings & corporate actions',
    tags: ['Earnings Calls', 'Regulatory Actions', 'Contract Wins', 'M&A Pipeline'],
    source: 'Official Press Releases & SEBI / SEC Filings',
    bullets: [
      'Cross-verifies headlines with audited regulatory disclosures',
      'Detects timeline shifts in corporate guidance',
    ],
  },
  growth: {
    category: 'Core Growth & Capex',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Capex runway, capacity additions, expansion projects & total addressable market',
    tags: ['Capex Deployment', 'TAM Expansion', 'Capacity Utilization', 'Revenue Run-rate'],
    source: 'Investor Presentations & Management Guidance',
    bullets: [
      'Audits capex conversion to asset turnover',
      'Analyzes total addressable market expansion runway',
    ],
  },
  risk: {
    category: 'Core Downside Audit',
    dispatch: 'CORE · ALWAYS ACTIVE',
    dispatchType: 'core',
    trigger: 'Debt repayment schedules, client concentration, FX & macro vulnerability',
    tags: ['Debt Maturity', 'Client Concentration', 'FX Sensitivity', 'Margin Erosion'],
    source: 'Audited Debt Schedules & Risk Disclosures',
    bullets: [
      'Stress-tests debt maturities against baseline cash flow',
      'Measures top-5 customer revenue concentration vulnerability',
    ],
  },
  document: {
    category: 'Document Ground-Truth',
    dispatch: 'ON-DEMAND · UPLOADED PDF',
    dispatchType: 'ondemand',
    trigger: 'Activates when you attach official company filings, annual reports, or PDFs',
    tags: ['10-K / Annual Reports', 'Footnote Audit', 'Table Extraction', 'Cross-Verification'],
    source: 'User Attached Official PDF Documents',
    bullets: [
      'Extracts and cross-references financial disclosure tables',
      'Surfaces risk factors buried in annual report footnotes',
    ],
  },
  workforce: {
    category: 'Human Capital & Talent',
    dispatch: 'SPECIALIZED · QUERY TRIGGERED',
    dispatchType: 'specialized',
    trigger: 'Activates on queries regarding hiring velocity, employee sentiment, or headcount',
    tags: ['Attrition Velocity', 'Glassdoor Sentiment', 'Headcount Growth', 'R&D Talent'],
    source: 'Labor Filings & Verified Talent Insights',
    bullets: [
      'Monitors hiring velocity against stated corporate growth',
      'Evaluates key leadership and engineering attrition rates',
    ],
  },
  social: {
    category: 'Sentiment & Public Forums',
    dispatch: 'ON-DEMAND · SENTIMENT PROMPT',
    dispatchType: 'ondemand',
    trigger: 'Activates when prompt explicitly targets investor sentiment or public discussion',
    tags: ['Investor Sentiment', 'Forum Trajectory', 'Hype vs Reality', 'Retail Velocity'],
    source: 'Public Investor Forums & Verified Discussions',
    bullets: [
      'Quantifies retail forum discussion velocity vs institutional volume',
      'Detects speculative sentiment divergences from earnings reality',
    ],
  },
  industry: {
    category: 'Sector & Macro Position',
    dispatch: 'CORE · ALWAYS ACTIVE (BROAD)',
    dispatchType: 'core',
    trigger: 'Benchmark industry cycle positioning, macro tailwinds & competitive moats',
    tags: ['Porter Moat Audit', 'Pricing Power', 'Industry Cycles', 'Supplier Leverage'],
    source: 'Sector Industry Reports & Benchmarks',
    bullets: [
      'Maps company market share across sector supply chains',
      'Audits gross margin resilience against raw material inflation',
    ],
  },
  management: {
    category: 'Corporate Governance',
    dispatch: 'CORE · ALWAYS ACTIVE (BROAD)',
    dispatchType: 'core',
    trigger: 'Promoter pledging, management turnover, board oversight & capital allocation',
    tags: ['Promoter Pledging', 'Board Independence', 'Executive Turnover', 'Related-Party Audit'],
    source: 'Governance Filings & Annual Disclosures',
    bullets: [
      'Scrutinizes promoter share encumbrances and pledge changes',
      'Flags related-party transaction volumes against statutory caps',
    ],
  },
}

const CATEGORIES = {
  all: {
    label: 'All Specialists (11)',
    match: () => true,
  },
  fundamentals: {
    label: 'Fundamentals (3)',
    match: (a) => ['financial', 'valuation', 'market'].includes(a.name),
  },
  catalysts: {
    label: 'Catalysts & Growth (3)',
    match: (a) => ['news', 'growth', 'risk'].includes(a.name),
  },
  forensic: {
    label: 'Forensics & Governance (5)',
    match: (a) => ['document', 'management', 'workforce', 'industry', 'social'].includes(a.name),
  },
}

/* ── Hooks ────────────────────────────────────────────────────────────────── */

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme !== 'light')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* private browsing */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), [])
  return [theme, toggle]
}

/** Types out each phrase, pauses, deletes it, moves on. Static if reduced motion. */
function useTypewriter(phrases) {
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [text, setText] = useState(reduced ? phrases[0] : '')

  useEffect(() => {
    if (reduced) return undefined
    let index = 0
    let char = 0
    let deleting = false
    let timer = 0

    const tick = () => {
      const phrase = phrases[index]
      char += deleting ? -1 : 1
      setText(phrase.slice(0, char))

      let delay = deleting ? 32 : 68
      if (!deleting && char === phrase.length) {
        deleting = true
        delay = 1900
      } else if (deleting && char === 0) {
        deleting = false
        index = (index + 1) % phrases.length
        delay = 320
      }
      timer = window.setTimeout(tick, delay)
    }

    timer = window.setTimeout(tick, 600)
    return () => window.clearTimeout(timer)
  }, [phrases, reduced])

  return text
}

/** Marks the nav link for whichever section currently owns the viewport. */
function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0])

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean)
    if (!sections.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] }
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [ids])

  return active
}

function scrollToSection(id) {
  const node = document.getElementById(id)
  if (!node) return
  const container = document.querySelector('.be-landing')
  if (container && typeof container.scrollTo === 'function') {
    const containerRect = container.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const targetTop = id === 'research' ? 0 : Math.max(0, container.scrollTop + (nodeRect.top - containerRect.top))
    container.scrollTo({
      top: targetTop,
      behavior: 'smooth',
    })
  } else {
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/* ── Specialist registry ──────────────────────────────────────────────────── */

function Registry() {
  const [agents, setAgents] = useState(null)
  const [error, setError] = useState(false)
  const [attempt, retry] = useState(0)
  const [filter, setFilter] = useState('all')

  const carouselRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)

  // Drag-to-scroll refs
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeftStart = useRef(0)

  useEffect(() => {
    let active = true
    setError(false)
    api
      .getAgents()
      .then((data) => {
        if (!Array.isArray(data) || !data.length) throw new Error('Registry unavailable')
        if (active) setAgents(data)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [attempt])

  const displayed = (agents || []).filter(CATEGORIES[filter]?.match || (() => true))

  const updateScrollState = useCallback(() => {
    const el = carouselRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
    const card = el.firstElementChild
    if (card) {
      const cardWidth = card.clientWidth + 16
      const idx = Math.round(el.scrollLeft / cardWidth)
      setActiveIndex(Math.max(0, Math.min(idx, displayed.length - 1)))
    }
  }, [displayed.length])

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return undefined
    el.addEventListener('scroll', updateScrollState, { passive: true })
    updateScrollState()
    return () => el.removeEventListener('scroll', updateScrollState)
  }, [updateScrollState, displayed])

  const scrollByDirection = (dir) => {
    const el = carouselRef.current
    if (!el) return
    const card = el.firstElementChild
    const step = card ? card.clientWidth + 16 : 320
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  const scrollToIndex = (idx) => {
    const el = carouselRef.current
    if (!el) return
    const card = el.firstElementChild
    const step = card ? card.clientWidth + 16 : 320
    el.scrollTo({ left: idx * step, behavior: 'smooth' })
  }

  const onMouseDown = (e) => {
    if (!carouselRef.current) return
    isDragging.current = true
    startX.current = e.pageX - carouselRef.current.offsetLeft
    scrollLeftStart.current = carouselRef.current.scrollLeft
    carouselRef.current.style.scrollSnapType = 'none'
    carouselRef.current.style.cursor = 'grabbing'
  }

  const onMouseMove = (e) => {
    if (!isDragging.current || !carouselRef.current) return
    e.preventDefault()
    const x = e.pageX - carouselRef.current.offsetLeft
    const walk = (x - startX.current) * 1.5
    carouselRef.current.scrollLeft = scrollLeftStart.current - walk
  }

  const onMouseUpOrLeave = () => {
    if (!isDragging.current) return
    isDragging.current = false
    if (carouselRef.current) {
      carouselRef.current.style.scrollSnapType = 'x mandatory'
      carouselRef.current.style.cursor = 'grab'
      updateScrollState()
    }
  }

  return (
    <section className="be-section" id="agents" aria-labelledby="agents-heading">
      <div className="be-container">
        <Reveal variant="up" className="be-section-heading">
          <div>
            <p className="be-kicker">
              <span className="be-status-dot green live" /> Multi-agent specification
            </p>
            <h2 id="agents-heading">
              Specialist lenses.
              <br />
              A fuller picture.
            </h2>
          </div>
          <div>
            <p>
              Every specialist interrogates a distinct financial vector, and the planner only
              dispatches the ones your question actually needs. This list is read live from the
              ArthaLens registry.
            </p>
          </div>
        </Reveal>

        <div className="be-agents-toolbar">
          <div
            className="be-filter-pills"
            role="tablist"
            aria-label="Filter specialists by discipline"
          >
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`registry-tab-${key}`}
                aria-selected={filter === key}
                aria-controls="registry-panel"
                className="be-filter-pill"
                onClick={() => setFilter(key)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="be-carousel-arrows-desktop">
            <button
              type="button"
              className="be-carousel-nav-btn prev"
              onClick={() => scrollByDirection(-1)}
              disabled={!canScrollLeft}
              aria-label="Previous specialist"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="be-carousel-nav-btn next"
              onClick={() => scrollByDirection(1)}
              disabled={!canScrollRight}
              aria-label="Next specialist"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div
          id="registry-panel"
          role="tabpanel"
          aria-labelledby={`registry-tab-${filter}`}
          style={{ marginTop: 10 }}
        >
          {error ? (
            <div className="be-empty">
              <p style={{ margin: 0 }}>
                The specialist registry could not be reached. The research engine may be waking up.
              </p>
              <button type="button" className="be-text-button" onClick={() => retry((n) => n + 1)}>
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          ) : !agents ? (
            <div className="be-empty">
              <p style={{ margin: 0 }}>Loading the specialist registry…</p>
            </div>
          ) : !displayed.length ? (
            <div className="be-empty">
              <p style={{ margin: 0 }}>No specialists are registered under this discipline.</p>
            </div>
          ) : (
            <div className="be-carousel-outer">
              <div
                ref={carouselRef}
                className="be-agent-grid be-agent-carousel-track"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUpOrLeave}
                onMouseLeave={onMouseUpOrLeave}
              >
                {displayed.map((agent, i) => {
                  const meta = SPECIALIST_META[agent.name] || {}
                  return (
                    <article className="be-agent-card" key={agent.name}>
                      <div className="be-card-top">
                        <span className="be-number">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="be-tag">{meta.category || 'Specialist'}</span>
                      </div>

                      <h3>{agent.name}</h3>
                      <p>{meta.trigger || agent.description || 'Registered research specialist.'}</p>

                      {!!meta.tags?.length && (
                        <div className="be-agent-tags-row">
                          {meta.tags.map((tag) => (
                            <span className="be-agent-subtag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {meta.source && (
                        <div className="be-agent-meta-block">
                          <span className="be-agent-meta-label">Evidence source</span>
                          <span className="be-agent-meta-value">{meta.source}</span>
                        </div>
                      )}

                      {!!meta.bullets?.length && (
                        <ul className="be-agent-bullets-list">
                          {meta.bullets.map((b) => (
                            <li className="be-agent-bullet-item" key={b}>
                              <CheckCircle2 size={14} aria-hidden="true" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="be-agent-card-footer">
                        <span
                          className="be-agent-verdict-pill"
                          data-dispatch={meta.dispatchType || 'core'}
                        >
                          <Activity size={12} aria-hidden="true" />
                          {meta.dispatch || 'REGISTERED'}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}

          <div className="be-agent-carousel-control-bar">
            <div className="be-agent-swipe-hint" aria-hidden="true">
              <span>← Swipe to explore →</span>
            </div>

            <div className="be-carousel-controls-group">
              <button
                type="button"
                className="be-carousel-nav-btn be-carousel-nav-mobile prev"
                onClick={() => scrollByDirection(-1)}
                disabled={!canScrollLeft}
                aria-label="Previous specialist"
              >
                <ChevronLeft size={14} />
              </button>

              <div className="be-carousel-dots" role="tablist" aria-label="Specialist pagination">
                {displayed.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`be-carousel-dot ${i === activeIndex ? 'is-active' : ''}`}
                    onClick={() => scrollToIndex(i)}
                    aria-label={`Go to specialist ${i + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                className="be-carousel-nav-btn be-carousel-nav-mobile next"
                onClick={() => scrollByDirection(1)}
                disabled={!canScrollRight}
                aria-label="Next specialist"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="be-carousel-counter">
              <span>{String(Math.min(activeIndex + 1, displayed.length)).padStart(2, '0')}</span> / <span>{String(displayed.length).padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Landing ──────────────────────────────────────────────────────────────── */

export default function LandingExperience({
  onRun,
  running,
  submitting,
  query,
  onQueryChange,
  sessions = [],
  onSelectSession,
  onDeleteSession,
  onResume,
  user,
  onLogout,
  onOpenAuth,
}) {
  const [theme, toggleTheme] = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [side, setSide] = useState('bull')
  const inputRef = useRef(null)
  const typed = useTypewriter(TYPEWRITER_PHRASES)

  // Dossier Live Ticker Preview State with Synchronized Progress & Value Filling
  const [dossierIndex, setDossierIndex] = useState(0)
  const [dossierAnimating, setDossierAnimating] = useState(false)
  const [dossierPaused, setDossierPaused] = useState(false)
  const [dossierProgress, setDossierProgress] = useState(0)

  const currentDossier = DOSSIER_SAMPLE_TICKERS[dossierIndex]
  const DOSSIER_DURATION_MS = 3400

  useEffect(() => {
    if (dossierPaused) return undefined
    const stepIntervalMs = 50
    const progressIncrement = (stepIntervalMs / DOSSIER_DURATION_MS) * 100

    const interval = setInterval(() => {
      setDossierProgress((prev) => {
        if (prev >= 100) {
          setDossierAnimating(true)
          setTimeout(() => {
            setDossierIndex((curr) => (curr + 1) % DOSSIER_SAMPLE_TICKERS.length)
            setDossierAnimating(false)
          }, 140)
          return 0
        }
        return prev + progressIncrement
      })
    }, stepIntervalMs)

    return () => clearInterval(interval)
  }, [dossierPaused])

  const selectDossierTicker = (idx) => {
    if (idx === dossierIndex) return
    setDossierAnimating(true)
    setDossierProgress(0)
    setTimeout(() => {
      setDossierIndex(idx)
      setDossierAnimating(false)
    }, 120)
  }

  const [activePipelineIndex, setActivePipelineIndex] = useState(0)
  const [isPipelinePaused, setIsPipelinePaused] = useState(false)
  const [pipelineProgress, setPipelineProgress] = useState(0)

  const STAGE_DURATION_MS = 2800

  // Sequential Canonical Pipeline Progression: Plan -> Collect -> Compute -> Challenge -> Report -> loop
  useEffect(() => {
    if (isPipelinePaused) return undefined
    const stepIntervalMs = 50
    const progressIncrement = (stepIntervalMs / STAGE_DURATION_MS) * 100

    const timer = setInterval(() => {
      setPipelineProgress((prev) => {
        if (prev >= 100) {
          setActivePipelineIndex((curr) => (curr + 1) % PIPELINE_STAGES.length)
          return 0
        }
        return prev + progressIncrement
      })
    }, stepIntervalMs)

    return () => clearInterval(timer)
  }, [isPipelinePaused])

  const sectionIds = useMemo(() => NAV_LINKS.map(([id]) => id), [])
  const activeSection = useActiveSection(sectionIds)

  const busy = running || submitting
  const signedIn = !!user && !user.guest

  // Close the drawer on Escape, on resize past the desktop breakpoint, and
  // hold the page still while it is open.
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen])


  // Smart Auto-Hiding Taskbar (Samvaad Pattern)
  const [taskbarVisible, setTaskbarVisible] = useState(true)
  const taskbarVisibleRef = useRef(true)
  const taskbarHideTimerRef = useRef(null)
  const scrollStopTimerRef = useRef(null)
  const isHoveringNavRef = useRef(false)

  const isOnFirstPage = useCallback(() => {
    if (!activeSection || activeSection === 'research') return true
    const container = document.querySelector('.be-landing')
    const top = container ? container.scrollTop : (typeof window !== 'undefined' ? window.scrollY : 0)
    const threshold = (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.75
    return top <= threshold
  }, [activeSection])

  const hideTaskbar = useCallback(() => {
    if (taskbarHideTimerRef.current) {
      clearTimeout(taskbarHideTimerRef.current)
      taskbarHideTimerRef.current = null
    }
    if (menuOpen) return // Never hide if drawer is open
    if (isHoveringNavRef.current) return // Never hide while hovering over taskbar
    if (isOnFirstPage()) return // Never hide on first page (hero)!
    if (taskbarVisibleRef.current) {
      taskbarVisibleRef.current = false
      setTaskbarVisible(false)
    }
  }, [menuOpen, isOnFirstPage])

  const showTaskbar = useCallback((autoHideDelayMs = 0) => {
    if (!taskbarVisibleRef.current) {
      taskbarVisibleRef.current = true
      setTaskbarVisible(true)
    }
    if (taskbarHideTimerRef.current) {
      clearTimeout(taskbarHideTimerRef.current)
      taskbarHideTimerRef.current = null
    }

    // Keep permanently visible while on first page (hero)
    if (isOnFirstPage()) return

    if (autoHideDelayMs > 0 && !isHoveringNavRef.current && !menuOpen) {
      taskbarHideTimerRef.current = setTimeout(() => {
        hideTaskbar()
      }, autoHideDelayMs)
    }
  }, [hideTaskbar, menuOpen, isOnFirstPage])

  // 1. Initial page load: taskbar is visible permanently on hero landing
  useEffect(() => {
    showTaskbar(0)
  }, [showTaskbar])

  // 2. Lock taskbar visible when mobile menu is open; keep visible on page 1
  useEffect(() => {
    if (menuOpen || isOnFirstPage()) {
      showTaskbar(0)
    } else {
      showTaskbar(1500)
    }
  }, [menuOpen, showTaskbar, isOnFirstPage])

  const [searchHighlighted, setSearchHighlighted] = useState(false)
  const searchHighlightTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (searchHighlightTimerRef.current) clearTimeout(searchHighlightTimerRef.current)
    }
  }, [])

  // 3. User movement & scroll: show taskbar immediately while moving, auto-hide after 1.5s on deeper pages
  useEffect(() => {
    const container = document.querySelector('.be-landing')

    const onScrollOrMove = () => {
      if (taskbarHideTimerRef.current) {
        clearTimeout(taskbarHideTimerRef.current)
        taskbarHideTimerRef.current = null
      }

      if (!taskbarVisibleRef.current) {
        taskbarVisibleRef.current = true
        setTaskbarVisible(true)
      }

      // If user is on the first page, keep taskbar visible indefinitely
      if (isOnFirstPage()) {
        return
      }

      if (scrollStopTimerRef.current) {
        clearTimeout(scrollStopTimerRef.current)
      }
      scrollStopTimerRef.current = setTimeout(() => {
        if (!isOnFirstPage() && !isHoveringNavRef.current && !menuOpen) {
          hideTaskbar()
        }
      }, 1500)
    }

    const onPointerMove = (e) => {
      if (e.clientY <= 90) {
        showTaskbar(isOnFirstPage() || isHoveringNavRef.current ? 0 : 2000)
      }
    }

    if (container) {
      container.addEventListener('scroll', onScrollOrMove, { passive: true })
    }
    window.addEventListener('scroll', onScrollOrMove, { passive: true })
    window.addEventListener('mousemove', onPointerMove, { passive: true })
    window.addEventListener('touchstart', onScrollOrMove, { passive: true })
    window.addEventListener('touchmove', onScrollOrMove, { passive: true })
    window.addEventListener('wheel', onScrollOrMove, { passive: true })

    return () => {
      if (container) {
        container.removeEventListener('scroll', onScrollOrMove)
      }
      window.removeEventListener('scroll', onScrollOrMove)
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('touchstart', onScrollOrMove)
      window.removeEventListener('touchmove', onScrollOrMove)
      window.removeEventListener('wheel', onScrollOrMove)
      if (scrollStopTimerRef.current) clearTimeout(scrollStopTimerRef.current)
    }
  }, [showTaskbar, hideTaskbar, isOnFirstPage, menuOpen])

  const go = useCallback(
    (id) => {
      setMenuOpen(false)
      scrollToSection(id)
      if (id === 'research') {
        setTimeout(() => inputRef.current?.focus(), 120)
        showTaskbar(0)
        return
      }
      // Show while navigating, and when smooth scroll lands (~600ms), wait 2s then hide
      showTaskbar(0)
      setTimeout(() => {
        if (!isHoveringNavRef.current && !isOnFirstPage()) {
          showTaskbar(2000)
        }
      }, 650)
    },
    [showTaskbar, isOnFirstPage]
  )

  const handleStartResearchAction = useCallback(() => {
    setMenuOpen(false)
    if (busy) {
      onResume?.()
      return
    }
    const trimmed = (query || '').trim()
    if (trimmed) {
      onRun?.(trimmed)
    } else {
      onResume?.()
    }
  }, [query, busy, onRun, onResume])

  const submit = useCallback(
    (e) => {
      e?.preventDefault?.()
      const value = (query || '').trim()
      if (busy) return
      onRun?.(value)
    },
    [query, busy, onRun]
  )

  const fill = useCallback(
    (value) => {
      onQueryChange?.(value)
      inputRef.current?.focus()
    },
    [onQueryChange]
  )

  const thesis = THESES[side]
  const recent = sessions.slice(0, 8)

  return (
    <div className="be-landing" data-theme={theme}>
      <ScrollProgress />

      {/* Invisible Top Proximity Sensor Zone: Moving cursor near top summons taskbar */}
      <div
        className="be-taskbar-trigger-zone"
        onMouseEnter={() => showTaskbar(isOnFirstPage() ? 0 : 2500)}
        aria-hidden="true"
      />

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <div
        className={`be-nav-wrapper ${!taskbarVisible && !menuOpen && !isOnFirstPage() ? 'is-taskbar-hidden' : ''}`}
        onMouseEnter={() => {
          isHoveringNavRef.current = true
          showTaskbar(0)
        }}
        onMouseLeave={() => {
          isHoveringNavRef.current = false
          if (isOnFirstPage()) {
            showTaskbar(0)
          } else {
            showTaskbar(1500)
          }
        }}
      >
        <div className="be-google-bar" aria-hidden="true" />
        <div className="be-container">
          <nav className="be-nav" aria-label="Primary">
            <button type="button" className="be-brand" onClick={() => go('research')}>
              <Logo size={30} />
              <span className="be-brand-name">
                Artha AI<span className="be-brand-dot">.</span>
              </span>
              <span className="be-brand-tag">Equity intelligence</span>
            </button>

            <div className="be-desktop-nav">
              {NAV_LINKS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="be-nav-pill"
                  aria-current={activeSection === id}
                  onClick={() => go(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="be-nav-actions">
              <button
                type="button"
                className="be-icon-button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              >
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              </button>

              {signedIn ? (
                <div className="be-nav-user-cluster">
                  <div
                    className="be-nav-avatar"
                    title={`Signed in as ${user.displayName || user.email}`}
                    aria-label={`Signed in as ${user.displayName || user.email}`}
                  >
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" />
                    ) : (
                      <span className="be-avatar-initial" aria-hidden="true">
                        {(user.displayName || user.email || 'A').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="be-avatar-status-dot" aria-hidden="true" />
                  </div>
                  <button
                    type="button"
                    className="be-icon-button be-signout-btn"
                    onClick={onLogout}
                    title="Sign out"
                    aria-label="Sign out"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <button type="button" className="be-nav-pill be-signin-btn" onClick={onOpenAuth}>
                  Sign in
                </button>
              )}

              <button
                type="button"
                className={`be-cta-btn ${busy ? 'be-cta-running' : ''}`}
                onClick={handleStartResearchAction}
                title={busy ? 'Research is running · Return to Workspace' : 'Start research in Artha AI Copilot'}
              >
                {busy ? (
                  <>
                    <span className="be-status-dot green live" />
                    <span>Back to Workspace</span>
                    <ArrowRight size={15} />
                  </>
                ) : (
                  <>
                    Start research <ArrowRight size={15} />
                  </>
                )}
              </button>

              <button
                type="button"
                className="be-icon-button be-nav-toggle"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                {menuOpen ? <X size={19} /> : <Menu size={19} />}
              </button>
            </div>
          </nav>
        </div>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className="be-mobile-scrim"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="be-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="be-container be-mobile-menu-inner">
              <div className="be-mobile-menu-head">
                <div className="be-brand">
                  <Logo size={28} />
                  <span className="be-brand-name">ArthaLens</span>
                </div>
                <button
                  type="button"
                  className="be-icon-button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <X size={19} />
                </button>
              </div>

              {NAV_LINKS.map(([id, label]) => (
                <button key={id} type="button" className="be-mobile-link" onClick={() => go(id)}>
                  {label}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              ))}

              <div className="be-mobile-actions">
                {signedIn && (
                  <div className="be-mobile-user">
                    <span className="be-avatar" aria-hidden="true">
                      {(user.displayName || user.email || 'A').charAt(0).toUpperCase()}
                    </span>
                    <span className="be-user-name">{user.displayName || user.email}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="be-button accent block"
                  onClick={handleStartResearchAction}
                >
                  Start research <ArrowRight size={15} />
                </button>
                {signedIn ? (
                  <button
                    type="button"
                    className="be-mobile-link"
                    onClick={() => {
                      setMenuOpen(false)
                      onLogout?.()
                    }}
                  >
                    Sign out
                    <LogOut size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="be-mobile-link"
                    onClick={() => {
                      setMenuOpen(false)
                      onOpenAuth?.()
                    }}
                  >
                    Sign in
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <main id="main">
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="be-section be-hero-section" id="research" aria-labelledby="hero-heading">
          <div className="be-container">
            <div className="be-hero-grid">
              <div className="be-hero-copy">
                <p className="be-hero-pill">
                  <span className="be-status-dot green live" />
                  Artha AI · Autonomous Multi-Agent Stock Research Platform
                </p>

                <h1 id="hero-heading">
                  Research that should
                  <br />
                  <span className="be-hero-typed be-gradient-text">
                    {typed}
                    <span className="be-hero-caret" aria-hidden="true" />
                  </span>
                  <span className="be-sr-only">{TYPEWRITER_PHRASES.join(' ')}</span>
                </h1>

                <p className="be-hero-description">
                  Artha AI is an autonomous multi-agent stock research platform. Ask about any company, ticker, or peer comparison. 11 specialized AI agents read real regulatory filings in parallel, calculate true fair value with deterministic math, and uncover hidden risks in 60 seconds.
                </p>

                <div
                  className="be-architecture-hud"
                  onMouseEnter={() => setIsPipelinePaused(true)}
                  onMouseLeave={() => setIsPipelinePaused(false)}
                >
                  <div className="be-arch-header">
                    <span className="be-arch-live-dot" aria-hidden="true" />
                    <span className="be-arch-title">Canonical pipeline</span>
                    <span className="be-arch-tag">
                      Stage 0{activePipelineIndex + 1}/05 · {PIPELINE_STAGES[activePipelineIndex].name.toUpperCase()} ACTIVE
                    </span>
                  </div>

                  {/* Micro Progress Bar track that fills up as current phase runs */}
                  <div className="be-arch-progress-track">
                    <div
                      className="be-arch-progress-fill"
                      style={{
                        width: `${pipelineProgress}%`,
                        transition: isPipelinePaused ? 'none' : 'width 50ms linear'
                      }}
                    />
                  </div>

                  <div
                    className="be-arch-pipeline"
                    role="tablist"
                    aria-label="Interactive pipeline stages"
                  >
                    {PIPELINE_STAGES.map((stage, i) => {
                      const Icon = stage.icon
                      const isActive = activePipelineIndex === i
                      const isCompleted = i < activePipelineIndex
                      const isWireActive = i === activePipelineIndex
                      const isWireCompleted = i <= activePipelineIndex

                      return (
                        <div key={stage.id} style={{ display: 'contents' }}>
                          {i > 0 && (
                            <span
                              className={`be-arch-wire ${isWireCompleted ? 'is-completed' : ''} ${isWireActive ? 'is-active-wire' : ''}`}
                              aria-hidden="true"
                            >
                              <span className="be-arch-wire-beam" />
                            </span>
                          )}
                          <button
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`be-arch-node ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`}
                            data-accent={stage.accent}
                            onClick={() => {
                              setActivePipelineIndex(i)
                              setPipelineProgress(0)
                            }}
                            title={`Inspect Stage ${stage.step} (${stage.name}): ${stage.desc}`}
                          >
                            <span className="be-arch-node-step">
                              {isCompleted ? (
                                <CheckCircle2 size={9} className="be-step-check" />
                              ) : (
                                stage.step
                              )}
                            </span>
                            <span className="be-arch-node-icon">
                              <Icon size={14} aria-hidden="true" />
                              {isActive && <span className="be-node-pulse-ring" />}
                            </span>
                            <span className="be-arch-node-name">{stage.name}</span>
                            <span className="be-arch-node-desc">
                              {isActive ? 'In Progress…' : isCompleted ? 'Completed' : stage.desc}
                            </span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <Reveal variant="fade" className="be-search-reveal">
                  <form className={`be-search-card ${searchHighlighted ? 'is-highlighted' : ''}`} onSubmit={submit}>
                    <div className="be-search-label">
                      <span>Research console</span>
                      <span className="be-search-label-badge">
                        <Sparkles size={11} aria-hidden="true" /> Ticker or question
                      </span>
                    </div>

                    <div className="be-search-row">
                      <div className="be-search-field">
                        <span className="be-search-icon">
                          <Search size={17} aria-hidden="true" />
                        </span>
                        <input
                          id="research-query"
                          ref={inputRef}
                          type="text"
                          value={query}
                          onChange={(e) => onQueryChange?.(e.target.value)}
                          placeholder="e.g. TCS.NS, or compare Infosys and TCS margins"
                          aria-label="Company, ticker or research question"
                          autoComplete="off"
                          enterKeyHint="search"
                          disabled={busy}
                        />
                      </div>
                      <button
                        type="submit"
                        className="be-button accent"
                        disabled={busy}
                        title="Start research in ArthaLens AI Copilot"
                      >
                        {busy ? 'Researching…' : 'Start research'}
                        {!busy && <ArrowRight size={15} aria-hidden="true" />}
                      </button>
                    </div>

                    <div className="be-chips-group">
                      <div className="be-chips-row">
                        <span className="be-chips-label" id="chip-label-tickers">
                          Popular tickers
                        </span>
                        <div
                          className="be-chips-scroll"
                          role="group"
                          tabIndex={0}
                          aria-labelledby="chip-label-tickers"
                        >
                          {SUGGESTIONS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="be-chip-pill"
                              onClick={() => fill(s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="be-chips-row be-prompt-suggestions-row">
                        <span className="be-chips-label" id="chip-label-prompts">
                          Try a question
                        </span>
                        <div
                          className="be-chips-scroll"
                          role="group"
                          tabIndex={0}
                          aria-labelledby="chip-label-prompts"
                        >
                          {PROMPT_SUGGESTIONS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="be-chip-pill"
                              onClick={() => fill(s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="be-search-footer">
                      <span>Research aid, not investment advice.</span>
                      {!signedIn && (
                        <button type="button" className="be-text-button" onClick={onOpenAuth}>
                          Sign in to run <ArrowUpRight size={13} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {!!recent.length && (
                      <details className="be-history">
                        <summary>
                          <span className="be-history-summary-inner">
                            <Layers3 size={14} aria-hidden="true" />
                            Resume previous research ({recent.length})
                            <ChevronDown
                              size={16}
                              className="be-history-arrow"
                              aria-hidden="true"
                            />
                          </span>
                        </summary>
                        <div className="be-history-list">
                          {recent.map((s) => (
                            <div className="be-history-item" key={s.job_id}>
                              <button type="button" onClick={() => onSelectSession?.(s)}>
                                {s.query || 'Untitled research'}
                              </button>
                              <button
                                type="button"
                                className="be-history-del"
                                onClick={() => onDeleteSession?.(s.job_id)}
                                aria-label={`Delete research: ${s.query || 'untitled'}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div style={{ padding: '0 10px 12px' }}>
                          <button type="button" className="be-text-button" onClick={onResume}>
                            Open the workspace <ArrowUpRight size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </details>
                    )}
                  </form>
                </Reveal>
              </div>

              {/* Live pipeline card */}
              {/* Multi-Agent Live Execution Terminal */}
              <Reveal variant="scale" delay={120} className="be-hero-visual">
                <div
                  className="be-terminal-card"
                  onMouseEnter={() => setIsPipelinePaused(true)}
                  onMouseLeave={() => setIsPipelinePaused(false)}
                >
                  <div className="be-terminal-header">
                    <span className="be-terminal-dots" aria-hidden="true">
                      <span className="be-terminal-dot" />
                      <span className="be-terminal-dot" />
                      <span className="be-terminal-dot" />
                    </span>
                    <span className="be-terminal-title">multi-agent · execution trace</span>
                    <span className="be-terminal-live-badge">
                      <span className="be-status-dot green live" />
                      TCS.NS LIVE AUDIT
                    </span>
                  </div>

                  <div className="be-terminal-nodes" role="tablist">
                    {PIPELINE_STAGES.map((stage, idx) => {
                      const isActive = activePipelineIndex === idx
                      const isCompleted = idx < activePipelineIndex
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`be-terminal-node ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`}
                          onClick={() => {
                            setActivePipelineIndex(idx)
                            setPipelineProgress(0)
                          }}
                        >
                          <span className="be-node-left">
                            <span
                              className={`be-status-dot ${isCompleted ? 'green' : isActive ? 'green live' : 'muted'}`}
                              aria-hidden="true"
                            />
                            <span className="be-node-name">{stage.agentName}</span>
                            <span className="be-node-sub">
                              {isCompleted ? 'Phase Verified ✓' : isActive ? stage.agentRole : 'Queued'}
                            </span>
                          </span>
                          <span className={`be-node-chip ${isCompleted ? 'ok' : isActive ? stage.tone : 'muted'}`}>
                            {isCompleted ? '✓ DONE' : isActive ? '● ACTIVE' : stage.badge}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Live Active Stage Inspector: Demonstrates exactly what ArthaLens does! */}
                  <div className="be-terminal-inspector">
                    <div className="be-inspector-top">
                      <div className="be-inspector-label">
                        <Activity size={12} className="be-inspector-icon" aria-hidden="true" />
                        <span>STAGE {PIPELINE_STAGES[activePipelineIndex].step} · {PIPELINE_STAGES[activePipelineIndex].action}</span>
                      </div>
                      <span className="be-inspector-metric">
                        {PIPELINE_STAGES[activePipelineIndex].metric}
                      </span>
                    </div>

                    <div className="be-inspector-code">
                      <span className="be-code-prompt">&gt;</span>
                      <code>{PIPELINE_STAGES[activePipelineIndex].log}</code>
                    </div>

                    <div className="be-inspector-evidence">
                      <CheckCircle2 size={12} className="be-evidence-icon" aria-hidden="true" />
                      <span>{PIPELINE_STAGES[activePipelineIndex].evidence}</span>
                    </div>
                  </div>

                  <div className="be-terminal-footer">
                    <span className="be-footer-guard">
                      <ShieldCheck size={13} aria-hidden="true" />
                      Deterministic Python math · 100% cited filings
                    </span>
                    <div className="be-terminal-pagers" role="group" aria-label="Pipeline progress">
                      {PIPELINE_STAGES.map((st, i) => (
                        <button
                          key={st.id}
                          type="button"
                          className={`be-pager-dot ${activePipelineIndex === i ? 'is-active' : ''}`}
                          onClick={() => setActivePipelineIndex(i)}
                          aria-label={`Go to stage ${i + 1}: ${st.name}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal variant="stagger" className="be-stats-row">
              {STATS.map((stat) => (
                <div className="be-stat" key={stat.label}>
                  <span className="be-stat-value">
                    <AnimatedCounter to={stat.value} />
                    {/* AnimatedCounter is aria-hidden, so screen readers read this */}
                    <span className="be-sr-only">{stat.value}</span>
                  </span>
                  <span className="be-stat-label">{stat.label}</span>
                </div>
              ))}
            </Reveal>
          </div>

          {/* ── Grounding Live Market Coverage Ticker Tape ──────────────── */}
          <MarketTicker />
        </section>

        {/* ── Specialists ────────────────────────────────────────────────── */}
        <Registry />

        {/* ── Dual-thesis engine ─────────────────────────────────────────── */}
        <section className="be-section" id="engine" aria-labelledby="engine-heading">
          <div className="be-container be-engine-container">
            <Reveal variant="up" className="be-section-heading">
              <div>
                <p className="be-kicker">
                  <span className="be-status-dot yellow" /> Concurrent Dual-Thesis Engine
                </p>
                <h2 id="engine-heading">
                  Both sides argued.
                  <br />
                  Neither one hidden.
                </h2>
              </div>
              <div>
                <p>
                  Evidence is cross-checked for conflicting values before anything is written. The
                  bull and the bear are computed from the identical numbers, so real disagreement is
                  surfaced side-by-side rather than averaged away into a consensus target.
                </p>
                <span className="be-tag">Zero fabricated price targets</span>
              </div>
            </Reveal>

            {/* Symmetrical Side-by-Side Dual Thesis Confrontation */}
            <div className="be-thesis-confrontation-grid">
              {/* ── Bull Case Card ── */}
              <div className="be-thesis-card be-thesis-bull">
                <div className="be-thesis-card-header">
                  <div className="be-thesis-brand-row">
                    <div className="be-thesis-animal-wrap bull">
                      <MarketAnimal side="bull" className="be-thesis-animal-img" lazy={false} />
                    </div>
                    <div className="be-thesis-header-meta">
                      <div className="be-thesis-title-badge">
                        <h3>Bull Thesis</h3>
                        <span className="be-conviction-badge bull">
                          <ShieldCheck size={12} aria-hidden="true" />
                          Evidence-backed
                        </span>
                      </div>
                      <span className="be-thesis-momentum bull">
                        <TrendingUp size={12} aria-hidden="true" />
                        Momentum + (Expansionary)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="be-thesis-card-body">
                  <p className="be-thesis-section-lbl">Core Arguments from Filings</p>
                  <ul className="be-thesis-points-list bull">
                    {THESES.bull.points.map((p) => (
                      <li key={p}>
                        <TrendingUp size={14} className="be-point-icon bull" aria-hidden="true" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="be-thesis-metrics-strip bull">
                    <div className="be-metric-chip">
                      <span className="be-metric-lbl">FCF Conversion</span>
                      <span className="be-metric-val">&gt; 5-Yr Median</span>
                    </div>
                    <div className="be-metric-chip">
                      <span className="be-metric-lbl">Capacity Usage</span>
                      <span className="be-metric-val">Expanding</span>
                    </div>
                    <div className="be-metric-chip">
                      <span className="be-metric-lbl">Covenant Room</span>
                      <span className="be-metric-val">Substantial</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Bear Case Card ── */}
              <div className="be-thesis-card be-thesis-bear">
                <div className="be-thesis-card-header">
                  <div className="be-thesis-brand-row">
                    <div className="be-thesis-animal-wrap bear">
                      <MarketAnimal side="bear" className="be-thesis-animal-img" lazy={false} />
                    </div>
                    <div className="be-thesis-header-meta">
                      <div className="be-thesis-title-badge">
                        <h3>Bear Thesis</h3>
                        <span className="be-conviction-badge bear">
                          <ShieldAlert size={12} aria-hidden="true" />
                          Stress-tested
                        </span>
                      </div>
                      <span className="be-thesis-momentum bear">
                        <TrendingDown size={12} aria-hidden="true" />
                        Momentum − (Headwinds)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="be-thesis-card-body">
                  <p className="be-thesis-section-lbl">Stress-Tested Vulnerabilities</p>
                  <ul className="be-thesis-points-list bear">
                    {THESES.bear.points.map((p) => (
                      <li key={p}>
                        <TrendingDown size={14} className="be-point-icon bear" aria-hidden="true" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="be-thesis-metrics-strip bear">
                    <div className="be-metric-chip">
                      <span className="be-metric-lbl">Client Conc.</span>
                      <span className="be-metric-val">High Vulnerability</span>
                    </div>
                    <div className="be-metric-chip">
                      <span className="be-metric-lbl">Input Costs</span>
                      <span className="be-metric-val">Margin Compression</span>
                    </div>
                    <div className="be-metric-chip">
                      <span className="be-metric-lbl">Forward P/E</span>
                      <span className="be-metric-val">&gt; Sector Median</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Grounding Action & Synthesis Bar ── */}
            <div className="be-engine-bottom-bar">
              <div className="be-engine-audit-note">
                <Scale size={14} aria-hidden="true" />
                <span>Identical mathematical baseline. Every live run cites evidence used and explicitly names what is missing.</span>
              </div>
              <button
                type="button"
                className="be-cockpit-action-btn be-engine-cta"
                onClick={() => go('research')}
              >
                <span className="be-cockpit-action-dot" aria-hidden="true" />
                Run dual-thesis on your own ticker
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* ── Dossier preview ────────────────────────────────────────────── */}
        <section className="be-section" id="report" aria-labelledby="report-heading">
          <div className="be-container">
            <div className="be-report-layout">
              <Reveal variant="up" className="be-report-copy">
                <p className="be-kicker">
                  <span className="be-status-dot blue" /> Dossier preview
                </p>
                <h2 id="report-heading">A report you can audit line by line.</h2>
                <p className="be-report-desc">
                  Every run produces the same structure: computed metrics, the two cases, the
                  evidence behind each claim and an explicit list of what could not be verified.
                  Export it as a PDF or keep asking follow-up questions in the workspace.
                </p>

                <ul className="be-feature-list">
                  <li>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>Metrics computed from supplied inputs, never invented.</span>
                  </li>
                  <li>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>Source links and retrieval times next to each finding.</span>
                  </li>
                  <li>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>Conflicting figures surfaced rather than silently resolved.</span>
                  </li>
                  <li>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>Follow-up questions answered against the same evidence set.</span>
                  </li>
                </ul>

                <button type="button" className="be-text-link" onClick={() => go('research')}>
                  Generate a dossier <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </Reveal>

              <Reveal
                variant="scale"
                delay={100}
                className="be-report-mockup be-report-mockup-interactive"
                onMouseEnter={() => setDossierPaused(true)}
                onMouseLeave={() => setDossierPaused(false)}
              >
                <div className="be-card-top">
                  <div className="be-dossier-pill-header">
                    <span className="be-status-dot green live" />
                    <span className="be-number">AUDITED DOSSIER SYNTHESIS</span>
                  </div>
                  <div className="be-dossier-audit-tag">
                    <Sparkles size={11} aria-hidden="true" />
                    <span>{currentDossier.period}</span>
                  </div>
                </div>

                {/* Interactive Ticker Selector Strip with Auto-Cycle Animation */}
                <div className="be-dossier-ticker-strip" role="tablist" aria-label="Sample equity tickers">
                  {DOSSIER_SAMPLE_TICKERS.map((t, idx) => {
                    const active = idx === dossierIndex
                    return (
                      <button
                        key={t.symbol}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`be-ticker-strip-btn ${active ? 'is-active' : ''}`}
                        onClick={() => selectDossierTicker(idx)}
                      >
                        <span className="be-ticker-chip-sym">{t.symbol}</span>
                        {active && (
                          <span
                            className="be-ticker-progress-bar"
                            style={{
                              width: `${dossierProgress}%`,
                              transition: dossierPaused ? 'none' : 'width 50ms linear'
                            }}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className={`be-dossier-dynamic-wrap ${dossierAnimating ? 'is-animating' : ''}`}>
                  <div className="be-dossier-header-meta be-header-fill-anim" key={`header-${currentDossier.symbol}`}>
                    <h3 className="be-preview-title">
                      {currentDossier.name} <span className="be-preview-sub">({currentDossier.exchange}: {currentDossier.symbol})</span>
                    </h3>
                    <span className="be-dossier-sources-chip">
                      <CheckCircle2 size={11} aria-hidden="true" />
                      {currentDossier.evidenceCount}
                    </span>
                  </div>

                  <dl className="be-preview-metrics" key={`metrics-${currentDossier.symbol}`}>
                    <div className="be-preview-metric">
                      <dt>Revenue growth</dt>
                      <dd className="be-metric-computed growth be-metric-fill-anim">
                        <span className="be-metric-value-text">{currentDossier.growth}</span>
                      </dd>
                      <span className="be-metric-caption be-metric-fill-anim">{currentDossier.growthPeriod}</span>
                    </div>
                    <div className="be-preview-metric">
                      <dt>Operating margin</dt>
                      <dd className="be-metric-computed margin be-metric-fill-anim">
                        <span className="be-metric-value-text">{currentDossier.margin}</span>
                      </dd>
                      <span className="be-metric-caption be-metric-fill-anim">{currentDossier.marginDetail}</span>
                    </div>
                    <div className="be-preview-metric">
                      <dt>Net debt / EBITDA</dt>
                      <dd className="be-metric-computed debt be-metric-fill-anim">
                        <span className="be-metric-value-text">{currentDossier.debt}</span>
                      </dd>
                      <span className="be-metric-caption be-metric-fill-anim">{currentDossier.debtDetail}</span>
                    </div>
                    <div className="be-preview-metric">
                      <dt>Price target</dt>
                      <dd className="be-metric-computed target be-metric-fill-anim">
                        <span className="be-metric-value-text">{currentDossier.target}</span>
                      </dd>
                      <span className="be-metric-caption be-metric-fill-anim">{currentDossier.targetDetail}</span>
                    </div>
                  </dl>

                  <div className="be-preview-cases" key={`cases-${currentDossier.symbol}`}>
                    <div className="be-preview-case" data-side="bull">
                      <div className="be-preview-case-head-row be-case-fill-anim">
                        <span className="be-preview-case-head">
                          <TrendingUp size={12} aria-hidden="true" /> Bull case
                        </span>
                        <span className="be-case-citation-tag">{currentDossier.bullCitation}</span>
                      </div>
                      <p className="be-case-fill-anim">{currentDossier.bullPoint}</p>
                    </div>
                    <div className="be-preview-case" data-side="bear">
                      <div className="be-preview-case-head-row be-case-fill-anim">
                        <span className="be-preview-case-head">
                          <TrendingDown size={12} aria-hidden="true" /> Bear case
                        </span>
                        <span className="be-case-citation-tag">{currentDossier.bearCitation}</span>
                      </div>
                      <p className="be-case-fill-anim">{currentDossier.bearPoint}</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  key={`btn-${currentDossier.symbol}`}
                  className="be-cockpit-action-btn be-dossier-action-btn be-header-fill-anim"
                  onClick={() => {
                    onSelectSuggestion?.(currentDossier.symbol) || onQueryChange?.(currentDossier.symbol)
                    go('research')
                  }}
                >
                  <span className="be-cockpit-action-dot" aria-hidden="true" />
                  Audit {currentDossier.symbol} in workspace
                  <ArrowRight size={13} aria-hidden="true" />
                </button>

                <p className="be-preview-footer">
                  <FileText size={13} aria-hidden="true" />
                  Exportable as PDF · evidence appendix included
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section className="be-section be-faq-section" id="faq" aria-labelledby="faq-heading">
          <div className="be-container be-faq-container">
            {/* Top Section Heading */}
            <div className="be-section-heading be-faq-section-head">
              <div>
                <p className="be-kicker">
                  <span className="be-status-dot red" /> Methodology & Transparency
                </p>
                <h2 id="faq-heading">What this is, and what it is not.</h2>
              </div>
              <p className="be-faq-lead-desc">
                The limits matter as much as the capabilities. Here is where evidence originates, how
                deterministic Python computes financial truth, and where automation stops.
              </p>
            </div>

            {/* Symmetrical Two-Column Content Grid */}
            <div className="be-faq-layout">
              {/* Left Column: Methodology Assurance + Ready-to-Audit Card */}
              <div className="be-faq-left-col">
                <div className="be-methodology-card">
                  <div className="be-method-card-header">
                    <span className="be-method-kicker">
                      <span className="be-status-dot emerald live" /> ARCHITECTURAL ASSURANCE
                    </span>
                    <span className="be-method-stat-pill">100% Deterministic</span>
                  </div>

                  <div className="be-method-item">
                    <div className="be-method-icon python">
                      <Cpu size={15} aria-hidden="true" />
                    </div>
                    <div className="be-method-content">
                      <div className="be-method-meta">
                        <h4>Deterministic Python Computation</h4>
                        <span className="be-method-badge emerald">PYTHON 3.11 AST</span>
                      </div>
                      <p>
                        Financial ratios, margins, and CAGR trajectories are computed directly in sandboxed Python from SEC & exchange tables — <strong className="be-hl-emerald">never hallucinated by generative language models</strong>.
                      </p>
                      <div className="be-method-check">
                        <CheckCircle2 size={11} className="be-check-icon emerald" />
                        <span>Zero math hallucinations · Exact formula verification</span>
                      </div>
                    </div>
                  </div>

                  <div className="be-method-item">
                    <div className="be-method-icon dual">
                      <Scale size={15} aria-hidden="true" />
                    </div>
                    <div className="be-method-content">
                      <div className="be-method-meta">
                        <h4>Symmetrical Dual-Thesis</h4>
                        <span className="be-method-badge cyan">CONCURRENT AUDIT</span>
                      </div>
                      <p>
                        Both Bull and Bear cases are constructed concurrently from the <strong className="be-hl-cyan">identical factual baseline</strong> so genuine risk-reward tension is surfaced rather than averaged into a generic consensus.
                      </p>
                      <div className="be-method-check">
                        <CheckCircle2 size={11} className="be-check-icon cyan" />
                        <span>Zero fabricated price targets · Genuine dialectic debate</span>
                      </div>
                    </div>
                  </div>

                  <div className="be-method-item">
                    <div className="be-method-icon audit">
                      <ShieldCheck size={15} aria-hidden="true" />
                    </div>
                    <div className="be-method-content">
                      <div className="be-method-meta">
                        <h4>Audited Citations & Gap Transparency</h4>
                        <span className="be-method-badge amber">TRACEABILITY LOG</span>
                      </div>
                      <p>
                        Every factual assertion links to primary filings with exact section anchors and timestamps. <strong className="be-hl-amber">Missing data points are explicitly flagged</strong>, never assumed.
                      </p>
                      <div className="be-method-check">
                        <CheckCircle2 size={11} className="be-check-icon amber" />
                        <span>SEC EDGAR & Exchange permalinks · 100% gap transparency</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="be-cta-card">
                  <div className="be-cta-card-head">
                    <div className="be-cta-live-indicator">
                      <span className="be-status-dot green live" />
                      <span className="be-cta-live-text">READY WHEN YOU ARE</span>
                    </div>
                    <span className="be-cta-tag">11 Autonomous Specialists</span>
                  </div>

                  <div className="be-cta-body">
                    <h3>
                      Start with one <span className="be-gradient-text">ticker</span>.
                    </h3>
                    <p>
                      One question is enough to see the whole multi-agent pipeline work — planner decomposition, parallel evidence collection, and dual-thesis synthesis.
                    </p>
                  </div>

                  <div className="be-faq-ticker-pills">
                    {[
                      { sym: 'NVDA', name: 'Nvidia' },
                      { sym: 'AAPL', name: 'Apple' },
                      { sym: 'MSFT', name: 'Microsoft' },
                      { sym: 'RELIANCE.NS', name: 'Reliance' },
                      { sym: 'TCS.NS', name: 'TCS' },
                    ].map((item) => (
                      <button
                        key={item.sym}
                        type="button"
                        className="be-faq-ticker-pill"
                        onClick={() => {
                          onSelectSuggestion?.(item.sym) || onQueryChange?.(item.sym)
                          go('research')
                        }}
                      >
                        <span className="be-ticker-sym">{item.sym}</span>
                        <span className="be-ticker-name">{item.name}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="be-button accent block be-faq-cta-btn"
                    onClick={() => go('research')}
                  >
                    <Sparkles size={14} aria-hidden="true" />
                    <span>Launch Equity Research</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Right Column: Interactive Accordions */}
              <div className="be-faq-right-col">
                <div className="be-faq-panel-head">
                  <span className="be-faq-panel-kicker">
                    <span className="be-status-dot cyan live" /> AUDITED METHODOLOGY & FAQS
                  </span>
                  <span className="be-faq-panel-count">5 Core Tenets</span>
                </div>

                <div className="be-faq-accordion-stack">
                  {QUESTIONS.map((item, idx) => (
                    <details className="be-faq-accordion" key={item.q} open={idx === 0}>
                      <summary>
                        <div className="be-faq-q-left">
                          <span className="be-faq-num">0{idx + 1}</span>
                          <span className="be-faq-q-text">{item.q}</span>
                        </div>
                        <div className="be-faq-q-right">
                          <span className={`be-faq-type-pill ${item.badgeType}`}>{item.badge}</span>
                          <span className="be-faq-chevron-wrap">
                            <ChevronDown size={13} className="be-faq-chevron" aria-hidden="true" />
                          </span>
                        </div>
                      </summary>
                      <div className="be-faq-answer-wrap">
                        <p className="be-faq-answer">{item.answer}</p>
                        {item.pills && (
                          <div className="be-faq-pills">
                            {item.pills.map((p) => (
                              <span key={p} className="be-faq-pill">
                                <CheckCircle2 size={10} className="be-faq-pill-icon" />
                                <span>{p}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Integrated Floating Pill Dock Footer ─────────────────────── */}
            <footer className="be-footer be-footer-dock">
              <div className="be-footer-inner">
                <div className="be-footer-left">
                  <div className="be-brand">
                    <Logo size={18} />
                    <span className="be-brand-name">
                      Artha AI<span className="be-brand-dot">.</span>
                    </span>
                  </div>
                  <span className="be-footer-status">
                    <span className="be-status-dot green live" />
                    <span>SEC EDGAR Live</span>
                  </span>
                  <span className="be-footer-divider" aria-hidden="true">•</span>
                  <p
                    className="be-footer-note"
                    title="ArthaLens AI is an evidence-first research aid, not an investment adviser. Verify all data against original filings before making decisions."
                  >
                    Evidence-first research aid · Not financial advice · Verify against original filings
                  </p>
                </div>

                <div className="be-footer-right">
                  <div className="be-footer-links">
                    {NAV_LINKS.map(([id, label]) => (
                      <button key={id} type="button" className="be-footer-link" onClick={() => go(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="be-footer-copy">© 2026 Artha AI</span>
                </div>
              </div>
            </footer>
          </div>
        </section>
      </main>
    </div>
  )
}
