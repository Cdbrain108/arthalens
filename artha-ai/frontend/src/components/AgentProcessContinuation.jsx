import { useState } from 'react'
import {
  TrendingUp,
  BarChart3,
  PieChart,
  Sparkles,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Terminal,
  Clock,
  Layers,
  Users,
  Globe,
  FileSearch,
  XCircle
} from 'lucide-react'

/* ---------------------------------------------------------------------------
 * Stepwise view of the specialist pipeline.
 *
 * This component runs while the job is in flight, so no findings exist yet and
 * none are streamed to the client. It therefore shows two things only: the
 * brief each specialist is given (fixed and knowable) and its real status from
 * `job.selected_agents` / `completed_agents` / `failed_agents`. It does not
 * show results — those appear in the report below, with their sources attached.
 * ------------------------------------------------------------------------- */

const AGENT_CATALOGUE = {
  financial: {
    name: 'Financial Health & Quality Agent',
    icon: TrendingUp,
    badge: 'Validated filings',
    brief:
      'Extract reported operating margin, return on equity, net profit margin and debt / equity from validated filings. Benchmark each measured ratio against the stored sector reference. Report any ratio that cannot be sourced as an evidence gap.'
  },
  valuation: {
    name: 'Valuation & Multiples Agent',
    icon: PieChart,
    badge: 'Evidence-gated',
    brief:
      'Resolve trailing P/E and related multiples from a live quote and a sourced earnings figure. Where either input is missing, disclose the multiple as an evidence gap rather than substituting a peer or historical value.'
  },
  market: {
    name: 'Market Dynamics & Technical Snapshot Agent',
    icon: BarChart3,
    badge: 'Live quote',
    brief:
      'Fetch the last traded price and trading volume on the primary exchange, evaluating price action and volatility posture.'
  },
  growth: {
    name: 'Strategic Growth & Pipeline Agent',
    icon: Sparkles,
    badge: 'Disclosed activity',
    brief:
      'Audit disclosed capital expenditure, capacity expansion and announced contracts. Each item must carry a retrievable source; management forward-looking language is typed as interpretation, not fact.'
  },
  news: {
    name: 'Corporate News & Governance Agent',
    icon: FileCheck,
    badge: 'Statutory disclosures',
    brief:
      'Scan statutory exchange disclosures, results releases, board resolutions and regulatory notices. Every claim must be dated; undated items fail the recency check.'
  },
  risk: {
    name: 'Adversarial Risk & Downside Agent',
    icon: AlertTriangle,
    badge: 'Downside stress',
    brief:
      'Stress the downside: customer and geographic concentration, leverage, macro sensitivity and contingent liabilities. Findings feed the adversarial bear case.'
  },
  workforce: {
    name: 'Workforce & Operational Posture Agent',
    icon: Users,
    badge: 'Disclosed headcount',
    brief:
      'Read disclosed headcount, attrition and open-role volume. Job-board counts are labelled as provider data rather than filings.'
  },
  social: {
    name: 'Public Sentiment Scan',
    icon: Globe,
    badge: 'Interpretation only',
    brief:
      'Sample public discussion for recurring themes. Everything returned is typed as interpretation and cannot contribute to the quality score.'
  },
  document: {
    name: 'Uploaded Document Analyst',
    icon: FileSearch,
    badge: 'Page-level citations',
    brief:
      'Answer from the uploaded document only, attaching a document ID and page reference to every claim.'
  }
}

