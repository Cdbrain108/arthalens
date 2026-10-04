import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  FileCheck,
  FileSearch,
  FileText,
  Globe,
  Layers,
  ListChecks,
  Lock,
  MinusCircle,
  Network,
  Newspaper,
  PieChart,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react'
import ResearchPrompt from './ResearchPrompt'
import Logo from './Logo'

const WORKFLOW_STEPS = [
  {
    step: '01',
    badge: 'STAGE 1 · SCOPE',
    title: 'Query Deconstruction & Scope',
    short: 'Intent & Entity Resolution',
    description: 'Deconstructs the question into investment intent (valuation, long-term thesis, peer comparison, price catalyst, or document query). Resolves NSE/BSE tickers and defines evidence bounds.',
    output: 'Deterministic research scope & security identifiers',
    icon: Search,
    color: '#4285f4',
    bg: 'rgba(66, 133, 244, 0.1)',
    border: 'rgba(66, 133, 244, 0.25)'
  },
  {
    step: '02',
    badge: 'STAGE 2 · DISPATCH',
    title: 'Dynamic Multi-Agent Dispatch',
    short: 'Parallel Isolated Specialists',
    description: 'Instead of running a slow, generic swarm, Bulls Eye dynamically activates only the required specialists from our 9-agent roster. Each specialist runs in an isolated sandbox with dedicated toolkits.',
    output: 'Concurrent tool execution & raw evidence extraction',
    icon: Network,
    color: '#34a853',
    bg: 'rgba(52, 168, 83, 0.1)',
    border: 'rgba(52, 168, 83, 0.25)'
  },
  {
    step: '03',
    badge: 'STAGE 3 · AUDIT',
    title: 'Deterministic Evidence Auditor',
    short: '9-Point Verification & Stress Test',
    description: 'Every statement is scored against a strict 9-point grounding checklist. Financial arithmetic is computed in Python, unverified claims are purged, and the thesis undergoes an adversarial Bull vs Bear challenge.',
    output: 'Audited evidence packet & explicit gap disclosures',
    icon: ShieldCheck,
    color: '#fbbc04',
    bg: 'rgba(251, 188, 4, 0.1)',
    border: 'rgba(251, 188, 4, 0.25)'
  },
  {
    step: '04',
    badge: 'STAGE 4 · SYNTHESIS',
    title: 'Institutional Brief & In-App PDF',
    short: 'Cited Executive Delivery',
    description: 'The finalized findings are organized into an executive narrative with supporting metrics tables, risk vectors, what could change the view, and clickable citation footnotes. Available in-app and as a vector PDF.',
    output: 'Institutional report with in-app reader & download',
    icon: FileText,
    color: '#9b72cb',
    bg: 'rgba(155, 114, 203, 0.1)',
    border: 'rgba(155, 114, 203, 0.25)'
  }
]

