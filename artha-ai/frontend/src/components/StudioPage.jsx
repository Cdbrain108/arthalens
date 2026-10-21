import { useState, useRef, useEffect } from 'react'
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
import ResearchProcessGraph from './ResearchProcessGraph'
import ReportPreview from './ReportPreview'
import Sidebar from './Sidebar'
import PdfViewerModal from './PdfViewerModal'
import Logo from './Logo'
import ArthaCopilot from './ArthaCopilot'
import CopilotMarkdown from './CopilotMarkdown'
import { api } from '../api/client'
import { persistReportPdfToStorage, saveChatQuery } from '../storage/chatSessions'
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

function ConversationalCopilot({ messages = [], onAction, user, onOpenAuth }) {
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

            {/* Suggestions on the latest assistant turn (fade in after typing completes) */}
            {isLatestAssistant && hasFinishedTyping && isLoggedIn && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
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
  pdfUrl,
  user,
  onToggleSidebar,
  onOpenAuth,
  onLogout,
  onViewPdf,
  onShare,
}) {
  const resolved = (entities || []).map((e) => e.name || e.ticker).filter(Boolean)
  const workspaceTitle = isConversational
    ? 'Artha AI Copilot'
    : resolved.length === 1
    ? `${resolved[0]} Research`
    : resolved.length > 1
    ? `${resolved.join(' vs ')}`
    : 'Artha AI Workspace'

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

      {/* Center: Perfectly Centered Sleek Indicator Pill (Argus-style) */}
      <div className="flex items-center justify-center min-w-0 flex-1 px-1 sm:px-2 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-[#16181e]/90 px-2.5 py-1 max-w-[155px] sm:max-w-[320px] shadow-[0_2px_12px_rgba(0,0,0,0.4)] backdrop-blur-md">
          <Logo size={14} className="shrink-0" />
          <span className="truncate text-[11px] sm:text-[13px] font-bold text-white tracking-tight">
            {workspaceTitle}
          </span>
          <span className="hidden sm:inline-flex rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-mono text-emerald-400 shrink-0">
            {isConversational ? 'Copilot' : 'Multi-Agent'}
          </span>
        </div>
      </div>

      {/* Right: Actions (Clean cluster, zero collision on mobile) */}
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

        {pdfUrl && isStockQuery && (
          <button
            type="button"
            onClick={onViewPdf}
            className="hidden sm:flex h-8 sm:h-9 items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25 cursor-pointer active:scale-95"
            title="View Institutional Research Report PDF In-App"
          >
            <FileText size={13} />
            <span className="hidden lg:inline">PDF</span>
          </button>
        )}

        <button
          type="button"
          onClick={user?.guest ? onOpenAuth : onLogout}
          title={user?.guest ? "Sign in to persist research history" : `Signed in as ${user?.name || user?.email || 'User'} · Click to sign out`}
          className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#22c55e] to-[#16a34a] text-[11px] font-bold text-white shadow hover:ring-2 hover:ring-white/20 transition cursor-pointer active:scale-95"
        >
          {(user?.name || user?.email || 'U').trim().charAt(0).toUpperCase()}
        </button>
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#9aa0a6] transition hover:bg-white/10 hover:text-white"
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
            title={running ? 'Researching…' : 'Send'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-all duration-200 ${
              hasText && !running
                ? 'bg-gradient-to-tr from-emerald-500 to-emerald-600 text-black font-bold shadow-[0_4px_16px_-2px_rgba(16,185,129,0.5)] hover:brightness-110 hover:scale-105 active:scale-95 cursor-pointer'
                : 'bg-white/5 text-[#5f6368] cursor-not-allowed'
            }`}
          >
            {running ? <Square size={12} className="animate-pulse text-emerald-400" /> : <ArrowUp size={16} strokeWidth={2.5} />}
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
  const [rightTab, setRightTab] = useState('preview')
  const [mobilePane, setMobilePane] = useState(() => (job?.report || job?.status === 'succeeded' ? 'report' : 'chat'))
  const [viewMode, setViewMode] = useState('report') // 'report' | 'copilot'
  const [qaMessages, setQaMessages] = useState([])
  const [askingReport, setAskingReport] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [toast, setToast] = useState('')
  const chatScrollRef = useRef(null)
  const inputRef = useRef(null)

  const isDone = job?.status === 'succeeded'
  const activeQuery = job?.query || query || ''
  const canAskReport = isDone && Boolean(job?.job_id) && typeof onAskReport === 'function'
  const isLoggedIn = Boolean(user && !user.guest && user.uid && !String(user.uid).startsWith('guest_'))
  const currentJobId = job?.job_id || sessions?.find((s) => s.job_id && !s.job_id.startsWith('chat_'))?.job_id || null
  const pdfUrl = currentJobId ? api.pdfUrl(currentJobId) : null

  // Reset viewMode and Q&A messages on new job, switch to report pane on mobile when report is ready
  useEffect(() => {
    setQaMessages([])
    setViewMode('report')
    if (job?.report || job?.status === 'succeeded') {
      setMobilePane('report')
    }
  }, [job?.job_id, job?.report, job?.status])

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

  // Sidebar nav targets. The landing page anchors live on the landing route, so
  // anything other than 'chat' has to leave the studio first.
  const handleNavSelect = (section) => {
    setSidebarOpen(false)
    if (section === 'chat') return
    onBackToStart?.()
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
      return [
        { id: 'u_init', role: 'user', text: activeQuery },
        {
          id: 'a_init',
          role: 'assistant',
          text: getCopilotResponse(activeQuery, user),
          suggestions: getFollowupSuggestions(activeQuery),
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
      setCopilotMessages([
        { id: `u_${Date.now()}`, role: 'user', text: activeQuery },
        {
          id: `a_${Date.now() + 1}`,
          role: 'assistant',
          text: getCopilotResponse(activeQuery, user),
          suggestions: getFollowupSuggestions(activeQuery),
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
    setIsGenerating(true)
    setGenerationStep(0)
    saveChatQuery(text, user?.uid)
    requestAnimationFrame(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' }))

    const type = detectQueryType(text)
    const effectiveUser = user || { uid: 'local_active', name: 'Researcher', guest: false }

    setTimeout(() => setGenerationStep(1), 450)
    setTimeout(() => setGenerationStep(2), 950)

    setTimeout(() => {
      setIsGenerating(false)
      if (type === 'conversational') {
        const aId = `a_${Date.now()}`
        const reply = getCopilotResponse(text, effectiveUser)
        const suggestions = getFollowupSuggestions(text)
        setCopilotMessages((prev) => [
          ...prev,
          { id: aId, role: 'assistant', text: reply, suggestions },
        ])
      } else {
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
      }
      requestAnimationFrame(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' }))
    }, 1500)
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const q = followupText.trim()
    if (!q || running || askingReport || isGenerating) return

    setFollowupText('')
    if (canAskReport) {
      setQaMessages((messages) => [...messages, { role: 'user', text: q }])
      setAskingReport(true)
      try {
        const response = await onAskReport(job.job_id, q)
        setQaMessages((messages) => [...messages, {
          role: 'assistant',
          text: response.answer || 'The report did not return an answer.',
          sources: response.sources || [],
          followUp: response.follow_up_research_needed,
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
          onNewResearch?.()
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
        onBackToStart={onBackToStart}
        onNewResearch={onNewResearch}
        running={running}
        pdfUrl={pdfUrl}
        user={user}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenAuth={onOpenAuth}
        onLogout={onLogout}
        onViewPdf={() => setShowPdfModal(true)}
        onShare={handleShare}
      />

      {/* 2-column split workspace (stacks into tabs on mobile) */}
      <div className="studio-split flex flex-1 overflow-hidden">

        {/* ══ LEFT COLUMN: Chat & Agent Stream ══ */}
        {/* Width, border and the mobile show/hide of `data-active` are owned by
            responsive.css — Tailwind width utilities here fought with it. */}
        <section
          data-active={String(mobilePane === 'chat')}
          className="studio-left-pane flex flex-col bg-[#181a1f] overflow-hidden"
        >
          <div className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-5 space-y-4 scroll-slim scroll-smooth">

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

            {/* 1. Conversational / Copilot Mode OR Fresh Workspace without active job */}
            {isConversational || (!job?.selected_agents?.length && !running && !isDone) ? (
              <div className={`space-y-4 flex flex-col ${copilotMessages.length <= 1 && !running && !submitting && !isGenerating ? 'flex-1 justify-center my-auto' : ''}`}>
                {/* Copilot Overview Hero Card */}
                {copilotMessages.length <= 1 && !running && !submitting && !isGenerating && (
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
                  />
                )}

                {/* Active Generation Thinking Card in Thread */}
                {isGenerating && (
                  <div className="studio-generating-card rounded-2xl border border-emerald-500/40 bg-gradient-to-tr from-[#161f1a] to-[#121722] p-4 shadow-xl space-y-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-400 to-teal-500 shadow-md">
                          <Sparkles size={14} className="text-black animate-spin" />
                        </div>
                        <span className="text-[12px] font-bold text-white">Artha AI Copilot</span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10.5px] font-mono text-emerald-400 font-semibold shadow-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Reasoning
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[12px] text-slate-300">
                      <span className="flex gap-1 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span className="truncate">
                        {generationStep === 0 && 'Analyzing query intent & financial terminology...'}
                        {generationStep === 1 && 'Auditing valuation multiples, balance sheets & SEC filings...'}
                        {generationStep >= 2 && 'Synthesizing deterministic mathematical intelligence...'}
                      </span>
                    </div>

                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="studio-shimmer-bar h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: generationStep === 0 ? '38%' : generationStep === 1 ? '72%' : '96%' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 2. Stock Multi-Agent Research Stream */
              <div className="space-y-4">
                {/* User Prompt Card */}
                <div className="rounded-2xl border border-white/15 bg-[#1e2026] p-4 shadow-md text-left animate-fade-up">
                  <p className="text-[14px] sm:text-[15px] font-medium text-[#f1f3f4] leading-relaxed">{activeQuery}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(job?.entities || []).map((e, i) => (
                      <span
                        key={`${e.ticker || e.name || 'entity'}-${i}`}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono text-emerald-400"
                      >
                        {e.exchange ? `${e.exchange}: ` : ''}
                        {e.ticker || e.name || 'Unresolved'}
                      </span>
                    ))}

                    {job?.intent && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#9aa0a6]">
                        {INTENT_LABEL[job.intent] || job.intent}
                      </span>
                    )}

                    {job?.selected_agents != null && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#9aa0a6]">
                        {job.selected_agents.length}{' '}
                        {job.selected_agents.length === 1 ? 'Agent' : 'Agents'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Live Agent Execution Stream */}
                <div className="rounded-2xl border border-white/10 bg-[#131518]/60 p-3.5 shadow-inner">
                  <LiveAgentStream
                    job={job}
                    query={activeQuery}
                    running={running}
                    isDone={isDone}
                    onSelectPrompt={onStartResearch}
                  />
                </div>
              </div>
            )}

            {/* Follow-up Copilot Messages in Stock Research View */}
            {!isConversational && copilotMessages.length > 1 && (
              <div className="space-y-3 pt-1">
                <ConversationalCopilot
                  messages={copilotMessages.slice(1)}
                  onAction={handleCopilotAction}
                  user={user}
                  onOpenAuth={onOpenAuth}
                />
              </div>
            )}

            {/* 3. Live Animated Generation Thinking Card (Always visible when pipeline, QA, or Copilot is generating) */}
            {(running || submitting || askingReport || isGenerating) && (
              <div className="studio-generating-card rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-[#161f1a] to-[#121722] p-4 shadow-xl text-left space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-400 to-teal-500 shadow-md">
                      <Sparkles size={18} className="text-black animate-spin" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-white truncate">
                          {askingReport
                            ? 'Auditing dossier for answers...'
                            : isGenerating || isConversational
                            ? 'Artha AI Copilot is reasoning...'
                            : 'Synthesizing Institutional Research...'}
                        </span>
                        <span className="flex gap-1 shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                        {askingReport
                          ? 'Cross-referencing verified metrics and citations from completed report'
                          : isGenerating
                          ? generationStep === 0
                            ? 'Analyzing query intent & financial terminology...'
                            : generationStep === 1
                            ? 'Auditing valuation multiples, balance sheets & SEC filings...'
                            : 'Synthesizing deterministic mathematical intelligence...'
                          : job?.current_node
                          ? `Executing node: ${job.current_node.replace(/_/g, ' ')}`
                          : 'Orchestrating 11 autonomous specialists across SEC filings, valuation & momentum'}
                      </p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-mono text-emerald-400 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Active
                  </span>
                </div>
                {/* Animated shimmer progress bar */}
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="studio-shimmer-bar h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: isGenerating
                        ? generationStep === 0
                          ? '38%'
                          : generationStep === 1
                          ? '72%'
                          : '96%'
                        : '85%'
                    }}
                  />
                </div>
              </div>
            )}

            {/* 4. Report Q&A messages */}
            {qaMessages.length > 0 && (
              <div className="space-y-3 animate-fade-up" aria-live="polite">
                {qaMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={message.role === 'user'
                      ? 'ml-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12.5px] leading-relaxed text-[#f1f3f4]'
                      : 'mr-3 rounded-xl border border-white/10 bg-[#1e2026] p-3 text-[12.5px] leading-relaxed text-[#d2d6dc]'}
                  >
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                      {message.role === 'user' ? 'You' : 'Report answer'}
                    </span>
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    {message.followUp && (
                      <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-[#fbbc04]">
                        This asks for information outside the completed report; a fresh research run is needed for a current answer.
                      </p>
                    )}
                    {message.sources?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
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
                ))}
              </div>
            )}

            <div ref={chatScrollRef} />
          </div>

          {/* Studio Chat Input Bar — docked at the bottom for standard chatbot UX */}
          <div className="flex flex-col border-t border-white/10 bg-[#181a1f]/95 backdrop-blur-xl">
            {isDone && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/5 bg-[#14161b] text-[11.5px]">
                <div className="flex items-center gap-2 text-emerald-400 min-w-0">
                  <Sparkles size={13} className="shrink-0" />
                  <span className="truncate text-slate-300 font-medium">
                    Evidence dossier &amp; PDF attached · Ask anything about this report
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('copilot')
                    setMobilePane('report')
                  }}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition shrink-0 cursor-pointer"
                >
                  <span>Open Deep Q&A</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
            <StudioChatInputBar
              value={followupText}
              onValueChange={setFollowupText}
              onSubmit={handleSubmit}
              running={running || askingReport || isGenerating}
              inputRef={inputRef}
              placeholder={
                isDone
                  ? 'Ask anything about this report, test assumptions, valuation...'
                  : copilotMessages.length <= 1
                  ? 'Ask anything: PE ratio, compare stocks, DCF...'
                  : 'Ask follow-up, test assumptions, request DCF...'
              }
            />
          </div>
        </section>

        {/* ══ RIGHT COLUMN: Preview / Artha Copilot ══ */}
        <section
          id="studio-report-pane"
          data-active={String(mobilePane === 'report')}
          className="studio-right-pane flex flex-1 flex-col bg-[#131518] overflow-hidden"
        >
          {isDone && viewMode === 'copilot' ? (
            <ArthaCopilot
              job={job}
              pdfUrl={pdfUrl}
              onBackToReport={() => setViewMode('report')}
              onAskReport={onAskReport}
              user={user}
            />
          ) : (
            <>
              {/* Right Pane Tab Bar — scrolls horizontally rather than
                  squeezing labels on narrow screens. */}
              <div className="studio-pane-tabs flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#181a1f] px-3 sm:px-6">
                <div
                  className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scroll-slim"
                  role="group"
                  aria-label="Report views"
                  tabIndex={0}
                >
                  <button
                    type="button"
                    onClick={() => setRightTab('preview')}
                    aria-pressed={rightTab === 'preview'}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                      rightTab === 'preview'
                        ? 'bg-white/15 text-white shadow-sm border border-white/20'
                        : 'text-[#9aa0a6] hover:text-white'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4]" />
                    <span>Report Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('pdf')}
                    aria-pressed={rightTab === 'pdf'}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                      rightTab === 'pdf'
                        ? 'bg-emerald-500/25 text-emerald-300 shadow-sm border border-emerald-500/40'
                        : 'text-[#9aa0a6] hover:text-white'
                    }`}
                  >
                    <FileText size={13} className="text-emerald-400" />
                    <span>In-App PDF Dossier</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('graph')}
                    aria-pressed={rightTab === 'graph'}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                      rightTab === 'graph'
                        ? 'bg-white/15 text-white shadow-sm border border-white/20'
                        : 'text-[#9aa0a6] hover:text-white'
                    }`}
                  >
                    <Layers size={13} />
                    <span>Pipeline Flow</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('data')}
                    aria-pressed={rightTab === 'data'}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                      rightTab === 'data'
                        ? 'bg-white/15 text-white shadow-sm border border-white/20'
                        : 'text-[#9aa0a6] hover:text-white'
                    }`}
                  >
                    <Code2 size={13} />
                    <span>Specialist Data</span>
                  </button>
                  {isDone && (
                    <button
                      type="button"
                      onClick={() => setViewMode('copilot')}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                    >
                      <Sparkles size={13} className="text-emerald-400" />
                      <span>Ask Artha Copilot</span>
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3 text-[#9aa0a6]">
                  <span className="hidden lg:inline text-[11px] font-mono text-[#bdc1c6]">
                     {isDone ? 'Evidence audit complete' : running ? 'Synthesizing...' : 'Report ready'}
                  </span>
                  <button
                    type="button"
                    className="hidden sm:block hover:text-white transition p-1"
                    title="Fullscreen"
                    aria-label="Fullscreen"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              {/* Right Pane Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-8 scroll-slim scroll-smooth">
                {rightTab === 'pdf' ? (
                  isDone && pdfUrl ? (
                    <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-[#0d0e12] min-h-[680px]">
                      <div className="flex items-center justify-between p-3.5 border-b border-white/10 bg-[#181a1f]">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-emerald-400" />
                          <span className="text-[13px] font-bold text-white">Institutional PDF Dossier Preview</span>
                          <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                            In-App View
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowPdfModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 text-slate-200 border border-white/15 text-xs font-semibold hover:bg-white/15 transition cursor-pointer"
                            title="Open full interactive PDF dossier modal"
                          >
                            <Maximize2 size={13} />
                            <span>In-App Viewer</span>
                          </button>
                          <a
                            href={pdfUrl}
                            download={`ArthaLens_${activeQuery || 'Research'}.pdf`}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/30 transition cursor-pointer"
                          >
                            <Download size={13} />
                            <span className="hidden sm:inline">Download</span>
                          </a>
                        </div>
                      </div>
                      <div className="w-full flex-1 min-h-[620px] bg-[#1e2026] relative">
                        <object
                          data={pdfUrl}
                          type="application/pdf"
                          className="w-full h-full min-h-[620px] border-none"
                        >
                          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-300 gap-3 min-h-[460px] my-auto">
                            <FileText size={38} className="text-emerald-400" />
                            <p className="font-semibold text-base text-white">Institutional PDF Dossier Ready</p>
                            <p className="text-xs text-slate-400 max-w-sm">
                              Preview the complete high-resolution research brief directly in our interactive in-app viewer.
                            </p>
                            <div className="flex gap-2.5 mt-2">
                              <button
                                type="button"
                                onClick={() => setShowPdfModal(true)}
                                className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs shadow-md hover:brightness-110 cursor-pointer"
                              >
                                Open Interactive Dossier
                              </button>
                              <a
                                href={pdfUrl}
                                download={`ArthaLens_${activeQuery || 'Research'}.pdf`}
                                className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white font-medium text-xs hover:bg-white/15 cursor-pointer"
                              >
                                Download PDF
                              </a>
                            </div>
                          </div>
                        </object>
                      </div>
                    </div>
                  ) : (
                    <div className="my-auto flex flex-col items-center justify-center min-h-[460px] text-center max-w-lg mx-auto animate-fade-up">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 mb-5 shadow-lg border border-emerald-500/25">
                        <FileText size={30} />
                      </div>
                      <h3 className="text-xl font-bold text-white tracking-tight">Institutional PDF Dossier</h3>
                      <p className="mt-2 text-[13px] text-[#9aa0a6] leading-relaxed">
                        {running
                          ? 'Auditing specialist evidence and generating institutional PDF dossier with source citations...'
                          : 'Launch research on any company to generate and preview the institutional PDF dossier with dual-thesis analysis.'}
                      </p>
                      {!running && (
                        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                          {[
                            { label: 'Reliance 5-Year Thesis', query: 'Should I hold Reliance for 5 years?' },
                            { label: 'TCS vs Infosys Multiples', query: 'Compare TCS and Infosys on valuation & margins' },
                          ].map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onStartResearch(item.query)}
                              className="rounded-xl border border-white/10 bg-[#1e2026] p-3 text-left text-[12px] font-medium text-[#bdc1c6] transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-white"
                            >
                              {item.label} →
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : rightTab === 'graph' ? (
                  job ? (
                    <div className="my-auto flex flex-col items-center justify-center min-h-[500px]">
                      <ResearchProcessGraph job={job} running={running || !isDone} isDone={isDone} />
                    </div>
                  ) : (
                    <div className="my-auto flex flex-col items-center justify-center min-h-[460px] text-center max-w-lg mx-auto animate-fade-up">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4285f4]/15 text-[#8ab4f8] mb-5 shadow-lg border border-[#4285f4]/25">
                        <Layers size={30} />
                      </div>
                      <h3 className="text-xl font-bold text-white tracking-tight">Autonomous Multi-Agent Graph</h3>
                      <p className="mt-2 text-[13px] text-[#9aa0a6] leading-relaxed">
                        Visual topology of the 11 parallel specialist agents dispatched across fundamental health, valuation, technical momentum, and evidence auditing.
                      </p>
                    </div>
                  )
                ) : rightTab === 'preview' ? (
                  <div className="max-w-4xl mx-auto">
                    <ReportPreview
                      jobId={job?.job_id}
                      job={job}
                      pdfUrl={pdfUrl}
                      initialMode={researchMode}
                      onModeChange={setResearchMode}
                      onStartResearch={onStartResearch}
                      onAskMoreAboutReport={() => setViewMode('copilot')}
                    />
                  </div>
                ) : (
              <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-[#1e2026] p-6 text-left font-mono text-[12px] text-[#bdc1c6] space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className="font-bold text-white">Pipeline Execution State</span>
                  <span className="text-[#8ab4f8]">{job?.job_id}</span>
                </div>
                <pre className="overflow-x-auto text-[11px] text-[#8ab4f8] bg-black/40 p-4 rounded-xl">
                  {/* Real job state only. This panel reads as a debug dump, so a
                      hardcoded value here is more misleading than anywhere else:
                      it used to inject quality_score '8/9' and grounding '66.7%'
                      alongside the genuine fields. Scores live on the report. */}
                  {JSON.stringify(
                    {
                      job_id: job?.job_id ?? null,
                      query: activeQuery,
                      status: job?.status ?? null,
                      current_node: job?.current_node || null,
                      intent: job?.intent || null,
                      entities: job?.entities ?? [],
                      selected_agents: job?.selected_agents ?? [],
                      completed_agents: job?.completed_agents ?? [],
                      failed_agents: job?.failed_agents ?? [],
                      errors: job?.errors ?? []
                    },
                    null,
                    2
                  )}
                </pre>
                <p className="text-[10.5px] text-[#9aa0a6]">
                  Quality score and evidence grounding are measured during validation and are shown
                  on the report, not here.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  </div>

  {/* Mobile-only pane switcher. Three explicit destinations, so a finished run
      never strands the agent stream behind a Copilot button. */}
  <div className="studio-mobile-tabs" role="group" aria-label="Workspace views">
    <button
      type="button"
      aria-pressed={mobilePane === 'chat'}
      onClick={() => setMobilePane('chat')}
      className="flex items-center justify-center gap-1.5 font-medium transition-all"
    >
      <Bot size={15} className={mobilePane === 'chat' ? 'text-emerald-400' : 'text-slate-400'} />
      <span>Copilot</span>
    </button>
    <button
      type="button"
      aria-pressed={mobilePane === 'report' && viewMode === 'report'}
      onClick={() => {
        setViewMode('report')
        setMobilePane('report')
      }}
      className="flex items-center justify-center gap-1.5 font-medium transition-all"
    >
      <FileText size={15} className={mobilePane === 'report' && viewMode === 'report' ? 'text-emerald-400' : 'text-slate-400'} />
      <span>Report</span>
    </button>
    {isDone && (
      <button
        type="button"
        aria-pressed={mobilePane === 'report' && viewMode === 'copilot'}
        onClick={() => {
          setViewMode('copilot')
          setMobilePane('report')
        }}
        className="flex items-center justify-center gap-1.5 font-medium transition-all"
      >
        <Sparkles size={15} className={mobilePane === 'report' && viewMode === 'copilot' ? 'text-emerald-400' : 'text-slate-400'} />
        <span>Deep Q&A</span>
      </button>
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
        />
      )}
    </div>
  )
}
