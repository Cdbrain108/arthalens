import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react'

const LABELS = { financial: 'Financial Health', valuation: 'Valuation', market: 'Market & Technicals', news: 'News', growth: 'Growth', risk: 'Adversarial Risk', workforce: 'Workforce & Hiring', industry: 'Industry & Sector', management: 'Management & Governance', document: 'Uploaded Documents', social: 'Public Discussion' }
const STATUS = { completed: 'Evidence collected', partial: 'Partial evidence', unavailable: 'Unavailable', failed: 'Failed', timed_out: 'Timed out', running: 'Working', queued: 'Queued' }

export default function LiveAgentStream({ job, running = false, title = 'Multi-agent pipeline' }) {
  const agents = job?.selected_agents || []
  return <section className="space-y-3 text-left" aria-label={title}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity size={17} />{title}</h3>
    {!agents.length && <p className="text-xs text-[#bdc1c6]">{running ? 'Waiting for the router to select relevant specialists…' : 'No specialist agents were dispatched for this query.'}</p>}
    {agents.map(name => {
      const recorded = job?.steps?.find(step => step.node === `${name}_agent`)
      const status = job?.agent_statuses?.[name] || (job?.failed_agents?.includes(name) ? 'failed' : job?.completed_agents?.includes(name) ? 'completed' : recorded?.state === 'running' ? 'running' : 'queued')
      const details = job?.agent_details?.[name]
      const Icon = status === 'running' ? Loader2 : status === 'queued' ? Clock : status === 'completed' ? CheckCircle2 : AlertTriangle
      return <details key={name} className="rounded-xl border border-white/15 bg-[#181f1b] p-4">
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3"><Icon size={17} className={status === 'running' ? 'animate-spin' : ''} /><span className="flex-1 text-sm">{LABELS[name] || name}</span><span className="text-xs text-[#bdcbbf]">{STATUS[status] || status}</span></summary>
        {details ? <div className="mt-3 text-xs leading-relaxed text-[#bdcbbf]"><p>{details.evidence_count} evidence items collected. Source checks happen after collection.</p><ul className="mt-2 list-disc space-y-2 pl-4">{details.data_gaps?.map((gap, i) => <li key={i}>{gap}</li>)}</ul></div> : <p className="mt-3 text-xs text-[#bdcbbf]">{status === 'running' ? 'Collection is in progress.' : status === 'queued' ? 'Waiting for an execution slot.' : 'Inspect the report for source-linked findings and coverage limits.'}</p>}
      </details>
    })}
  </section>
}
