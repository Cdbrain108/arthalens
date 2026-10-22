import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Sparkles,
  FileText,
  Download,
  RotateCcw,
  Share2,
  Settings,
  Maximize2,
  Plus,
  Mic,
  ArrowUp,
  Square,
  Code2,
  Bot,
  Zap,
  TrendingUp,
  BarChart2,
  Search,
  BookOpen,
  Menu,
  AlertTriangle,
  LogIn,
  ChevronRight,
  Layers,
} from 'lucide-react'
import LiveAgentStream from './LiveAgentStream'
import ArthaReasoningBlock from './ArthaReasoningBlock'
import ResearchProcessGraph from './ResearchProcessGraph'
import ReportPreview from './ReportPreview'
import Sidebar from './Sidebar'
import PdfViewerModal from './PdfViewerModal'
import Logo from './Logo'
import ArthaCopilot from './ArthaCopilot'
import CopilotMarkdown from './CopilotMarkdown'
import { api } from '../api/client'
import {
  persistReportPdfToStorage,
  saveChatQuery,
  canGuestGenerateReport,
  recordGuestReportUsage,
} from '../storage/chatSessions'
import {
  detectQueryType,
  getCopilotResponse,
  getFollowupSuggestions,
} from '../utils/queryRouter'

// Display names for the backend's routing intents. Mirrors ROUTING_TABLE in
// `backend/app/crew/routing.py` — previously every non-compare intent was
// labelled "Fundamental Health", which mislabelled five of the seven.
const INTENT_LABEL = {
  conversational: 'Conversational',
  price_move: 'Price Move',
  long_term: 'Long-Term Thesis',
  hiring: 'Hiring & Workforce',
  compare: 'Peer Comparison',
  document: 'Document Analysis',
}

function TypewriterMessage({ text = '', shouldAnimate = false, onTypingDone }) {
  const [typedLength, setTypedLength] = useState(() => (shouldAnimate ? 0 : text.length))
  const [isDone, setIsDone] = useState(() => !shouldAnimate)

  useEffect(() => {
    if (!shouldAnimate) {
      setTypedLength(text.length)
      setIsDone(true)
      onTypingDone?.()
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedLength(text.length)
      setIsDone(true)
      onTypingDone?.()
      return
    }

    setTypedLength(0)
    setIsDone(false)
    let index = 0
    const step = 4
    const speed = 10

    const timer = setInterval(() => {
      index += step
      if (index >= text.length) {
        setTypedLength(text.length)
        setIsDone(true)
        clearInterval(timer)
        onTypingDone?.()
      } else {
        setTypedLength(index)
      }
    }, speed)

    return () => clearInterval(timer)
  }, [text, shouldAnimate])

  const visibleText = isDone ? text : text.slice(0, typedLength)

  return (
    <div className="relative">
      <CopilotMarkdown content={visibleText} />
      {!isDone && (
        <span className="inline-block h-3.5 w-1.5 ml-1 bg-[#22c55e] animate-pulse rounded-xs align-middle" />
      )}
    </div>
  )
}