const SPECIALIST_ROSTER = [
  {
    id: 'financial',
    name: 'Financial Health',
    role: 'Balance Sheet & Cash Flows',
    desc: 'Audits multi-year revenue growth, operating profit margins, debt-to-equity leverage, and return on equity (ROE) from verified financial filings.',
    icon: BarChart3,
    color: '#4285f4',
    tools: ['get_financials', 'get_quarterly_results', 'calculate_ratio']
  },
  {
    id: 'valuation',
    name: 'Valuation & Multiples',
    role: 'Historical & Peer Multiples',
    desc: 'Extracts real-time trading quotes, trailing P/E, EV/EBITDA, price-to-book ratios, and compares against sector benchmarks without fabricating inputs.',
    icon: PieChart,
    color: '#fbbc04',
    tools: ['get_quote', 'get_company_metrics', 'get_peer_multiples']
  },
  {
    id: 'market',
    name: 'Market Momentum',
    role: 'Technicals & Volume Channels',
    desc: 'Tracks price history, trading volume distribution, 52-week channels, moving average crossovers, and computed technical indicators for timing signals.',
    icon: TrendingUp,
    color: '#34a853',
    tools: ['get_price_history', 'get_volume', 'get_technicals']
  },
  {
    id: 'growth',
    name: 'Growth & Expansion',
    role: 'CapEx & Addressable TAM',
    desc: 'Analyzes corporate capital expenditure pipelines, manufacturing capacity additions, new product rollouts, and multi-year industry tailwinds.',
    icon: Layers,
    color: '#a78bfa',
    tools: ['search_web', 'fetch_page', 'search_documents']
  },
  {
    id: 'news',
    name: 'News & Disclosures',
    role: 'Regulatory Filings & BSE/NSE',
    desc: 'Monitors real-time exchange announcements, quarterly earning calls, board changes, dividend declarations, and material regulatory filings.',
    icon: Newspaper,
    color: '#f87171',
    tools: ['search_news', 'fetch_news', 'fetch_page']
  },
  {
    id: 'risk',
    name: 'Risk & Downside',
    role: 'Covenants & Concentration',
    desc: 'Stress-tests debt maturity cliffs, client concentration risks, foreign exchange exposure, input inflation vulnerability, and governance red flags.',
    icon: ShieldAlert,
    color: '#fb923c',
    tools: ['search_web', 'get_financials', 'search_news']
  },
  {
    id: 'workforce',
    name: 'Workforce & Operations',
    role: 'Hiring Velocity & Attrition',
    desc: 'Gauges headcount trajectory, key managerial personnel departures, talent retention health, and Glassdoor operational sentiment.',
    icon: Users,
    color: '#22d3ee',
    tools: ['search_jobs', 'fetch_job_detail', 'search_web']
  },
  {
    id: 'social',
    name: 'Public Sentiment',
    role: 'Chatter vs Corporate Reality',
    desc: 'Dissects retail forum sentiment, investor conference takeaways, and public sentiment to separate genuine catalysts from short-term noise.',
    icon: Globe,
    color: '#38bdf8',
    tools: ['search_web', 'fetch_page']
  },
  {
    id: 'document',
    name: 'Document Intelligence',
    role: 'RAG & Regulatory PDF Audit',
    desc: 'Extracts ground-truth data from uploaded annual reports, investor presentations, and broker notes with semantic vector search.',
    icon: FileSearch,
    color: '#818cf8',
    tools: ['search_documents', 'retrieve_evidence']
  }
]

const GUARANTEES = [
  {
    icon: Scale,
    title: 'Zero Plausible Hallucinations',
    desc: 'If a ratio or metric cannot be established from filed statements or quotes, it is surfaced as an explicit "Not measured" gap, never filled with model guesswork.'
  },
  {
    icon: Lock,
    title: 'Deterministic Python Arithmetic',
    desc: 'All financial calculations (ROE, ROCE, debt-to-equity, profit margins) are computed by deterministic Python code with audited inputs, not improvised by LLMs.'
  },
  {
    icon: FileCheck,
    title: 'Audited Source Provenance',
    desc: 'Every key claim in the synthesized report includes a superscript footnote pointing to its exact filing, disclosure, or source document.'
  },
  {
    icon: Swords,
    title: 'Adversarial Bull vs Bear Challenge',
    desc: 'The pipeline does not produce one-sided cheerleading. Every positive thesis is challenged by dedicated risk auditors before final sign-off.'
  }
]

