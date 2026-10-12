import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  Sparkles,
  Layers,
  BarChart3,
  TrendingUp,
  Cpu
} from 'lucide-react'

export default function StudioWaitCarousel({ running = true }) {
  const [currentIdx, setCurrentIdx] = useState(1) // center card focused

  const cards = [
    {
      id: 0,
      title: 'Beginner Mode & Plain-English Gauges',
      description: 'Switch between dense institutional multiples and accessible plain-English takeaways. Two clear gauges answer business health and pricing without financial jargon.',
      tag: 'New Feature',
      gradient: 'from-[#4285f4] via-[#9b72cb] to-[#ea4335]'
    },
    {
      id: 1,
      title: 'Deterministic Grounding: Zero Arbitrary Scores',
      description: 'Stock Research computes ratios from available inputs and shows missing data as gaps. Verify important claims against the original sources.',
      tag: 'Audited Reliability',
      gradient: 'from-[#ea4335] via-[#fbbc04] to-[#34a853]'
    },
    {
      id: 2,
      title: 'Adversarial Catalyst Reconciler',
      // Describes the mechanism only. This card renders while any query is
      // loading, so naming specific companies or figures here would assert
      // findings about a run that has not produced any yet.
      description: 'A dedicated adversarial agent argues the downside. Disclosed upside drivers are set directly against concentration, leverage and contingent-liability risk, and conflicts between the two are surfaced rather than averaged away.',
      tag: 'Risk Reconciled',
      gradient: 'from-[#34a853] via-[#4285f4] to-[#9b72cb]'
    }
  ]

  // Auto-rotate every 5 seconds if running
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % cards.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [running, cards.length])

  const handlePrev = () => {
    setCurrentIdx((prev) => (prev - 1 + cards.length) % cards.length)
  }

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % cards.length)
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-4 text-center max-w-2xl mx-auto animate-fade-up">
      <span className="text-[12px] font-mono text-[#9aa0a6] uppercase tracking-wider mb-1">
        Generating Equity Research
      </span>
      <h2 className="text-2xl sm:text-3xl font-normal text-white tracking-tight font-sans">
        Enjoy these insights while you wait
      </h2>

      {/* 3D-styled Carousel Container */}
      <div className="relative mt-8 sm:mt-12 w-full flex items-center justify-center min-h-[340px]">
        {/* Navigation Arrow Left */}
        <button
          type="button"
          onClick={handlePrev}
          className="absolute left-0 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#1e2026] text-[#bdc1c6] shadow-xl transition hover:bg-white/15 hover:text-white"
          aria-label="Previous tip"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Carousel Cards */}
        <div className="w-full max-w-md px-4">
          {cards.map((card, idx) => {
            const isCurrent = idx === currentIdx
            if (!isCurrent) return null

            return (
              <div
                key={card.id}
                className="relative rounded-2xl border border-white/10 bg-[#1e2026] p-8 shadow-2xl transition-all duration-500 text-center animate-fade-up"
              >
                {/* 3D Glowing Neon Icon Illustration */}
                <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
                  <div
                    className={`absolute inset-0 rounded-2xl bg-gradient-to-tr ${card.gradient} opacity-30 blur-xl animate-pulse`}
                  />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-tr from-white/10 to-white/5 backdrop-blur-md shadow-2xl text-white">
                    {idx === 0 && <Sparkles size={36} className="text-[#8ab4f8]" />}
                    {idx === 1 && <Shield size={36} className="text-[#fbbc04]" />}
                    {idx === 2 && <TrendingUp size={36} className="text-[#34a853]" />}
                  </div>
                </div>

                <span className="inline-block rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10.5px] font-mono text-[#8ab4f8] mb-3">
                  {card.tag}
                </span>

                <h3 className="text-[17px] font-semibold text-white mb-2.5">
                  {card.title}
                </h3>

                <p className="text-[13px] leading-relaxed text-[#9aa0a6]">
                  {card.description}
                </p>
              </div>
            )
          })}
        </div>

        {/* Navigation Arrow Right */}
        <button
          type="button"
          onClick={handleNext}
          className="absolute right-0 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#1e2026] text-[#bdc1c6] shadow-xl transition hover:bg-white/15 hover:text-white"
          aria-label="Next tip"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Dot Indicators */}
      <div className="mt-6 flex items-center justify-center gap-1.5">
        {cards.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIdx(idx)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === currentIdx ? 'w-6 bg-[#4285f4]' : 'w-1.5 bg-white/20 hover:bg-white/40'
            }`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