export default function AgentProcessContinuation({ job, query, running, isDone }) {
  const [expandedSteps, setExpandedSteps] = useState({})
  const [collapseAll, setCollapseAll] = useState(false)

  const activeQuery = job?.query || query || ''
  const selectedAgents = job?.selected_agents || []
  const completedAgents = job?.completed_agents || []
  const failedAgents = job?.failed_agents || []

  // The pipeline shows exactly the agents that were routed — not a fixed six.
  const agents = selectedAgents
    .filter((key) => AGENT_CATALOGUE[key])
    .map((key, idx) => ({
      key,
      stepNum: String(idx + 1).padStart(2, '0'),
      ...AGENT_CATALOGUE[key]
    }))

  const settledCount = selectedAgents.filter(
    (k) => completedAgents.includes(k) || failedAgents.includes(k)
  ).length

  const toggleStep = (key) => {
    setExpandedSteps((prev) => ({ ...prev, [key]: prev[key] === false }))
  }

  const toggleAll = () => {
    const next = !collapseAll
    setCollapseAll(next)
    const updated = {}
    agents.forEach((a) => { updated[a.key] = !next })
    setExpandedSteps(updated)
  }

  if (agents.length === 0) {
    return (
      <div className="w-full animate-fade-up rounded-xl border border-white/10 bg-[#181a1f] p-4 text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#4285f4]/15 text-[#8ab4f8]">
            <Layers size={14} />
          </span>
          <h3 className="font-sans text-[13px] font-semibold text-[#f1f3f4]">Specialist pipeline</h3>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#9aa0a6]">
          {running
            ? 'Waiting for the router to select the specialist agents this query requires...'
            : 'No specialist agents were dispatched for this query.'}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full animate-fade-up space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#4285f4]/15 text-[#8ab4f8]">
            <Layers size={14} />
          </span>
          <div>
            <h3 className="font-sans text-[13px] font-semibold text-[#f1f3f4]">
              Specialist Execution Stream
            </h3>
            <p className="text-[11px] text-[#9aa0a6]">
              The brief each specialist was given, and its live status. Findings appear in the report below.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1.5 font-mono text-[11px] text-[#8ab4f8] hover:underline"
        >
          <span>{collapseAll ? 'Expand all briefs' : 'Collapse all briefs'}</span>
          {collapseAll ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      <div className="relative ml-3 space-y-5 border-l-2 border-[#4285f4]/25 pl-6 sm:ml-4 sm:pl-8">
        {agents.map((agent) => {
          const Icon = agent.icon
          const hasFailed = failedAgents.includes(agent.key)
          const isCompleted = !hasFailed && completedAgents.includes(agent.key)
          const isCurrent = !hasFailed && !isCompleted && running
          const isOpen = expandedSteps[agent.key] !== false

          return (
            <div key={agent.key} className="group relative animate-fade-up">
              <div
                className={`absolute -left-[31px] top-3.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300 sm:-left-[39px] ${
                  hasFailed
                    ? 'border-rose-500 bg-[#181a1f] text-rose-400'
                    : isCompleted
                    ? 'border-[#34a853] bg-[#181a1f] text-[#34a853]'
                    : isCurrent
                    ? 'border-[#4285f4] bg-[#181a1f] text-[#4285f4] shadow-lg shadow-[#4285f4]/30'
                    : 'border-white/20 bg-[#131518] text-[#5f6368]'
                }`}
              >
                {hasFailed ? (
                  <XCircle size={13} />
                ) : isCompleted ? (
                  <CheckCircle2 size={13} />
                ) : isCurrent ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Circle size={10} />
                )}
              </div>

              <div
                className={`overflow-hidden rounded-xl border transition-all duration-300 ${
                  hasFailed
                    ? 'border-rose-500/30 bg-rose-500/[0.04]'
                    : isCompleted
                    ? 'border-white/10 bg-[#181a1f]'
                    : isCurrent
                    ? 'border-[#4285f4]/60 bg-[#1a1e27] shadow-xl shadow-[#4285f4]/10 ring-1 ring-[#4285f4]/30'
                    : 'border-white/5 bg-[#131518]/70 opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleStep(agent.key)}
                  className="flex w-full items-center justify-between p-3 text-left transition hover:bg-white/[0.02] sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        hasFailed
                          ? 'bg-rose-500/15 text-rose-400'
                          : isCompleted
                          ? 'bg-[#34a853]/15 text-[#34a853]'
                          : isCurrent
                          ? 'bg-[#4285f4]/20 text-[#4285f4]'
                          : 'bg-white/5 text-[#9aa0a6]'
                      }`}
                    >
                      <Icon size={15} />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-[#9aa0a6]">Step {agent.stepNum}</span>
                        <h4 className="truncate font-sans text-[13.5px] font-semibold text-[#f1f3f4]">
                          {agent.name}
                        </h4>
                        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-[#9aa0a6]">
                          {agent.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ml-2 flex shrink-0 items-center gap-2.5">
                    <span
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] ${
                        hasFailed
                          ? 'bg-rose-500/15 text-rose-300'
                          : isCompleted
                          ? 'bg-[#34a853]/15 text-[#34a853]'
                          : isCurrent
                          ? 'animate-pulse bg-[#4285f4]/20 text-[#8ab4f8]'
                          : 'bg-white/5 text-[#9aa0a6]'
                      }`}
                    >
                      {hasFailed ? (
                        <>
                          <XCircle size={11} />
                          <span>Failed</span>
                        </>
                      ) : isCompleted ? (
                        <>
                          <CheckCircle2 size={11} />
                          {/* "Reported", not "Verified" — the validator decides
                              what is verified, and it runs after this stage. */}
                          <span>Reported</span>
                        </>
                      ) : isCurrent ? (
                        <>
                          <Loader2 size={11} className="animate-spin text-[#8ab4f8]" />
                          <span>Running...</span>
                        </>
                      ) : (
                        <span>Queued</span>
                      )}
                    </span>

                    <span className="text-[#9aa0a6]">
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-3.5 border-t border-white/5 bg-[#131518] p-4">
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-[#8ab4f8]">
                        <Terminal size={12} />
                        <span className="font-semibold">Specialist brief</span>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-[#181a1f] p-3 font-mono text-[12px] leading-relaxed text-[#bdc1c6]">
                        {agent.brief}
                        {activeQuery && (
                          <span className="mt-2 block text-[#9aa0a6]">
                            Target query: &ldquo;{activeQuery}&rdquo;
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-wider text-[#9aa0a6]">
                        <span className="font-semibold">Status</span>
                      </div>

                      <div
                        className={`rounded-lg border p-3 font-mono text-[12px] leading-relaxed ${
                          hasFailed
                            ? 'border-rose-500/30 bg-[#181a1f] text-rose-300'
                            : isCompleted
                            ? 'border-[#34a853]/30 bg-[#181a1f] text-[#d2d6dc]'
                            : isCurrent
                            ? 'animate-pulse border-[#4285f4]/40 bg-[#181a1f] text-[#8ab4f8]'
                            : 'border-white/5 bg-[#181a1f] text-[#9aa0a6]'
                        }`}
                      >
                        {hasFailed ? (
                          'This specialist did not complete. It contributed no evidence, so its section of the report is an evidence gap.'
                        ) : isCompleted ? (
                          'Returned its claims to the validator. Those that carry a source, a date and an excerpt appear in the report below; the rest are disclosed as evidence gaps.'
                        ) : isCurrent ? (
                          <span className="flex items-center gap-2">
                            <Loader2 size={13} className="animate-spin text-[#4285f4]" />
                            <span>Gathering evidence...</span>
                          </span>
                        ) : (
                          <span>Queued.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        <div className="relative animate-fade-up pt-1">
          <div
            className={`absolute -left-[31px] top-3.5 flex h-6 w-6 items-center justify-center rounded-full border-2 sm:-left-[39px] ${
              isDone
                ? 'border-[#34a853] bg-[#34a853] text-white'
                : 'border-white/20 bg-[#131518] text-[#9aa0a6]'
            }`}
          >
            {isDone ? <CheckCircle2 size={13} /> : <Clock size={11} />}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#181a1f] p-3 text-left sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-sans text-[12px] font-semibold text-[#f1f3f4]">
                {isDone
                  ? `Pipeline complete — ${completedAgents.length} of ${agents.length} ${agents.length === 1 ? 'specialist' : 'specialists'} reported`
                  : 'Pipeline in progress'}
              </span>
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10.5px] ${
                  isDone ? 'bg-[#34a853]/20 text-[#34a853]' : 'bg-[#4285f4]/20 text-[#8ab4f8]'
                }`}
              >
                {settledCount} of {agents.length} settled
                {failedAgents.length > 0 ? ` · ${failedAgents.length} failed` : ''}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#9aa0a6]">
              {isDone
                ? 'Validated claims were merged into the report below. The grounding percentage and evidence gaps are shown there.'
                : 'Claims are passed through the deterministic validator before any of them reach the report.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
