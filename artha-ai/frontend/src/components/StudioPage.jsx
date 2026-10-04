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
  BookOpen
} from 'lucide-react'
import LiveAgentStream from './LiveAgentStream'
import ResearchProcessGraph from './ResearchProcessGraph'
import ReportPreview from './ReportPreview'
import Logo from './Logo'

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
  general: 'Fundamental Health'
}

// ─── Utility: detect if a query is stock/finance related ────────────────────
function detectQueryType(q = '') {
  const s = q.toLowerCase().trim()

  // Pure conversational / greetings
  const conversationalPhrases = [
    'hi', 'hello', 'hey', 'greetings', 'help', 'who are you',
    'what can you do', 'good morning', 'good afternoon', 'good evening',
    'how are you', 'what is your name', 'tell me about yourself',
    'what do you do', 'can you help', 'thanks', 'thank you', 'bye', 'goodbye'
  ]
  if (conversationalPhrases.some(p => s === p || s.startsWith(p + ' ') || s.startsWith(p + '?') || s.startsWith(p + '!'))) {
    return 'conversational'
  }
  // Very short with no financial context
  if (s.split(' ').length <= 2 && !s.match(/nse|bse|stock|share|equity|rupe|price|nifty|sensex|₹|\$|pe|roe|eps|cagr/)) {
    return 'conversational'
  }

  // Stock / financial signals
  const stockSignals = [
    'stock', 'share', 'equity', 'invest', 'buy', 'sell', 'hold', 'portfolio',
    'market', 'nse', 'bse', 'sensex', 'nifty', 'valuation', 'pe ratio', 'price',
    'revenue', 'profit', 'loss', 'earnings', 'dividend', 'fundamental', 'technical',
    'tcs', 'infosys', 'infy', 'reliance', 'wipro', 'hdfc', 'icici', 'sbi',
    'tata', 'bajaj', 'hcl', 'roe', 'eps', 'cagr', 'debt', 'margin',
    'compare', 'vs', 'versus', 'sector', 'industry', 'midcap', 'largecap',
    'smallcap', 'bluechip', 'ipo', 'demat', 'broker', '₹', 'rupee', 'lakh', 'crore'
  ]
  if (stockSignals.some(sig => s.includes(sig))) {
    return 'stock'
  }

  // Default to conversational if nothing matches
  return 'conversational'
}

// ─── Conversational AI Reply suggestions ──────────────────────────────────────
const COPILOT_SUGGESTIONS = [
  { icon: TrendingUp, label: 'Analyze TCS fundamentals', color: '#4285f4' },
  { icon: BarChart2, label: 'Compare Infosys vs Wipro', color: '#34a853' },
  { icon: Search, label: 'Should I hold Reliance for 5 years?', color: '#fbbc04' },
  { icon: BookOpen, label: 'Explain PE ratio simply', color: '#ea4335' },
]

