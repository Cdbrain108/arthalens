import { useState, useRef, useEffect } from 'react'
import { Sparkles, ArrowRight, CornerDownLeft, TrendingUp, ShieldCheck, Cpu } from 'lucide-react'

export default function LandingHero({ onRun, running, submitting, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`
    }
  }, [query])

  const submit = (e) => {
    e?.preventDefault()
    if (query.trim() && !running) {
      onRun(query.trim())
    }
  }

  const promptSuggestions = [
    { label: "What about Infosys's current situation?", query: "What about Infosys's current situation?" },
    { label: "Compare TCS and Infosys on valuation", query: "Compare TCS and Infosys on valuation" },
    { label: "Reliance debt & retail expansion", query: "What is Reliance Industries debt and retail growth posture?" },
    { label: "Is Tata Motors undervalued today?", query: "Is Tata Motors cheap at current price and margin levels?" },
  ]

  return (
    <div className="flex min-h-[90vh] flex-col items-center justify-center px-4 py-12 text-center animate-fade-up">
      {/* Sleek Header Branding */}
      <div className="mb-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1 text-[11px] font-mono tracking-wider text-muted">
        <span className="flex h-2 w-2 rounded-full bg-[#4285f4] animate-pulse" />
        ARTHAAI MULTI-AGENT EQUITY RESEARCH
      </div>

      {/* Main Headline — Google AI Studio Clean Typography */}
      <h1 className="max-w-3xl text-3xl font-normal tracking-tight text-white sm:text-5xl md:text-6xl font-sans">
        Explore the evidence with <span className="font-serif italic text-[#a5d99d]">Bullseye</span>
      </h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted sm:text-[16px]">
        Autonomous institutional research. Ask any company question and a roster of 9 specialist AI agents is routed to the ones it needs — to challenge, verify, and synthesize evidence.
      </p>

      {/* Google AI Studio Rotating RGB Neon Input Box */}
      <div className="relative mt-8 w-full max-w-2xl">
        {/* Rotating Conic Neon Glow Effect */}
        <div className="rgb-glow-wrapper">
          <div className="rgb-glow-ambient" />
          
          <form
            onSubmit={submit}
            className="relative z-10 flex flex-col rounded-[17px] bg-[#1e2026] p-3.5 shadow-2xl transition-all duration-300 focus-within:bg-[#16181d]"
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) submit(e)
              }}
              placeholder="Ask Bullseye about a company, ticker or investment question…"
              disabled={running}
              className="w-full resize-none bg-transparent px-2 text-[14px] sm:text-[15px] text-white placeholder-slate-500 focus:outline-none scroll-slim"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted">
                <CornerDownLeft size={13} />
                <span>Enter to research · Shift + Enter for new line</span>
              </span>

              <button
                type="submit"
                disabled={!query.trim() || running}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4285f4] to-[#1a73e8] px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
              >
                {running ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Launching agents...</span>
                  </>
                ) : (
                  <>
                    <span>Start research</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Quick Suggestion Pills underneath input */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {promptSuggestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(item.query)
                textareaRef.current?.focus()
              }}
              className="rounded-full border border-white/10 bg-[#181a1f] px-3 py-1.5 text-[12px] text-[#bdc1c6] transition hover:border-[#4285f4]/40 hover:bg-[#4285f4]/5 hover:text-[#8ab4f8]"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3 Value Pillars */}
      <div className="mt-14 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3 text-left">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4285f4]/10 text-[#4285f4] mb-2.5">
            <Cpu size={16} />
          </div>
          <h3 className="text-[13px] font-semibold text-white">6 Parallel Specialists</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Financials, valuation, market technicals, growth, news, and downside risk agents run simultaneously.
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 mb-2.5">
            <ShieldCheck size={16} />
          </div>
          <h3 className="text-[13px] font-semibold text-white">Zero Hallucinations</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Every metric is grounded in audited filings and live market feeds. Unsupported claims are classified as evidence gaps.
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 mb-2.5">
            <TrendingUp size={16} />
          </div>
          <h3 className="text-[13px] font-semibold text-white">Two-Tier Reports</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Instant toggle between plain-English executive summaries for beginners and dense institutional valuation models for experts.
          </p>
        </div>
      </div>
    </div>
  )
}
