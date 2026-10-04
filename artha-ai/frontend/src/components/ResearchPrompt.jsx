import { useEffect, useRef } from 'react'
import { ArrowUpRight, Sparkles, Loader2, CornerDownLeft } from 'lucide-react'

export default function ResearchPrompt({ onRun, running, submitting, query, onQueryChange }) {
  const areaRef = useRef(null)

  useEffect(() => {
    const el = areaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }
  }, [query])

  const submit = (event) => {
    event?.preventDefault()
    if (query.trim() && !running) onRun(query.trim())
  }

  const suggestions = [
    { label: "What about Infosys's current situation?", query: "What about Infosys's current situation?" },
    { label: "Compare TCS and Infosys on valuation", query: "Compare TCS and Infosys on valuation" },
    { label: "Reliance debt & retail expansion", query: "What is Reliance Industries debt and retail growth posture?" },
    { label: "Is Tata Motors undervalued today?", query: "Is Tata Motors cheap at current price and margin levels?" },
  ]

  return (
    <div className="w-full">
      {/* Google AI Studio Rotating RGB Neon Glow Box */}
      <div className="rgb-glow-wrapper w-full">
        <div className="rgb-glow-ambient" />
        <form onSubmit={submit} className="relative z-10 flex flex-col rounded-[18px] bg-[#1e2026] p-4 shadow-2xl transition focus-within:bg-[#16181d]">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/5 text-[11px] font-mono text-[#9aa0a6]">
            <span className="flex items-center gap-1.5 text-[#8ab4f8] font-semibold">
              <Sparkles size={14} /> YOUR INVESTMENT QUESTION
            </span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[#9aa0a6]">
              DYNAMIC CONCURRENT PIPELINE
            </span>
          </div>

          <textarea
            id="research-query"
            ref={areaRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) submit(e)
            }}
            rows={2}
            placeholder="Describe an investment question or company... e.g. What about Infosys's current situation?"
            disabled={running}
            className="mt-2.5 w-full resize-none bg-transparent text-[14px] sm:text-[15px] text-[#f1f3f4] placeholder-[#5f6368] focus:outline-none scroll-slim leading-relaxed"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#9aa0a6]">
              <CornerDownLeft size={13} />
              <span>Enter to research <span className="hidden sm:inline">· Shift + Enter for new line</span></span>
            </span>

            <button
              type="submit"
              disabled={!query.trim() || running}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4285f4] to-[#1a73e8] px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
            >
              {running ? (
                <>
                  <Loader2 size={16} className="animate-spin text-white" />
                  <span>{submitting ? 'Submitting…' : 'Researching…'}</span>
                </>
              ) : (
                <>
                  <span>Start research</span>
                  <ArrowUpRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Quick Suggestion Chips */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {suggestions.map((item, idx) => (
          <button
            key={idx}
            type="button"
            disabled={running}
            onClick={() => {
              onQueryChange(item.query)
              areaRef.current?.focus()
            }}
            className="rounded-full border border-white/10 bg-[#181a1f] px-3.5 py-1.5 text-[11.5px] text-[#bdc1c6] transition hover:border-[#4285f4]/50 hover:bg-[#4285f4]/10 hover:text-[#8ab4f8] disabled:opacity-40"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
