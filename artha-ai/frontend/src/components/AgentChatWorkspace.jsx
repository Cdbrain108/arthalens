import { useState, useEffect } from 'react'
import {
  Brain,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Loader2,
  TrendingUp,
  BarChart3,
  PieChart,
  FileCheck,
  AlertTriangle,
  ArrowLeft,
  Download,
  ExternalLink,
  ShieldCheck,
  FileText
} from 'lucide-react'
import ReportPreview from './ReportPreview'

const AGENT_META = [
  { key: 'financial', name: 'Financial Health & Quality', icon: TrendingUp, role: 'Audited filings, ROE, operating margins, cash buffer' },
  { key: 'market', name: 'Market Dynamics & Technicals', icon: BarChart3, role: 'Live NSE quote, trading volume, and market price posture' },
  { key: 'valuation', name: 'Valuation & Multiples', icon: PieChart, role: 'Trailing P/E, EV/EBITDA, peer benchmarking, multiple compression' },
  { key: 'growth', name: 'Strategic Growth & Projects', icon: Sparkles, role: 'Infrastructure expansion, delivery center scaling, AI partnerships' },
  { key: 'news', name: 'Corporate News & Deal Flow', icon: FileCheck, role: 'Q4 financial results, tax notices, major client contract signings' },
  { key: 'risk', name: 'Adversarial Risk & Challenge', icon: AlertTriangle, role: 'Downside vulnerabilities, client concentration, regulatory liabilities' },
]

