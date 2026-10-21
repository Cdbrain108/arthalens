import { useEffect, useRef } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react'

const LABELS = { financial: 'Financial Health', valuation: 'Valuation', market: 'Market & Technicals', news: 'News', growth: 'Growth', risk: 'Adversarial Risk', workforce: 'Workforce & Hiring', industry: 'Industry & Sector', management: 'Management & Governance', document: 'Uploaded Documents', social: 'Public Discussion' }
const STATUS = { completed: 'Evidence collected', partial: 'Partial evidence', unavailable: 'Unavailable', failed: 'Failed', timed_out: 'Timed out', running: 'Working', queued: 'Queued' }

export default function LiveAgentStream({ job, running = false, title = 'Multi-agent pipeline' }) {
  const agents = job?.selected_agents || []
  const containerRef = useRef(null)

  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => {
      const activeEl = containerRef.current?.querySelector('.live-agent-running')
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 60)
    return () => clearTimeout(timer)
  }, [job?.agent_statuses, job?.current_node, job?.steps, running])

  return (
    <section ref={containerRef} className="space-y-3 text-left" aria-label={title}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity size={17} />{title}</h3>
        {running && (
          <span className="inline-flex items-center gap-1 rounded bg-[#4285f4]/15 px-2 py-0.5 text-[10px] font-mono text-[#8ab4f8]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4] animate-pulse" />
            Live Stream
          </span>
        )}
      </div>
      {!agents.length && <p className="text-xs text-[#bdc1c6]">{running ? 'Waiting for the router to select relevant specialists…' : 'No specialist agents were dispatched for this query.'}</p>}
      {agents.map(name => {
        const recorded = job?.steps?.find(step => step.node === `${name}_agent`)
        const status = job?.agent_statuses?.[name] || (job?.failed_agents?.includes(name) ? 'failed' : job?.completed_agents?.includes(name) ? 'completed' : recorded?.state === 'running' ? 'running' : 'queued')
        const isRunning = status === 'running'
        const details = job?.agent_details?.[name]
        const Icon = isRunning ? Loader2 : status === 'queued' ? Clock : status === 'completed' ? CheckCircle2 : AlertTriangle
        return (
          <details
            key={name}
            data-agent={name}
            data-status={status}
            className={`rounded-xl border transition-all duration-300 p-4 ${
              isRunning
                ? 'border-[#4285f4]/70 bg-[#172338] shadow-[0_0_20px_rgba(66,133,244,0.18)] live-agent-running'
                : 'border-white/15 bg-[#181f1b]'
            }`}
            style={isRunning ? { scrollMargin: '60px' } : undefined}
          >
            <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3">
              <Icon size={17} className={isRunning ? 'animate-spin text-[#8ab4f8]' : ''} />
              <span className={`flex-1 text-sm ${isRunning ? 'text-white font-semibold' : ''}`}>{LABELS[name] || name}</span>
              {isRunning && (
                <span className="inline-flex items-center gap-1 rounded bg-[#4285f4]/25 px-1.5 py-0.5 text-[8.5px] font-mono text-[#8ab4f8] animate-pulse">
                  ACTIVE
                </span>
              )}
              <span className={`text-xs ${isRunning ? 'text-[#8ab4f8] font-mono font-medium' : 'text-[#bdcbbf]'}`}>{STATUS[status] || status}</span>
            </summary>
            {details ? (
              <div className="mt-3 text-xs leading-relaxed text-[#bdcbbf]">
                <p>{details.evidence_count} evidence items collected. Source checks happen after collection.</p>
                <ul className="mt-2 list-disc space-y-2 pl-4">{details.data_gaps?.map((gap, i) => <li key={i}>{gap}</li>)}</ul>
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#bdcbbf]">
                {isRunning ? 'Collection is in progress.' : status === 'queued' ? 'Waiting for an execution slot.' : 'Inspect the report for source-linked findings and coverage limits.'}
              </p>
            )}
          </details>
        )
      })}
    </section>
  )
}
