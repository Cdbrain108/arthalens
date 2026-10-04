import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  BarChart3,
  PieChart,
  TrendingUp,
  Layers,
  FileText,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowRight,
  HelpCircle,
  Users,
  AlertTriangle,
  Globe,
  FileSearch
} from 'lucide-react'
import TypingText from './TypingText'

/* ---------------------------------------------------------------------------
 * This panel shows the pipeline running. It may describe what each agent is
 * FOR, because that is fixed and knowable; it may not describe what an agent
 * FOUND, because no per-agent output is streamed to the client. The job status
 * carries `selected_agents` and `completed_agents` — that is the whole of the
 * real progress signal, and it is what drives this component.
 * ------------------------------------------------------------------------- */

/** Fixed role descriptions. These state the agent's remit, never its results. */
const AGENT_CATALOGUE = {
  financial: {
    name: 'Financial Health & Profitability Specialist',
    icon: BarChart3,
    color: 'text-[#8ab4f8]',
    active: 'Reading balance sheet, margin and leverage evidence...',
    role: 'Extracts reported profitability and leverage from validated filings.',
    remit: [
      'Looks for: operating margin, net margin, return on equity, debt / equity',
      'Benchmarks any measured ratio against the stored sector reference',
      'Reports a ratio it cannot source as an evidence gap rather than estimating it'
    ]
  },
  valuation: {
    name: 'Valuation & Multiples Specialist',
    icon: PieChart,
    color: 'text-amber-400',
    active: 'Resolving trailing multiples and cross-checking pricing evidence...',
    role: 'Derives trailing multiples from live quotes and validated earnings.',
    remit: [
      'Looks for: trailing P/E, price-to-book, enterprise multiples',
      'Requires a live quote and a sourced earnings figure before reporting a multiple',
      'Discloses an unresolvable multiple instead of substituting a peer or historic value'
    ]
  },
  market: {
    name: 'Market & Technical Momentum Specialist',
    icon: TrendingUp,
    color: 'text-[#34a853]',
    active: 'Evaluating spot price, trading volume, and market momentum...',
    role: 'Places current market quote into context of trading volume and price momentum.',
    remit: [
      'Looks for: last traded price, daily volume, trading range and volatility',
      'Requires verified exchange quote before reporting market posture',
      'Does not infer a trend from a single unverified quote'
    ]
  },
  growth: {
    name: 'Strategic Growth & Expansion Specialist',
    icon: Layers,
    color: 'text-purple-400',
    active: 'Searching disclosed capital expenditure and contract announcements...',
    role: 'Collects disclosed expansion, capex and contract activity.',
    remit: [
      'Looks for: announced deals, capacity investment, stated pipeline',
      'Each item must carry a retrievable source before it enters the report',
      'Forward-looking management language is recorded as interpretation, not fact'
    ]
  },
  news: {
    name: 'Corporate News & Regulatory Disclosures',
    icon: FileText,
    color: 'text-rose-400',
    active: 'Auditing exchange filings and recent disclosures...',
    role: 'Gathers exchange filings, disclosures and dated news items.',
    remit: [
      'Looks for: statutory announcements, litigation and regulatory notices',
      'Every claim is dated; undated items fail the recency check',
      'Aggregator summaries are not treated as primary sources'
    ]
  },
  risk: {
    name: 'Risk & Downside Assessment',
    icon: AlertTriangle,
    color: 'text-orange-400',
    active: 'Enumerating downside exposures and concentration risks...',
    role: 'Builds the downside case that the synthesis stage must answer.',
    remit: [
      'Looks for: concentration, leverage, regulatory and demand exposure',
      'Feeds the adversarial bear case rather than the summary directly',
      'A risk with no source is dropped, not softened into a caveat'
    ]
  },
  workforce: {
    name: 'Workforce & Operational Posture',
    icon: Users,
    color: 'text-cyan-400',
    active: 'Reviewing disclosed headcount and hiring signals...',
    role: 'Reads disclosed headcount, attrition and hiring activity.',
    remit: [
      'Looks for: reported headcount, attrition rate, open-role volume',
      'Job-board counts are labelled as provider data, not filings',
      'Does not infer morale or strategy from headcount alone'
    ]
  },
  social: {
    name: 'Public Sentiment Scan',
    icon: Globe,
    color: 'text-sky-400',
    active: 'Sampling public discussion for recurring themes...',
    role: 'Samples public commentary, marked as sentiment rather than fact.',
    remit: [
      'Looks for: recurring themes in public discussion',
      'Everything it returns is typed as interpretation, never as a fact claim',
      'Cannot contribute to the quality score'
    ]
  },
  document: {
    name: 'Uploaded Document Analyst',
    icon: FileSearch,
    color: 'text-indigo-400',
    active: 'Indexing and querying the uploaded document...',
    role: 'Answers from the document you supplied, with page-level citations.',
    remit: [
      'Looks for: passages in your upload relevant to the query',
      'Every claim carries a document ID and page reference',
      'Does not reach outside the uploaded file'
    ]
  }
}

