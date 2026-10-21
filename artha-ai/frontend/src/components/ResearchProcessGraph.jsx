import { useEffect, useRef } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Circle,
  Download,
  FileSearch,
  FileText,
  Globe,
  Layers,
  ListChecks,
  Loader2,
  Newspaper,
  PieChart,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingUp,
  Users,
} from 'lucide-react'

const PIPELINE_STAGES = [
  { id: 'analyze_query', label: 'Understand query', detail: 'Resolve securities and intent', icon: Search },
  { id: 'create_plan', label: 'Plan research', detail: 'Choose the required specialists', icon: ListChecks },
  { id: 'collect_results', label: 'Collect specialist results', detail: 'Wait for all dispatched tracks', icon: Layers },
  { id: 'validate_evidence', label: 'Validate evidence', detail: 'Check sources, dates and claims', icon: ShieldCheck },
  { id: 'challenge_thesis', label: 'Challenge the thesis', detail: 'Stress-test upside and downside', icon: Swords },
  { id: 'synthesize_report', label: 'Synthesize findings', detail: 'Combine validated evidence', icon: Sparkles },
  { id: 'build_report', label: 'Assemble report', detail: 'Format the research brief', icon: FileText },
  { id: 'generate_pdf', label: 'Generate PDF', detail: 'Prepare the downloadable report', icon: Download },
]

const AGENT_META = {
  financial: { label: 'Financial health', icon: BarChart3, tone: 'blue' },
  valuation: { label: 'Valuation', icon: PieChart, tone: 'amber' },
  market: { label: 'Market momentum', icon: TrendingUp, tone: 'green' },
  growth: { label: 'Growth', icon: Layers, tone: 'purple' },
  news: { label: 'News & filings', icon: Newspaper, tone: 'rose' },
  risk: { label: 'Risk', icon: AlertTriangle, tone: 'orange' },
  workforce: { label: 'Workforce', icon: Users, tone: 'cyan' },
  social: { label: 'Public sentiment', icon: Globe, tone: 'sky' },
  document: { label: 'Uploaded document', icon: FileSearch, tone: 'indigo' },
  industry: { label: 'Industry & sector', icon: Globe, tone: 'green' },
  management: { label: 'Management & governance', icon: Users, tone: 'green' },
}

const ORDER = [
  'analyze_query',
  'create_plan',
  'apply_routing_policy',
  'collect_results',
  'validate_evidence',
  'challenge_thesis',
  'synthesize_report',
  'build_report',
  'generate_pdf',
]

function stateIcon(state) {
  if (state === 'done') return <CheckCircle2 size={14} />
  if (state === 'running') return <Loader2 size={14} className="animate-spin" />
  if (['failed', 'partial', 'unavailable', 'timed_out'].includes(state)) return <AlertTriangle size={14} />
  return <Circle size={10} />
}

function stateLabel(state) {
  if (state === 'done') return 'Complete'
  if (state === 'running') return 'Working'
  if (state === 'failed') return 'Failed'
  if (state === 'partial') return 'Partial evidence'
  if (state === 'unavailable') return 'Unavailable'
  if (state === 'timed_out') return 'Timed out'
  return 'Queued'
}