export default function AgentChatWorkspace({ job, query, onNewResearch, running, paused, onPauseResume }) {
  const [showAnalyzerThinking, setShowAnalyzerThinking] = useState(true)
  const [typingIndex, setTypingIndex] = useState(0)

  const activeQuery = job?.query || query || 'Investment Research Query'
  const isDone = job?.status === 'succeeded'
  const completedAgents = job?.completed_agents || []
  const failedAgents = job?.failed_agents || []

  // Typing animation for Analyzer Agent thought process
  const analyzerThoughts = [
    `Analyzing query intent: "${activeQuery}"`,
    `Identified target entity and exchange routing guardrail: NSE primary`,
    `Formulated 6-stage adversarial investigation hypothesis`,
    `Dispatched specialist agent crews: Financial, Valuation, Market, Growth, News, Risk`,
  ]

  useEffect(() => {
    if (typingIndex < analyzerThoughts.length) {
      const timer = setTimeout(() => {
        setTypingIndex(prev => prev + 1)
      }, 700)
      return () => clearTimeout(timer)
    }
  }, [typingIndex, analyzerThoughts.length])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 animate-fade-up">
      {/* Top Breadcrumb & Return Action */}
      <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
        <button
          onClick={onNewResearch}
          className="flex items-center gap-2 text-[12px] font-mono text-muted transition hover:text-white"
        >
          <ArrowLeft size={15} />
          <span>Back to research prompt</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="flex h-2 w-2 rounded-full bg-[#4285f4] animate-pulse" />
          <span className="text-slate-300">
            {isDone ? 'RESEARCH ASSEMBLED' : running ? 'MULTI-AGENT PIPELINE ACTIVE' : 'SYSTEM IDLE'}
          </span>
        </div>
      </div>

      {/* User Query Bubble */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-lg">
        <span className="block text-[11px] font-mono uppercase tracking-wider text-muted">You Asked</span>
        <h2 className="mt-1 text-xl font-medium text-white sm:text-2xl font-sans">
          &ldquo;{activeQuery}&rdquo;
        </h2>
      </div>

      {/* 1. First Query Agent: Analyzer & Planner */}
      <div className="mb-6 rounded-2xl border border-[#4285f4]/30 bg-[#181a1f] p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4285f4]/20 text-[#8ab4f8]">
              <Brain size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold text-white">Analyzer & Planning Agent</h3>
                <span className="rounded-md bg-[#4285f4]/20 px-2 py-0.5 text-[10px] font-mono text-[#8ab4f8]">
                  Query Understanding
                </span>
              </div>
              <p className="text-[12px] text-muted">Dissected user query intent, resolved entity symbols, and initialized parallel specialist crews.</p>
            </div>
          </div>

          <button
            onClick={() => setShowAnalyzerThinking(!showAnalyzerThinking)}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-mono text-slate-300 transition hover:bg-white/10"
          >
            <span>{showAnalyzerThinking ? 'Hide thinking' : 'Show thinking'}</span>
            {showAnalyzerThinking ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {/* Animated Thinking Stream */}
        {showAnalyzerThinking && (
          <div className="mt-4 rounded-xl border border-[#4285f4]/20 bg-[#131518] p-3.5 font-mono text-[12px] leading-relaxed text-[#bdc1c6]">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#8ab4f8]">
              <Sparkles size={13} className="animate-spin text-[#8ab4f8]" />
              <span>Query Agent Thought Process</span>
            </div>
            <ul className="space-y-1.5 pl-2">
              {analyzerThoughts.slice(0, typingIndex).map((thought, idx) => (
                <li key={idx} className="flex items-start gap-2 animate-fade-up">
                  <span className="text-[#34a853]">✓</span>
                  <span>{thought}</span>
                </li>
              ))}
              {typingIndex < analyzerThoughts.length && (
                <li className="flex items-center gap-2 text-[#8ab4f8] animate-pulse">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#4285f4]" />
                  <span>Synthesizing plan constraints...</span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* 2. Parallel Specialist Execution Matrix */}
      {!isDone && (
        <div className="mb-8 rounded-2xl border border-white/10 bg-[#181a1f] p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 className="text-[14px] font-semibold text-white">Parallel Specialist Agents (6 Active)</h3>
              <p className="text-[12px] text-muted">Specialists query live market feeds and filings in parallel.</p>
            </div>
            {onPauseResume && (
              <button
                onClick={onPauseResume}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-mono text-slate-300 hover:bg-white/10"
              >
                {paused ? 'Resume stream' : 'Pause stream'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_META.map((agent) => {
              const Icon = agent.icon
              const isAgentDone = completedAgents.includes(agent.key)
              const isAgentFailed = failedAgents.includes(agent.key)
              const isCurrent = job?.current_node === `${agent.key}_agent`

              return (
                <div
                  key={agent.key}
                  className={`rounded-xl border p-3.5 transition-all duration-300 ${
                    isAgentDone
                      ? 'border-[#34a853]/30 bg-[#34a853]/5'
                      : isCurrent
                      ? 'border-[#4285f4]/50 bg-[#4285f4]/10 shadow-lg shadow-blue-500/10'
                      : 'border-white/5 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                        isAgentDone ? 'bg-[#34a853]/20 text-[#34a853]' : 'bg-white/10 text-slate-300'
                      }`}>
                        <Icon size={14} />
                      </span>
                      <h4 className="text-[12px] font-semibold text-white">{agent.name}</h4>
                    </div>

                    {isAgentDone ? (
                      <CheckCircle2 size={16} className="text-[#34a853]" />
                    ) : isCurrent ? (
                      <Loader2 size={16} className="text-[#8ab4f8] animate-spin" />
                    ) : (
                      <Circle size={14} className="text-slate-600" />
                    )}
                  </div>

                  <p className="mt-2 text-[11px] text-muted line-clamp-2">{agent.role}</p>

                  <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono">
                    <span className={isAgentDone ? 'text-[#34a853]' : isCurrent ? 'text-[#8ab4f8] font-bold' : 'text-slate-500'}>
                      {isAgentDone ? 'Evidence Verified' : isCurrent ? 'Live Extracting...' : 'Queued'}
                    </span>
                    {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4] animate-ping" />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 3. Completed Institutional Report (Claude 2-Tier Beginner vs Expert) */}
      {job?.job_id && (
        <div className="mt-2">
          <ReportPreview jobId={job.job_id} job={job} />
        </div>
      )}
    </div>
  )
}
