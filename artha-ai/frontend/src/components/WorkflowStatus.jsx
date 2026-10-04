import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

const PIPELINE = [
  { key: 'analyze_query', label: 'Understanding query' },
  { key: 'create_plan', label: 'Planning' },
]

const AGENT_LABELS = {
  financial: 'Financial Agent', valuation: 'Valuation Agent', market: 'Market Agent',
  news: 'News Agent', growth: 'Growth Agent', risk: 'Risk Agent',
  workforce: 'Workforce Agent', social: 'Social Agent', document: 'Document / RAG Agent',
}

const AGENT_TONES = [
  'text-[#4285f4] bg-[#4285f4]/10', 'text-violet bg-violet/10', 'text-[#34a853] bg-[#34a853]/10',
  'text-amber bg-amber/10', 'text-cyan bg-cyan/10', 'text-rose bg-rose/10',
]

const TAIL = [
  { key: 'validate_evidence', label: 'Validation' },
  { key: 'bull_bear_risk', label: 'Bull / Bear challenge' },
  { key: 'synthesize', label: 'Synthesis' },
  { key: 'build_report', label: 'Report assembly' },
  { key: 'generate_pdf', label: 'PDF generation' },
]

const STATUS_PILL = {
  queued: 'bg-line/60 text-muted',
  running: 'bg-accent/15 text-accent',
  succeeded: 'bg-[#34a853]/15 text-[#34a853]',
  failed: 'bg-rose/15 text-rose',
}

// Renders ONLY JobStatus fields — selected_agents, completed_agents,
// current_node, status — per the framework's honesty rule.
export default function WorkflowStatus({ job, paused = false }) {
  if (!job) return null
  const done = job.completed_agents || []
  const selected = job.selected_agents || []

  const order = [...PIPELINE.map((s) => s.key), ...selected.map((a) => `${a}_agent`), ...TAIL.map((s) => s.key)]

  const nodeState = (key) => {
    if (job.status === 'succeeded') return 'done'
    if (job.current_node === key) return 'running'
    const cur = order.indexOf(job.current_node)
    return cur > order.indexOf(key) && cur !== -1 ? 'done' : 'pending'
  }

  const allRows = [
    ...PIPELINE.map((s) => ({ ...s, group: 'head', state: nodeState(s.key) })),
    ...selected.map((a, i) => ({
      key: a,
      label: AGENT_LABELS[a] || a,
      group: 'agent',
      tone: AGENT_TONES[i % AGENT_TONES.length],
      state: done.includes(a) ? 'done' : job.current_node === `${a}_agent` ? 'running' : 'pending',
    })),
    ...TAIL.map((s) => ({ ...s, group: 'tail', state: nodeState(s.key) })),
  ]

  const completedCount = allRows.filter((r) => r.state === 'done').length
  const progress = job.status === 'succeeded' ? 100 : Math.round((completedCount / allRows.length) * 100)

  const Row = ({ label, state, agent, tone }) => (
    <div className="flex items-center gap-2.5 py-1">
      {state === 'done' && <CheckCircle2 size={16} className="shrink-0 text-[#34a853]" />}
      {state === 'running' && (paused
        ? <Circle size={16} className="shrink-0 text-accent" />
        : <Loader2 size={16} className="pulse-dot shrink-0 animate-spin text-accent" />)}
      {state === 'pending' && <Circle size={16} className="shrink-0 text-line" />}
      {agent && (
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${tone}`}>
          {label.charAt(0)}
        </span>
      )}
      <span
        className={`text-[13px] transition-colors duration-300 ${
          state === 'pending' ? 'text-muted/50' : state === 'running' ? 'font-medium text-primary' : 'text-muted'
        }`}>
        {label}
      </span>
      {state === 'running' && !paused && (
        <span className="shimmer h-1 w-10 rounded-full" aria-hidden />
      )}
    </div>
  )

  return (
    <div className="card card-hover animate-fade-up w-full max-w-3xl rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-primary">
          {paused ? 'Status updates paused' : job.status === 'succeeded' ? 'Research complete' : 'Researching…'}
        </h3>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_PILL[job.status] || STATUS_PILL.queued}`}>
          {job.status === 'running' && !paused && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
          {job.status}
        </span>
      </div>

      {/* Progress bar — real counts only (completed / total pipeline nodes) */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-line/60" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full bg-gradient-to-r from-accent to-violet transition-[width] duration-700 ease-out-expo ${job.status === 'running' && !paused ? 'progress-live' : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        <div>
          {allRows.filter((r) => r.group !== 'tail').map((r) => (
            <Row key={r.key} label={r.label} state={r.state} agent={r.group === 'agent'} tone={r.tone} />
          ))}
        </div>
        <div>
          {allRows.filter((r) => r.group === 'tail').map((r) => (
            <Row key={r.key} label={r.label} state={r.state} />
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-muted">
          Planner routed {selected.length} specialist{selected.length > 1 ? 's' : ''} for this question:
          <span className="font-medium text-accent"> {selected.join(' · ')}</span>
        </p>
      )}
    </div>
  )
}
