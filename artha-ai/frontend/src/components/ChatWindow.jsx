import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  FileText,
  Download,
  RotateCcw,
  CornerDownLeft,
  ArrowUpRight,
  Loader2
} from 'lucide-react'
import QueryReasoningAccordion from './QueryReasoningAccordion'
import AgentProcessContinuation from './AgentProcessContinuation'
import ReportPreview from './ReportPreview'
import Logo from './Logo'
import { api } from '../api/client'

export default function ChatWindow({
  job,
  query,
  running,
  submitting,
  onNewResearch,
  onFollowupResearch,
  user
}) {
  const [followupQuery, setFollowupQuery] = useState('')
  const scrollEndRef = useRef(null)
  const inputRef = useRef(null)
  const isDone = job?.status === 'succeeded'
  const activeQuery = job?.query || query || 'Investment Research Query'
  const pdfUrl = job?.job_id ? api.pdfUrl(job.job_id) : null

  // Derived from the job, not a constant — the router selects per query.
  const selectedCount = (job?.selected_agents || []).length
  const completedCount = (job?.completed_agents || []).length
  const failedCount = (job?.failed_agents || []).length

  const handleFollowupSubmit = (e) => {
    e?.preventDefault()
    if (followupQuery.trim() && !running) {
      onFollowupResearch(followupQuery.trim())
      setFollowupQuery('')
      const isTouch = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0)
      if (!isTouch) {
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
  }

  // Scroll smoothly as content updates
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [isDone])

  return (
    <div className="flex flex-col min-h-full max-w-5xl mx-auto px-3 sm:px-6 py-4 animate-fade-up">
      {/* Top Breadcrumb & Control Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-6">
        <button
          onClick={onNewResearch}
          className="flex items-center gap-1.5 text-[12px] font-mono text-[#9aa0a6] transition hover:text-[#f1f3f4]"
        >
          <ArrowLeft size={15} />
          <span>New research session</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="flex h-2 w-2 rounded-full bg-[#4285f4] animate-pulse" />
          <span className="text-[#bdc1c6]">
            {isDone ? 'RESEARCH SYNTHESIS COMPLETE' : running ? 'MULTI-AGENT INFERENCE ACTIVE' : 'THREAD READY'}
          </span>
        </div>
      </div>

      {/* Chat Thread Messages */}
      <div className="space-y-6 flex-1 pb-32">
        {/* 1. User Message (Right-aligned bubble / prompt card) */}
        <div className="flex justify-end">
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

        {/* 2. Assistant Response Container */}
        <div className="flex items-start gap-3 text-left">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#4285f4]/15 text-[#8ab4f8] mt-1">
            <Logo size={20} />
          </div>

          <div className="flex-1 space-y-4 min-w-0">
            {/* Assistant Label */}
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#9aa0a6]">
              <span className="font-semibold text-[#f1f3f4] font-sans">Bulls Eye Agent Swarm</span>
              <span>·</span>
              <span>Autonomous Equity Research</span>
            </div>

            {/* A. Query Understanding Agent Reasoning Accordion with ChatGPT Typing Animation */}
            <QueryReasoningAccordion
              query={activeQuery}
              job={job}
              isRunning={running}
              isDone={isDone}
            />

            {/* B. Specialist Agents Execution Stream (Stepwise Intermediate Process Continuation) */}
            <AgentProcessContinuation
              job={job}
              query={activeQuery}
              running={running}
              isDone={isDone}
            />

            {/* C. Complete Succeeded Banner */}
            {isDone && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#4285f4]/30 bg-[#1e2026] p-4 animate-fade-up shadow-xl">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#34a853]/20 text-[#34a853]">
                    <CheckCircle2 size={18} />
                  </span>
                  <div>
                    <h4 className="text-[13px] font-semibold text-[#f1f3f4]">Research complete — report synthesized</h4>
                    <p className="text-[11px] text-[#9aa0a6]">
                      {completedCount} of {selectedCount || completedCount} specialist{' '}
                      {(selectedCount || completedCount) === 1 ? 'output' : 'outputs'} validated and merged
                      {failedCount > 0
                        ? ` · ${failedCount} failed, disclosed as evidence gaps`
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
                        download={`stock_research_${job.job_id}.pdf`}
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

            {/* D. Final Enhanced Report Preview */}
            {job?.job_id && (
              <div className="pt-2">
                <ReportPreview jobId={job.job_id} job={job} pdfUrl={pdfUrl} />
              </div>
            )}
          </div>
        </div>

        <div ref={scrollEndRef} />
      </div>

      {/* 3. Docked Sticky Bottom Chatbox — Aurora Glassmorphism */}
      <div className="sticky bottom-0 z-40 -mx-3 sm:-mx-6 px-3 sm:px-6 py-4 bg-gradient-to-t from-[#0f1117] via-[#0f1117]/95 to-transparent backdrop-blur-md">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Animated Aurora Background */}
            <div className="absolute -inset-0.5 rounded-[22px] bg-gradient-to-r from-[#4f46e5]/40 via-[#06b6d4]/40 to-[#ec4899]/40 opacity-75 blur-xl animate-pulse-slow" />

            <form
              onSubmit={handleFollowupSubmit}
              className="relative flex items-center gap-2 rounded-[20px] bg-[#16181d]/80 border border-white/10 px-4 py-2.5 shadow-2xl transition-all duration-200 hover:border-white/20"
            >
              {/* Micro-Icon Sparkle */}
              <Sparkles size={15} className="text-[#4f46e5] shrink-0 opacity-80" />

              <input
                ref={inputRef}
                type="text"
                value={followupQuery}
                onChange={(e) => setFollowupQuery(e.target.value)}
                placeholder="Ask a follow-up or research another company (e.g. Compare with TCS)..."
                disabled={running}
                autoComplete="off"
                spellCheck="false"
                className="flex-1 bg-transparent text-[14px] text-[#f1f3f4] placeholder-[#5f6368] focus:outline-none"
              />

              <button
                type="submit"
                disabled={!followupQuery.trim() || running}
                className="group relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-extrabold text-white transition-all duration-200 shadow-md cursor-pointer hover:brightness-115 hover:scale-105 active:scale-95"
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
                    <ArrowUpRight size={15} className="text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" style={{ stroke: '#ffffff' }} />
                  </>
                )}
              </button>
            </form>

            {/* Subtle floating label */}
            <div className="mt-2 px-1 text-center text-[10.5px] font-mono text-[#5f6368]">
              <span>Specialists selected per query · Deterministic evidence validation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