export default function LiveAgentStream({
  job,
  query = '',
  running = false,
  isDone = false,
  onSelectPrompt
}) {
  const [expandedSteps, setExpandedSteps] = useState({ query_agent: true })
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const finalSeconds = useRef(null)

  useEffect(() => {
    let interval = null
    if (running) {
      finalSeconds.current = null
      setElapsedSeconds(0)
      interval = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [running])

  useEffect(() => {
    if (isDone && finalSeconds.current === null) {
      finalSeconds.current = elapsedSeconds
    }
  }, [isDone, elapsedSeconds])

  const qLower = (query || '').toLowerCase().trim()

  const selectedAgentKeys = job?.selected_agents || []
  const completedAgentKeys = job?.completed_agents || []
  const failedAgentKeys = job?.failed_agents || []
  const entities = job?.entities || []

  const isConversational =
    job?.intent === 'conversational' ||
    ['hi', 'hello', 'hey', 'greetings', 'help', 'who are you', 'what can you do',
      'good morning', 'good evening'].includes(qLower) ||
    (isDone && selectedAgentKeys.length === 0 && entities.length === 0)

  // Comparison is a fact about how many securities the router resolved, not a
  // guess from the query string. Scanning for "vs" used to fire inside ordinary
  // words, so "TVS Motor" was routed as a head-to-head comparison.
  const isComparisonQuery = !isConversational && entities.length > 1

  const primaryEntity = entities[0] || null
  const entityLabel = primaryEntity
    ? `${primaryEntity.name || 'Unnamed security'}${primaryEntity.ticker ? ` (${primaryEntity.exchange || 'listing'}: ${primaryEntity.ticker})` : ''}`
    : null

  /* --- Step list, built from the real routing decision -------------------- */

  let steps = []

  if (isConversational) {
    steps = [
      {
        id: 'query_agent',
        name: 'Query Understanding & Intent Router',
        icon: Sparkles,
        color: 'text-[#8ab4f8]',
        activeSummary: 'Analyzing intent and scanning the query for target securities...',
        completedSummary: `No public security was identified in your query${query ? ` ("${query}")` : ''}. No specialist agents were dispatched, so no research was billed or run.`,
        details: [
          'Classification: conversational / platform orientation',
          'Securities resolved: none',
          'Specialists dispatched: zero'
        ],
        isConversationalStep: true
      }
    ]
  } else {
    steps.push({
      id: 'query_agent',
      name: isComparisonQuery
        ? 'Query Understanding & Multi-Entity Intent'
        : 'Query Understanding & Entity Intent',
      icon: Sparkles,
      color: 'text-[#8ab4f8]',
      activeSummary: 'Resolving target securities and selecting the minimum agent set...',
      completedSummary: entities.length
        ? `Resolved ${entities.length} ${entities.length === 1 ? 'security' : 'securities'}: ${entities
            .map((e) => `${e.name || e.ticker || 'unnamed'}${e.ticker ? ` (${e.ticker})` : ''}`)
            .join(', ')}. Dispatched ${selectedAgentKeys.length} specialist ${selectedAgentKeys.length === 1 ? 'agent' : 'agents'} in parallel.`
        : 'No security was resolved from this query. Any agents dispatched will report evidence gaps rather than results.',
      details: [
        entities.length
          ? `Entities: ${entities.map((e) => `${e.name || 'unnamed'}${e.ticker ? ` · ${e.ticker}` : ''}${e.exchange ? ` · ${e.exchange}` : ''}`).join(' | ')}`
          : 'Entities: none resolved',
        selectedAgentKeys.length
          ? `Dispatched tracks: ${selectedAgentKeys.join(', ')}`
          : 'Dispatched tracks: none',
        'Routing dispatches only the agents the query requires — unused specialists are not run.'
      ]
    })

    selectedAgentKeys.forEach((key) => {
      const spec = AGENT_CATALOGUE[key]
      if (!spec) return
      steps.push({
        id: `${key}_agent`,
        agentKey: key,
        name: spec.name,
        icon: spec.icon,
        color: spec.color,
        activeSummary: entityLabel && !isComparisonQuery
          ? `${spec.active.replace(/\.\.\.$/, '')} for ${entityLabel}...`
          : spec.active,
        completedSummary: spec.role,
        details: spec.remit
      })
    })

    steps.push({
      id: 'audit_agent',
      name: 'Evidence Validator & Deterministic Auditor',
      icon: ShieldCheck,
      color: 'text-[#8ab4f8]',
      activeSummary: 'Validating provenance on every claim and scoring the checklist...',
      completedSummary:
        'Each claim is checked for a retrievable source, a date and a retained calculation input. Claims that fail are dropped and disclosed as evidence gaps; the quality score is then computed from what survived.',
      details: [
        'Provenance: source, publication date and excerpt required per claim',
        'Conflicts: every pair of numeric claims compared, widest disagreement reported',
        'Score: deterministic checklist — an unmeasured criterion fails rather than passing'
      ]
    })
  }

  /* --- Step state from real completion data ------------------------------- */

  const getStepState = (step, idx) => {
    // A failed agent is reported as failed even after the job finishes — it
    // contributed nothing, and showing it as "done" would imply otherwise.
    if (step.agentKey && failedAgentKeys.includes(step.agentKey)) return 'failed'
    if (isDone) return 'done'
    if (!running) return 'idle'

    // The query router has finished as soon as routing produced a selection.
    if (step.id === 'query_agent') {
      return selectedAgentKeys.length > 0 || entities.length > 0 ? 'done' : 'running'
    }
    // Specialists report their own completion.
    if (step.agentKey) {
      if (completedAgentKeys.includes(step.agentKey)) return 'done'
      return selectedAgentKeys.length > 0 ? 'running' : 'pending'
    }
    // The auditor runs only once every dispatched specialist has reported.
    if (step.id === 'audit_agent') {
      const settled = (k) => completedAgentKeys.includes(k) || failedAgentKeys.includes(k)
      const allIn = selectedAgentKeys.length > 0 && selectedAgentKeys.every(settled)
      return allIn ? 'running' : 'pending'
    }
    return idx === 0 ? 'running' : 'pending'
  }

  const toggleExpand = (id) => {
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const doneCount = steps.filter((s, i) => getStepState(s, i) === 'done').length
  const displaySeconds = finalSeconds.current ?? elapsedSeconds

  return (
    <div className="space-y-3 font-sans">
      {/* Status bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 font-mono text-[12px] text-[#9aa0a6]">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className={running ? 'animate-spin text-[#4285f4]' : 'text-[#8ab4f8]'} />
          <span className="font-semibold text-[#f1f3f4]">Multi-agent pipeline</span>
          <span>•</span>
          {running ? (
            <span className="flex items-center gap-1 text-[#8ab4f8]">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#4285f4]" />
              Running for {elapsedSeconds}s
            </span>
          ) : isDone ? (
            <span className="font-medium text-[#34a853]">
              {displaySeconds > 0 ? `Completed in ${displaySeconds}s` : 'Completed'}
            </span>
          ) : (
            <span>Ready</span>
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase text-[#8ab4f8]">
          {isConversational
            ? 'Router mode · 0 subagents'
            : `${doneCount} / ${steps.length} stages complete`}
        </span>
      </div>

      {/* Agent activity list */}
      <div className="space-y-2 pt-1">
        {steps.map((step, idx) => {
          const state = getStepState(step, idx)
          const isExpanded = expandedSteps[step.id] !== false
          const Icon = step.icon

          return (
            <div
              key={step.id}
              className={`overflow-hidden rounded-xl border text-left transition-all duration-300 ${
                state === 'running'
                  ? 'border-[#4285f4]/50 bg-[#1e2026] shadow-lg shadow-[#4285f4]/5'
                  : state === 'failed'
                  ? 'border-rose-500/30 bg-rose-500/[0.04]'
                  : state === 'done'
                  ? 'border-white/10 bg-[#181a1f]/80 hover:bg-[#1e2026]'
                  : 'border-white/5 bg-white/[0.01] opacity-50'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleExpand(step.id)}
                disabled={state === 'pending'}
                className="flex w-full items-center justify-between p-3 text-left transition"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      state === 'running'
                        ? 'animate-pulse bg-[#4285f4]/20 text-[#8ab4f8] ring-2 ring-[#4285f4]/40'
                        : state === 'failed'
                        ? 'bg-rose-500/15 text-rose-400'
                        : state === 'done'
                        ? 'bg-[#34a853]/15 text-[#34a853]'
                        : 'bg-white/5 text-[#9aa0a6]'
                    }`}
                  >
                    {state === 'running' ? (
                      <Loader2 size={13} className="animate-spin text-[#4285f4]" />
                    ) : state === 'failed' ? (
                      <AlertTriangle size={13} className="text-rose-400" />
                    ) : state === 'done' ? (
                      <CheckCircle2 size={14} className="text-[#34a853]" />
                    ) : (
                      <Icon size={13} />
                    )}
                  </span>

                  <div className="min-w-0 truncate">
                    <span className="block truncate text-[12.5px] font-medium text-[#f1f3f4]">
                      {step.name}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {state === 'running' && (
                    <span className="rounded-full bg-[#4285f4]/20 px-2 py-0.5 font-mono text-[10px] text-[#8ab4f8]">
                      running...
                    </span>
                  )}
                  {state === 'done' && (
                    <span className="rounded-full bg-[#34a853]/10 px-2 py-0.5 font-mono text-[10px] text-[#34a853]">
                      done
                    </span>
                  )}
                  {state === 'failed' && (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] text-rose-300">
                      failed
                    </span>
                  )}
                  {state !== 'pending' && (
                    <span className="text-[#9aa0a6]">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  )}
                </div>
              </button>

              {(state === 'running' || state === 'done' || state === 'failed') && (
                <div className="border-t border-white/5 px-3 pb-3 pt-0">
                  <div className="mt-2 text-[12px] leading-relaxed text-[#bdc1c6]">
                    {state === 'running' ? (
                      <div className="flex items-start gap-1.5 text-[#8ab4f8]">
                        <TypingText text={step.activeSummary} speed={12} className="font-medium text-[#8ab4f8]" />
                      </div>
                    ) : state === 'failed' ? (
                      <p className="text-rose-300">
                        This specialist did not complete. It contributed no evidence, so its section of the
                        report is an evidence gap rather than a gap filled from elsewhere.
                      </p>
                    ) : (
                      <p className="text-[#d2d6dc]">{step.completedSummary}</p>
                    )}
                  </div>

                  {isExpanded && step.details && (
                    <div className="mt-3 animate-fade-up space-y-1 rounded-lg bg-black/40 p-2.5 font-mono text-[11px] text-[#9aa0a6]">
                      {/* Label states what these lines are: the agent's remit.
                          They are not findings, and must not be dressed as them. */}
                      <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-wider text-[#8ab4f8]">
                        {isConversational ? 'Intent & routing breakdown' : 'What this stage does'}
                      </span>
                      {step.details.map((d, dIdx) => (
                        <div key={dIdx} className="flex items-start gap-1.5 text-slate-300">
                          <span className="text-[#4285f4]">›</span>
                          <span>{d}</span>
                        </div>
                      ))}
                      {step.agentKey && (
                        <p className="pt-1 text-[10px] italic text-[#9aa0a6]">
                          This agent&rsquo;s actual findings appear in the report below, with their sources.
                        </p>
                      )}
                    </div>
                  )}

                  {step.isConversationalStep && onSelectPrompt && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8ab4f8]">
                        <HelpCircle size={12} />
                        <span>Launch research on a company or comparison:</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {[
                          {
                            title: 'Compare TCS vs Infosys',
                            desc: 'Pulls both listings’ multiples and margins side by side'
                          },
                          {
                            title: 'Analyze Tata Motors',
                            desc: 'Solvency, leverage and profitability from filed statements'
                          },
                          {
                            title: 'Why did Reliance move today?',
                            desc: 'Checks the move against recent disclosures and trading volume'
                          },
                          {
                            title: 'Is Infosys reasonably priced?',
                            desc: 'Resolves the trailing multiple and states its basis'
                          }
                        ].map((item, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => onSelectPrompt(item.title)}
                            className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[11.5px] text-slate-200 transition hover:border-[#4285f4]/40 hover:bg-[#4285f4]/15 hover:text-white"
                          >
                            <div>
                              <span className="font-medium text-[#f1f3f4] group-hover:text-[#8ab4f8]">
                                {item.title}
                              </span>
                              <span className="block text-[10.5px] text-[#9aa0a6]">{item.desc}</span>
                            </div>
                            <ArrowRight
                              size={13}
                              className="text-[#9aa0a6] transition group-hover:translate-x-0.5 group-hover:text-[#8ab4f8]"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