// ─── Conversational response card ─────────────────────────────────────────────
function getCopilotResponse(rawQuery = '', user) {
  const q = (rawQuery || '').trim()
  const qLower = q.toLowerCase().trim()
  const userName = (user?.name || '').trim()

  // 1. Name introduction — "my name is ak", "i am ak", "i'm ak", "call me ak"
  const nameMatch = qLower.match(/^(?:my name is|i am|i'm|im|call me|this is)\s+([a-zA-Z][a-zA-Z .]{0,30})/)
  if (nameMatch) {
    const saidName = nameMatch[1].trim().replace(/[?.!]+$/, '')
    const display = saidName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    return `Nice to meet you, **${display}!** I'm **Bullseye**, a stock research aid. Ask about a company or compare two tickers to get started.`
  }

  // 2. Creator / maker — handles typo "creater" too
  if (/(creater|creator|created|who made|who built|who developed|built you|made you|developed you|your founder|your maker|your developer|your team|your company|your owner|behind you)/.test(qLower)) {
    return `I'm **Bullseye**, a research application using specialist tools and optional language models. The landing page shows the configured agent registry. Try *"Analyze TCS fundamentals"*.`
  }

  // 3. Identity
  if (qLower.includes('your name') || qLower.includes('who are you') || qLower === 'who r u') {
    return `I'm **Bullseye**, your stock research assistant. I collect evidence, check provenance and show gaps. Verify important claims against original sources. Try *"Compare Infosys vs Wipro"*.`
  }

  // 4. Capabilities
  if (qLower.includes('what can you do') || qLower.includes('tell me about yourself') || qLower.includes('your features') || qLower.includes('help me') || qLower === 'help' || qLower.includes('how do you work') || qLower.includes('what do you do')) {
    return `Here's what I do best:\n\n• **Deep-dive fundamental analysis** on any NSE/BSE company\n• **Side-by-side peer comparisons** (e.g. TCS vs Infosys)\n• **Investment thesis** — buy, hold or sell with evidence\n• **Simplified explainers** for PE, ROE, DCF, margins\n\nJust type a company question below — like *"Should I hold Reliance for 5 years?"*`
  }

  // 5. How are you
  if (qLower.includes('how are you') || qLower.includes('how r u') || qLower.includes("how's it going") || qLower.includes('how are u')) {
    return `Ready for your next question. Provider availability is checked during research. Try *"Analyze Infosys results"*.`
  }

  // 6. Thanks
  if (/(thank you|thanks|thankyou|dhanyavad|shukriya|great|awesome|nice)/.test(qLower)) {
    return `Anytime${userName ? `, **${userName}**` : ''}! 🙌\n\nIf that helped, let's go deeper — pick a stock:\n• *"Analyze TCS fundamentals"*\n• *"Compare Infosys vs Wipro"*`
  }

  // 7. Bye
  if (/^(bye|goodbye|see you|good night|goodnight|alvida)/.test(qLower)) {
    return `See you soon${userName ? `, **${userName}**` : ''}! 👋\n\nI'll keep the agents warmed up for your next research question.`
  }

  // 8. Time-of-day greetings
  if (/(good morning|good afternoon|good evening|namaste|sat sri akal|ram ram)/.test(qLower)) {
    return `Namaste${userName ? `, **${userName}**` : ''}! I'm **Bullseye**. What's on your watchlist today? Try *"Research TCS"*.`
  }

  // 9. Plain hi/hello/hey
  if (['hi', 'hello', 'hey', 'hey there', 'hii', 'hiii', 'hello there', 'greetings'].some(g => qLower === g || qLower.startsWith(g + ' ') || qLower.startsWith(g + '!') || qLower.startsWith(g + ','))) {
    return `Hello${userName ? `, **${userName}**` : ''}! I'm **Bullseye**. Explore company research, comparisons and opposing perspectives. This is a research aid, not financial advice. Try *"Research TCS"* or *"Compare AAPL and MSFT"*.`
  }

  // 10. Contextual fallback — echo the actual query so it never feels "fixed"
  const short = q.length > 90 ? q.slice(0, 90) + '…' : q
  return `Got it — you said *"${short}"*. 💡\n\nI'm tuned for **Indian equity research**, so I don't have a canned answer for that chit-chat yet.\n\nBut I can help you turn it into research:\n• *"Should I invest in TCS?"*\n• *"Compare HDFC Bank vs ICICI Bank"*\n• *"Explain Infosys's business model"*\n\nOr ask me *"What can you do?"* / *"Who are you?"*`
}

function ConversationalCopilot({ query, onStartResearch, user }) {
  const [typedText, setTypedText] = useState('')
  const [isDone, setIsDone] = useState(false)

  const userName = user?.name
  useEffect(() => {
    setTypedText('')
    setIsDone(false)
    let i = 0
    const plain = getCopilotResponse(query, { name: userName })
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedText(plain)
      setIsDone(true)
      return undefined
    }
    const timer = setInterval(() => {
      if (i < plain.length) {
        // type 2 chars per tick for snappier feel
        setTypedText(plain.slice(0, i + 2))
        i += 2
      } else {
        setIsDone(true)
        clearInterval(timer)
      }
    }, 8)
    return () => clearInterval(timer)
  }, [query, userName])

  // Simple markdown-ish renderer
  const renderText = (text) => {
    return text.split('\n').map((line, idx) => {
      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
      return (
        <p key={idx} className="text-[13.5px] leading-relaxed text-[#e8eaed]"
          dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }} />
      )
    })
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* AI Response Bubble */}
      <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-[#4285f4] to-[#1a73e8]">
            <Bot size={14} className="text-white" />
          </div>
          <span className="text-[12px] font-semibold text-[#a5d99d]">Bullseye Copilot</span>
          {!isDone && (
            <span className="flex gap-0.5 ml-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4] animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
        <div className="space-y-1.5">{renderText(typedText)}</div>
        {!isDone && <span className="inline-block h-4 w-0.5 bg-[#4285f4] animate-pulse ml-0.5 mt-1" />}
      </div>

      {/* Quick action suggestions (shown after typing finishes) */}
      {isDone && (
        <div className="space-y-2 animate-fade-up">
          <p className="text-[11px] font-medium text-[#5f6368] uppercase tracking-wide px-1">Try a research query →</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COPILOT_SUGGESTIONS.map(({ icon: Icon, label, color }) => (
              <button
                key={label}
                onClick={() => onStartResearch(label)}
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-left text-[12.5px] text-[#bdc1c6] transition hover:bg-white/10 hover:text-white hover:border-white/20 group"
              >
                <Icon size={14} style={{ color }} className="shrink-0 group-hover:scale-110 transition-transform" />
                <span>{label}</span>
              </button>
            ))}
          </div>
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
}) {
  // Title names the securities the router resolved. It used to be two
  // hardcoded substring tests, so "Compare Infosys vs TCS" read as the
  // "Infosys Research Workspace" and every other company read as generic.
  const resolved = (entities || []).map((e) => e.name || e.ticker).filter(Boolean)
  const workspaceTitle = isConversational
    ? 'Bullseye Copilot'
    : resolved.length === 1
    ? `${resolved[0]} Research Workspace`
    : resolved.length > 1
    ? `${resolved.join(' vs ')} — Comparison Workspace`
    : 'Equity Research Workspace'
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#181a1f] px-4 sm:px-6 z-20">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBackToStart}
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-[#f1f3f4] transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={14} />
          <span>Back to start</span>
        </button>
        <div className="hidden sm:flex items-center gap-2 text-[12.5px] font-mono text-[#9aa0a6]">
          <span>/</span>
          <span className="text-[#8ab4f8] font-medium truncate max-w-[280px]">
            {activeQuery || 'Bullseye Research'}
          </span>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2">
        <Logo size={27} />
        <span className="truncate max-w-[340px] text-[13.5px] font-medium text-[#f1f3f4]">
          {workspaceTitle}
        </span>
        <span className="rounded-full bg-[#4285f4]/15 px-2 py-0.5 text-[10.5px] font-mono text-[#8ab4f8]">
          {isConversational ? 'Chat Mode' : 'Multi-Agent'}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        {isStockQuery ? (
          <div className="flex items-center rounded-xl border border-white/15 bg-black/40 p-0.5">
            <button
              type="button"
              onClick={() => setResearchMode('beginner')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                researchMode === 'beginner' ? 'bg-[#4285f4] text-white shadow-sm' : 'text-[#9aa0a6] hover:text-[#f1f3f4]'
              }`}
            >
              Beginner
            </button>
            <button
              type="button"
              onClick={() => setResearchMode('expert')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                researchMode === 'expert' ? 'bg-[#fbbc04] text-slate-950 font-bold shadow-sm' : 'text-[#9aa0a6] hover:text-[#f1f3f4]'
              }`}
            >
              Expert
            </button>
          </div>
        ) : (
          <span className="rounded-full bg-[#4285f4]/15 px-2.5 py-1 text-[11px] font-mono font-medium text-[#8ab4f8] border border-[#4285f4]/25">
            Copilot Ready
          </span>
        )}

        <button
          type="button"
          onClick={onNewResearch}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11.5px] font-medium text-[#f1f3f4] transition hover:bg-white/10 disabled:opacity-40"
          title="Start new research"
        >
          <Sparkles size={13} className="text-[#4285f4]" />
          <span className="hidden sm:inline">New</span>
        </button>

        {pdfUrl && isStockQuery && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-white/20"
            title="Download institutional report PDF"
          >
            <Download size={13} />
            <span className="hidden sm:inline">PDF</span>
          </a>
        )}

        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#9aa0a6] transition hover:text-white"
          title="Share session"
        >
          <Share2 size={14} />
        </button>

        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-[#4285f4] to-[#1a73e8] text-[11px] font-bold text-white shadow ml-1">
          {(user?.name || 'U').trim().charAt(0).toUpperCase()}
        </span>
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
    <div className="border-t border-white/10 bg-[#181a1f]/85 backdrop-blur-xl p-3">
      <div className="relative group">
        {/* Aurora glow — lights up only on focus-within */}
        <div className="pointer-events-none absolute -inset-[2px] rounded-[16px] bg-gradient-to-r from-[#4285f4]/60 via-[#9b72cb]/50 to-[#34a853]/50 opacity-0 blur-lg transition-opacity duration-300 group-focus-within:opacity-100" />
        <div className="pointer-events-none absolute -inset-px rounded-[15px] bg-gradient-to-r from-[#4285f4]/30 via-transparent to-[#9b72cb]/30 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100" />

        <form
          onSubmit={onSubmit}
          className="relative flex items-center gap-1.5 rounded-[14px] border border-white/15 bg-[#1e2026]/95 px-2.5 py-2 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.8)] transition-all duration-200 hover:border-white/25 focus-within:border-[#4285f4]/60 focus-within:bg-[#16181d] focus-within:shadow-[0_0_0_1px_rgba(66,133,244,0.35),0_10px_40px_-10px_rgba(66,133,244,0.45)]"
        >
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#9aa0a6] transition hover:bg-white/10 hover:text-white"
            title="Add context"
          >
            <Plus size={16} />
          </button>

          <div className="relative flex-1 flex items-center">
            {!hasText && !running && (
              <Sparkles size={14} className="pointer-events-none absolute left-0 text-[#4285f4]/60" />
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
                ? 'bg-gradient-to-tr from-[#4285f4] to-[#1a73e8] text-white shadow-[0_4px_16px_-2px_rgba(66,133,244,0.7)] hover:brightness-110 hover:scale-105 active:scale-95'
                : 'bg-white/5 text-[#5f6368] cursor-not-allowed'
            }`}
          >
            {running ? <Square size={12} className="animate-pulse" /> : <ArrowUp size={16} strokeWidth={2.5} />}
          </button>
        </form>
      </div>

      <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] font-mono text-[#5f6368]">
        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>9 agents ready · Type freely — focus stays here · Enter to send</span>
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
  onStartResearch,
  onAskReport,
  onNewResearch,
  onBackToStart,
  user
}) {
  const [followupText, setFollowupText] = useState('')
  const [researchMode, setResearchMode] = useState('beginner')
  const [rightTab, setRightTab] = useState('preview')
  const [qaMessages, setQaMessages] = useState([])
  const [askingReport, setAskingReport] = useState(false)
  const chatScrollRef = useRef(null)
  const inputRef = useRef(null)

  const isDone = job?.status === 'succeeded'
  const activeQuery = job?.query || query || ''
  const canAskReport = isDone && Boolean(job?.job_id) && typeof onAskReport === 'function'

  useEffect(() => {
    setQaMessages([])
  }, [job?.job_id])

  // Auto-scroll on agent progress
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [job?.current_node, isDone])

  // Focus input on mount + refocus when research finishes (never steal while typing)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!running && !askingReport) inputRef.current?.focus()
  }, [running, askingReport])

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const q = followupText.trim()
    if (q && !running && !askingReport) {
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
        onStartResearch(q)
      }
      // Keep focus in the box after send — no more re-click needed
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
  // The four `qLower.includes('infosys' | 'tcs' | 'tata motors' | 'reliance')`
  // tests that used to live here asserted a ticker and exchange the pipeline
  // may never have resolved, and covered only those four companies.
  const pdfUrl = job?.job_id ? `/api/research/${encodeURIComponent(job.job_id)}/pdf` : null

  // NOTE: ChatInputBar + TopHeader now live outside this component as
  // StudioChatInputBar / StudioTopHeader so typing never remounts the <input>
  // and focus is preserved. See top of file.

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT A: CONVERSATIONAL — Full-width single chat (no split, no agents)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isConversational) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#131518] text-[#f1f3f4] font-sans antialiased">
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
        />

        {/* Full-width centered chat area */}
        <div className="flex flex-1 overflow-hidden justify-center">
          <div className="flex w-full max-w-2xl flex-col overflow-hidden">
            {/* Scrollable chat */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-5 scroll-slim">
              {/* User message bubble (right-aligned) */}
              <div className="flex justify-end animate-fade-up">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#4285f4]/20 border border-[#4285f4]/30 px-4 py-3">
                  <p className="text-[14px] font-medium text-[#f1f3f4] leading-relaxed">{activeQuery || 'Hello'}</p>
                </div>
              </div>

              {/* AI Response */}
              <ConversationalCopilot query={activeQuery} onStartResearch={onStartResearch} user={user} />

              <div ref={chatScrollRef} />
            </div>

            <StudioChatInputBar
              value={followupText}
              onValueChange={setFollowupText}
              onSubmit={handleSubmit}
              running={running}
              inputRef={inputRef}
              placeholder="Ask about any Indian stock, company, or financial concept..."
            />
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT B: STOCK RESEARCH — Split-pane (Left: Agent Stream, Right: Report)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#131518] text-[#f1f3f4] font-sans antialiased">
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
      />

      {/* 2-column split workspace */}
      <div className="flex flex-1 overflow-hidden">

        {/* ══ LEFT COLUMN: Chat & Agent Stream ══ */}
        <section className="flex w-full md:w-[420px] lg:w-[460px] shrink-0 flex-col border-r border-white/10 bg-[#181a1f] overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scroll-slim">

            {/* User Prompt Card */}
            <div className="rounded-2xl border border-white/15 bg-[#1e2026] p-4 shadow-md text-left animate-fade-up">
              <p className="text-[14px] sm:text-[15px] font-medium text-[#f1f3f4] leading-relaxed">{activeQuery}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {/* Ticker chips come from the securities the router actually
                    resolved. They used to be four hardcoded substring tests
                    (infosys/tcs/tata motors/reliance), which asserted a listing
                    venue the pipeline may never have resolved — and showed
                    nothing at all for every other company. */}
                {(job?.entities || []).map((e, i) => (
                  <span
                    key={`${e.ticker || e.name || 'entity'}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md border border-[#4285f4]/30 bg-[#4285f4]/10 px-2 py-0.5 text-[11px] font-mono text-[#8ab4f8]"
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

                {/* `?? ` not `|| ` — a genuine zero is falsy, and zero is a real
                    outcome here: conversational intent routes no agents. */}
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

            {qaMessages.length > 0 && (
              <div className="space-y-3 animate-fade-up" aria-live="polite">
                {qaMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={message.role === 'user'
                      ? 'ml-8 rounded-xl border border-[#4285f4]/25 bg-[#4285f4]/10 p-3 text-[12.5px] leading-relaxed text-[#f1f3f4]'
                      : 'mr-3 rounded-xl border border-white/10 bg-[#1e2026] p-3 text-[12.5px] leading-relaxed text-[#d2d6dc]'}
                  >
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[#8ab4f8]">
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
                            className="max-w-full truncate rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-[#8ab4f8] hover:text-white"
                          >
                            {source.title || 'Source'}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {askingReport && (
                  <div className="mr-3 flex items-center gap-2 rounded-xl border border-white/10 bg-[#1e2026] p-3 text-[11.5px] text-[#9aa0a6]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4285f4]" />
                    Checking the validated report evidence...
                  </div>
                )}
              </div>
            )}

            <div ref={chatScrollRef} />
          </div>

          <StudioChatInputBar
            value={followupText}
            onValueChange={setFollowupText}
            onSubmit={handleSubmit}
            running={running || askingReport}
            inputRef={inputRef}
            placeholder={canAskReport ? 'Ask a question about this report...' : 'Ask follow-up, test assumptions, request DCF...'}
          />
        </section>

        {/* ══ RIGHT COLUMN: Preview & Carousel ══ */}
        <section className="hidden md:flex flex-1 flex-col bg-[#131518] overflow-hidden">
          {/* Right Pane Tab Bar */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#181a1f] px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRightTab('preview')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                  rightTab === 'preview'
                    ? 'bg-white/15 text-white shadow-sm border border-white/20'
                    : 'text-[#9aa0a6] hover:text-white'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4]" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab('data')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                  rightTab === 'data'
                    ? 'bg-white/15 text-white shadow-sm border border-white/20'
                    : 'text-[#9aa0a6] hover:text-white'
                }`}
              >
                <Code2 size={13} />
                <span>Specialist Data</span>
              </button>
            </div>

            <div className="flex items-center gap-3 text-[#9aa0a6]">
              <span className="text-[11px] font-mono text-[#bdc1c6]">
                 {isDone ? 'Evidence audit complete' : running ? 'Synthesizing...' : 'Report ready'}
              </span>
              <button type="button" className="hover:text-white transition p-1" title="Fullscreen">
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* Right Pane Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 scroll-slim">
            {!isDone && job ? (
              <div className="my-auto flex flex-col items-center justify-center min-h-[500px]">
                <ResearchProcessGraph job={job} running={running || !isDone} isDone={isDone} />
              </div>
            ) : isDone && rightTab === 'preview' ? (
              <div className="max-w-4xl mx-auto">
                <ReportPreview
                  jobId={job?.job_id}
                  job={job}
                  pdfUrl={pdfUrl}
                  initialMode={researchMode}
                  onModeChange={setResearchMode}
                  onStartResearch={onStartResearch}
                />
              </div>
            ) : !job ? (
              <div className="my-auto flex flex-col items-center justify-center min-h-[460px] text-center max-w-lg mx-auto animate-fade-up">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4285f4]/15 text-[#8ab4f8] mb-5 shadow-lg border border-[#4285f4]/25">
                  <Sparkles size={30} />
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">Institutional Research Workspace</h3>
                <p className="mt-2 text-[13px] text-[#9aa0a6] leading-relaxed">
                   Enter a research question in the command bar below to trigger the configured specialist pipeline.
                </p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                  {[
                    { label: 'Analyze Reliance 5-yr view', query: 'Should I hold Reliance for 5 years?' },
                    { label: 'Compare TCS vs Infosys', query: 'Compare TCS and Infosys on valuation & margins' },
                    { label: 'Tata Motors balance sheet', query: 'Analyze Tata Motors balance sheet and debt' },
                    { label: 'HDFC Bank momentum', query: 'What is HDFC Bank market momentum and valuation?' },
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onStartResearch(item.query)}
                      className="rounded-xl border border-white/10 bg-[#1e2026] p-3 text-left text-[12px] font-medium text-[#bdc1c6] transition hover:border-[#4285f4]/50 hover:bg-[#4285f4]/10 hover:text-white"
                    >
                      {item.label} →
                    </button>
                  ))}
                </div>
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
        </section>
      </div>
    </div>
  )
}
