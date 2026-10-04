import { useState, useEffect, useRef } from 'react'
import { Brain, ChevronDown, ChevronUp, Sparkles, CheckCircle2, Clock } from 'lucide-react'

/* ---------------------------------------------------------------------------
 * The reasoning trace shown here is assembled from the job's own routing data:
 * the query, the securities the router resolved, and the agents it selected.
 * It describes the policy the pipeline applies; it never states what a
 * specialist found, because findings are not available at this point in the run
 * and inventing them would put words in the pipeline's mouth.
 * ------------------------------------------------------------------------- */

const AGENT_REMIT = {
  financial: 'Financial Health — reported margins, return on equity and leverage from validated filings',
  valuation: 'Valuation — trailing multiples, reported only when a live quote and sourced earnings both resolve',
  market: 'Market Dynamics — live quote, trading volume, and market price action',
  growth: 'Strategic Growth — disclosed capital expenditure and contract announcements',
  news: 'Corporate News — dated exchange filings and regulatory disclosures',
  risk: 'Adversarial Risk — concentration, leverage and regulatory exposure',
  workforce: 'Workforce — disclosed headcount, attrition and hiring activity',
  social: 'Public Sentiment — recorded as interpretation, never as fact',
  document: 'Uploaded Document — answered with page-level citations from your file'
}

export default function QueryReasoningAccordion({ query, job, isRunning, isDone }) {
  const [isOpen, setIsOpen] = useState(true)
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(true)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef(null)
  const finalSeconds = useRef(null)

  const activeQuery = query || ''
  const entities = job?.entities || []
  const selectedAgents = job?.selected_agents || []

  const reasoningLines = [
    activeQuery ? `Analyzing query intent: "${activeQuery}"` : 'Awaiting a query.',
    'Resolving target securities and their listing venues...'
  ]

  if (entities.length > 0) {
    reasoningLines.push(
      `Resolved ${entities.length} ${entities.length === 1 ? 'security' : 'securities'}:`
    )
    entities.forEach((e, i) => {
      const branch = i === entities.length - 1 ? '  └─' : '  ├─'
      const venue = e.exchange ? ` · ${e.exchange}` : ' · listing not resolved'
      reasoningLines.push(`${branch} ${e.name || 'Unnamed'}${e.ticker ? ` (${e.ticker})` : ''}${venue}`)
    })
  } else if (isDone || selectedAgents.length > 0) {
    reasoningLines.push('No public security was resolved from this query.')
  }

  if (selectedAgents.length > 0) {
    reasoningLines.push('')
    reasoningLines.push(
      `Routing to ${selectedAgents.length} specialist ${selectedAgents.length === 1 ? 'agent' : 'agents'} — only those this query requires:`
    )
    selectedAgents.forEach((key, i) => {
      const branch = i === selectedAgents.length - 1 ? '  └─' : '  ├─'
      reasoningLines.push(`${branch} ${AGENT_REMIT[key] || key}`)
    })
  } else if (isDone) {
    reasoningLines.push('')
    reasoningLines.push('No specialist agents were dispatched for this query.')
  }

  reasoningLines.push('')
  reasoningLines.push('Evidence policy: every claim must carry a retrievable source, a date and an excerpt.')
  reasoningLines.push('Claims that fail validation are dropped and disclosed as evidence gaps, not estimated.')

  const fullText = reasoningLines.join('\n')

  useEffect(() => {
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.round((Date.now() - start) / 1000)))
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    let index = 0
    setIsTyping(true)
    setDisplayedText('')

    const interval = setInterval(() => {
      index += 3
      if (index >= fullText.length) {
        setDisplayedText(fullText)
        setIsTyping(false)
        clearInterval(interval)
      } else {
        setDisplayedText(fullText.slice(0, index))
      }
    }, 18)

    return () => clearInterval(interval)
  }, [fullText])

  // Freeze the elapsed reading when the run finishes. The displayed number is
  // the real elapsed time — it used to be capped at 4s regardless.
  useEffect(() => {
    if (isDone && finalSeconds.current === null) {
      finalSeconds.current = elapsedSeconds
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isDone, elapsedSeconds])

  const shownSeconds = finalSeconds.current ?? elapsedSeconds

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#4285f4]/30 bg-[#181a1f] shadow-2xl transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4285f4]/20 text-[#8ab4f8]">
            <Brain size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-sans text-[13px] font-semibold text-[#f1f3f4]">
                Query Understanding Agent
              </span>
              {isTyping || isRunning ? (
                <span className="flex animate-pulse items-center gap-1 rounded-full bg-[#4285f4]/20 px-2 py-0.5 font-mono text-[10px] text-[#8ab4f8]">
                  <Sparkles size={10} className="animate-spin text-[#8ab4f8]" />
                  <span>Routing...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-[#34a853]/15 px-2 py-0.5 font-mono text-[10px] text-[#34a853]">
                  <CheckCircle2 size={11} />
                  <span>Intent structured</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-mono text-[11px] text-[#9aa0a6]">
            <Clock size={12} />
            <span>{isDone ? `Ran for ${shownSeconds}s` : `${shownSeconds}s elapsed`}</span>
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 p-1 text-[#9aa0a6] hover:text-[#f1f3f4]">
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-[#4285f4]/20 bg-[#131518] p-4 font-mono text-[12px] leading-relaxed text-[#c4c7c5]">
          <div className="mb-2.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-[#8ab4f8]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#4285f4]" />
              <span>Routing &amp; intent trace</span>
            </span>
            <span className="text-[10px] text-[#9aa0a6]">Derived from this run</span>
          </div>

          <pre className="scroll-slim max-h-[260px] overflow-y-auto whitespace-pre-wrap pl-1 font-mono text-[12px] text-[#e3e3e3]">
            {displayedText}
            {isTyping && (
              <span className="ml-0.5 inline-block h-3.5 w-2 animate-pulse bg-[#4285f4] align-middle" />
            )}
          </pre>

          {!isTyping && (
            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5 text-[11px] text-[#9aa0a6]">
              <span className="flex items-center gap-1 text-[#34a853]">
                <CheckCircle2 size={12} />
                <span>
                  {selectedAgents.length > 0
                    ? `${selectedAgents.length} specialist ${selectedAgents.length === 1 ? 'agent' : 'agents'} dispatched`
                    : 'No specialist agents dispatched'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-1 font-mono text-[10.5px] text-[#8ab4f8] hover:underline"
              >
                <span>Collapse reasoning</span>
                <ChevronUp size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
