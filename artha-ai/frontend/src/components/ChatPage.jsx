import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  FileText,
  Download,
  RotateCcw,
  ArrowUpRight,
  Loader2,
  Compass,
  CornerDownLeft,
  Layers,
  ShieldCheck
} from 'lucide-react'
import QueryReasoningAccordion from './QueryReasoningAccordion'
import AgentProcessContinuation from './AgentProcessContinuation'
import ReportPreview from './ReportPreview'
import Logo from './Logo'
import { api } from '../api/client'

export default function ChatPage({
  job,
  query,
  running,
  submitting,
  onStartResearch,
  onNewResearch,
  onNavigateHome,
  user
}) {
  const [followupQuery, setFollowupQuery] = useState('')
  const [initialInput, setInitialInput] = useState('')
  const [researchMode, setResearchMode] = useState('beginner') // 'beginner' | 'expert'
  const scrollEndRef = useRef(null)

  const isDone = job?.status === 'succeeded'
  const activeQuery = job?.query || query
  const hasActiveSession = Boolean(activeQuery || job || submitting)
  const pdfUrl = job?.job_id ? api.pdfUrl(job.job_id) : null

  // Agent counts come from the job, never from a constant — the router selects
  // only the specialists a given query needs, so "6" is wrong on most runs.
  const selectedCount = (job?.selected_agents || []).length
  const completedCount = (job?.completed_agents || []).length
  const failedCount = (job?.failed_agents || []).length

  const handleFollowupSubmit = (e) => {
    e?.preventDefault()
    const q = followupQuery.trim()
    if (q && !running) {
      onStartResearch(q)
      setFollowupQuery('')
    }
  }

  const handleInitialSubmit = (e) => {
    e?.preventDefault()
    const q = initialInput.trim()
    if (q && !running) {
      onStartResearch(q)
      setInitialInput('')
    }
  }

  // Scroll smoothly when new intermediate content arrives or job completes
  useEffect(() => {
    if (isDone) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isDone])

  const suggestions = [
    { label: "What about Infosys's current situation?", query: "What about Infosys's current situation?" },
    { label: "Compare TCS and Infosys on valuation", query: "Compare TCS and Infosys on valuation" },
    { label: "Reliance retail growth & debt profile", query: "What is Reliance Industries debt and retail growth posture?" },
    { label: "Is Tata Motors undervalued today?", query: "Is Tata Motors cheap at current price and margin levels?" },
  ]

  return (
    <div className="flex flex-col min-h-screen bg-[#131518] text-[#f1f3f4]">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#181a1f]/95 px-4 sm:px-8 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11.5px] font-mono text-[#9aa0a6] transition hover:bg-white/10 hover:text-white"
            title="Return to Landing & Methodology Overview"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Overview</span>
          </button>

          <div className="flex items-center gap-2 text-[12px] font-mono text-[#9aa0a6] truncate">
            <span className="text-[#f1f3f4] font-medium hidden md:inline">Research Session</span>
            {activeQuery && (
              <>
                <span className="hidden md:inline">/</span>
                <span className="text-[#8ab4f8] font-semibold truncate max-w-[200px] sm:max-w-[320px]">
                  {activeQuery}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className={`flex h-2 w-2 rounded-full ${
              isDone ? 'bg-[#34a853]' : running ? 'bg-[#4285f4] animate-pulse' : 'bg-[#9aa0a6]'
            }`} />
            <span className="text-[#bdc1c6] hidden sm:inline">
              {isDone ? 'SYNTHESIS COMPLETE' : running ? 'INTERMEDIATE STREAM ACTIVE' : 'CHAT READY'}
            </span>
          </div>

          {/* 2-Tier Mode Toggle: Beginner vs Expert */}
          <div className="flex items-center rounded-xl border border-white/15 bg-black/40 p-1">
            <button
              type="button"
              onClick={() => setResearchMode('beginner')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11.5px] font-semibold transition ${
                researchMode === 'beginner'
                  ? 'bg-[#4285f4] text-white shadow-sm'
                  : 'text-[#9aa0a6] hover:text-[#f1f3f4]'
              }`}
              title="Beginner mode: Plain-English summary & gauges without dense tables"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Beginner</span>
            </button>
            <button
              type="button"
              onClick={() => setResearchMode('expert')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11.5px] font-semibold transition ${
                researchMode === 'expert'
                  ? 'bg-[#fbbc04] text-slate-950 font-bold shadow-sm'
                  : 'text-[#9aa0a6] hover:text-[#f1f3f4]'
              }`}
              title="Expert mode: Full institutional multiples, 5 tabs, and quality score breakdown"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span>Expert</span>
            </button>
          </div>

          <button
            onClick={onNewResearch}
            disabled={running}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11.5px] font-mono text-[#bdc1c6] transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <Sparkles size={13} className="text-[#4285f4]" />
            <span>+ New session</span>
          </button>

          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-[#4285f4] to-[#1a73e8] text-[11px] font-bold text-white shadow">
            {(user?.name || 'U').trim().charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {/* Main Chat Canvas */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 flex flex-col">
        {!hasActiveSession ? (
          /* ==================== 1. EMPTY / WELCOME CHAT STATE ==================== */
          <div className="my-auto py-12 flex flex-col items-center justify-center text-center animate-fade-up max-w-2xl mx-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4285f4]/15 text-[#8ab4f8] mb-4 shadow-xl shadow-[#4285f4]/10">
              <Logo size={36} />
            </div>

            <h2 className="text-2xl sm:text-3xl font-normal text-white font-sans tracking-tight">
              ArthaAI Institutional Research
            </h2>
            <p className="mt-2 text-[13.5px] text-[#9aa0a6] leading-relaxed max-w-md">
              Ask any investment or company question. A router picks the specialist agents your
              question actually needs, and every claim they return is validated against a source
              before it reaches the report.
            </p>

            {/* Google AI Studio Rotating RGB Neon Input Box */}
            <div className="mt-8 w-full">
              <div className="rgb-glow-wrapper w-full">
                <div className="rgb-glow-ambient" />
                <form
                  onSubmit={handleInitialSubmit}
                  className="relative z-10 flex flex-col rounded-[18px] bg-[#1e2026] p-4 shadow-2xl transition focus-within:bg-[#16181d]"
                >
                  <textarea
                    rows={2}
                    value={initialInput}
                    onChange={(e) => setInitialInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) handleInitialSubmit(e)
                    }}
                    placeholder="Enter ticker or question (e.g. What about Infosys's current situation?)..."
                    disabled={running}
                    className="w-full resize-none bg-transparent text-[14px] sm:text-[15px] text-[#f1f3f4] placeholder-[#5f6368] focus:outline-none scroll-slim leading-relaxed"
                  />

                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
                    <span className="text-[11px] font-mono text-[#9aa0a6]">
                      Enter to research · agents selected per query
                    </span>

                    <button
                      type="submit"
                      disabled={!initialInput.trim() || running}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4285f4] to-[#1a73e8] px-4 py-2 text-[12.5px] font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-40"
                    >
                      <span>Start research</span>
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </form>
              </div>

              {/* Suggestion Chips */}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInitialInput(s.query)
                      onStartResearch(s.query)
                    }}
                    className="rounded-full border border-white/10 bg-[#181a1f] px-3.5 py-1.5 text-[11.5px] text-[#bdc1c6] transition hover:border-[#4285f4]/40 hover:bg-[#4285f4]/10 hover:text-[#8ab4f8]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Mode Elicitation Pill */}
              <div className="mt-5 flex items-center justify-center gap-2 text-[12px] text-[#9aa0a6]">
                <span>Reading mode:</span>
                <button
                  type="button"
                  onClick={() => setResearchMode('beginner')}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-medium transition ${
                    researchMode === 'beginner'
                      ? 'border border-[#4285f4] bg-[#4285f4]/15 text-[#8ab4f8]'
                      : 'border border-white/10 text-[#9aa0a6] hover:text-white'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Beginner (Plain English)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResearchMode('expert')}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-medium transition ${
                    researchMode === 'expert'
                      ? 'border border-[#fbbc04] bg-[#fbbc04]/15 text-[#fbbc04]'
                      : 'border border-white/10 text-[#9aa0a6] hover:text-white'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span>Expert (Institutional Multiples)</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ==================== 2. ACTIVE CHAT THREAD WITH PROCESS CONTINUATION ==================== */
          <div className="space-y-6 flex-1 pb-36">
            {/* User Prompt Message Card */}
            <div className="flex justify-end animate-fade-up">
              <div className="max-w-2xl rounded-2xl border border-white/15 bg-[#1e2026] p-4 sm:p-5 shadow-xl text-left">
                <div className="flex items-center gap-2 mb-1.5 text-[10.5px] font-mono uppercase tracking-wider text-[#9aa0a6]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4285f4]/20 text-[#8ab4f8] text-[10px] font-bold">
                    {(user?.name || 'U').trim().charAt(0).toUpperCase()}
                  </span>
                  <span>You Asked</span>
                </div>
                <p className="text-[16px] sm:text-[18px] font-medium text-[#f1f3f4] font-sans leading-relaxed">
                  &ldquo;{activeQuery}&rdquo;
                </p>
              </div>
            </div>

            {/* Assistant Swarm Conversational Node */}
            <div className="flex items-start gap-3.5 text-left animate-fade-up">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#4285f4]/15 text-[#8ab4f8] mt-1 shadow">
                <Logo size={20} />
              </div>

              <div className="flex-1 space-y-5 min-w-0">
                {/* Assistant Label */}
                <div className="flex items-center gap-2 text-[11px] font-mono text-[#9aa0a6]">
                  <span className="font-semibold text-[#f1f3f4] font-sans">ArthaAI Multi-Agent Swarm</span>
                  <span>·</span>
                  <span>Deterministic Autonomous Equity Research</span>
                </div>

                {/* Stage 1: Query Understanding Agent Reasoning Accordion */}
                <QueryReasoningAccordion
                  query={activeQuery}
                  job={job}
                  isRunning={running}
                  isDone={isDone}
                />

                {/* Stage 2: Stepwise Specialist Intermediate Process Continuation */}
                <AgentProcessContinuation
                  job={job}
                  query={activeQuery}
                  running={running}
                  isDone={isDone}
                />

                {/* Stage 3: Succeeded Completion Banner */}
                {isDone && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#4285f4]/30 bg-[#1e2026] p-4 animate-fade-up shadow-xl">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#34a853]/20 text-[#34a853]">
                        <CheckCircle2 size={18} />
                      </span>
                      <div>
                        <h4 className="text-[13.5px] font-semibold text-[#f1f3f4]">
                          Research complete — report synthesized
                        </h4>
                        <p className="text-[11.5px] text-[#9aa0a6]">
                          {completedCount} of {selectedCount || completedCount} specialist{' '}
                          {(selectedCount || completedCount) === 1 ? 'output' : 'outputs'} validated and
                          merged
                          {failedCount > 0
                            ? ` · ${failedCount} specialist${failedCount === 1 ? '' : 's'} failed, disclosed as evidence gaps`
                            : ''}
                          .
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {pdfUrl && (
                        <>
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11.5px] font-medium text-[#f1f3f4] hover:bg-white/10"
                          >
                            <FileText size={13} /> Open PDF
                          </a>
                          <a
                            href={pdfUrl}
                            download={`arthaai_${job?.job_id}.pdf`}
                            className="cta-gradient flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11.5px] font-semibold text-white shadow-md"
                          >
                            <Download size={13} /> Download PDF
                          </a>
                        </>
                      )}
                      <button
                        onClick={onNewResearch}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] text-[#9aa0a6] hover:text-[#f1f3f4]"
                      >
                        <RotateCcw size={12} /> New
                      </button>
                    </div>
                  </div>
                )}

                {/* Stage 4: Enhanced 2-Tier Institutional Report Preview */}
                {job?.job_id && (
                  <div className="pt-2">
                    <ReportPreview
                      jobId={job.job_id}
                      job={job}
                      pdfUrl={pdfUrl}
                      initialMode={researchMode}
                      onModeChange={setResearchMode}
                    />
                  </div>
                )}
              </div>
            </div>

            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* Docked Sticky Bottom Follow-up Prompt Box */}
      {hasActiveSession && (
        <div className="sticky bottom-0 z-40 px-3 sm:px-6 py-3 bg-gradient-to-t from-[#131518] via-[#131518]/95 to-transparent backdrop-blur-md">
          <div className="max-w-4xl mx-auto">
            <div className="rgb-glow-wrapper w-full">
              <div className="rgb-glow-ambient" />
              <form
                onSubmit={handleFollowupSubmit}
                className="relative z-10 flex items-center gap-2 rounded-[18px] bg-[#1e2026] px-4 py-2.5 shadow-2xl transition focus-within:bg-[#16181d]"
              >
                <input
                  type="text"
                  value={followupQuery}
                  onChange={(e) => setFollowupQuery(e.target.value)}
                  placeholder="Ask a follow-up or research another entity (e.g. Compare with TCS)..."
                  disabled={running}
                  className="flex-1 bg-transparent text-[13.5px] sm:text-[14.5px] text-[#f1f3f4] placeholder-[#5f6368] focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={!followupQuery.trim() || running}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-extrabold text-white transition-all duration-200 shadow-md cursor-pointer hover:brightness-115 hover:scale-105 active:scale-95"
                  style={{
                    background: followupQuery.trim() && !running
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'rgba(16, 185, 129, 0.28)',
                    border: followupQuery.trim() && !running ? '2px solid #6ee7b7' : '1.5px solid rgba(16, 185, 129, 0.55)',
                    boxShadow: followupQuery.trim() && !running
                      ? '0 0 20px rgba(16, 185, 129, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                      : '0 0 10px rgba(16, 185, 129, 0.25)',
                    color: '#ffffff',
                  }}
                >
                  {running ? (
                    <Loader2 size={15} className="animate-spin text-white" />
                  ) : (
                    <>
                      <span className="font-extrabold text-white">Send</span>
                      <ArrowUpRight size={15} className="text-white transition-transform" style={{ stroke: '#ffffff' }} />
                    </>
                  )}
                </button>
              </form>
            </div>
            <div className="mt-1.5 text-center text-[10.5px] font-mono text-[#9aa0a6]">
              <span>Specialists selected per query · Deterministic evidence validation</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