function ConversationalCopilot({ messages = [], onAction, user, onOpenAuth, running = false, isDone = false }) {
  const isLoggedIn = Boolean(user && !user.guest && user.uid && !String(user.uid).startsWith('guest_'))
  const [completedTypingIds, setCompletedTypingIds] = useState(() => new Set())

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      {messages.map((msg, idx) => {
        const isUser = msg.role === 'user'
        const isLatestAssistant = !isUser && idx === messages.length - 1
        const hasFinishedTyping = completedTypingIds.has(msg.id || idx) || (!isLatestAssistant && messages.length > 1)

        if (isUser) {
          return (
            <div key={msg.id || idx} className="flex justify-end studio-fade-up">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-emerald-500/15 to-emerald-600/20 border border-emerald-500/30 px-4 py-2.5 shadow-md">
                <p className="text-[13.5px] font-medium text-emerald-50 leading-relaxed">{msg.text}</p>
              </div>
            </div>
          )
        }

        return (
          <div key={msg.id || idx} className="rounded-2xl border border-white/10 bg-[#1e2026] p-4 sm:p-5 shadow-lg space-y-4 studio-fade-up">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-400 to-emerald-600 shadow-sm">
                <Bot size={15} className="text-black" />
              </div>
              <span className="text-[12px] font-bold text-white">Artha AI Copilot</span>
              {!hasFinishedTyping && (
                <span className="flex gap-1 ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>

            <TypewriterMessage
              text={msg.text}
              shouldAnimate={!hasFinishedTyping}
              onTypingDone={() => {
                setCompletedTypingIds((prev) => new Set(prev).add(msg.id || idx))
              }}
            />

            {/* Suggestions on latest assistant turn (available for all users whenever research is not actively running) */}
            {isLatestAssistant && hasFinishedTyping && !running && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
              <div className="pt-3 border-t border-white/5 space-y-2 animate-fade-in">
                <p className="text-[11px] font-medium text-[#5f6368] uppercase tracking-wide px-0.5">
                  Suggested Research Actions →
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {msg.suggestions.map((sug) => {
                    const isStock = sug.type === 'stock' || detectQueryType(sug.label) === 'stock'
                    const Icon = isStock ? TrendingUp : BookOpen
                    const iconColor = isStock ? '#34a853' : '#ea4335'
                    return (
                      <button
                        key={sug.label}
                        type="button"
                        onClick={() => onAction(sug.label)}
                        className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[12px] text-[#bdc1c6] transition hover:bg-white/10 hover:text-white hover:border-white/20 group cursor-pointer"
                      >
                        <Icon size={14} style={{ color: iconColor }} className="shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="truncate">{sug.label}</span>
                        {isStock && (
                          <span className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                            LangGraph
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Non-intrusive Cloud Sync & Sign In Hint (shown when guest) */}
      {!isLoggedIn && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-white/10 bg-white/5 animate-fade-up">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Sparkles size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-white truncate">Sign in to save research history</p>
              <p className="text-[11px] text-slate-400 truncate">Cloud sync across devices & PDF reports</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-3 py-1.5 text-[11.5px] font-bold text-black shadow hover:brightness-110 transition cursor-pointer shrink-0"
          >
            <LogIn size={13} />
            <span>Sign In</span>
          </button>
        </div>
      )}
    </div>
  )
}

function InlineReportBriefCard({ job, pdfUrl, onViewPdf, onOpenReport, researchMode = 'beginner' }) {
  const report = job?.report
  if (!report) return null

  const oa = report.overall_assessment || {}
  const company = report.company || {}
  const classification = String(oa.classification || 'ASSESSED').toUpperCase()
  const isPositive = classification.includes('BUY') || classification.includes('POSITIVE')
  const isNegative = classification.includes('SELL') || classification.includes('NEGATIVE') || classification.includes('AVOID')

  // Financial health / metrics summary if present
  const metrics = company.metrics || report.metrics || {}
  const pe = oa.pe_ratio ?? metrics.pe_ratio ?? metrics.pe
  const roe = oa.roe_pct ?? metrics.roe_pct ?? metrics.roe
  const opm = oa.opm_pct ?? metrics.opm_pct ?? metrics.opm
  const de = oa.debt_equity ?? metrics.debt_equity ?? metrics.de

  // Bull & Bear points
  const bullPoints = report.bull_thesis?.points || report.thesis_summary?.bull_points || []
  const bearPoints = report.bear_thesis?.points || report.thesis_summary?.bear_points || report.evidence_gaps || []

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-4 sm:p-6 shadow-2xl space-y-4 animate-fade-up">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-md">
            <FileText size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-white truncate">
                {company.name || 'Institutional Research Brief'}
              </h3>
              {company.ticker && (
                <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-300">
                  {company.ticker} {company.exchange ? `· ${company.exchange}` : ''}
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-slate-400 mt-0.5">
              Multi-Agent Evidence Audit · 100% Citation Grounded
            </p>
          </div>
        </div>

        {/* Verdict Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold font-mono tracking-wide ${
              isPositive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : isNegative
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {classification}
          </span>
        </div>
      </div>

      {/* Executive Summary */}
      {report.executive_summary && (
        <div className="text-[13px] leading-relaxed text-slate-200 bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
          <p>{report.executive_summary}</p>
        </div>
      )}

      {/* Rationale */}
      {oa.rationale && (
        <div className="text-xs text-slate-300 leading-relaxed space-y-1">
          <span className="font-semibold text-emerald-400 block font-mono text-[10.5px] uppercase tracking-wider">
            Synthesis Rationale
          </span>
          <p>{oa.rationale}</p>
        </div>
      )}

      {/* Key Metrics Chips (if available) */}
      {(pe != null || roe != null || opm != null || de != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {pe != null && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
              <span className="text-[10.5px] font-mono text-slate-400 block">P/E Ratio</span>
              <span className="text-sm font-bold text-white font-mono">{pe}x</span>
            </div>
          )}
          {roe != null && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
              <span className="text-[10.5px] font-mono text-slate-400 block">ROE</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">{roe}%</span>
            </div>
          )}
          {opm != null && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
              <span className="text-[10.5px] font-mono text-slate-400 block">Operating Margin</span>
              <span className="text-sm font-bold text-teal-300 font-mono">{opm}%</span>
            </div>
          )}
          {de != null && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
              <span className="text-[10.5px] font-mono text-slate-400 block">Debt / Equity</span>
              <span className="text-sm font-bold text-slate-200 font-mono">{de}</span>
            </div>
          )}
        </div>
      )}

      {/* Bull & Bear Dual-Thesis Mini Row */}
      {(bullPoints.length > 0 || bearPoints.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {bullPoints.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-left">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold mb-1.5">
                <TrendingUp size={13} />
                <span>Bull Catalysts</span>
              </div>
              <ul className="space-y-1 text-[11.5px] text-slate-300 list-disc list-inside">
                {bullPoints.slice(0, 2).map((pt, i) => (
                  <li key={i} className="truncate">{typeof pt === 'string' ? pt : pt.claim || pt.point}</li>
                ))}
              </ul>
            </div>
          )}
          {bearPoints.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-left">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold mb-1.5">
                <AlertTriangle size={13} />
                <span>Downside Risks</span>
              </div>
              <ul className="space-y-1 text-[11.5px] text-slate-300 list-disc list-inside">
                {bearPoints.slice(0, 2).map((pt, i) => (
                  <li key={i} className="truncate">{typeof pt === 'string' ? pt : pt.claim || pt.point}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-black px-3.5 py-2 text-xs font-bold transition shadow-md cursor-pointer active:scale-95"
            >
              <FileText size={13} />
              <span>Open In-App Report ({researchMode})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onViewPdf}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white px-3.5 py-2 text-xs font-semibold transition cursor-pointer active:scale-95"
          >
            <Maximize2 size={13} />
            <span>PDF Dossier</span>
          </button>
          {pdfUrl && (
            <a
              href={pdfUrl}
              download={`ArthaLens_${company.ticker || 'Research'}.pdf`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition cursor-pointer"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Download PDF</span>
            </a>
          )}
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Ask questions about this report below ↓
        </span>
      </div>
    </div>
  )
}

// ─── Stable Top Header (defined outside to preserve input focus) ──────────────
function StudioTopHeader({
  activeQuery,
  isConversational,
  entities,
  isStockQuery,
  researchMode,
  setResearchMode,
  onBackToStart,
  onNewResearch,
  running,
  submitting = false,
  pdfUrl,
  user,
  onToggleSidebar,
  onOpenAuth,
  onLogout,
  onViewPdf,
  onShare,
  isDone,
  activeView = 'chat',
  setActiveView,
  hasReport = false,
}) {
  const resolved = (entities || []).map((e) => e.name || e.ticker).filter(Boolean)
  const workspaceTitle = isConversational
    ? 'Artha AI Copilot'
    : resolved.length === 1
    ? `${resolved[0]} Research`
    : resolved.length > 1
    ? `${resolved.join(' vs ')}`
    : 'Artha AI Workspace'

  const [profileOpen, setProfileOpen] = useState(false)
  const isLoggedIn = Boolean(user && !user.guest && user.uid && !String(user.uid).startsWith('guest_'))
  const userInitials = (user?.displayName || user?.name || user?.email || 'A').trim().charAt(0).toUpperCase()

  return (
    <header className="studio-top-header flex shrink-0 items-center justify-between border-b border-white/10 bg-[#16181e] px-2 sm:px-6 z-20">
      {/* Left: Clean Home button (compact on mobile) */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          onClick={onBackToStart}
          className="flex h-8 w-8 sm:h-9 sm:w-auto shrink-0 items-center justify-center sm:gap-1.5 rounded-xl border border-white/15 bg-white/5 sm:px-3 text-[12px] font-semibold text-[#f1f3f4] transition hover:bg-white/10 hover:text-white cursor-pointer active:scale-95"
          aria-label="Back to home"
          title="Back to home"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline text-xs">Home</span>
        </button>

        <div className="studio-query hidden md:flex min-w-0 items-center gap-2 text-[12.5px] font-mono text-[#9aa0a6]">
          <span>/</span>
          <span className="text-[#22c55e] font-medium truncate max-w-[200px]">
            {activeQuery || 'Artha AI Copilot'}
          </span>
        </div>
      </div>

      {/* Center: Sleek View Mode Switcher styled with the Reasoning Block aesthetic */}
      <div className="flex items-center justify-center min-w-0 flex-1 px-1 sm:px-2 text-center">
        <div className="inline-flex items-center rounded-2xl bg-gradient-to-tr from-[#161f1a]/95 via-[#131720]/95 to-[#11141b]/95 border border-emerald-500/35 p-1 shadow-[0_4px_24px_rgba(0,0,0,0.65)] backdrop-blur-md transition-all duration-300">
          {/* ── Chat Button ── */}
          <button
            type="button"
            onClick={() => {
              if (running || submitting) return
              setActiveView?.('chat')
            }}
            disabled={running || submitting}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl text-[11.5px] sm:text-xs font-semibold transition-all duration-200 cursor-pointer ${
              running || submitting
                ? 'opacity-40 cursor-not-allowed text-slate-400'
                : activeView === 'chat'
                ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 text-black font-bold shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title={
              running || submitting
                ? 'Multi-agent research synthesis in progress...'
                : 'Switch to Copilot Chat'
            }
          >
            <Sparkles
              size={13}
              className={
                activeView === 'chat' && !running && !submitting
                  ? 'text-black'
                  : 'text-emerald-400'
              }
            />
            <span>Chat</span>
          </button>

          {/* ── Report Button (Reasoning Block Theme & Real-time Live Highlight while generating) ── */}
          <button
            type="button"
            onClick={() => setActiveView?.('report')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-[11.5px] sm:text-xs font-semibold transition-all duration-300 cursor-pointer relative ${
              running || submitting
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-emerald-500/25 border border-emerald-400/80 text-emerald-300 ring-1 ring-emerald-400/50 shadow-[0_0_22px_rgba(16,185,129,0.5)] animate-pulse'
                : activeView === 'report'
                ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 text-black font-bold shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title={
              running || submitting
                ? 'Multi-agent report compilation underway · Live Auditing'
                : 'View In-Depth Equity Research Report'
            }
          >
            {running || submitting ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              </span>
            ) : (
              <FileText
                size={13}
                className={
                  activeView === 'report'
                    ? 'text-black'
                    : 'text-emerald-400'
                }
              />
            )}

            <span>Report</span>

            {/* Mode / Compilation Badge */}
            {running || submitting ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-200 font-bold uppercase tracking-wider animate-pulse">
                <Sparkles size={9} className="animate-spin text-emerald-300" style={{ animationDuration: '3s' }} />
                <span>Generating...</span>
              </span>
            ) : (
              <span
                className={`text-[9.5px] px-1.5 py-0.5 rounded-md font-mono uppercase font-bold tracking-wider transition-colors ${
                  activeView === 'report'
                    ? 'bg-black/25 text-black'
                    : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                }`}
              >
                {researchMode}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={onNewResearch}
          disabled={running}
          className="flex h-8 w-8 sm:h-9 sm:w-auto shrink-0 items-center justify-center sm:gap-1.5 rounded-xl border border-white/15 bg-white/5 sm:px-2.5 text-[11.5px] font-medium text-[#f1f3f4] transition hover:bg-white/10 disabled:opacity-40 cursor-pointer active:scale-95"
          title="Start new research"
          aria-label="Start new research"
        >
          <Sparkles size={13} className="text-emerald-400" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-8 w-8 sm:h-9 sm:w-auto shrink-0 items-center justify-center sm:gap-1.5 rounded-xl border border-white/15 bg-white/5 text-slate-300 hover:text-white sm:px-2.5 cursor-pointer active:scale-95"
          title="Past research history"
          aria-label="Past research history"
        >
          <Menu size={15} />
          <span className="hidden lg:inline text-xs">History</span>
        </button>

        {isStockQuery && (
          <button
            type="button"
            onClick={onViewPdf}
            disabled={!isDone || running}
            className={`flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1 text-[11px] sm:text-[11.5px] font-semibold transition cursor-pointer active:scale-95 ${
              isDone
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed opacity-50'
            }`}
            title={
              isDone
                ? 'View Institutional PDF Dossier In-App'
                : 'PDF dossier compiles upon research completion'
            }
          >
            <FileText size={13} />
            <span className="hidden sm:inline">PDF</span>
          </button>
        )}

        {!isLoggedIn ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-[11.5px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition cursor-pointer active:scale-95 shadow-sm"
            title="Sign in to your account"
          >
            <LogIn size={13} />
            <span className="inline text-xs">Sign In</span>
          </button>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              title={`Signed in as ${user?.displayName || user?.name || user?.email || 'Researcher'}`}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#22c55e] to-[#16a34a] text-[11px] font-bold text-white shadow hover:ring-2 hover:ring-white/20 transition cursor-pointer active:scale-95"
            >
              {userInitials}
            </button>
            {profileOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileOpen(false)}
                />
                <div className="absolute right-0 top-10 z-50 w-56 rounded-2xl border border-white/10 bg-[#14171d]/95 p-3.5 shadow-2xl backdrop-blur-xl">
                  <div className="mb-2.5 border-b border-white/10 pb-2">
                    <div className="text-xs font-semibold text-white truncate">
                      {user?.displayName || user?.name || 'Researcher'}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {user?.email || 'researcher@gmail.com'}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-mono font-medium text-emerald-400">
                      Verified Researcher
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false)
                      onLogout?.()
                    }}
                    className="w-full rounded-lg bg-rose-500/15 border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/25 transition active:scale-95 cursor-pointer text-center"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

// ─── Stable Chat Input Bar — Aurora Glass, defined outside so typing never remounts ─
function StudioChatInputBar({
  value,
  onValueChange,
  onSubmit,
  running,
  placeholder,
  inputRef,
}) {
  const hasText = value.trim().length > 0
  return (
    <div className="studio-chat-input border-t border-white/10 bg-[#181a1f]/90 backdrop-blur-xl p-3">
      <div className="relative group">
        {/* Emerald-Teal Aurora glow — lights up softly on focus-within */}
        <div className="pointer-events-none absolute -inset-[2px] rounded-[16px] bg-gradient-to-r from-emerald-500/40 via-teal-500/30 to-blue-500/30 opacity-0 blur-lg transition-opacity duration-300 group-focus-within:opacity-100" />
        <div className="pointer-events-none absolute -inset-px rounded-[15px] bg-gradient-to-r from-emerald-500/30 via-transparent to-teal-500/30 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100" />

        <form
          onSubmit={onSubmit}
          className="relative flex items-center gap-1.5 rounded-[14px] border border-white/15 bg-[#1e2026]/95 px-2.5 py-2 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.8)] transition-all duration-200 hover:border-white/25 focus-within:border-emerald-500/60 focus-within:bg-[#16181d] focus-within:shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_10px_40px_-10px_rgba(16,185,129,0.35)]"
        >
          <button
            type="button"
            className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#9aa0a6] transition hover:bg-white/10 hover:text-white"
            title="Add context"
          >
            <Plus size={16} />
          </button>

          <div className="relative flex-1 flex items-center min-w-0">
            {!hasText && !running && (
              <Sparkles size={14} className="pointer-events-none absolute left-0 text-emerald-400/70" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder={placeholder}
              disabled={running}
              autoComplete="off"
              spellCheck="false"
              className={`w-full bg-transparent text-[13.5px] text-[#f1f3f4] placeholder-[#5f6368] focus:outline-none disabled:opacity-60 ${!hasText && !running ? 'pl-6' : 'pl-1'}`}
            />
          </div>

          {hasText && !running && (
            <kbd className="hidden sm:flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-[#9aa0a6]">
              Enter ↵
            </kbd>
          )}

          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#9aa0a6] transition hover:bg-white/10 hover:text-white"
            title="Voice input"
          >
            <Mic size={15} />
          </button>

          <button
            type="submit"
            disabled={!hasText || running}
            title={running ? 'Researching…' : 'Start research'}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer ${
              hasText && !running
                ? 'hover:brightness-115 hover:scale-105 active:scale-95'
                : 'opacity-85'
            }`}
            style={{
              background: hasText && !running
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'rgba(16, 185, 129, 0.28)',
              border: hasText && !running ? '2px solid #6ee7b7' : '1.5px solid rgba(16, 185, 129, 0.55)',
              boxShadow: hasText && !running
                ? '0 0 20px rgba(16, 185, 129, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                : '0 0 10px rgba(16, 185, 129, 0.25)',
              color: '#ffffff',
            }}
          >
            {running ? (
              <Square size={13} className="animate-pulse text-white fill-white" />
            ) : (
              <ArrowUp
                size={18}
                strokeWidth={3}
                className="text-white"
                style={{ stroke: '#ffffff', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
              />
            )}
          </button>
        </form>
      </div>

      <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10.5px] font-mono text-[#9aa0a6]">
        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="hidden sm:inline">11 autonomous agents ready · Enter to dispatch</span>
        <span className="sm:hidden">11 agents ready · Tap to send</span>
      </div>
    </div>
  )
}

// ─── Main StudioPage ───────────────────────────────────────────────────────────
export default function StudioPage({
  job,
  query,
  running,
  submitting,
  error,
  onStartResearch,
  onAskReport,
  onNewResearch,
  onBackToStart,
  user,
  sessions = [],
  onSelectSession,
  onDeleteSession,
  onLogout,
  onOpenAuth,
}) {
  const isTouchDevice = () => {
    if (typeof window === 'undefined') return false
    return (
      window.innerWidth < 768 ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    )
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [followupText, setFollowupText] = useState('')
  const [researchMode, setResearchMode] = useState('beginner')
  const [activeView, setActiveView] = useState('chat') // 'chat' | 'report'
  const [qaMessages, setQaMessages] = useState([])
  const [completedQaIds, setCompletedQaIds] = useState(() => new Set())
  const [askingReport, setAskingReport] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [toast, setToast] = useState('')
  const chatScrollRef = useRef(null)
  const inputRef = useRef(null)

  const isDone = job?.status === 'succeeded' && Boolean(job?.report)
  const activeQuery = job?.query || query || ''
  const canAskReport = isDone && Boolean(job?.job_id) && typeof onAskReport === 'function'
  const isLoggedIn = Boolean(user && !user.guest && user.uid && !String(user.uid).startsWith('guest_'))
  const currentJobId = job?.job_id || sessions?.find((s) => s.job_id && !s.job_id.startsWith('chat_'))?.job_id || null
  const pdfUrl = currentJobId ? api.pdfUrl(currentJobId) : null

  // Reset Q&A messages on new job
  useEffect(() => {
    setQaMessages([])
    setCompletedQaIds(new Set())
  }, [job?.job_id, job?.report, job?.status])

  // Automatically open the report dossier as soon as research finishes generating
  const autoNavigatedRef = useRef(null)
  useEffect(() => {
    if (isDone && job?.report && autoNavigatedRef.current !== job.job_id) {
      autoNavigatedRef.current = job.job_id
      setActiveView('report')
    }
  }, [isDone, job?.report, job?.job_id])

  // Auto-scroll down to the agents reasoning cockpit when research begins executing for the first time
  const hasAutoScrolledAgentsRef = useRef(null)
  const reasoningAnchorRef = useRef(null)

  useEffect(() => {
    if ((running || submitting) && hasAutoScrolledAgentsRef.current !== (job?.job_id || 'started')) {
      hasAutoScrolledAgentsRef.current = job?.job_id || 'started'
      const timer = setTimeout(() => {
        reasoningAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
      return () => clearTimeout(timer)
    }
    if (!running && !submitting) {
      hasAutoScrolledAgentsRef.current = null
    }
  }, [running, submitting, job?.job_id])

  // Dedicated Copilot welcoming when switching to chat after a report has been generated
  const hasAddedReportGreetingRef = useRef(null)
  const handleSwitchToChat = useCallback(() => {
    setActiveView('chat')
    if (isDone && job?.report && hasAddedReportGreetingRef.current !== job.job_id) {
      hasAddedReportGreetingRef.current = job.job_id
      const queryName = activeQuery || job?.report?.company?.name || job?.entities?.[0]?.name || 'your research'
      const reportGreeting = `As per your query "${queryName}", I have generated an in-depth institutional equity research report. You can review the complete dossier anytime from the Report tab (where interactive in-app preview and PDF download options are available).\n\nIf you want to know more about this report or want to understand it in greater depth, I can help you with specific questions and analysis:`
      setCopilotMessages((prev) => [
        ...prev,
        {
          id: `report_ready_${job.job_id || Date.now()}`,
          role: 'assistant',
          text: reportGreeting,
          suggestions: [
            { label: 'What is the valuation verdict & P/E multiple?', type: 'action' },
            { label: 'What are the core bull catalysts?', type: 'action' },
            { label: 'What are the top downside risk triggers?', type: 'action' },
            { label: 'Show agent conclusions and scope limitations', type: 'action' },
          ],
        },
      ])
    }
    if (!isTouchDevice()) {
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [isDone, job?.report, job?.job_id, job?.entities, activeQuery])

  // Focus input on mount + refocus when research finishes (DESKTOP ONLY — never on mobile/touch screens to avoid popping virtual keyboard)
  useEffect(() => {
    if (!isTouchDevice()) {
      inputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    if (!running && !askingReport && !isTouchDevice()) {
      inputRef.current?.focus()
    }
  }, [running, askingReport])

  // Auto-dismiss the inline toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const handleShare = async () => {
    const url = window.location.href
    try {
      // navigator.share is the native affordance on phones; clipboard is the
      // desktop fallback. Both can reject (permission, insecure context), so
      // the failure path reports instead of silently doing nothing.
      if (navigator.share) {
        await navigator.share({ title: 'ArthaLens AI research workspace', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setToast('Workspace link copied')
    } catch {
      setToast('Could not copy the link — copy it from the address bar')
    }
  }

  const [showLeaveWarning, setShowLeaveWarning] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)

  const handleGuardedBack = () => {
    if (running || submitting) {
      setPendingAction('back')
      setShowLeaveWarning(true)
    } else {
      onBackToStart?.()
    }
  }

  const handleGuardedNewResearch = () => {
    if (running || submitting) {
      setPendingAction('new')
      setShowLeaveWarning(true)
    } else {
      onNewResearch?.()
    }
  }

  // Sidebar nav targets. The landing page anchors live on the landing route, so
  // anything other than 'chat' has to leave the studio first.
  const handleNavSelect = (section) => {
    setSidebarOpen(false)
    if (section === 'chat') return
    handleGuardedBack()
    if (section && section !== 'landing') {
      // Let the landing route mount before asking it to scroll.
      setTimeout(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 240)
    }
  }

  // ─── Conversational Copilot Multi-Turn Messages State ────────────────────
  const [copilotMessages, setCopilotMessages] = useState(() => {
    if (activeQuery) {
      const isStock = detectQueryType(activeQuery) === 'stock'
      return [
        { id: 'u_init', role: 'user', text: activeQuery },
        {
          id: 'a_init',
          role: 'assistant',
          text: isStock
            ? `### 🚀 Dispatched Autonomous Research: **${activeQuery}**\n\nI have routed your inquiry to our **11 autonomous specialist agents** cross-examining regulatory filings, calculating peer valuation metrics, and stress-testing operational margins.\n\n*Monitor live agent reasoning and filing verification in the live specialist stream below.*`
            : getCopilotResponse(activeQuery, user),
          suggestions: isStock ? [] : getFollowupSuggestions(activeQuery),
        },
      ]
    }
    return [
      {
        id: 'a_welcome',
        role: 'assistant',
        text: getCopilotResponse('', user),
        suggestions: getFollowupSuggestions(''),
      },
    ]
  })

  // Synchronize external query transitions into Copilot thread
  useEffect(() => {
    if (activeQuery) {
      const isStock = detectQueryType(activeQuery) === 'stock'
      setCopilotMessages([
        { id: `u_${Date.now()}`, role: 'user', text: activeQuery },
        {
          id: `a_${Date.now() + 1}`,
          role: 'assistant',
          text: isStock
            ? `### 🚀 Dispatched Autonomous Research: **${activeQuery}**\n\nI have routed your inquiry to our **11 autonomous specialist agents** cross-examining regulatory filings, calculating peer valuation metrics, and stress-testing operational margins.\n\n*Monitor live agent reasoning and filing verification in the live specialist stream below.*`
            : getCopilotResponse(activeQuery, user),
          suggestions: isStock ? [] : getFollowupSuggestions(activeQuery),
        },
      ])
    }
  }, [activeQuery])

  // Auto-scroll chat on Q&A messages, copilot messages, completion, or active generation
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qaMessages?.length, copilotMessages?.length, isDone, askingReport, isGenerating])

  const handleCopilotAction = (rawText) => {
    const text = (rawText || '').trim()
    if (!text || isGenerating) return

    const uId = `u_${Date.now()}`
    setCopilotMessages((prev) => [...prev, { id: uId, role: 'user', text }])
    saveChatQuery(text, user?.uid)
    requestAnimationFrame(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' }))

    const type = detectQueryType(text)
    const effectiveUser = user || { uid: 'local_active', name: 'Researcher', guest: false }

    // 1. Refuse Out-of-Scope non-financial queries immediately
    if (type === 'out_of_scope') {
      setIsGenerating(false)
      const aId = `a_${Date.now()}`
      const reply = getCopilotResponse(text, effectiveUser)
      const suggestions = getFollowupSuggestions(text)
      setCopilotMessages((prev) => [
        ...prev,
        { id: aId, role: 'assistant', text: reply, suggestions },
      ])
      requestAnimationFrame(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' }))
      return
    }

    // 2. Dispatch stock research immediately without delay
    if (type === 'stock') {
      // Enforce 1-time free report limit for non-logged-in users
      if (!canGuestGenerateReport(user)) {
        setIsGenerating(false)
        const aId = `a_${Date.now()}`
        setCopilotMessages((prev) => [
          ...prev,
          {
            id: aId,
            role: 'assistant',
            text: `### 🔒 Sign In Required for Additional Research\n\nYou have completed your **1 free equity research report**! To research **${text}**, unlock deeper valuation models, and export institutional PDFs, please sign in.\n\n*Tap Sign In in the top navigation or use Google to continue.*`,
          },
        ])
        onOpenAuth?.()
        requestAnimationFrame(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' }))
        return
      }

      setIsGenerating(false)
      const aId = `a_${Date.now()}`
      setCopilotMessages((prev) => [
        ...prev,
        {
          id: aId,
          role: 'assistant',
          text: `### 🚀 Dispatching Autonomous Multi-Agent Research: **${text}**\n\nI have routed your inquiry to our **11 autonomous specialist agents** cross-examining balance sheets, valuation multiples, news catalysts, and adversarial Bull vs Bear risk audit in real-time.\n\n*Review live progress in the execution stream below.*`,
        },
      ])
      onStartResearch(text)
      requestAnimationFrame(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' }))
      return
    }

    // 3. Educational / Conceptual Finance queries
    setIsGenerating(true)
    setGenerationStep(0)
    setTimeout(() => setGenerationStep(1), 180)
    setTimeout(() => setGenerationStep(2), 420)

    setTimeout(() => {
      setIsGenerating(false)
      const aId = `a_${Date.now()}`
      const reply = getCopilotResponse(text, effectiveUser, {
        companyName: job?.entities?.[0]?.name || (job?.query || activeQuery),
        ticker: job?.entities?.[0]?.ticker,
        job,
      })
      const suggestions = getFollowupSuggestions(text)
      setCopilotMessages((prev) => [
        ...prev,
        { id: aId, role: 'assistant', text: reply, suggestions },
      ])
      requestAnimationFrame(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' }))
    }, 600)
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const q = followupText.trim()
    if (!q || running || askingReport || isGenerating) return

    setFollowupText('')

    // Check if the user is asking to research a NEW / DIFFERENT stock or comparison
    const isNewStock = (() => {
      const qLower = q.toLowerCase()
      // Skip greetings, identity, concepts, hold/sell/verdict/comparison follow-ups
      if (/^(hi|hello|hey|who are you|who r u|what are you|help|introduce)/i.test(qLower)) return false
      if (/what is|explain|define|how to|meaning of/i.test(qLower)) return false
      if (/which.*(better|winner|pick)|should i (hold|buy|sell)|can i hold|hold or sell|what to do|summarize|verdict|risks|downside/i.test(qLower)) return false
      
      const currentTickers = (job?.entities || []).map((ent) => (ent.ticker || '').toLowerCase()).filter(Boolean)
      const currentNames = (job?.entities || []).map((ent) => (ent.name || '').toLowerCase()).filter(Boolean)
      
      const type = detectQueryType(q)
      if (type === 'stock') {
        const words = qLower.split(/[\s,vs\-\/]+/)
        const mentionsNewEntity = words.some((w) =>
          ['reliance', 'nvidia', 'nvda', 'apple', 'aapl', 'microsoft', 'msft', 'tesla', 'tsla', 'wipro', 'hdfc', 'sbi', 'itc', 'tata', 'tatamotors', 'meta', 'google', 'googl', 'amazon', 'amzn', 'l&t', 'icici'].includes(w) &&
          !currentTickers.includes(w) && !currentNames.some((n) => n.includes(w))
        )
        if (mentionsNewEntity || (words.includes('compare') && !currentTickers.every((t) => qLower.includes(t)))) {
          return true
        }
      }
      return false
    })()

    if (isNewStock) {
      handleCopilotAction(q)
      if (!isTouchDevice()) {
        requestAnimationFrame(() => inputRef.current?.focus())
      }
      return
    }

    if (canAskReport) {
      setQaMessages((messages) => [...messages, { role: 'user', text: q }])
      setAskingReport(true)
      try {
        let answerText = ''
        let sources = []
        let followUp = false

        try {
          const response = await onAskReport(job.job_id, q)
          if (response?.answer && !response.answer.includes('not established by the completed report')) {
            answerText = response.answer
            sources = response.sources || []
            followUp = response.follow_up_research_needed
          }
        } catch (_) {}

        if (!answerText) {
          answerText = getCopilotResponse(q, user, {
            companyName: job?.entities?.[0]?.name || activeQuery,
            ticker: job?.entities?.[0]?.ticker,
            reportData: job?.report_json || job?.report,
            job,
          })
        }

        setQaMessages((messages) => [...messages, {
          role: 'assistant',
          text: answerText || 'The report did not return an answer.',
          sources,
          followUp,
        }])
      } catch (error) {
        setQaMessages((messages) => [...messages, {
          role: 'assistant',
          text: `I could not answer from this report: ${error.message}`,
        }])
      } finally {
        setAskingReport(false)
      }
    } else {
      handleCopilotAction(q)
    }
    // Keep focus in the box after send on desktop only
    if (!isTouchDevice()) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  // ── LAYOUT DECISION ────────────────────────────────────────────────────────
  // Use intent from backend if available, else detect on client
  const queryType = job?.intent === 'conversational'
    ? 'conversational'
    : job?.intent
    ? 'stock'
    : detectQueryType(activeQuery)

  const isConversational = queryType === 'conversational'
  const isStockQuery = !isConversational

  // ── Entity badges come from the router's resolved securities ──────────────

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTITUTIONAL RESEARCH WORKSPACE — Split-pane (Left: Agent Stream, Right: In-App Preview)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="studio-root flex w-full flex-col overflow-hidden bg-[#131518] text-[#f1f3f4] font-sans antialiased relative">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={sessions}
        onSelectSession={(sess) => {
          setSidebarOpen(false)
          onSelectSession?.(sess)
        }}
        onDeleteSession={onDeleteSession}
        onNewChat={() => {
          setSidebarOpen(false)
          handleGuardedNewResearch()
        }}
        user={user}
        onLogout={onLogout}
        onOpenAuth={onOpenAuth}
        running={running}
        currentPage="chat"
        onNavSelect={handleNavSelect}
      />

      <StudioTopHeader
        activeQuery={activeQuery}
        isConversational={isConversational}
        entities={job?.entities}
        isStockQuery={isStockQuery}
        researchMode={researchMode}
        setResearchMode={setResearchMode}
        onBackToStart={handleGuardedBack}
        onNewResearch={handleGuardedNewResearch}
        running={running}
        submitting={submitting}
        pdfUrl={pdfUrl}
        user={user}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenAuth={onOpenAuth}
        onLogout={onLogout}
        onViewPdf={() => setShowPdfModal(true)}
        onShare={handleShare}
        isDone={isDone}
        activeView={activeView}
        setActiveView={(view) => {
          if (view === 'chat') {
            handleSwitchToChat()
          } else {
            setActiveView(view)
          }
        }}
        hasReport={Boolean(job?.report)}
      />

      {/* ══ Full-Width Unified Copilot Chat & Report Workspace ══ */}
      <div
        className="studio-split flex flex-1 overflow-hidden"
        data-running={String(running || submitting)}
        data-active-view={activeView}
      >
        {/* ══ Dedicated Synthesis View: while research is compiling, show combined animation cockpit ══ */}
        {running || submitting ? (
          <section className="studio-synthesis-pane flex flex-1 flex-col bg-[#14161b] overflow-y-auto w-full p-3 sm:p-6 scroll-slim">
            <div className="w-full max-w-4xl mx-auto space-y-5 animate-fade-in my-auto py-4">
              {/* Top Hero: Synthesizing banner animation */}
              <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center rounded-2xl border border-emerald-500/30 bg-[#1a1d24] shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden">
                <div className="absolute -inset-10 bg-gradient-to-tr from-emerald-500/10 via-teal-500/5 to-transparent blur-2xl pointer-events-none" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mb-3.5 shadow-lg shadow-emerald-500/20">
                  <Sparkles size={28} className="animate-spin text-emerald-400" style={{ animationDuration: '6s' }} />
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-mono font-semibold text-emerald-300 uppercase tracking-wider mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Stage: {job?.current_node ? job.current_node.replace(/_/g, ' ').toUpperCase() : 'MANAGEMENT AGENT'}</span>
                </div>
                <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  Synthesizing Equity Research Report
                </h2>
                <p className="mt-2 text-xs sm:text-sm text-slate-300 max-w-lg leading-relaxed">
                  Parallel specialist agents are auditing regulatory filings, calculating financial metrics, and stress-testing evidence.
                </p>
                <div className="mt-4 flex items-center gap-3 text-[11px] font-mono text-slate-400">
                  <span>Real-time multi-agent execution</span>
                  <span>·</span>
                  <span>100% cited evidence</span>
                </div>
              </div>

              {/* Directly below: Artha AI Copilot Reasoning Block animation */}
              <div ref={reasoningAnchorRef} className="scroll-mt-6">
                <ArthaReasoningBlock
                  job={job}
                  query={activeQuery}
                  running={running}
                  submitting={submitting}
                  isDone={isDone}
                  isGenerating={isGenerating}
                  isConversational={isConversational}
                  generationStep={generationStep}
                  askingReport={askingReport}
                  onViewReport={() => setActiveView('report')}
                />
              </div>

              {/* Guard against premature report access & live auditing status indicator */}
              <div className="w-full flex items-center justify-between p-3 rounded-xl border border-white/10 bg-[#16181e] text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-medium truncate">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="truncate">Auditing... 11 specialists analyzing filings</span>
                </div>
                <button
                  type="button"
                  disabled
                  className="text-[11px] font-mono text-slate-500 shrink-0 cursor-not-allowed opacity-70"
                >
                  Auditing...
                </button>
              </div>
            </div>
          </section>
        ) : activeView === 'chat' ? (
          <section
            className="studio-left-pane flex flex-1 flex-col bg-[#14161b] overflow-hidden w-full"
          >
          <div className="flex-1 flex flex-col overflow-y-auto p-3 sm:p-6 space-y-4 scroll-slim scroll-smooth">
            <div className="w-full max-w-4xl mx-auto flex flex-col flex-1 space-y-4">
              {error && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-left shadow-lg animate-fade-up">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                      <div>
                        <h4 className="text-[13px] font-semibold text-rose-200">Research pipeline unreachable</h4>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-rose-300/80">
                          {error}
                        </p>
                      </div>
                    </div>
                    {activeQuery && (
                      <button
                        type="button"
                        onClick={() => onStartResearch(activeQuery)}
                        className="rounded-lg bg-rose-500/20 hover:bg-rose-500/30 px-2.5 py-1 text-[11px] font-medium text-rose-200 transition shrink-0"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Fresh Workspace Hero (Greeting + Suggested Inquiries) when no messages and idle */}
              {copilotMessages.length <= 1 && !running && !submitting && !isGenerating && !job && (
                <div className="flex flex-col justify-center items-center py-6 sm:py-10 text-center max-w-lg mx-auto w-full space-y-6 studio-fade-up">
                  <div className="relative inline-flex items-center justify-center">
                    <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-emerald-500/30 via-teal-500/20 to-blue-500/20 blur-xl animate-pulse" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#1e222d] to-[#12151c] shadow-2xl border border-white/15">
                      <Logo size={32} />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-base sm:text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
                      Artha AI Copilot
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 font-semibold shadow-sm">
                        Live
                      </span>
                    </h2>
                    <p className="text-[12px] sm:text-[13px] text-slate-400 mt-1.5 leading-relaxed px-4 max-w-md mx-auto">
                      Autonomous financial intelligence &amp; valuation reasoning. Ask any financial question, compare industry peers, or audit regulatory filings.
                    </p>
                  </div>

                  {/* Quick Inquiry Suggestions */}
                  <div className="w-full space-y-2 pt-1 text-left px-1">
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider pl-1">
                      Suggested Financial Inquiries
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { q: 'Compare TCS and Infosys on margins', label: 'TCS vs Infosys Margins', badge: 'Compare' },
                        { q: 'Explain P/E ratio and DCF multiples', label: 'Explain P/E & DCF', badge: 'Valuation' },
                        { q: 'Should I hold Reliance for 5 years?', label: 'Reliance 5-Yr Thesis', badge: 'Thesis' },
                        { q: 'What are the risks in NVIDIA NVDA?', label: 'NVIDIA Risk Audit', badge: 'Risk Audit' }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleCopilotAction(item.q)}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 p-2.5 text-[11.5px] text-slate-300 hover:text-white transition group cursor-pointer active:scale-[0.98]"
                        >
                          <span className="truncate">{item.label}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-colors">
                              {item.badge}
                            </span>
                            <ChevronRight size={13} className="text-slate-500 group-hover:text-emerald-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Conversational Copilot Chat Thread */}
              {copilotMessages.length > 1 && (
                <ConversationalCopilot
                  messages={copilotMessages}
                  onAction={handleCopilotAction}
                  user={user}
                  onOpenAuth={onOpenAuth}
                  running={running}
                  isDone={isDone}
                />
              )}

              {/* Live Multi-Agent Reasoning Cockpit / Process Stepper */}
              {/* Always rendered with active animation whenever research is submitting, running, generating, or asking report */}
              {(running || submitting || isGenerating || askingReport || (job && !isDone) || (isDone && !job?.report)) && (
                <div ref={reasoningAnchorRef} className="scroll-mt-6">
                  <ArthaReasoningBlock
                    job={job}
                    query={activeQuery}
                    running={running}
                    submitting={submitting}
                    isDone={isDone}
                    isGenerating={isGenerating}
                    isConversational={isConversational}
                    generationStep={generationStep}
                    askingReport={askingReport}
                    onViewReport={() => setActiveView('report')}
                  />
                </div>
              )}

              {/* Inline Institutional Report Brief Card (appears directly in chat when research finishes) */}
              {isDone && job?.report && (
                <InlineReportBriefCard
                  job={job}
                  pdfUrl={pdfUrl}
                  onViewPdf={() => setShowPdfModal(true)}
                  onOpenReport={() => setActiveView('report')}
                  researchMode={researchMode}
                />
              )}

              {/* Report Q&A messages */}
              {qaMessages.length > 0 && (
                <div className="space-y-3 animate-fade-up" aria-live="polite">
                  {qaMessages.map((message, index) => {
                    const isUser = message.role === 'user'
                    const isLatestAssistant = !isUser && index === qaMessages.length - 1
                    const shouldAnimate = isLatestAssistant && !completedQaIds.has(index)

                    return (
                      <div
                        key={`${message.role}-${index}`}
                        className={isUser
                          ? 'ml-8 rounded-2xl rounded-tr-sm border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 to-emerald-600/20 px-4 py-2.5 text-[13px] leading-relaxed text-[#f1f3f4] shadow-md'
                          : 'mr-3 rounded-2xl rounded-tl-sm border border-white/10 bg-[#1e2026] p-4 text-[13px] leading-relaxed text-[#d2d6dc] shadow-md'}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {!isUser && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                              <Sparkles size={12} />
                            </div>
                          )}
                          <span className="block font-mono text-[10.5px] uppercase tracking-wider text-emerald-400 font-semibold">
                            {isUser ? 'You' : 'Artha Copilot'}
                          </span>
                          {!isUser && shouldAnimate && (
                            <span className="flex gap-1 ml-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] leading-relaxed text-[#d2d6dc]">
                          {isUser ? (
                            <p>{message.text}</p>
                          ) : (
                            <TypewriterMessage
                              text={message.text}
                              shouldAnimate={shouldAnimate}
                              onTypingDone={() => {
                                setCompletedQaIds((prev) => new Set(prev).add(index))
                              }}
                            />
                          )}
                        </div>
                        {message.followUp && (
                          <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-[#fbbc04]">
                            This asks for information outside the completed report; a fresh research run is needed for a current answer.
                          </p>
                        )}
                        {message.sources?.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
                            {message.sources.slice(0, 4).map((source, sourceIndex) => (
                              <a
                                key={`${source.title || 'source'}-${sourceIndex}`}
                                href={source.url || undefined}
                                target={source.url ? '_blank' : undefined}
                                rel={source.url ? 'noreferrer' : undefined}
                                className="max-w-full truncate rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-emerald-400 hover:text-white"
                              >
                                {source.title || 'Source'}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Thinking / Auditing card during Report Q&A */}
              {askingReport && (
                <div className="mr-3 rounded-2xl border border-emerald-500/30 bg-[#1e2026] p-4 shadow-lg animate-fade-up">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      <Sparkles size={13} className="animate-spin" />
                    </div>
                    <span className="text-[12px] font-bold text-white">Artha AI Copilot</span>
                    <span className="flex gap-1 ml-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-300">Auditing report evidence &amp; calculating verified answer...</p>
                  <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-400 animate-pulse" style={{ width: '75%' }} />
                  </div>
                </div>
              )}

              <div ref={chatScrollRef} />
            </div>
          </div>

          {/* Studio Chat Input Bar */}
          {!running && !submitting ? (
            <div className="flex flex-col border-t border-white/10 bg-[#16181e]/95 backdrop-blur-xl shrink-0 z-10">
              <div className="w-full max-w-4xl mx-auto px-2 sm:px-6">
                <StudioChatInputBar
                  value={followupText}
                  onValueChange={setFollowupText}
                  onSubmit={handleSubmit}
                  running={running || askingReport || isGenerating}
                  inputRef={inputRef}
                  placeholder={
                    isDone
                      ? 'Ask about this report (e.g. PE, risks, horizon)...'
                      : 'Ask about any stock or financial concept...'
                  }
                />
              </div>
            </div>
          ) : (
            <div className="studio-running-status-bar flex items-center justify-between px-4 py-2.5 border-t border-white/10 bg-[#14161b]/95 text-xs text-slate-400 shrink-0 z-10">
              <div className="w-full max-w-4xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-medium truncate">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="truncate">Auditing... 11 specialists analyzing filings</span>
                </div>
                <button
                  type="button"
                  disabled
                  className="text-[11px] font-mono text-slate-500 shrink-0 cursor-not-allowed opacity-70"
                >
                  Auditing...
                </button>
              </div>
            </div>
          )}
        </section>
        ) : (
          <section className="studio-report-pane flex flex-1 flex-col bg-[#14161b] overflow-y-auto w-full p-3 sm:p-6 scroll-slim">
            <div className="w-full max-w-5xl mx-auto space-y-4 pb-28 sm:pb-32">
              <ReportPreview
                jobId={currentJobId}
                job={job}
                pdfUrl={pdfUrl}
                initialMode={researchMode}
                onModeChange={setResearchMode}
                onStartResearch={onStartResearch}
                onAskMoreAboutReport={handleSwitchToChat}
              />
            </div>
            {/* Floating action button on PC and mobile to quickly jump back to chat */}
            <button
              type="button"
              onClick={handleSwitchToChat}
              className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-black px-4 py-2.5 sm:px-5 sm:py-3 shadow-[0_4px_24px_rgba(16,185,129,0.5)] border border-emerald-300/40 text-xs sm:text-[13px] font-bold hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Chat with Artha Copilot about this report"
              aria-label="Chat with Artha Copilot about this report"
            >
              <Sparkles size={15} className="text-black animate-pulse" />
              <span>Ask Copilot →</span>
            </button>
          </section>
        )}
      </div>

      {toast && (
        <div className="studio-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {showPdfModal && (
        <PdfViewerModal
          jobId={currentJobId}
          pdfUrl={pdfUrl}
          onClose={() => setShowPdfModal(false)}
          onSwitchToReport={() => {
            setShowPdfModal(false)
            setActiveView('report')
          }}
          hasReport={Boolean(job?.report)}
        />
      )}

      {/* Active Research Back Navigation Guard Warning */}
      {showLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-500/40 bg-[#16181e] p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.7)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Sparkles size={22} className="animate-pulse" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-white tracking-tight">
                  Artha AI is actively working!
                </h3>
                <p className="text-[11.5px] text-emerald-400 font-mono">
                  Autonomous Multi-Agent Diligence
                </p>
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-slate-300">
              Please stay with us — your institutional report is getting generated! 
              Our 11 autonomous specialist agents are auditing regulatory filings, calculating deterministic valuation metrics, and stress-testing operational risks.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLeaveWarning(false)
                  setPendingAction(null)
                }}
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 px-4 text-center text-[13px] font-bold text-white shadow-lg shadow-emerald-500/25 hover:brightness-110 active:scale-95 transition cursor-pointer"
              >
                Stay in Workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLeaveWarning(false)
                  if (pendingAction === 'new') onNewResearch?.()
                  else onBackToStart?.()
                  setPendingAction(null)
                }}
                className="rounded-xl border border-white/10 bg-white/5 py-2.5 px-4 text-center text-[12.5px] font-medium text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                Go to Home anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
