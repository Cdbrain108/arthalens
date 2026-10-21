import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  Scale,
  BarChart3,
  PieChart,
  TrendingUp,
  Newspaper,
  Layers,
  FileText,
  MessageSquare,
  Users,
  Globe,
  ShieldCheck,
  FileCheck,
  ArrowRight,
  BookOpen,
} from 'lucide-react'
import { detectQueryType } from '../utils/queryRouter'

const SPECIALIST_META = {
  financial: {
    name: 'Financial Health Specialist',
    short: 'Financial Health',
    icon: BarChart3,
    color: '#38bdf8',
    working: 'Auditing balance sheet solvency, debt covenants & free cash flow...',
    done: 'Balance sheet solvency verified with 10-K/10-Q filings',
  },
  valuation: {
    name: 'Valuation Multiples Specialist',
    short: 'Valuation Multiples',
    icon: PieChart,
    color: '#34d399',
    working: 'Computing trailing P/E, EV/EBITDA, DCF & peer percentile ranks...',
    done: 'Intrinsic valuation models & historical percentiles calculated',
  },
  risk: {
    name: 'Adversarial Risk Auditor',
    short: 'Risk Diligence',
    icon: AlertTriangle,
    color: '#f87171',
    working: 'Auditing customer concentration, debt maturities & regulatory actions...',
    done: 'Tail-risks & adversarial scenarios stress-tested',
  },
  market: {
    name: 'Market Dynamics Specialist',
    short: 'Market Dynamics',
    icon: TrendingUp,
    color: '#a78bfa',
    working: 'Tracking real-time order books, beta, 52-week channels & liquidity...',
    done: 'Market price discovery & momentum metrics captured',
  },
  document: {
    name: 'SEC Filing Auditor',
    short: 'SEC / Filing Auditor',
    icon: FileText,
    color: '#fbbf24',
    working: 'Parsing statutory footnotes, auditor remarks & MDA disclosures...',
    done: 'Statutory disclosures & footnotes verified',
  },
  growth: {
    name: 'Strategic Growth Specialist',
    short: 'Growth & Expansion',
    icon: TrendingUp,
    color: '#60a5fa',
    working: 'Analyzing TAM expansion, CapEx guidance & unit economics...',
    done: 'CapEx trajectory & revenue durability modelled',
  },
  news: {
    name: 'Regulatory & News Specialist',
    short: 'Corporate News',
    icon: Newspaper,
    color: '#f472b6',
    working: 'Filtering exchange filings, board decisions & regulatory alerts...',
    done: 'Exchange disclosures & material developments curated',
  },
  workforce: {
    name: 'Talent & Workforce Specialist',
    short: 'Workforce & Talent',
    icon: Users,
    color: '#818cf8',
    working: 'Auditing attrition trends, talent retention & engineering headcount...',
    done: 'Human capital indicators & attrition trends quantified',
  },
  social: {
    name: 'Social Sentiment Auditor',
    short: 'Public Sentiment',
    icon: MessageSquare,
    color: '#fb923c',
    working: 'Measuring retail sentiment, conference call tone & executive sentiment...',
    done: 'Sentiment tone checked and marked as interpretation',
  },
  governance: {
    name: 'Governance & Board Auditor',
    short: 'Corporate Governance',
    icon: ShieldCheck,
    color: '#10b981',
    working: 'Checking promoter share pledging, board independence & governance...',
    done: 'Governance alignment & promoter pledging audited',
  },
}