export default function ResearchProcessGraph({ job, running = false, isDone = false }) {
  const containerRef = useRef(null)
  const currentNode = job?.current_node || ''
  const steps = job?.steps || []
  const selectedAgents = job?.selected_agents || []
  const completedAgents = job?.completed_agents || []
  const failedAgents = job?.failed_agents || []
  const currentIndex = ORDER.indexOf(currentNode)

  const scrollToActive = () => {
    if (!containerRef.current) return
    const activeEl =
      containerRef.current.querySelector('.process-node-running') ||
      containerRef.current.querySelector('.process-agent-running') ||
      (currentNode ? containerRef.current.querySelector(`[data-node-id="${currentNode}"]`) : null)

    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    }
  }

  // Auto-scroll screen whenever active action or node changes during live research
  useEffect(() => {
    if (!running && !currentNode) return
    const timer = setTimeout(() => {
      scrollToActive()
    }, 60)
    return () => clearTimeout(timer)
  }, [currentNode, job?.steps, job?.agent_statuses, running])

  const stepState = (id) => {
    const recorded = steps.find((step) => step.node === id)
    if (recorded?.state === 'failed') return 'failed'
    if (job?.status === 'failed' && currentNode === id) return 'failed'
    if (recorded?.state === 'done') return 'done'
    if (recorded?.state === 'running') return 'running'
    if (isDone || currentNode === 'done') return 'done'
    if (currentNode === id) return 'running'
    const nodeIndex = ORDER.indexOf(id)
    if (currentIndex >= 0 && nodeIndex >= 0 && currentIndex > nodeIndex) return 'done'
    return 'pending'
  }

  const agentState = (agent) => {
    const actual = job?.agent_statuses?.[agent]
    if (actual) return actual === 'completed' ? 'done' : actual
    const id = `${agent}_agent`
    const recorded = steps.find((step) => step.node === id)
    if (recorded?.state === 'failed' || failedAgents.includes(agent)) return 'failed'
    if (recorded?.state === 'done' || completedAgents.includes(agent)) return 'done'
    if (recorded?.state === 'running' || currentNode === id) return 'running'
    return 'pending'
  }

  const allAgentStates = selectedAgents.map(agentState)
  const completedStageCount = PIPELINE_STAGES.filter((stage) => stepState(stage.id) === 'done').length
  const completedAgentCount = allAgentStates.filter((state) => ['done', 'partial', 'unavailable', 'failed', 'timed_out'].includes(state)).length
  const totalUnits = PIPELINE_STAGES.length + selectedAgents.length
  const completedUnits = completedStageCount + completedAgentCount
  const progress = totalUnits ? Math.min(100, Math.round((completedUnits / totalUnits) * 100)) : 0
  const activeStage = PIPELINE_STAGES.find((stage) => stepState(stage.id) === 'running')
  const activeAgent = selectedAgents.find((agent) => agentState(agent) === 'running')
  const activeLabel = activeAgent
    ? AGENT_META[activeAgent]?.label || activeAgent
    : activeStage?.label || (running ? 'Preparing research' : 'Research ready')

  const renderNode = (stage) => {
    const state = stepState(stage.id)
    const Icon = stage.icon
    const isRunning = state === 'running'
    return (
      <div
        key={stage.id}
        data-node-id={stage.id}
        data-state={state}
        className={`process-node process-node-${state}`}
      >
        <div className="process-node-icon">{stateIcon(state)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="process-node-label">{stage.label}</span>
              {isRunning && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#4285f4]/20 border border-[#4285f4]/40 px-1.5 py-0.5 text-[9px] font-mono text-[#8ab4f8] animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4]" />
                  ACTIVE
                </span>
              )}
            </div>
            <span className="process-node-status">{stateLabel(state)}</span>
          </div>
          <div className="process-node-detail">
            <Icon size={12} />
            <span>{stage.detail}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="research-process-graph animate-fade-up" aria-live="polite">
      <div className="research-process-header">
        <div>
          <div className="research-process-kicker">
            <span className={running ? 'process-live-dot' : 'process-ready-dot'} />
            <span>Live research pipeline</span>
            {running && (
              <button
                type="button"
                onClick={scrollToActive}
                className="ml-2 inline-flex items-center gap-1 rounded-md bg-[#4285f4]/20 hover:bg-[#4285f4]/35 border border-[#4285f4]/35 px-2 py-0.5 text-[10.5px] font-medium text-[#8ab4f8] transition cursor-pointer"
                title="Move screen to whichever action is running live"
              >
                <span>Jump to live action</span>
                <span className="text-[10px]">↓</span>
              </button>
            )}
          </div>
          <h2>Evidence moving through the workspace</h2>
          <p>{running ? `${activeLabel} is active now.` : isDone ? 'Every stage has settled.' : 'The pipeline is ready for a research question.'}</p>
        </div>
        <div className="research-process-count">
          <strong>{isDone ? 100 : progress}%</strong>
          <span>{completedUnits} / {totalUnits || PIPELINE_STAGES.length} steps</span>
        </div>
      </div>

      <div className="research-process-progress" role="progressbar" aria-label="Research steps settled" aria-valuenow={isDone ? 100 : progress} aria-valuemin="0" aria-valuemax="100">
        <span style={{ width: `${isDone ? 100 : progress}%` }} />
      </div>

      <div className="process-flow" aria-label="Research execution flow">
        {renderNode(PIPELINE_STAGES[0])}
        <div className={`process-connector ${stepState('create_plan') !== 'pending' ? 'is-live' : ''}`} />
        {renderNode(PIPELINE_STAGES[1])}

        <div className="process-branch-label">
          <span>Parallel specialist review</span>
          <span>{selectedAgents.length ? `${completedAgentCount}/${selectedAgents.length} settled` : 'Waiting for routing'}</span>
        </div>
        <div className="process-branch">
          <div className="process-branch-rail" aria-hidden="true" />
          {selectedAgents.length ? selectedAgents.map((agent) => {
            const meta = AGENT_META[agent] || { label: agent, icon: FileSearch, tone: 'blue' }
            const Icon = meta.icon
            const state = agentState(agent)
            return (
              <div
                key={agent}
                data-node-id={`${agent}_agent`}
                data-agent-id={agent}
                data-state={state}
                className={`process-agent process-agent-${state} process-agent-${meta.tone}`}
              >
                <div className="process-agent-icon">{stateIcon(state)}</div>
                <Icon size={13} />
                <span className="flex-1 min-w-0 truncate">{meta.label}</span>
                {state === 'running' && (
                  <span className="inline-flex items-center gap-1 rounded bg-[#4285f4]/25 px-1.5 py-0.5 text-[8.5px] font-mono text-[#8ab4f8] animate-pulse">
                    ACTIVE
                  </span>
                )}
                <span className="process-agent-status">{stateLabel(state)}</span>
              </div>
            )
          }) : (
            <div className="process-agent process-agent-pending process-agent-empty">
              <Circle size={10} />
              <span>Specialists appear after planning</span>
            </div>
          )}
        </div>

        <div className={`process-connector ${completedAgentCount > 0 || stepState('collect_results') !== 'pending' ? 'is-live' : ''}`} />
        {PIPELINE_STAGES.slice(2).map((stage, index) => (
          <div key={stage.id}>
            {renderNode(stage)}
            {index < PIPELINE_STAGES.slice(2).length - 1 && (
              <div className={`process-connector ${stepState(PIPELINE_STAGES[index + 3].id) !== 'pending' ? 'is-live' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {job?.errors?.length > 0 && (
        <div className="process-error-note">
          <AlertTriangle size={14} />
          <span>{job.errors.length} pipeline issue{job.errors.length === 1 ? '' : 's'} reported. The affected step is marked above.</span>
        </div>
      )}
    </div>
  )
}