export default function LandingExperience({ onRun, running, submitting, query, onQueryChange }) {
  const [activeWorkflow, setActiveWorkflow] = useState(0)
  const currentStep = WORKFLOW_STEPS[activeWorkflow]
  const CurrentIcon = currentStep.icon

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-20 sm:px-6 lg:px-10 font-sans">
      
      {/* ═══ 1. COMMAND DECK HERO ═══ */}
      <section className="relative overflow-hidden pt-8 pb-12 sm:pt-14 sm:pb-16 text-center">
        {/* Ambient lighting glows */}
        <div className="pointer-events-none absolute left-1/2 -top-24 h-96 w-96 -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#4285f4]/15 via-[#9b72cb]/10 to-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute right-10 top-1/3 h-64 w-64 rounded-full bg-[#4285f4]/8 blur-3xl" />
        <div className="pointer-events-none absolute left-10 bottom-0 h-64 w-64 rounded-full bg-emerald-500/8 blur-3xl" />

        {/* Top Intelligence Pill */}
        <div className="relative inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-1.5 backdrop-blur-md mb-6 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[10.5px] font-semibold tracking-wider text-[#8ab4f8] uppercase">
            ARTHAAI · BULLS EYE
          </span>
          <span className="text-white/20">|</span>
          <span className="font-mono text-[10px] text-[#9aa0a6] uppercase tracking-wide">
            9 Autonomous Specialists · NSE/BSE Live
          </span>
        </div>

        {/* Main Headline */}
        <h1 className="mx-auto max-w-4xl text-[clamp(2.4rem,5.5vw,4.5rem)] font-medium leading-[1.05] tracking-tight text-[#f1f3f4]">
          Less noise. More conviction.<br />
          <span className="bg-gradient-to-r from-[#8ab4f8] via-[#c4b5fd] to-[#6ee7b7] bg-clip-text text-transparent font-semibold">
            Evidence-Driven Equity Research.
          </span>
        </h1>

        {/* Subhead */}
        <p className="mx-auto mt-5 max-w-2xl text-[14.5px] leading-relaxed text-[#9aa0a6] sm:text-[16px]">
          Ask any question on Indian equities. Bulls Eye routes isolated specialists, audits filed balance sheets, stress-tests Bull vs Bear cases, and generates cited executive briefs with in-app PDF export.
        </p>

        {/* Central Spotlight Search Terminal */}
        <div className="relative mx-auto mt-9 w-full max-w-3xl">
          <div className="relative rounded-[22px] border border-white/12 bg-[#171a21]/90 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
            <div className="mb-2.5 flex items-center justify-between px-1 text-[11px] font-mono text-[#9aa0a6]">
              <div className="flex items-center gap-2 font-semibold text-[#8ab4f8]">
                <Sparkles size={14} className="text-[#8ab4f8]" />
                <span>AUTONOMOUS RESEARCH PROMPT</span>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Evidence before opinion
              </span>
            </div>

            <ResearchPrompt
              onRun={onRun}
              running={running}
              submitting={submitting}
              query={query}
              onQueryChange={onQueryChange}
            />
          </div>
        </div>

        {/* Market Quick Metrics Banner */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono text-[#9aa0a6]">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3.5 py-1.5">
            <span className="font-semibold text-white">NIFTY 50</span>
            <span className="text-emerald-400 font-bold">25,250.10</span>
            <span className="text-[10px] text-emerald-400/80">(+0.42%)</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3.5 py-1.5">
            <span className="font-semibold text-white">SENSEX</span>
            <span className="text-emerald-400 font-bold">82,490.85</span>
            <span className="text-[10px] text-emerald-400/80">(+0.38%)</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3.5 py-1.5">
            <span className="font-semibold text-white">NIFTY IT</span>
            <span className="text-amber-400 font-bold">42,120.45</span>
            <span className="text-[10px] text-amber-400/80">(-0.15%)</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3.5 py-1.5">
            <ShieldCheck size={13} className="text-[#8ab4f8]" />
            <span className="text-[#8ab4f8] font-medium">100% CITED FACTS ONLY</span>
          </div>
        </div>
      </section>

      {/* ═══ 2. FOUR-STAGE AUTONOMOUS PIPELINE ARCHITECTURE ═══ */}
      <section className="mt-14 scroll-mt-12 rounded-3xl border border-white/10 bg-[#15181f]/80 p-6 sm:p-9 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-[#4285f4]/15 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[#8ab4f8]">
              <Target size={13} />
              <span>HOW BULLS EYE WORKS</span>
            </div>
            <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              From Plain Question to Cited Institutional Brief
            </h2>
          </div>
          <p className="max-w-md text-[13px] leading-relaxed text-[#9aa0a6]">
            Every query passes through an autonomous 4-stage pipeline that eliminates hallucinations and guarantees full provenance.
          </p>
        </div>

        {/* 4 Interactive Stage Tabs */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {WORKFLOW_STEPS.map((s, index) => {
            const Icon = s.icon
            const isSelected = activeWorkflow === index
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => setActiveWorkflow(index)}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 text-left transition-all duration-200 ${
                  isSelected
                    ? 'border-[#4285f4] bg-[#4285f4]/10 shadow-[0_8px_30px_-10px_rgba(66,133,244,0.4)]'
                    : 'border-white/8 bg-[#1a1e27]/60 hover:border-white/20 hover:bg-[#1a1e27]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl shadow"
                    style={{ background: s.bg, color: s.color }}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="font-mono text-[12px] font-bold text-[#5f6368]">
                    {s.step}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-mono font-semibold tracking-wider text-[#8ab4f8] uppercase">
                    {s.badge}
                  </span>
                  <h3 className="mt-1 text-[14px] font-bold text-white">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-[11.5px] text-[#9aa0a6] line-clamp-2">
                    {s.short}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-[11px] font-medium text-[#bdc1c6]">
                    {isSelected ? 'Viewing details' : 'Click to inspect'}
                  </span>
                  <ChevronRight
                    size={14}
                    className={`transition-transform ${isSelected ? 'translate-x-1 text-[#8ab4f8]' : 'text-[#5f6368]'}`}
                  />
                </div>
              </button>
            )
          })}
        </div>

        {/* Active Stage Detailed Breakdown Panel */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-[#12141a] p-6 sm:p-7">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 items-center">
            <div>
              <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-[#8ab4f8]">
                <CurrentIcon size={16} />
                <span>STAGE {currentStep.step} DEEP DIVE · {currentStep.badge}</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-white sm:text-2xl">
                {currentStep.title}
              </h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[#bdc1c6]">
                {currentStep.description}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#181c24] p-5">
              <span className="text-[10.5px] font-mono uppercase tracking-wider text-[#9aa0a6] block mb-2">
                Stage Deliverable & Artifact:
              </span>
              <div className="flex items-start gap-2.5 text-[13px] font-semibold text-emerald-300 leading-snug">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{currentStep.output}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[10.5px] font-mono text-[#8ab4f8]">
                <span className="rounded-md border border-[#4285f4]/20 bg-[#4285f4]/10 px-2 py-0.5">Automated</span>
                <span className="rounded-md border border-[#4285f4]/20 bg-[#4285f4]/10 px-2 py-0.5">Deterministic</span>
                <span className="rounded-md border border-[#4285f4]/20 bg-[#4285f4]/10 px-2 py-0.5">Source-Checked</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 3. THE 9 SPECIALIST AGENTS ROSTER ═══ */}
      <section className="mt-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-7">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-[#34a853]/15 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-emerald-400">
              <Layers size={13} />
              <span>THE SPECIALIST ENGINE ROOM · WHAT WE HAVE BUILT</span>
            </div>
            <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              What we have built: Nine Focused Specialists. Zero Generic Agents.
            </h2>
          </div>
          <p className="max-w-md text-[13px] leading-relaxed text-[#9aa0a6]">
            Every company is investigated across separate specialized dimensions with dedicated provider tools and strict rate-limiting.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SPECIALIST_ROSTER.map((agent) => {
            const Icon = agent.icon
            return (
              <div
                key={agent.id}
                className="group relative rounded-2xl border border-white/8 bg-[#181c24] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-[#1c212c] hover:shadow-xl"
              >
                <div className="flex items-center justify-between mb-3.5">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                    style={{ background: `${agent.color}15`, color: agent.color }}
                  >
                    <Icon size={19} />
                  </span>
                  <span className="font-mono text-[10px] text-[#5f6368] uppercase tracking-wider">
                    Specialist #{SPECIALIST_ROSTER.indexOf(agent) + 1}
                  </span>
                </div>
                <h3 className="text-[15px] font-bold text-white group-hover:text-[#8ab4f8] transition-colors">
                  {agent.name}
                </h3>
                <span className="block text-[11px] font-mono text-[#8ab4f8] mt-0.5">
                  {agent.role}
                </span>
                <p className="mt-2.5 text-[12px] leading-relaxed text-[#9aa0a6]">
                  {agent.desc}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                  {agent.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9.5px] text-[#bdc1c6]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ═══ 4. DUAL READING MODES SHOWCASE ═══ */}
      <section className="mt-16 rounded-3xl border border-white/10 bg-gradient-to-br from-[#181d26] via-[#141720] to-[#12141a] p-6 sm:p-9 shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-[#fbbc04]/15 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[#fbbc04]">
              <Eye size={13} />
              <span>DUAL READING MODES</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              One Research Engine. Two Views for Different Audiences.
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#bdc1c6]">
              Whether you are an active investor wanting institutional clarity in 60 seconds, or an equity analyst verifying audited balance-sheet multiples, Bulls Eye switches seamlessly between two purpose-built perspectives.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4285f4]/15 text-[#8ab4f8] mt-0.5 font-bold text-[12px]">
                  B
                </span>
                <div>
                  <h4 className="text-[13px] font-semibold text-white">Beginner Mode · Plain English Verdict</h4>
                  <p className="text-[11.5px] text-[#9aa0a6] mt-0.5">
                    Directional evidence summary, high-impact cards, plain-language risk factors, and clear takeaways.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fbbc04]/15 text-[#fbbc04] mt-0.5 font-bold text-[12px]">
                  E
                </span>
                <div>
                  <h4 className="text-[13px] font-semibold text-white">Expert Mode · Deep Analytical Rigor</h4>
                  <p className="text-[11.5px] text-[#9aa0a6] mt-0.5">
                    Python-computed ratios table, quarterly trend audits, peer spread calculations, and source links.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Mode Preview Card */}
          <div className="rounded-2xl border border-white/12 bg-[#1b202a] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="font-mono text-[11px] font-semibold text-[#8ab4f8] flex items-center gap-1.5">
                <Sparkles size={13} /> SAMPLE VERDICT: RELIANCE INDUSTRIES
              </span>
              <span className="rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold">
                EVIDENCE: ACCUMULATE
              </span>
            </div>
            <div className="mt-4 space-y-3 text-left">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
                <span className="text-[11px] font-mono text-[#9aa0a6] uppercase tracking-wider block">Short Answer</span>
                <p className="mt-1 text-[13px] font-medium text-white leading-relaxed">
                  Five-year fundamentals lean constructive: Retail and Jio digital cash flows support ongoing green energy CapEx, with net debt comfortably covered by EBITDA.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="rounded-lg bg-black/30 p-2 border border-white/5">
                  <span className="block text-[10px] text-[#9aa0a6]">P/E (TTM)</span>
                  <strong className="text-[13px] text-white">24.2x</strong>
                </div>
                <div className="rounded-lg bg-black/30 p-2 border border-white/5">
                  <span className="block text-[10px] text-[#9aa0a6]">ROE</span>
                  <strong className="text-[13px] text-emerald-400">11.4%</strong>
                </div>
                <div className="rounded-lg bg-black/30 p-2 border border-white/5">
                  <span className="block text-[10px] text-[#9aa0a6]">Grounding</span>
                  <strong className="text-[13px] text-[#8ab4f8]">94.2%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 5. CORE METHODOLOGY & GUARANTEES ═══ */}
      <section className="mt-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-[#9b72cb]/15 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[#c4b5fd]">
            <ShieldCheck size={13} />
            <span>INSTITUTIONAL INTEGRITY</span>
          </div>
          <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Built on Facts. Verified by Code.
          </h2>
          <p className="mt-2 text-[13px] text-[#9aa0a6]">
            Every architectural decision is optimized to eliminate false confidence and deliver actionable research.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GUARANTEES.map((g, idx) => {
            const Icon = g.icon
            return (
              <div key={idx} className="rounded-2xl border border-white/8 bg-[#181c24] p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4285f4]/15 text-[#8ab4f8] mb-4">
                  <Icon size={18} />
                </span>
                <h3 className="text-[14px] font-bold text-white mb-2">
                  {g.title}
                </h3>
                <p className="text-[12px] leading-relaxed text-[#9aa0a6]">
                  {g.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ═══ 6. IN-APP PDF VIEWER BANNER ═══ */}
      <section className="mt-16 overflow-hidden rounded-3xl border border-[#4285f4]/25 bg-gradient-to-r from-[#172545] via-[#151d30] to-[#121622] p-7 sm:p-9 shadow-2xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-2xl text-left">
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#93c5fd]">
              Executive PDF Publishing
            </span>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              Inspect Onscreen or Export a C-Suite Ready PDF Brief
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#bdc1c6]">
              Every completed research job renders an embedded in-app PDF preview with download and external window support, complete with cover page, metrics cards, Bull/Bear thesis, and audited footnotes.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onQueryChange('Analyze TCS fundamentals')
                onRun('Analyze TCS fundamentals')
              }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4285f4] to-[#1a73e8] px-5 py-3 text-[13px] font-semibold text-white shadow-lg hover:brightness-110 transition"
            >
              <span>Launch Research Demo</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="mt-16 flex flex-col sm:flex-row items-center justify-between border-t border-white/8 pt-8 text-[11px] font-mono text-[#6f7a8c] gap-3">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span>ArthaAI · Bulls Eye Institutional Equity Intelligence</span>
        </div>
        <span>Built for Indian Markets (NSE / BSE) · 100% Audited Evidence</span>
      </footer>

    </div>
  )
}