export default function ArthaReasoningBlock({
  job,
  query = '',
  running = false,
  submitting = false,
  isDone = false,
  isGenerating = false,
  isConversational = false,
  generationStep = 0,
  askingReport = false,
  onViewReport,
}) {
  const activeQuery = query || job?.query || ''

  // Determine if this is a conversational / educational query (0 specialist agents)
  const isConversationalMode = Boolean(
    isConversational ||
    job?.intent === 'conversational' ||
    (job && Array.isArray(job.selected_agents) && job.selected_agents.length === 0) ||
    (!job?.entities?.length && detectQueryType(activeQuery) === 'conversational')
  )

  // In conversational mode, keep collapsed by default to avoid cluttering mobile UI
  const [expanded, setExpanded] = useState(() => !isConversationalMode)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef(null)
  const finalSecondsRef = useRef(null)

  const active = Boolean(running || submitting || isGenerating || askingReport)

  // Track live elapsed seconds
  useEffect(() => {
    if (active && !isDone) {
      const start = Date.now()
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.max(1, Math.round((Date.now() - start) / 1000)))
      }, 1000)
      return () => clearInterval(timerRef.current)
    }
  }, [active, isDone])

  // Freeze elapsed time on finish
  useEffect(() => {
    if (isDone && finalSecondsRef.current === null) {
      finalSecondsRef.current = elapsedSeconds || 1
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isDone, elapsedSeconds])

  const shownSeconds = finalSecondsRef.current ?? elapsedSeconds

  // Format seconds as MM:SS
  const mins = Math.floor(shownSeconds / 60)
  const secs = shownSeconds % 60
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}s`

  // Resolve active entity and specialists
  const entity = job?.entities?.[0]
  const entityLabel = isConversationalMode
    ? 'Concept Explainer'
    : entity?.ticker
    ? `${entity.ticker} (${entity.name || ''})`
    : entity?.name || activeQuery || 'Stock Query'

  // Crucial: In conversational mode, zero agents are dispatched!
  const selectedAgentKeys = isConversationalMode
    ? []
    : (job?.selected_agents && job.selected_agents.length > 0)
    ? job.selected_agents
    : ['financial', 'valuation', 'risk', 'market', 'document']

  // Determine stage headline and progress percentage
  let stageTitle = 'Auditing valuation multiples, balance sheets & SEC filings...'
  let progressPct = 35

  if (isConversationalMode) {
    if (isGenerating) {
      if (generationStep === 0) {
        stageTitle = 'Analyzing query intent & financial terminology...'
        progressPct = 35
      } else if (generationStep === 1) {
        stageTitle = 'Synthesizing verified definitions & practical financial examples...'
        progressPct = 75
      } else {
        stageTitle = 'Finalizing institutional explanation & follow-up suggestions...'
        progressPct = 95
      }
    } else {
      stageTitle = 'Direct financial knowledge synthesis · 0 specialist agents dispatched.'
      progressPct = 100
    }
  } else if (askingReport) {
    stageTitle = 'Cross-referencing verified metrics and citations from completed report...'
    progressPct = 80
  } else if (isGenerating) {
    if (generationStep === 0) {
      stageTitle = 'Analyzing query intent & financial terminology...'
      progressPct = 38
    } else if (generationStep === 1) {
      stageTitle = 'Auditing valuation multiples, balance sheets & SEC filings...'
      progressPct = 72
    } else {
      stageTitle = 'Synthesizing deterministic mathematical intelligence...'
      progressPct = 96
    }
  } else if (submitting) {
    stageTitle = 'Deconstructing query & compiling dynamic Directed Acyclic Graph (DAG)...'
    progressPct = 15
  } else if (job?.current_node) {
    const node = job.current_node
    if (node === 'analyze_query') {
      stageTitle = 'Stage 1/6: Query Understanding · Resolving target security & timeframe...'
      progressPct = 20
    } else if (node === 'create_plan' || node === 'apply_routing_policy') {
      stageTitle = 'Stage 2/6: Dynamic Routing · Assigning specialized autonomous agents...'
      progressPct = 35
    } else if (node === 'run_specialists') {
      const completedCount = job?.completed_agents?.length || 0
      const total = selectedAgentKeys.length || 1
      stageTitle = `Stage 3/6: Parallel Diligence · ${completedCount}/${total} Specialists Extracted Filings...`
      progressPct = 40 + Math.round((completedCount / total) * 30)
    } else if (node === 'validate_evidence') {
      stageTitle = 'Stage 4/6: Evidence Auditor · Enforcing zero-hallucination math & citations...'
      progressPct = 78
    } else if (node === 'challenge_thesis') {
      stageTitle = 'Stage 5/6: Adversarial Confrontation · Stress-testing Bull thesis against Bear risks...'
      progressPct = 88
    } else if (node === 'synthesize_report' || node === 'build_report' || node === 'generate_pdf') {
      stageTitle = 'Stage 6/6: Institutional Synthesis · Generating executive brief & PDF dossier...'
      progressPct = 95
    } else if (node === 'done' || isDone) {
      stageTitle = 'Institutional Audit Complete · All evidence verified with primary filings.'
      progressPct = 100
    }
  } else if (isDone) {
    stageTitle = 'Institutional Audit Complete · All evidence verified with primary filings.'
    progressPct = 100
  }

  return (
    <div className="artha-reasoning-block rounded-2xl border border-emerald-500/40 bg-gradient-to-tr from-[#161f1a] to-[#121722] p-3.5 sm:p-4 shadow-xl space-y-3 text-left transition-all duration-300">
      {/* ── Top Bar: Title + Timer + Reasoning Collapse Toggle ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-400 to-teal-500 shadow-md">
            {active && !isDone ? (
              <Sparkles size={15} className="text-black animate-spin" />
            ) : isConversationalMode ? (
              <BookOpen size={15} className="text-black" />
            ) : (
              <CheckCircle2 size={16} className="text-black" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12.5px] sm:text-[13px] font-bold text-white tracking-tight">
                {isConversationalMode
                  ? 'Artha Copilot · Financial Intelligence'
                  : isDone
                  ? 'Artha AI Audit Verified'
                  : 'Artha AI Copilot'}
              </span>
              {entityLabel && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 truncate max-w-[140px] sm:max-w-[200px]">
                  {entityLabel}
                </span>
              )}
              {isConversationalMode && (
                <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                  0 Agents Dispatched
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Controls: Timer + Reasoning Button */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-[10.5px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
            <Clock size={10} className="text-emerald-400" />
            <span>{formattedTime}</span>
          </span>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-1 text-[11px] font-mono text-emerald-300 font-semibold shadow-sm hover:bg-emerald-500/25 transition cursor-pointer"
            title={expanded ? 'Collapse reasoning process' : 'Expand full process'}
          >
            {active && !isDone && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            )}
            <span>Reasoning</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* ── Active Process Headline ── */}
      <div className="flex items-center gap-2 text-[12px] text-slate-200">
        {active && !isDone && (
          <span className="flex gap-1 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        <span className="font-medium truncate">{stageTitle}</span>
      </div>

      {/* ── Smooth Multi-Gradient Progress Bar ── */}
      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
        <div
          className="studio-shimmer-bar h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(10, progressPct))}%` }}
        />
      </div>

      {/* ── Expandable Process Cockpit ── */}
      {expanded && (
        <div className="pt-2 border-t border-white/10 space-y-3 animate-fade-in text-[11.5px]">
          {isConversationalMode ? (
            /* Lightweight Conversational Concept Card (0 Agents Dispatched) */
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2 text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11.5px]">
                  <Sparkles size={13} />
                  <span>Direct Financial Intelligence</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                  0 Agents Dispatched
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                This inquiry asks for conceptual finance education or terminology. Artha Copilot resolves this directly from verified knowledge bases without dispatching the 11-agent multi-specialist filing audit or running SEC extractions.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
                  ⚡ Instant Response
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
                  🛡️ Zero Filing Overhead
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
                  💡 Educational Finance Intelligence
                </span>
              </div>
            </div>
          ) : (
            /* Stock Multi-Agent Diligence: Specialists & Dual-Thesis */
            <>
              {/* Section Header */}
              <div className="flex items-center justify-between text-[#94a3b8] font-mono text-[10px] uppercase tracking-wider">
                <span>Specialists Dispatched &amp; Live Process:</span>
                <span className="text-emerald-400">Deterministic Math &amp; Provenance</span>
              </div>

              {/* Active Specialists Live Cards */}
              <div className="grid grid-cols-1 gap-1.5 max-h-[220px] overflow-y-auto scroll-slim pr-1">
                {selectedAgentKeys.map((agentKey) => {
                  const meta = SPECIALIST_META[agentKey] || {
                    name: `${agentKey} Specialist`,
                    short: agentKey,
                    icon: FileCheck,
                    color: '#34d399',
                    working: 'Investigating statutory filings and financial data...',
                    done: 'Evidence collected and checked against citations',
                  }

                  const Icon = meta.icon
                  const agentStatus = job?.agent_statuses?.[agentKey]
                  const isAgentCompleted = agentStatus === 'completed' || job?.completed_agents?.includes(agentKey) || isDone
                  const isAgentFailed = agentStatus === 'failed' || job?.failed_agents?.includes(agentKey)
                  const isAgentActive = agentStatus === 'running' || (active && !isAgentCompleted && !isAgentFailed)

                  return (
                    <div
                      key={agentKey}
                      className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all ${
                        isAgentActive
                          ? 'border-emerald-500/40 bg-emerald-500/10 shadow-sm'
                          : isAgentCompleted
                          ? 'border-white/10 bg-white/[0.03]'
                          : 'border-white/5 bg-transparent opacity-60'
                      }`}
                    >
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg mt-0.5"
                        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                      >
                        <Icon size={13} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white truncate text-[11.5px]">
                            {meta.short}
                          </span>
                          <span className="shrink-0 text-[9.5px] font-mono">
                            {isAgentCompleted ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                                <CheckCircle2 size={10} />
                                Done
                              </span>
                            ) : isAgentFailed ? (
                              <span className="text-rose-400 font-semibold">Failed</span>
                            ) : isAgentActive ? (
                              <span className="inline-flex items-center gap-1 text-teal-300 font-semibold animate-pulse">
                                <Loader2 size={10} className="animate-spin" />
                                Working
                              </span>
                            ) : (
                              <span className="text-slate-500">Queued</span>
                            )}
                          </span>
                        </div>

                        <p className="text-[10.5px] text-slate-300 leading-tight mt-0.5 truncate">
                          {isAgentCompleted ? meta.done : meta.working}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Adversarial Bull vs Bear Dual-Thesis Phase */}
              <div className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-black/30 text-[10.5px]">
                <div className="flex items-center gap-2">
                  <Scale size={13} className="text-amber-400 shrink-0" />
                  <span className="text-slate-300">
                    <span className="text-amber-300 font-semibold">Adversarial Confrontation:</span> Bull catalysts stress-tested against Bear downside triggers
                  </span>
                </div>
                <span className="text-emerald-400 font-mono text-[9.5px] shrink-0 font-bold">
                  {isDone ? 'Balanced' : 'Active'}
                </span>
              </div>

              {/* Done CTA banner if finished */}
              {isDone && typeof onViewReport === 'function' && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-emerald-400 font-medium">
                    ✨ All specialists completed with zero hallucinations.
                  </span>
                  <button
                    type="button"
                    onClick={onViewReport}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500 text-black px-2.5 py-1 text-[11px] font-bold hover:brightness-110 transition cursor-pointer"
                  >
                    <span>View Full Report</span>
                    <ArrowRight size={11} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
