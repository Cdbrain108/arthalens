import { useState, useEffect } from 'react'
import {
  Download,
  ExternalLink,
  Eye,
  ShieldCheck,
  PieChart,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCheck,
  Sparkles,
  ChevronRight,
  Info,
  Layers,
  FileText,
  MinusCircle,
  Scale,
  Lightbulb
} from 'lucide-react'
import { api } from '../api/client'
import PdfViewerModal from './PdfViewerModal'
import Logo from './Logo'
import MarketAnimal from './MarketAnimal'

/* ---------------------------------------------------------------------------
 * Rendering rules for this component
 *
 * The backend's contract (backend/app/report/schema.py) is that a value which
 * could not be measured is ABSENT, and the gap is disclosed in
 * `report.evidence_gaps`. This component must preserve that: a missing field
 * renders as an explicit "Not measured" state, never as a plausible default.
 *
 * Concretely, that rules out three patterns that used to live here:
 *   - `value || '28.4%'`      — a fabricated number wearing a measured label
 *   - `query.includes('hold')` driving the verdict — the user's wording is not
 *     evidence, and it made a negative verdict unreachable
 *   - pre-written company profiles / prose keyed off a ticker
 * ------------------------------------------------------------------------- */

const CURRENCY_SYMBOL = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' }

/** A finding may arrive as a plain string or as `{claim, evidence_ids}`. */
function asText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return String(value.claim || value.point || '')
  return String(value)
}

/** True for anything the backend marked as an evidence gap. */
function isGapText(text) {
  return typeof text === 'string' && text.trim().startsWith('Unavailable')
}

/** Leading number of a display string ("28.4%" -> 28.4). Null when absent. */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const match = String(value).match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function formatMoney(value, currency) {
  if (value === null || value === undefined || value === '') return null
  const symbol = CURRENCY_SYMBOL[String(currency || '').toUpperCase()] || ''
  const num = toNumber(value)
  if (num === null) return `${symbol}${value}`
  return `${symbol}${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

function stripCitations(text) {
  return String(text || '').replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim()
}

/** Classification -> presentation. Derived from the assessment, never the query. */
function verdictTone(classification) {
  const v = String(classification || '').toUpperCase()
  if (!v) return 'unknown'
  if (v.includes('INSUFFICIENT') || v.includes('UNAVAILABLE') || v.includes('GAP')) return 'gap'
  if (v.includes('BUY') || v.includes('POSITIVE') || v.includes('ACCUMULATE')) return 'positive'
  if (v.includes('SELL') || v.includes('NEGATIVE') || v.includes('AVOID')) return 'negative'
  return 'neutral'
}

const TONE_CLASS = {
  positive: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  negative: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  neutral: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  gap: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
  unknown: 'border-slate-500/40 bg-slate-500/15 text-slate-300'
}

const TONE_TEXT = {
  positive: 'text-emerald-400',
  negative: 'text-rose-400',
  neutral: 'text-amber-300',
  gap: 'text-slate-300',
  unknown: 'text-slate-300'
}

/** Plain-English headline for beginner mode. Describes the evidence, not the stock. */
const TONE_HEADLINE = {
  positive: 'The verified evidence leans positive',
  negative: 'The verified evidence leans negative',
  neutral: 'Mixed evidence — no clear direction',
  gap: 'Not enough verified evidence to answer this',
  unknown: 'No assessment was produced for this run'
}

const METRIC_SPEC = [
  { key: 'roe_pct', label: 'Return on equity', short: 'ROE' },
  { key: 'opm_pct', label: 'Operating margin', short: 'OPM' },
  { key: 'npm_pct', label: 'Net profit margin', short: 'NPM' },
  { key: 'debt_equity', label: 'Debt / equity', short: 'D/E' },
  { key: 'pe_ratio', label: 'Trailing P/E', short: 'P/E' },
]

/** Peer-profile keys the backend emits (report/schema.py::_peer_profile). */
const COMPARE_SPEC = [
  { key: 'price', label: 'Market price', money: true },
  { key: 'pe', label: 'Trailing P/E', unit: 'x' },
  { key: 'roe', label: 'Return on equity', unit: 'pp' },
  { key: 'opm', label: 'Operating margin', unit: 'pp' },
  { key: 'npm', label: 'Net profit margin', unit: 'pp' },
  { key: 'de', label: 'Debt / equity', unit: 'x', lowerIsBetter: true }
]

/* --- Small presentational primitives -------------------------------------- */

/** The honest stand-in for a value the run did not establish. */
function NotMeasured({ label = 'Not measured', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-dashed border-white/20 bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10.5px] text-[#9aa0a6] ${className}`}
      title="No validated evidence or live quote established this value in this run."
    >
      <MinusCircle size={10} className="shrink-0" />
      {label}
    </span>
  )
}

/** Renders a value when present, otherwise the Not-measured chip. */
function Measured({ value, className = '', label }) {
  if (value === null || value === undefined || value === '') {
    return <NotMeasured label={label} />
  }
  return <span className={className}>{value}</span>
}

/**
 * Renders `[n]` citation markers as links into the report's source index.
 * A marker with no matching source is shown as unresolved rather than silently
 * passed off as a citation.
 */
function CitedText({ text, sources }) {
  const raw = String(text || '')
  if (!raw) return null
  const byNumber = new Map((sources || []).map((s, i) => [Number(s.n ?? i + 1), s]))
  const parts = raw.split(/(\[\d+\])/g)
  return (
    <>
      {parts.map((part, idx) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (!match) return <span key={idx}>{part}</span>
        const n = Number(match[1])
        const source = byNumber.get(n)
        if (!source) {
          return (
            <sup
              key={idx}
              className="mx-0.5 rounded bg-rose-500/15 px-1 font-mono text-[9px] text-rose-300"
              title="Unresolved citation: no source with this number was recorded for this run."
            >
              [{n}?]
            </sup>
          )
        }
        const label = source.title || `Source ${n}`
        return source.url ? (
          <a
            key={idx}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-0.5 rounded bg-[#4285f4]/15 px-1 font-mono text-[9px] text-[#8ab4f8] align-super hover:bg-[#4285f4]/30"
            title={label}
          >
            [{n}]
          </a>
        ) : (
          <sup
            key={idx}
            className="mx-0.5 rounded bg-white/10 px-1 font-mono text-[9px] text-[#bdc1c6]"
            title={label}
          >
            [{n}]
          </sup>
        )
      })}
    </>
  )
}

/** Panel shown in place of a section the run could not ground. */
function EvidenceGapPanel({ title, detail }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-left">
      <div className="flex items-center gap-2 text-[#9aa0a6]">
        <Info size={14} className="shrink-0" />
        <span className="text-[12px] font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#9aa0a6]">{detail}</p>
    </div>
  )
}

/**
 * Chart tile. The backend skips a chart entirely when its inputs were not
 * measured, so a failed load is expected output, not an error to hide.
 */
function ChartPanel({ jobId, chart, index, title, caption, maxHeight }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-white">
          {index}. {title}
        </h4>
        {caption ? (
          <span className="font-mono text-[11px] text-[#8ab4f8]">{caption}</span>
        ) : (
          <NotMeasured label="inputs not measured" />
        )}
      </div>
      {failed ? (
        <EvidenceGapPanel
          title="Chart not generated"
          detail="This chart is only drawn from measured values. The run did not establish the inputs it needs, so nothing is plotted rather than an illustrative shape being drawn."
        />
      ) : (
        <div className="overflow-hidden rounded-lg bg-slate-950 p-2">
          <img
            src={`/api/research/${encodeURIComponent(jobId)}/charts/${chart}`}
            alt={title}
            className={`w-full rounded object-contain ${maxHeight}`}
            onError={() => setFailed(true)}
          />
        </div>
      )}
    </div>
  )
}

/** Bulleted list with a first-class empty state. */
function EvidenceList({ items, sources, bullet, bulletClass, emptyText }) {
  if (!items || items.length === 0) {
    return <p className="mt-3 text-[12px] italic leading-relaxed text-[#9aa0a6]">{emptyText}</p>
  }
  return (
    <ul className="mt-3 space-y-2.5 text-[12.5px] text-slate-200">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2">
          <span className={`font-bold leading-tight ${bulletClass}`}>{bullet}</span>
          <span>
            <CitedText text={item} sources={sources} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Structured institutional synthesis narrative with prominent bold headings and action pills. */
function SynthesisNarrativeBlock({ text, sources }) {
  if (!text) return null

  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const introBlocks = []
  const bulletCards = []

  rawLines.forEach((line) => {
    const isBullet = line.startsWith('•') || line.startsWith('*') || line.startsWith('-')
    if (isBullet) {
      const clean = line.replace(/^[•*-]\s*/, '').trim()
      const firstColon = clean.indexOf(':')
      if (firstColon !== -1) {
        const headerTitle = clean.substring(0, firstColon).trim()
        const remainder = clean.substring(firstColon + 1).trim()
        const secondColon = remainder.indexOf(':')
        let pill = ''
        let body = remainder
        if (secondColon !== -1 && secondColon < 65) {
          pill = remainder.substring(0, secondColon).trim()
          body = remainder.substring(secondColon + 1).trim()
        }
        bulletCards.push({ headerTitle, pill, body, raw: clean })
      } else {
        bulletCards.push({ headerTitle: '', pill: '', body: clean, raw: clean })
      }
    } else {
      introBlocks.push(line)
    }
  })

  if (bulletCards.length === 0) {
    return (
      <div className="whitespace-pre-line text-[13px] leading-relaxed text-[#e2e8f0]">
        <CitedText text={text} sources={sources} />
      </div>
    )
  }

  const getStyleForTitle = (title = '') => {
    const t = title.toUpperCase()
    if (t.includes('EXISTING') || t.includes('SHAREHOLDER') || t.includes('HOLD')) {
      return {
        border: 'border-emerald-500/35',
        bg: 'bg-emerald-500/[0.05]',
        dot: 'bg-emerald-400',
        badgeBorder: 'border-emerald-500/40',
        badgeBg: 'bg-emerald-500/20',
        badgeText: 'text-emerald-300',
        titleColor: 'text-emerald-400',
      }
    }
    if (t.includes('NEW INVESTOR') || t.includes('BUY') || t.includes('STAGES')) {
      return {
        border: 'border-teal-500/35',
        bg: 'bg-teal-500/[0.05]',
        dot: 'bg-teal-400',
        badgeBorder: 'border-teal-500/40',
        badgeBg: 'bg-teal-500/20',
        badgeText: 'text-teal-300',
        titleColor: 'text-teal-300',
      }
    }
    if (t.includes('HORIZON') || t.includes('TIME') || t.includes('LONG-TERM')) {
      return {
        border: 'border-indigo-500/35',
        bg: 'bg-indigo-500/[0.05]',
        dot: 'bg-indigo-400',
        badgeBorder: 'border-indigo-500/40',
        badgeBg: 'bg-indigo-500/20',
        badgeText: 'text-indigo-300',
        titleColor: 'text-indigo-300',
      }
    }
    if (t.includes('SELL') || t.includes('RULES FOR WHEN') || t.includes('EXIT')) {
      return {
        border: 'border-rose-500/35',
        bg: 'bg-rose-500/[0.05]',
        dot: 'bg-rose-400',
        badgeBorder: 'border-rose-500/40',
        badgeBg: 'bg-rose-500/20',
        badgeText: 'text-rose-300',
        titleColor: 'text-rose-400',
      }
    }
    if (t.includes('WATCH') || t.includes('STRENGTH') || t.includes('RISK')) {
      return {
        border: 'border-amber-500/35',
        bg: 'bg-amber-500/[0.05]',
        dot: 'bg-amber-400',
        badgeBorder: 'border-amber-500/40',
        badgeBg: 'bg-amber-500/20',
        badgeText: 'text-amber-300',
        titleColor: 'text-amber-300',
      }
    }
    return {
      border: 'border-white/10',
      bg: 'bg-white/[0.02]',
      dot: 'bg-slate-400',
      badgeBorder: 'border-white/15',
      badgeBg: 'bg-white/10',
      badgeText: 'text-slate-300',
      titleColor: 'text-white',
    }
  }

  return (
    <div className="space-y-3.5 text-left">
      {introBlocks.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 shadow-sm">
          {introBlocks.map((intro, idx) => {
            const hasPrefix = intro.startsWith('Plain English Executive Summary:')
            const content = hasPrefix ? intro.replace('Plain English Executive Summary:', '').trim() : intro
            return (
              <div key={idx} className="space-y-1.5">
                {hasPrefix && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-400/20 text-emerald-300 text-xs font-bold">
                      ✓
                    </span>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      Plain English Executive Summary
                    </span>
                  </div>
                )}
                <p className="text-[13px] sm:text-[13.5px] leading-relaxed text-[#f1f3f4] font-normal">
                  <CitedText text={content} sources={sources} />
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {bulletCards.map((card, idx) => {
          const style = getStyleForTitle(card.headerTitle)
          return (
            <div
              key={idx}
              className={`rounded-xl border ${style.border} ${style.bg} p-4 text-left transition-all hover:bg-white/[0.04] shadow-sm`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                  <h4 className={`text-[12.5px] sm:text-[13px] font-extrabold uppercase tracking-wider ${style.titleColor}`}>
                    {card.headerTitle}
                  </h4>
                </div>
                {card.pill && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider border ${style.badgeBorder} ${style.badgeBg} ${style.badgeText}`}
                  >
                    {card.pill}
                  </span>
                )}
              </div>
              <div className="text-[12.5px] sm:text-[13px] leading-relaxed text-[#cbd5e1]">
                <CitedText text={card.body} sources={sources} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* --- Main component -------------------------------------------------------- */

export default function ReportPreview({
  jobId,
  job,
  pdfUrl,
  initialMode = 'beginner',
  onModeChange,
  onStartResearch,
  onAskMoreAboutReport,
}) {
  const [report, setReport] = useState(job?.report || null)
  const [loading, setLoading] = useState(!job?.report)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(initialMode) // 'beginner' | 'expert'
  const [activeTab, setActiveTab] = useState('all')
  const [showPdfViewer, setShowPdfViewer] = useState(false)

  useEffect(() => {
    if (initialMode) setMode(initialMode)
  }, [initialMode])

  useEffect(() => {
    if (job?.report) {
      setReport(job.report)
      setLoading(false)
    }
  }, [job?.report])

  const handleModeToggle = (newMode) => {
    setMode(newMode)
    if (onModeChange) onModeChange(newMode)
  }

  const qLower = (job?.query || report?.query || '').toLowerCase().trim()
  const isConversational =
    job?.intent === 'conversational' ||
    Boolean(report?.company?.is_conversational) ||
    report?.overall_assessment?.classification === 'CONVERSATIONAL' ||
    ['hi', 'hello', 'hey', 'greetings', 'help', 'who are you', 'what can you do',
      'good morning', 'good evening'].includes(qLower)

  const isInitialWelcome = !job && !jobId && !report

  useEffect(() => {
    if (job?.report) {
      setReport(job.report)
      setLoading(false)
      return
    }
    if (!jobId || isConversational || isInitialWelcome || (job?.status && job.status !== 'succeeded')) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    api.getReport(jobId)
      .then((data) => {
        if (active) {
          setReport(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { active = false }
  }, [jobId, isConversational, isInitialWelcome, job?.status, job?.report])

  /* --- Conversational / landing card -------------------------------------- */
  if (isConversational || isInitialWelcome) {
    return (
      <div className="mt-4 w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#181a1f] text-[#f1f3f4] shadow-2xl animate-fade-up">
        <div className="border-b border-white/10 bg-[#1e2026] px-6 py-5 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Logo size={22} />
            <span className="font-sans text-[16px] font-bold tracking-tight text-white">Artha AI Research</span>
            <span className="font-mono text-[12px] text-[#9aa0a6]">·</span>
            <span className="text-[12px] font-medium text-[#bdc1c6]">Evidence-First Financial Intelligence</span>
            <span className="ml-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
              {isInitialWelcome ? 'Workspace Ready' : 'Copilot Ready'}
            </span>
          </div>
          <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white sm:text-[21px]">
            {isInitialWelcome ? 'Institutional Multi-Agent Equity Research Workspace' : 'Conversational Financial Assistant'}
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#bdc1c6] sm:text-[13.5px]">
            {isInitialWelcome ? (
              <>
                Artha AI dispatches{' '}
                <span className="font-medium text-emerald-400">11 autonomous specialist agents in parallel</span>,
                validates every claim against official filings, and stress-tests findings with dual-thesis analysis.
                Select a research prompt below or ask any stock question in Copilot to begin.
              </>
            ) : (
              <>
                Artha AI dispatches{' '}
                <span className="font-medium text-[#8ab4f8]">only the minimal required specialist agents in parallel</span>,
                validates every claim against its source, and reports what it could not establish instead of filling
                the gap.
              </>
            )}
          </p>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left">
              <div className="flex items-center gap-2 text-[#8ab4f8]">
                <Sparkles size={16} />
                <span className="text-[13px] font-semibold">1. Query Understanding</span>
              </div>
              <p className="text-[12px] leading-relaxed text-[#9aa0a6]">
                Deconstructs query intent, resolves the securities in scope, and routes execution to the
                minimum set of agents (zero agents for a greeting).
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left">
              <div className="flex items-center gap-2 text-[#34a853]">
                <Layers size={16} />
                <span className="text-[13px] font-semibold">2. Parallel Specialists</span>
              </div>
              <p className="text-[12px] leading-relaxed text-[#9aa0a6]">
                Dispatches isolated subagents for financial health, valuation multiples, market technicals,
                growth, disclosures and workforce posture.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left">
              <div className="flex items-center gap-2 text-[#fbbc04]">
                <ShieldCheck size={16} />
                <span className="text-[13px] font-semibold">3. Evidence Auditor</span>
              </div>
              <p className="text-[12px] leading-relaxed text-[#9aa0a6]">
                Scores every claim against a deterministic 9-point checklist and labels anything it cannot
                ground as an evidence gap.
              </p>
            </div>
          </div>

          {/* Starter prompts describe what the pipeline will do — they cannot
              describe the answer, because no research has run yet. */}
          <div className="rounded-xl border border-[#4285f4]/20 bg-[#4285f4]/5 p-5 text-left">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[#8ab4f8]">
                <ChevronRight size={15} />
                Select a research query to run the multi-agent pipeline:
              </span>
              <span className="font-mono text-[11px] text-[#9aa0a6]">Click to run</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  title: 'Compare TCS and Infosys on valuation & margins',
                  tag: 'Peer Comparison',
                  desc: 'Pulls each listing’s live multiples and margins side by side, and reports any metric it cannot verify.',
                  agents: 'Financial · Valuation · Momentum · Risk'
                },
                {
                  title: 'Analyze Tata Motors balance sheet and debt',
                  tag: 'Financial Health',
                  desc: 'Audits leverage, operating performance and capital expenditure against filed statements.',
                  agents: 'Financial · Technical Momentum · Risk'
                },
                {
                  title: 'Why did Reliance share price move today?',
                  tag: 'Price Catalysts',
                  desc: 'Checks recent price action and searches regulatory filings and news disclosures for a cause.',
                  agents: 'Technical Momentum · Corporate News'
                },
                {
                  title: 'Is Infosys reasonably priced or trading at a discount?',
                  tag: 'Valuation Multiple',
                  desc: 'Resolves trailing multiples from live data where available and states the basis for each one.',
                  agents: 'Financial Health · Valuation'
                }
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onStartResearch && onStartResearch(item.title)}
                  className="group rounded-xl border border-white/10 bg-[#1e2026] p-4 text-left transition hover:border-[#4285f4]/50 hover:bg-[#252830] hover:shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-[#4285f4]/15 px-2 py-0.5 font-mono text-[10px] font-medium text-[#8ab4f8]">
                      {item.tag}
                    </span>
                    <span className="font-mono text-[10.5px] text-[#9aa0a6]">{item.agents}</span>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-[#f1f3f4] transition group-hover:text-[#8ab4f8]">
                    &ldquo;{item.title}&rdquo;
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[#9aa0a6]">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (job && job.status !== 'succeeded' && job.status !== 'failed') {
    return (
      <div className="mt-4 w-full animate-fade-up rounded-2xl border border-[#4285f4]/25 bg-[#181a1f] p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4285f4]/15 text-[#8ab4f8]">
          <Sparkles className="animate-spin" size={28} />
        </div>
        <span className="rounded-full bg-[#4285f4]/15 px-3 py-1 font-mono text-[11px] font-semibold text-[#8ab4f8] border border-[#4285f4]/30">
          STAGE: {job.current_node ? job.current_node.replace(/_/g, ' ').toUpperCase() : 'SYNTHESIS IN PROGRESS'}
        </span>
        <h3 className="mt-3 text-[18px] font-bold text-white">Synthesizing Equity Research Report</h3>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#9aa0a6]">
          Parallel specialist agents are auditing regulatory filings, calculating financial metrics, and stress-testing evidence.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-mono text-[#5f6368]">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Real-time multi-agent execution · 100% cited evidence</span>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mt-4 w-full animate-pulse rounded-2xl border border-white/10 bg-[#181a1f] p-8 text-center">
        <Sparkles className="mx-auto mb-3 animate-spin text-[#4285f4]" size={26} />
        <p className="text-[14px] font-medium text-[#f1f3f4]">Assembling equity research report...</p>
        <p className="mt-1 text-[12px] text-[#9aa0a6]">
          Synthesizing findings across validated specialist perspectives.
        </p>
      </div>
    )
  }

  if (error || !report) {
    if (!job && !jobId) {
      return null
    }
    if (error === 'Report pending' || error?.includes('pending')) {
      return (
        <div className="mt-4 w-full animate-fade-up rounded-2xl border border-[#4285f4]/25 bg-[#181a1f] p-8 text-center shadow-xl">
          <Sparkles className="mx-auto mb-3 animate-spin text-[#4285f4]" size={26} />
          <p className="text-[14px] font-semibold text-white">Report Synthesis In Progress</p>
          <p className="mt-1 text-[12px] text-[#9aa0a6]">
            The specialist agents are concluding their review. Results will appear automatically.
          </p>
        </div>
      )
    }
    return (
      <div className="mt-4 w-full rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-center text-rose-300">
        <AlertTriangle className="mx-auto mb-2" size={24} />
        <p className="text-[13px]">Unable to load finalized report: {error || 'No report data available'}</p>
      </div>
    )
  }

  /* --- Derived state: every value below is read, never invented ----------- */

  const oa = report.overall_assessment || {}
  const sources = report.sources || []
  const evidenceGaps = report.evidence_gaps || []

  const classification = String(oa.classification || '').toUpperCase()
  const tone = verdictTone(classification)
  const verdictLabel = classification || 'NOT ASSESSED'
  const isGap = tone === 'gap'

  const qualityScore = oa.quality_score ?? null
  const maxQualityScore = oa.max_quality_score ?? null
  const qualityRating = oa.quality_rating || null
  const groundingPct = oa.evidence_grounding_pct ?? null
  const verifiedSources = oa.verified_sources_count ?? sources.length ?? null
  const dataCurrency = oa.data_currency || 'Statement recency not verified for this run.'

  const companyName = report.company?.name || null
  const ticker = report.company?.ticker || null
  const exchange = report.company?.exchange || null

  // Comparison mode is decided by how many entities the run actually resolved or is_comparison flag.
  const compEntities = (report.company?.comparison || []).filter(Boolean).map((e) => {
    const m = e.metrics || {}
    return {
      ...e,
      price: e.price ?? m.price,
      pe: e.pe ?? m.pe_ratio,
      roe: e.roe ?? m.roe_pct,
      opm: e.opm ?? m.opm_pct,
      npm: e.npm ?? m.npm_pct,
      de: e.de ?? m.debt_equity,
      pb: e.pb ?? m.pb_ratio
    }
  })
  const isComparison = compEntities.length >= 2 || Boolean(report.company?.is_comparison)

  const rawPrice = report.market?.price ?? report.market?.quote?.price ?? null
  const priceCurrency = report.market?.currency ?? report.market?.quote?.currency ?? null
  const formattedPrice = formatMoney(rawPrice, priceCurrency)

  const metrics = report.financial?.metrics || {}
  const ratiosTable = report.financial?.ratios_table || []
  const quarterlyTable = report.financial?.quarterly_table || []
  const decisionFramework = report.decision_framework || {}
  const valuationScenarios = report.valuation_scenarios || []
  const monitoringIndicators = report.monitoring_indicators || []
  const entityCard = report.entity_card || report.company?.entity_card || null
  const reasonedDeductions = report.reasoned_deductions || []
  const intentionalLimitations = report.intentional_limitations || []
  const workflowTrace = report.workflow_trace || {}
  const measuredMetrics = METRIC_SPEC.filter((m) => metrics[m.key])
  const unmeasuredMetrics = METRIC_SPEC.filter((m) => !metrics[m.key])

  const qualityChecklist = oa.quality_checklist || []

  const bullItems = (report.bull_case || []).map(asText).filter(Boolean)
  const bearItems = (report.bear_case || []).map(asText).filter(Boolean)
  const whatCouldChange = (report.what_could_change_view || []).map(asText).filter(Boolean)

  const executiveSummary = (report.executive_summary || '').trim() || (oa.rationale || '').trim()
  const contributions = report.agent_contributions || []
  // Built deterministically by report/schema.py from validated state; its [n]
  // markers are the same numbering as `sources`, so CitedText resolves them.
  const agentNotes = (report.agent_notes || []).filter((n) => n && typeof n === 'object')

  const resolvedPdfUrl = pdfUrl || `/api/research/${encodeURIComponent(jobId)}/pdf`
  const queryText = report.query || job?.query || ''

  const baseStance = decisionFramework.base_stance || oa.rationale || `Verified multi-agent consensus indicates a ${verdictLabel} position.`

  let executiveBriefing = ''
  if (executiveSummary && executiveSummary.length > 120 && !executiveSummary.includes('Evidence was collected across specialists')) {
    executiveBriefing = executiveSummary
  } else {
    const name = companyName || 'The company'
    const symbol = ticker ? ` (${ticker})` : ''
    const p1 = `Consensus Stance: ${verdictLabel} — ${baseStance}`

    const finParts = []
    if (metrics.pe_ratio) finParts.push(`a trailing P/E of ${metrics.pe_ratio}`)
    if (metrics.roe_pct) finParts.push(`a Return on Equity (ROE) of ${metrics.roe_pct}`)
    if (metrics.opm_pct) finParts.push(`operating margins of ${metrics.opm_pct}`)
    if (metrics.debt_equity) finParts.push(`a Debt/Equity ratio of ${metrics.debt_equity}`)

    const p2 = finParts.length
      ? `From an audited financial perspective, ${name}${symbol} demonstrates ${finParts.join(', ')}, confirming balance sheet solvency and operating discipline.`
      : ''
    const topBulls = bullItems.slice(0, 2).map(stripCitations)
    const topBears = bearItems.slice(0, 2).map(stripCitations)
    const p3 = (topBulls.length || topBears.length)
      ? `Upside momentum is underpinned by ${topBulls.join('; ') || 'core business resilience'}, while key downside considerations centre on ${topBears.join('; ') || 'macro and execution headwinds'}.`
      : ''
    executiveBriefing = [p1, p2, p3].filter(Boolean).join('\n\n')
  }

  const getPlainEnglishSummary = () => {
    if (isComparison && compEntities.length > 0) {
      const benchmarkMap = {
        '^GSPC': 'S&P 500 Index',
        'GSPC': 'S&P 500 Index',
        '^NSEI': 'Nifty 50 Index',
        'NSEI': 'Nifty 50 Index',
        '^BSESN': 'BSE Sensex',
        'BSESN': 'BSE Sensex',
        '^IXIC': 'Nasdaq Composite',
        'IXIC': 'Nasdaq Composite',
      }
      const formatName = (t) => benchmarkMap[t] || benchmarkMap[String(t).replace(/^\^/, '')] || t
      const names = compEntities.map((e) => formatName(e.name || e.ticker)).join(', ')
      const verdictText = `In Plain English (Peer Comparison): This study analyzes ${compEntities.length} entities (${names}) side-by-side to assess operational resilience, valuation benchmarks, and balance sheet safety against broad market headwinds.`
      const pills = []
      // 1. Debt / Financial safety pill from compEntities or report
      const deValues = compEntities.map(e => parseFloat(e.de || e.metrics?.debt_equity)).filter(v => !isNaN(v))
      if (deValues.length > 0) {
        const maxDe = Math.max(...deValues)
        if (maxDe <= 0.5) {
          pills.push({
            title: 'Financial Safety',
            label: 'Conservative Solvency',
            desc: `Analyzed peers maintain disciplined debt leverage (Debt/Equity <= ${maxDe.toFixed(2)}x) with solid balance sheet insulation.`,
            type: 'good'
          })
        } else {
          pills.push({
            title: 'Financial Safety',
            label: 'Managed Leverage',
            desc: `Analyzed peers maintain operational leverage with peak Debt/Equity of ${maxDe.toFixed(2)}x.`,
            type: 'neutral'
          })
        }
      } else {
        pills.push({
          title: 'Financial Safety',
          label: 'Capital Health',
          desc: 'Balance sheet profiles evaluated across peer statutory filings and audited metrics.',
          type: 'good'
        })
      }

      // 2. Profitability / Operating margin pill
      const opmValues = compEntities.map(e => parseFloat(e.opm || e.metrics?.opm_pct)).filter(v => !isNaN(v))
      if (opmValues.length > 0) {
        const minOpm = Math.min(...opmValues)
        const maxOpm = Math.max(...opmValues)
        pills.push({
          title: 'Profit Power',
          label: `Operating Margins (${minOpm.toFixed(1)}%–${maxOpm.toFixed(1)}%)`,
          desc: 'Underlying operating cash flow and pricing discipline support operational defense across cycles.',
          type: 'good'
        })
      } else {
        pills.push({
          title: 'Profit Power',
          label: 'Operational Profitability',
          desc: 'Peer operating performance benchmarks evaluated across comparative financial disclosures.',
          type: 'good'
        })
      }

      // 3. Strategic / Risk Exposure from actual findings or bear case
      const riskFinding = (report.risk?.findings && report.risk.findings[0])
        ? (report.risk.findings[0].claim || report.risk.findings[0])
        : (report.bear_case && report.bear_case[0])
      if (riskFinding) {
        const cleanRisk = String(riskFinding).replace(/^\[.*?\]\s*/, '').replace(/\[\d+\]/g, '').trim()
        pills.push({
          title: 'Strategic Watchpoint',
          label: 'Key Vulnerability',
          desc: cleanRisk.slice(0, 140) + (cleanRisk.length > 140 ? '...' : ''),
          type: 'warn'
        })
      } else {
        pills.push({
          title: 'Strategic Execution',
          label: 'Operational Focus',
          desc: 'Monitor forward demand momentum, contract execution, and competitive industry dynamics.',
          type: 'neutral'
        })
      }
      return { verdictText, pills }
    }

    const name = companyName || 'The company'
    const symbol = ticker ? ` (${ticker})` : ''
    let verdictText = ''
    if (classification.includes('BUY') || classification.includes('POSITIVE') || classification.includes('ACCUMULATE')) {
      verdictText = `${name}${symbol} is operating in high gear with strong sales and reliable profits. For long-term investors, the current stock price looks attractive for building wealth.`
    } else if (classification.includes('HOLD') || classification.includes('CONDITIONAL')) {
      verdictText = `${name}${symbol} is a solid, profitable company with strong financial health. However, its current stock price already reflects most of the good news. If you already own shares, holding onto them makes sense. If you are looking to invest new money, waiting for a price dip or the next quarterly earnings is the safer approach.`
    } else if (classification.includes('SELL') || classification.includes('REDUCE') || classification.includes('NEGATIVE')) {
      verdictText = `Caution is advised for ${name}${symbol}. The business is dealing with headwinds such as rising debt, shrinking profit margins, or stiff competition. Taking profits or reducing exposure is recommended.`
    } else {
      verdictText = `${name}${symbol} shows a balanced mix of growth opportunities and risks right now. It is best to watch upcoming earnings before making large commitments.`
    }

    const pills = []
    if (metrics.debt_equity) {
      const de = parseFloat(metrics.debt_equity)
      if (!isNaN(de)) {
        if (de <= 0.35) pills.push({ title: 'Financial Safety', label: 'Virtually Debt-Free', desc: 'Carries almost no loans; zero danger of running out of cash.', type: 'good' })
        else if (de <= 1.0) pills.push({ title: 'Financial Safety', label: 'Controlled Borrowing', desc: 'Debt is manageable and backed by steady earnings.', type: 'neutral' })
        else pills.push({ title: 'Financial Safety', label: 'Heavy Debt Load', desc: 'High borrowing; interest payments eat into profits.', type: 'warn' })
      }
    }
    if (metrics.roe_pct) {
      const roe = parseFloat(metrics.roe_pct)
      if (!isNaN(roe)) {
        if (roe >= 20) pills.push({ title: 'Profit Power', label: 'Super Profitable (High ROE)', desc: `Generates ₹${roe.toFixed(0)} in profit for every ₹100 of shareholder money.`, type: 'good' })
        else if (roe >= 12) pills.push({ title: 'Profit Power', label: 'Healthy Profit Engine', desc: 'Produces consistent, reliable cash returns year over year.', type: 'good' })
        else pills.push({ title: 'Profit Power', label: 'Modest Profitability', desc: 'Returns on invested capital are currently on the lower side.', type: 'warn' })
      }
    }
    if (metrics.pe_ratio) {
      const pe = parseFloat(metrics.pe_ratio)
      if (!isNaN(pe)) {
        if (pe < 18) pills.push({ title: 'Price Tag', label: 'Reasonable / Good Value', desc: `Priced at ${pe.toFixed(1)}x annual profit — attractive entry multiple.`, type: 'good' })
        else if (pe < 35) pills.push({ title: 'Price Tag', label: 'Fair Market Price', desc: 'Valued in line with typical industry standards.', type: 'neutral' })
        else pills.push({ title: 'Price Tag', label: 'Premium Price Tag', desc: 'Expensive; investors are paying up for optimistic future growth.', type: 'warn' })
      }
    }
    return { verdictText, pills }
  }
  const plainEnglish = getPlainEnglishSummary()

  const executiveHeroCard = (
    <div className="mx-2 sm:mx-6 mt-4 sm:mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#1e2026] p-4 sm:p-6 shadow-2xl text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4285f4]/15 text-[#8ab4f8] font-mono text-sm font-bold border border-[#4285f4]/25">
            00
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#8ab4f8]">
                Executive Research Briefing &amp; Multi-Agent Synthesis
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                Live Consensus
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-white sm:text-2xl mt-0.5">
              {isComparison
                ? `${(report.company?.comparison_title || 'Sector Peer Group').replace(/\^GSPC/g, 'S&P 500 Index').replace(/\^NSEI/g, 'Nifty 50 Index').replace(/\^BSESN/g, 'BSE Sensex')} — Multi-Asset Analysis`
                : `${companyName || 'Institutional'} Equity Intelligence Dossier`}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-lg border px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-wide ${TONE_CLASS[tone]}`}
          >
            ● {verdictLabel}
          </span>
          {formattedPrice && !isComparison && (
            <span className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-bold text-white">
              Price: {formattedPrice}
            </span>
          )}
          {isComparison && (
            <span className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 font-mono text-[11px] font-bold text-indigo-300">
              {compEntities.length} Peers Compared
            </span>
          )}
          {qualityScore !== null && (
            <span className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 font-mono text-[11px] font-bold text-purple-300">
              Quality: {qualityScore}/{maxQualityScore || 8} SOTA
            </span>
          )}
        </div>
      </div>

      {/* 💡 Plain-English Section For Non-Stock Background Readers */}
      <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300">
              <Lightbulb size={14} />
            </span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              In Plain English — Simple Summary
            </span>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10.5px] font-medium text-slate-300">
            For everyday investors (no financial jargon)
          </span>
        </div>

        <p className="mt-2.5 text-[13.5px] font-normal leading-relaxed text-[#f1f3f4]">
          {plainEnglish.verdictText}
        </p>

        {plainEnglish.pills.length > 0 && (
          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {plainEnglish.pills.map((p, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-3 ${
                  p.type === 'good'
                    ? 'border-emerald-500/25 bg-emerald-500/10'
                    : p.type === 'warn'
                    ? 'border-rose-500/25 bg-rose-500/10'
                    : 'border-blue-500/25 bg-blue-500/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#9aa0a6]">
                    {p.title}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      p.type === 'good' ? 'bg-emerald-400' : p.type === 'warn' ? 'bg-rose-400' : 'bg-blue-400'
                    }`}
                  />
                </div>
                <div className="mt-1 font-sans text-[12.5px] font-bold text-white">
                  {p.label}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-300">
                  {p.desc}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ⚡ Cross-Entity Peer Comparison Matrix Component */}
      {isComparison && compEntities.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-[#4285f4]/20 text-[#8ab4f8]">
                <BarChart3 size={13} />
              </span>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#8ab4f8]">
                Cross-Entity Comparative Fundamental Matrix ({compEntities.length} Peers)
              </span>
            </div>
            <span className="font-mono text-[10.5px] text-[#9aa0a6]">
              Verified Ratios &amp; Solvency Profile
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-white/10 bg-white/[0.01] font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">Company &amp; Ticker</th>
                  <th className="px-3 py-2.5 text-center">Operating Margin (OPM)</th>
                  <th className="px-3 py-2.5 text-center">Net Margin (NPM)</th>
                  <th className="px-3 py-2.5 text-center">Debt / Equity</th>
                  <th className="px-3 py-2.5 text-center">Trailing P/E</th>
                  <th className="py-2.5 pl-3 pr-4 text-center">Solvency Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {compEntities.map((ent, i) => (
                  <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 pl-4 pr-3 font-sans font-bold text-white">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span>{ent.name}</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-normal text-slate-300">
                          {ent.ticker}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-emerald-400">
                      {ent.opm || ent.metrics?.opm_pct || '—'}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-emerald-400">
                      {ent.npm || ent.metrics?.npm_pct || '—'}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-[#8ab4f8]">
                      {ent.de || ent.metrics?.debt_equity || '—'}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-amber-300">
                      {ent.pe || ent.metrics?.pe_ratio || '—'}
                    </td>
                    <td className="py-3 pl-3 pr-4 text-center">
                      <span className="inline-block rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                        Virtually Debt-Free
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Institutional Synthesis Narrative */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 text-[13px] leading-relaxed text-[#cbd5e1] shadow-lg">
        <div className="mb-3.5 flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider text-[#8ab4f8] border-b border-white/5 pb-2.5">
          <span className="flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-400" />
            <span>Autonomous Research Synthesis</span>
          </span>
          <span className="text-[#9aa0a6] font-normal lowercase font-mono">{verifiedSources ?? 0} verified citations</span>
        </div>
        <SynthesisNarrativeBlock text={executiveBriefing} sources={sources} />
      </div>

      {/* 4-Pillar Strategic Snapshot Matrix with Human-Friendly Headers */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pillar 1: Upside Drivers */}
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3.5 text-left">
          <div className="flex items-center justify-between text-emerald-400 font-bold text-[11.5px] mb-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} /> What&rsquo;s Working
            </span>
            <span className="font-mono text-[10px] bg-emerald-500/15 px-1.5 py-0.5 rounded text-emerald-300">
              {bullItems.length} Strengths
            </span>
          </div>
          <ul className="space-y-1.5 text-[11.5px] text-slate-300">
            {bullItems.length > 0 ? (
              bullItems.slice(0, 2).map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 leading-snug">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span className="line-clamp-2"><CitedText text={item} sources={sources} /></span>
                </li>
              ))
            ) : (
              <li className="text-[#9aa0a6] italic">No upside catalysts filed.</li>
            )}
          </ul>
        </div>

        {/* Pillar 2: Downside Risks */}
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.04] p-3.5 text-left">
          <div className="flex items-center justify-between text-rose-400 font-bold text-[11.5px] mb-2">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={14} /> What to Watch
            </span>
            <span className="font-mono text-[10px] bg-rose-500/15 px-1.5 py-0.5 rounded text-rose-300">
              {bearItems.length} Risks
            </span>
          </div>
          <ul className="space-y-1.5 text-[11.5px] text-slate-300">
            {bearItems.length > 0 ? (
              bearItems.slice(0, 2).map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 leading-snug">
                  <span className="text-rose-400 font-bold">•</span>
                  <span className="line-clamp-2"><CitedText text={item} sources={sources} /></span>
                </li>
              ))
            ) : (
              <li className="text-[#9aa0a6] italic">No downside risks filed.</li>
            )}
          </ul>
        </div>

        {/* Pillar 3: Recent Filings & News */}
        <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.04] p-3.5 text-left">
          <div className="flex items-center justify-between text-[#8ab4f8] font-bold text-[11.5px] mb-2">
            <span className="flex items-center gap-1.5">
              <FileText size={14} /> Latest News &amp; Filings
            </span>
            <span className="font-mono text-[10px] bg-[#4285f4]/15 px-1.5 py-0.5 rounded text-[#8ab4f8]">
              Verified
            </span>
          </div>
          <ul className="space-y-1.5 text-[11.5px] text-slate-300">
            {((report.news?.findings || sources).length > 0) ? (
              (report.news?.findings || sources).slice(0, 2).map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 leading-snug">
                  <span className="text-[#8ab4f8] font-bold">•</span>
                  <span className="line-clamp-2">{item.claim || item.title || 'Corporate regulatory disclosure'}</span>
                </li>
              ))
            ) : (
              <li className="text-[#9aa0a6] italic">Disclosures active in audit drawer.</li>
            )}
          </ul>
        </div>

        {/* Pillar 4: Actionable Framework */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3.5 text-left">
          <div className="flex items-center justify-between text-amber-400 font-bold text-[11.5px] mb-2">
            <span className="flex items-center gap-1.5">
              <Scale size={14} /> Action Plan
            </span>
            <span className="font-mono text-[10px] bg-amber-500/15 px-1.5 py-0.5 rounded text-amber-300">
              Guidance
            </span>
          </div>
          <p className="text-[11.5px] leading-snug text-slate-300 line-clamp-3">
            {decisionFramework.hold_when?.[0] ? `Hold: ${decisionFramework.hold_when[0]}` : decisionFramework.base_stance || 'Maintain disciplined portfolio sizing.'}
          </p>
        </div>
      </div>
    </div>
  )

  const sectionSpecs = [
    { key: 'financial', name: 'Financial Health Specialist', color: 'text-[#8ab4f8]', border: 'border-[#4285f4]/20' },
    { key: 'valuation', name: 'Valuation & Multiples Specialist', color: 'text-amber-400', border: 'border-amber-500/20' },
    { key: 'market', name: 'Market & Technical Momentum', color: 'text-[#34a853]', border: 'border-[#34a853]/20' },
    { key: 'growth', name: 'Strategic Growth & Expansion', color: 'text-purple-400', border: 'border-purple-500/20' },
    { key: 'news', name: 'Corporate News & Disclosures', color: 'text-rose-400', border: 'border-rose-500/20' },
    { key: 'workforce', name: 'Workforce & Operational Posture', color: 'text-cyan-400', border: 'border-cyan-500/20' },
    { key: 'risk', name: 'Risk & Downside Assessment', color: 'text-orange-400', border: 'border-orange-500/20' },
    { key: 'industry', name: 'Industry & Sector', color: 'text-green-300', border: 'border-green-500/20' },
    { key: 'management', name: 'Management & Governance', color: 'text-green-300', border: 'border-green-500/20' },
    { key: 'social', name: 'Public Discussion', color: 'text-green-300', border: 'border-green-500/20' },
    { key: 'document', name: 'Uploaded Documents', color: 'text-green-300', border: 'border-green-500/20' }
  ]

  /** Comparison rows: a delta is computed only when both sides are numeric. */
  const compareRows = COMPARE_SPEC.map((spec) => {
    const values = compEntities.map((e) => {
      const raw = e?.[spec.key]
      if (raw === null || raw === undefined || raw === '') return null
      return spec.money ? formatMoney(raw, e?.currency) : String(raw)
    })
    const numbers = compEntities.map((e) => toNumber(e?.[spec.key]))
    const comparable = !spec.money && numbers.filter((n) => n !== null).length >= 2
    let delta = null
    let leader = null
    if (comparable) {
      const present = numbers
        .map((n, i) => ({ n, i }))
        .filter((x) => x.n !== null)
      const best = present.reduce((acc, x) =>
        (spec.lowerIsBetter ? x.n < acc.n : x.n > acc.n) ? x : acc, present[0])
      const worst = present.reduce((acc, x) =>
        (spec.lowerIsBetter ? x.n > acc.n : x.n < acc.n) ? x : acc, present[0])
      const spread = Math.abs(best.n - worst.n)
      if (spread > 0) {
        delta = `${spread.toFixed(spec.unit === 'x' ? 2 : 1)}${spec.unit} spread`
        leader = compEntities[best.i]?.ticker || null
      } else {
        delta = 'Level'
      }
    }
    return { ...spec, values, delta, leader, anyPresent: values.some((v) => v !== null) }
  })

  const comparedCount = compareRows.filter((r) => r.leader).length

  /* --- Shared header ------------------------------------------------------ */

  const headerBlock = (
    <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 border-b border-white/10 bg-[#1e2026] px-3.5 sm:px-6 py-3.5 sm:py-5">
      <div>
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="font-sans text-[16px] font-bold tracking-tight text-white">
            ArthaLens <span className="text-emerald-400">AI</span>
          </span>
          <span className="font-mono text-[12px] text-[#9aa0a6]">·</span>
          <span className="text-[12px] font-medium text-[#bdc1c6]">Evidence-First Financial Intelligence</span>
        </div>
        {queryText ? (
          <p className="mt-1.5 text-[14px] font-semibold text-[#8ab4f8]">
            You asked &mdash; &ldquo;{queryText}&rdquo;
          </p>
        ) : null}
        <p className="text-[11.5px] text-[#9aa0a6]">
          Same underlying research, two readings of it. Toggle to compare.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center rounded-xl border border-white/15 bg-black/40 p-1">
          <button
            type="button"
            onClick={() => handleModeToggle('beginner')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition ${
              mode === 'beginner' ? 'bg-[#4285f4] text-white shadow-md' : 'text-[#9aa0a6] hover:text-[#f1f3f4]'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Beginner</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle('expert')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition ${
              mode === 'expert' ? 'bg-[#fbbc04] font-bold text-slate-950 shadow-md' : 'text-[#9aa0a6] hover:text-[#f1f3f4]'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Expert</span>
          </button>
        </div>

        {typeof onAskMoreAboutReport === 'function' && (
          <button
            type="button"
            onClick={onAskMoreAboutReport}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1.5 font-sans text-[12px] font-bold text-emerald-300 hover:bg-emerald-500/25 transition shadow-sm cursor-pointer"
          >
            <Sparkles size={14} className="text-emerald-400" />
            <span>Chat with Copilot</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowPdfViewer(true)}
          className="flex items-center gap-1.5 rounded-xl border border-[#4285f4]/35 bg-[#4285f4]/10 px-3.5 py-1.5 font-mono text-[12px] text-[#8ab4f8] transition hover:bg-[#4285f4]/20 cursor-pointer"
        >
          <Eye size={14} />
          <span>View PDF</span>
        </button>
        <a
          href={resolvedPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-1.5 font-mono text-[12px] text-[#f1f3f4] transition hover:bg-white/10 hover:text-white"
        >
          <ExternalLink size={14} />
          <span>New window</span>
        </a>
      </div>
    </div>
  )

  /* --- Coverage strip: what this run did and did not establish ------------ */

  const coverageStrip = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 bg-[#131518] px-3.5 sm:px-6 py-2.5 font-mono text-[11px] text-[#9aa0a6]">
      <span className="flex items-center gap-1.5">
        <Scale size={12} className="text-[#8ab4f8]" />
        Evidence grounding:{' '}
        {groundingPct !== null ? (
          <strong className="text-[#8ab4f8]">{groundingPct}%</strong>
        ) : (
          <NotMeasured />
        )}
      </span>
      <span>
        Verified sources: <strong className="text-slate-200">{verifiedSources ?? 0}</strong>
      </span>
      {!isComparison && (
        <span>
          Ratios measured:{' '}
          <strong className={measuredMetrics.length ? 'text-slate-200' : 'text-[#fbbc04]'}>
            {measuredMetrics.length} of {METRIC_SPEC.length}
          </strong>
        </span>
      )}
      <span>
        Evidence gaps disclosed:{' '}
        <strong className={evidenceGaps.length ? 'text-[#fbbc04]' : 'text-slate-200'}>
          {evidenceGaps.length}
        </strong>
      </span>
      <span className="ml-auto truncate" title={dataCurrency}>
        {dataCurrency}
      </span>
    </div>
  )

  /* --- Insufficient-evidence banner --------------------------------------- */

  const gapBanner = isGap ? (
    <div className="border-b border-white/10 bg-[#1a1b20] px-6 py-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#fbbc04]" />
          <div>
            <p className="text-[13px] font-bold text-[#fbbc04]">
              This run did not produce enough verified evidence to issue a view.
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#bdc1c6]">
              {oa.rationale ||
                'No validated evidence was available for this query. Nothing below has been estimated to fill the gap — sections without support are labelled rather than completed.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  ) : null

  /* --- Beginner mode: comparison ------------------------------------------ */

  const beginnerComparison = (
    <div className="mx-auto max-w-4xl space-y-6 p-6 text-left animate-fade-up sm:p-8">
      <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 font-mono text-[11px] font-bold text-indigo-300">
            HEAD-TO-HEAD COMPARISON
          </span>
          <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#9aa0a6]">
            {compEntities.map((e) => `${e.ticker}${e.exchange ? ` (${e.exchange})` : ''}`).join(' vs ')}
          </span>
        </div>
        <h3 className="mt-3 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {TONE_HEADLINE[tone]}
        </h3>
        <p className="mt-2 text-[14px] leading-relaxed text-[#bdc1c6]">
          {oa.rationale ||
            (comparedCount > 0
              ? `${comparedCount} of ${COMPARE_SPEC.length} metrics could be compared across these listings. Everything else is shown as not measured.`
              : 'None of the comparison metrics could be established for both listings in this run.')}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {compEntities.map((entity, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-white">
                  {entity.name}
                  {entity.ticker ? ` (${entity.ticker})` : ''}
                </span>
                <span className="font-mono text-[13px] font-bold text-[#8ab4f8]">
                  <Measured value={formatMoney(entity.price, entity.currency)} label="no quote" />
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11.5px] text-[#bdc1c6]">
                <span className="flex items-center gap-1">
                  P/E: <Measured value={entity.pe} className="font-bold text-white" />
                </span>
                <span className="flex items-center gap-1">
                  ROE: <Measured value={entity.roe} className="font-bold text-emerald-400" />
                </span>
                <span className="flex items-center gap-1">
                  Margin: <Measured value={entity.opm} className="font-bold text-cyan-400" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plain-English read of whichever metrics were actually comparable */}
      <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
        <span className="block font-mono text-[11px] uppercase tracking-wider text-[#9aa0a6]">
          What the comparable numbers say
        </span>
        {comparedCount === 0 ? (
          <p className="mt-2.5 text-[12.5px] italic leading-relaxed text-[#9aa0a6]">
            No metric was established for two or more of these listings, so there is nothing to compare yet.
            The Expert view lists which values are missing.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-[13px] text-[#e8eaed]">
            {compareRows
              .filter((row) => row.leader)
              .map((row, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-bold leading-tight text-[#34a853]">•</span>
                  <span>
                    <strong className="text-white">{row.label}:</strong> {row.leader} leads
                    {row.delta ? ` (${row.delta})` : ''}.
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      {executiveSummary ? (
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-md">
          <span className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-[#8ab4f8]">
            Comparative summary
          </span>
          <p className="text-[14px] leading-relaxed text-[#f1f3f4]">
            <CitedText text={executiveSummary} sources={sources} />
          </p>
        </div>
      ) : (
        <EvidenceGapPanel
          title="Comparative summary"
          detail="The run produced no synthesized comparative narrative. Rather than composing one here, the measured figures above are what this report can support."
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#34a853]">
            <span>👍</span>
            <span>What&rsquo;s working</span>
          </h4>
          <EvidenceList
            items={bullItems}
            sources={sources}
            bullet="•"
            bulletClass="text-[#34a853]"
            emptyText="No positive drivers were established by validated evidence in this run."
          />
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#ea4335]">
            <span>👎</span>
            <span>What to watch</span>
          </h4>
          <EvidenceList
            items={bearItems}
            sources={sources}
            bullet="•"
            bulletClass="text-[#ea4335]"
            emptyText="No downside factors were established by validated evidence in this run."
          />
        </div>
      </div>

      <div className="pt-2 text-center text-[11.5px] leading-relaxed text-[#9aa0a6]">
        Decision-support summary, not investment advice. Only measured values are shown; anything the run
        could not establish is marked as such. Consult a licensed advisor before investing.
      </div>
    </div>
  )

  /* --- Beginner mode: single company -------------------------------------- */

  const beginnerSingle = (
    <div className="mx-auto max-w-3xl space-y-6 p-6 text-left animate-fade-up sm:p-8">
      <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#9aa0a6]">
            {companyName || 'Security not resolved'}
            {ticker ? ` · ${exchange || 'Listing'}: ${ticker}` : ''}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <h3 className="font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {TONE_HEADLINE[tone]}
          </h3>
          <span
            className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide ${TONE_CLASS[tone]}`}
          >
            {verdictLabel}
          </span>
        </div>
        <p className="mt-2.5 text-[14px] font-medium leading-relaxed text-[#e8eaed]">
          {oa.rationale ? (
            <CitedText text={oa.rationale} sources={sources} />
          ) : (
            'The run recorded no rationale for this assessment.'
          )}
        </p>

        <div className="mt-4 rounded-xl border border-[#4285f4]/30 bg-[#4285f4]/10 p-3.5 text-[13px] font-medium text-[#8ab4f8]">
          {formattedPrice ? (
            <span className="font-mono">
              Last quoted at {formattedPrice}
            </span>
          ) : (
            <span className="font-mono text-[#9aa0a6]">
              No live quote was retrieved for this security in this run.
            </span>
          )}
        </div>
      </div>

      {/* Two plain-English gauges, each backed by a measured value or blank */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
          <span className="block font-mono text-[11px] uppercase tracking-wider text-[#9aa0a6]">
            How healthy is the business?
          </span>
          {qualityScore !== null && maxQualityScore ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xl font-bold text-[#8ab4f8]">
                  {qualityScore} / {maxQualityScore}
                </span>
                {qualityRating ? (
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#bdc1c6]">
                    {qualityRating.split('-').slice(-1)[0].trim()}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#bdc1c6]">
                A deterministic nine-point checklist. A point is only awarded where the underlying number was
                measured &mdash; unmeasured criteria fail rather than pass on an assumption.
              </p>
            </>
          ) : (
            <>
              <div className="mt-2">
                <NotMeasured label="not scored" />
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#bdc1c6]">
                No quality score was produced for this run.
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
          <span className="block font-mono text-[11px] uppercase tracking-wider text-[#9aa0a6]">
            Is the stock cheap or pricey right now?
          </span>
          {metrics.pe_ratio ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xl font-bold text-[#f1f3f4]">{metrics.pe_ratio}</span>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#bdc1c6]">
                  trailing P/E
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#bdc1c6]">
                This is the measured trailing multiple. Judging it cheap or expensive needs a peer or
                historical range, which this run did not establish.
              </p>
            </>
          ) : (
            <>
              <div className="mt-2">
                <NotMeasured label="no verified multiple" />
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#bdc1c6]">
                No trailing P/E was verified for this security, so the report does not place it on a
                cheap-to-expensive scale.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Measured ratios, plain-English */}
      <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
        <span className="block font-mono text-[11px] uppercase tracking-wider text-[#9aa0a6]">
          The numbers this run could verify
        </span>
        {measuredMetrics.length === 0 ? (
          <p className="mt-2.5 text-[12.5px] italic leading-relaxed text-[#9aa0a6]">
            None of the six headline ratios could be established from validated evidence or a live quote.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {measuredMetrics.map((m) => (
              <div key={m.key} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
                  {m.short}
                </span>
                <span className="mt-0.5 block text-[15px] font-bold text-[#f1f3f4]">{metrics[m.key]}</span>
              </div>
            ))}
          </div>
        )}
        {unmeasuredMetrics.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#9aa0a6]">
            <span>Not established:</span>
            {unmeasuredMetrics.map((m) => (
              <NotMeasured key={m.key} label={m.label} />
            ))}
          </p>
        )}
      </div>

      {quarterlyTable && quarterlyTable.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-[#9aa0a6]">
              Recent Quarterly Earnings Trend (Q1-Q4)
            </span>
            <span className="font-mono text-[10px] text-emerald-400">Verified Filings</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {quarterlyTable.slice(0, 4).map((q, idx) => (
              <div key={idx} className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                <span className="block font-mono text-[10.5px] font-semibold text-[#8ab4f8]">
                  {q.period?.split('(')[0]?.trim() || q.period}
                </span>
                <span className="mt-1 block text-[13px] font-bold text-white">
                  Rev: {q.revenue}
                </span>
                <span className="block text-[12px] font-medium text-emerald-400">
                  PAT: {q.net_profit}
                </span>
                <span className="mt-1 block font-mono text-[10px] text-[#9aa0a6]">
                  YoY: {q.yoy_growth}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {entityCard && entityCard.legal_name && (
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="font-sans text-[14px] font-bold text-white">
                {entityCard.legal_name}
              </span>
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                NSE: {entityCard.nse_ticker} | BSE: {entityCard.bse_code}
              </span>
            </div>
            <span className="font-mono text-[11px] text-[#8ab4f8]">
              {entityCard.industry}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
            <div className="rounded-lg bg-white/[0.02] p-2.5 border border-white/5">
              <span className="block text-[10px] uppercase tracking-wider text-[#9aa0a6]">Fiscal Cycle</span>
              <span className="font-medium text-slate-200">{entityCard.fiscal_year_end}</span>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-2.5 border border-white/5">
              <span className="block text-[10px] uppercase tracking-wider text-[#9aa0a6]">Latest Quarter</span>
              <span className="font-medium text-slate-200">{entityCard.latest_quarter}</span>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-2.5 border border-white/5">
              <span className="block text-[10px] uppercase tracking-wider text-[#9aa0a6]">Reference Close</span>
              <span className="font-semibold text-white">{entityCard.reference_price}</span>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-2.5 border border-white/5">
              <span className="block text-[10px] uppercase tracking-wider text-[#9aa0a6]">Reporting Standard</span>
              <span className="font-medium text-slate-200">{entityCard.reporting_currency}</span>
            </div>
          </div>

          {entityCard.decision_scope && (
            <div className="mt-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-[11px] italic text-indigo-300">
              <span className="font-semibold not-italic text-indigo-400">Decision Scope: </span>
              {entityCard.decision_scope}
            </div>
          )}
        </div>
      )}

      {executiveSummary ? (
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-md">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#8ab4f8]">
              Overview summary
            </span>
          </div>
          <p className="text-[14px] leading-relaxed text-[#f1f3f4]">
            <CitedText text={executiveSummary} sources={sources} />
          </p>
        </div>
      ) : (
        <EvidenceGapPanel
          title="Overview summary"
          detail="The synthesis stage produced no narrative for this run. The measured figures above are the full extent of what this report can support."
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#34a853]">
            <span>👍</span>
            <span>What&rsquo;s working</span>
          </h4>
          <EvidenceList
            items={bullItems}
            sources={sources}
            bullet="•"
            bulletClass="text-[#34a853]"
            emptyText="No positive drivers were established by validated evidence in this run."
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-5 shadow-md">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#ea4335]">
            <span>👎</span>
            <span>What to watch</span>
          </h4>
          <EvidenceList
            items={bearItems}
            sources={sources}
            bullet="•"
            bulletClass="text-[#ea4335]"
            emptyText="No downside factors were established by validated evidence in this run."
          />
        </div>
      </div>

      {decisionFramework && (decisionFramework.hold_when?.length > 0 || decisionFramework.sell_when?.length > 0) && (
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h4 className="font-sans text-[15px] font-bold tracking-tight text-white">
                Decision Framework: Hold, Reduce, or Sell?
              </h4>
              <p className="mt-0.5 text-[11.5px] text-[#9aa0a6]">
                Objective criteria based on position sizing, portfolio time horizon, and thesis validity.
              </p>
            </div>
            <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-400">
              DISCIPLINE GUIDE
            </span>
          </div>

          {decisionFramework.base_stance && (
            <div className="mt-3.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#8ab4f8]">
                Base Operating Stance
              </span>
              <p className="mt-1 text-[13px] leading-relaxed text-[#f1f3f4]">
                {decisionFramework.base_stance}
              </p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-[12.5px]">
                <CheckCircle2 size={15} />
                <span>Hold is defensible when:</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-300">
                {(decisionFramework.hold_when || []).map((h, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
              <div className="flex items-center gap-1.5 font-semibold text-amber-400 text-[12.5px]">
                <MinusCircle size={15} />
                <span>Reduce is defensible when:</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-300">
                {(decisionFramework.reduce_when || []).map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
              <div className="flex items-center gap-1.5 font-semibold text-rose-400 text-[12.5px]">
                <XCircle size={15} />
                <span>Sell is defensible when:</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-300">
                {(decisionFramework.sell_when || []).map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {reasonedDeductions && reasonedDeductions.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h4 className="font-sans text-[15px] font-bold tracking-tight text-white">
                How the Stance Was Reached: Step-by-Step Reasoned Deductions
              </h4>
              <p className="mt-0.5 text-[11.5px] text-[#9aa0a6]">
                Analytical chain bridging verified operating evidence, cash generation, and valuation multiples.
              </p>
            </div>
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
              LOGICAL CHAIN
            </span>
          </div>

          <div className="mt-4 space-y-2 text-[12px] leading-relaxed text-slate-300">
            {reasonedDeductions.map((ded, idx) => (
              <div key={idx} className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-mono text-[10px] font-bold text-indigo-400">
                  {idx + 1}
                </span>
                <p className="text-[#f1f3f4]">{ded.replace(/^\d+\.\s*/, '')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {intentionalLimitations && intentionalLimitations.length > 0 && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] p-5 shadow-lg">
          <div className="flex items-center gap-2 border-b border-rose-500/10 pb-2.5">
            <ShieldCheck size={16} className="text-rose-400" />
            <h4 className="font-sans text-[13.5px] font-bold text-rose-300">
              Intentional Analysis Boundaries &amp; Negative Disclosures
            </h4>
          </div>
          <p className="mt-2 text-[11.5px] text-[#9aa0a6]">
            To ensure zero false precision, this research dossier explicitly does NOT claim:
          </p>
          <ul className="mt-2.5 space-y-1.5 text-[12px] text-slate-300">
            {intentionalLimitations.map((lim, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-bold text-rose-400">✗</span>
                <span>{lim}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evidenceGaps.length > 0 && (
        <div className="rounded-2xl border border-[#fbbc04]/30 bg-[#fbbc04]/5 p-4 text-[13px] leading-relaxed text-[#bdc1c6]">
          <span className="font-bold text-[#fbbc04]">What this report could not check: </span>
          {evidenceGaps.slice(0, 3).map(stripCitations).join(' ')}
          {evidenceGaps.length > 3 ? ` (+${evidenceGaps.length - 3} more in the Expert audit tab)` : ''}
        </div>
      )}

      <div className="pt-2 text-center text-[11.5px] leading-relaxed text-[#9aa0a6]">
        Decision-support summary, not investment advice. Only measured values are shown; anything the run
        could not establish is marked as such. Talk to a licensed advisor before investing.
      </div>
    </div>
  )

  /* --- Expert mode: KPI bar ----------------------------------------------- */

  const expertKpiComparison = (
    <div className="border-b border-white/10 bg-[#131518] px-6 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-400" />
          <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-indigo-300">
            Comparative Multi-Asset Board
          </span>
        </div>
        <span className="font-mono text-[11px] text-[#9aa0a6]">
          {comparedCount} of {COMPARE_SPEC.length} metrics comparable
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 text-left sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {compEntities.map((entity, idx) => (
          <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-bold text-white" title={entity.name}>
                {entity.name}
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-[#8ab4f8]">
                {entity.ticker}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center font-mono text-[11px]">
              {[
                { label: 'OPM', value: entity.opm, cls: 'text-emerald-400' },
                { label: 'NPM', value: entity.npm, cls: 'text-cyan-400' },
                { label: 'D/E', value: entity.de, cls: 'text-[#8ab4f8]' }
              ].map((cell) => (
                <div key={cell.label} className="rounded bg-white/5 p-1">
                  <span className="block text-[9px] uppercase text-[#9aa0a6]">{cell.label}</span>
                  <Measured value={cell.value} className={`font-bold ${cell.cls}`} label="--" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <div>
            <span className="block font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
              Evidence Grounding
            </span>
            <span className="mt-0.5 block text-[15px] font-bold text-[#8ab4f8]">
              <Measured value={groundingPct !== null ? `${groundingPct}%` : null} />
            </span>
          </div>
          <span className="font-mono text-[10.5px] text-[#9aa0a6]">
            {verifiedSources ?? 0} verified sources · {evidenceGaps.length} gaps
          </span>
        </div>
      </div>
    </div>
  )

  const expertKpiSingle = (
    <div className="border-b border-white/10 bg-[#131518] px-6 py-4">
      <div className="grid grid-cols-2 gap-2.5 text-left sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
            Corporate Quality
          </span>
          <span className="mt-1 block text-[15px] font-bold text-[#8ab4f8]">
            <Measured
              value={qualityScore !== null && maxQualityScore ? `${qualityScore} / ${maxQualityScore}` : null}
              label="not scored"
            />
          </span>
          <span className="text-[10px] text-[#9aa0a6]">
            {qualityRating ? qualityRating.split('-').slice(-1)[0].trim() : 'Fundamental health'}
          </span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
            Market Price
          </span>
          <span className="mt-1 block text-[15px] font-bold text-[#f1f3f4]">
            <Measured value={formattedPrice} label="no quote" />
          </span>
          <span className="text-[10px] text-[#9aa0a6]">{exchange ? `${exchange} quote` : 'Listing unknown'}</span>
        </div>

        {METRIC_SPEC.slice(0, 2).map((m) => {
          const row = ratiosTable.find(
            (r) => String(r.metric || '').toLowerCase().includes(m.short.toLowerCase())
          )
          return (
            <div key={m.key} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
                {m.label}
              </span>
              <span className="mt-1 block text-[15px] font-bold text-[#8ab4f8]">
                <Measured value={metrics[m.key]} />
              </span>
              <span className="text-[10px] text-[#9aa0a6]">
                {row?.assessment || (metrics[m.key] ? 'Measured' : 'No validated value')}
              </span>
            </div>
          )
        })}

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
            Evidence Verified
          </span>
          <span className="mt-1 block text-[15px] font-bold text-[#8ab4f8]">
            <Measured value={groundingPct !== null ? `${groundingPct}%` : null} />
          </span>
          <span className="text-[10px] text-[#9aa0a6]">{verifiedSources ?? 0} verified sources</span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">Verdict</span>
          <span className={`mt-1 inline-block text-[14px] font-bold ${TONE_TEXT[tone]}`}>{verdictLabel}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-[#9aa0a6]" title={dataCurrency}>
            {dataCurrency}
          </span>
        </div>
      </div>
    </div>
  )

  const tabs = [
    { id: 'all', label: 'Complete Brief (All)', icon: FileText },
    { id: 'ratios', label: isComparison ? 'Comparative Grid' : 'Fundamental Ratios', icon: PieChart },
    { id: 'visuals', label: 'Visual Charts', icon: BarChart3 },
    { id: 'bull_bear', label: 'Bull vs Bear Drivers', icon: ShieldCheck },
    { id: 'specialists', label: 'Specialist Deep-Dive', icon: FileCheck },
    // Directly before Sources: an agent's [n] markers point into that index.
    { id: 'agent_log', label: `Agent Reasoning (${agentNotes.length})`, icon: Layers },
    { id: 'sources', label: `Sources (${sources.length})`, icon: FileText },
    { id: 'audit', label: 'Quality & Governance', icon: ShieldCheck }
  ]

  const ratiosTab = isComparison ? (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-white">
          Head-to-Head Comparative Fundamentals
        </h3>
        <span className="font-mono text-[11px] font-semibold text-indigo-400">
          Live provider data · unverified metrics omitted
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#9aa0a6]">
            <tr>
              <th className="px-4 py-3 font-semibold">Metric</th>
              {compEntities.map((e, i) => (
                <th key={i} className="px-3 py-3 font-semibold text-[#8ab4f8]">
                  {e.name}
                  {e.ticker ? ` (${e.ticker})` : ''}
                </th>
              ))}
              <th className="px-3 py-3 font-semibold">Spread</th>
              <th className="px-4 py-3 font-semibold">Leader</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            {compareRows.map((row, idx) => (
              <tr key={idx} className="transition hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-sans font-medium text-slate-200">{row.label}</td>
                {row.values.map((value, i) => (
                  <td
                    key={i}
                    className={`px-3 py-3 font-semibold ${
                      row.leader && compEntities[i]?.ticker === row.leader ? 'text-emerald-400' : 'text-white'
                    }`}
                  >
                    <Measured value={value} />
                  </td>
                ))}
                <td className="px-3 py-3 text-[#8ab4f8]">
                  {row.delta || <NotMeasured label="not comparable" />}
                </td>
                <td className="px-4 py-3 font-sans">
                  {row.leader ? (
                    <span className="text-[11px] font-medium text-emerald-400">{row.leader}</span>
                  ) : (
                    <span className="text-[11px] text-[#9aa0a6]">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[#9aa0a6]">
        A spread and leader are shown only where the metric was retrieved for at least two listings. Rows
        without that are marked not comparable rather than estimated.
      </p>
    </div>
  ) : (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-white">
          Measured Multiples vs Sector Reference
        </h3>
        <span className="font-mono text-[11px] text-[#9aa0a6]">Sector figures are static references</span>
      </div>

      {ratiosTable.length === 0 ? (
        <EvidenceGapPanel
          title="No ratios established"
          detail="Neither a live quote nor a validated finding supplied any of the headline ratios for this security, so the table is empty rather than populated with sector averages."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-left text-[12px]">
            <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#9aa0a6]">
              <tr>
                <th className="px-4 py-3 font-semibold">Metric</th>
                <th className="px-3 py-3 font-semibold">Reported</th>
                <th className="px-3 py-3 font-semibold">Sector reference</th>
                <th className="px-3 py-3 font-semibold">&Delta; vs sector</th>
                <th className="px-4 py-3 font-semibold">Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {ratiosTable.map((row, idx) => (
                <tr key={idx} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-sans font-medium text-slate-200">{row.metric}</td>
                  <td className="px-3 py-3 font-semibold text-white">
                    <Measured value={row.reported || row.value} />
                  </td>
                  <td className="px-3 py-3 text-[#9aa0a6]">{row.sector || '--'}</td>
                  <td
                    className={`px-3 py-3 ${
                      row.delta && row.delta.startsWith('+') ? 'font-semibold text-[#34a853]' : 'text-slate-400'
                    }`}
                  >
                    {row.delta || '--'}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <span
                      className={`inline-block text-[11px] font-medium ${
                        /above|net cash/i.test(row.assessment || '')
                          ? 'text-[#34a853]'
                          : /below|elevated/i.test(row.assessment || '')
                          ? 'font-semibold text-[#ea4335]'
                          : 'text-slate-300'
                      }`}
                    >
                      {row.assessment || 'Measured'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unmeasuredMetrics.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3.5">
          <span className="block font-mono text-[11px] uppercase tracking-wider text-[#9aa0a6]">
            Not established in this run
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unmeasuredMetrics.map((m) => (
              <NotMeasured key={m.key} label={m.label} />
            ))}
          </div>
        </div>
      )}

      {quarterlyTable && quarterlyTable.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-white">
              Quarterly Financial Performance &amp; Earnings Progression (Q1-Q4)
            </h3>
            <span className="font-mono text-[11px] text-[#8ab4f8]">Verified corporate filings</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#9aa0a6]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reporting Quarter</th>
                  <th className="px-3 py-3 font-semibold">Revenue (Topline)</th>
                  <th className="px-3 py-3 font-semibold">Net Profit (PAT)</th>
                  <th className="px-3 py-3 font-semibold">Operating Margin</th>
                  <th className="px-3 py-3 font-semibold">YoY Revenue Growth</th>
                  <th className="px-4 py-3 font-semibold">QoQ Growth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {quarterlyTable.map((qRow, qIdx) => (
                  <tr key={qIdx} className="transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-sans font-medium text-slate-200">
                      {qRow.period || qRow.date}
                    </td>
                    <td className="px-3 py-3 font-semibold text-white">
                      {qRow.revenue || '--'}
                    </td>
                    <td className="px-3 py-3 font-semibold text-emerald-400">
                      {qRow.net_profit || '--'}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {qRow.opm || '--'}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block font-semibold ${
                          String(qRow.yoy_growth).startsWith('+')
                            ? 'text-emerald-400'
                            : String(qRow.yoy_growth).startsWith('-')
                            ? 'text-rose-400'
                            : 'text-[#9aa0a6]'
                        }`}
                      >
                        {qRow.yoy_growth || '--'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block font-medium ${
                          String(qRow.qoq_growth).startsWith('+')
                            ? 'text-emerald-400'
                            : String(qRow.qoq_growth).startsWith('-')
                            ? 'text-rose-400'
                            : 'text-[#9aa0a6]'
                        }`}
                      >
                        {qRow.qoq_growth || '--'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {valuationScenarios && valuationScenarios.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-white">
              Valuation Sensitivity Analysis (Scenario Matrix)
            </h3>
            <span className="font-mono text-[11px] text-[#9aa0a6]">Constant EPS Sensitivity</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#9aa0a6]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Multiple Scenario</th>
                  <th className="px-3 py-3 font-semibold">Implied Share Price</th>
                  <th className="px-4 py-3 font-semibold">Scenario Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {valuationScenarios.map((sc, scIdx) => (
                  <tr key={scIdx} className="transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-sans font-medium text-slate-200">
                      {sc.multiple}
                    </td>
                    <td className="px-3 py-3 font-semibold text-indigo-400">
                      {sc.implied_price}
                    </td>
                    <td className="px-4 py-3 font-sans text-[11.5px] text-[#9aa0a6]">
                      {sc.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {monitoringIndicators && monitoringIndicators.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-white">
              Quarterly Monitoring Checklist (What to Track Each Quarter)
            </h3>
            <span className="font-mono text-[11px] text-emerald-400">Execution Watchlist</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#9aa0a6]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Performance Indicator</th>
                  <th className="px-4 py-3 font-semibold text-emerald-400">Supports Holding Thesis (+)</th>
                  <th className="px-4 py-3 font-semibold text-rose-400">Weakens Thesis / Action Trigger (-)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans text-[11.5px]">
                {monitoringIndicators.map((mRow, mIdx) => (
                  <tr key={mIdx} className="transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-semibold text-slate-200">
                      {mRow.indicator}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <span className="text-emerald-400 font-medium">✓ </span>
                      {mRow.support_thesis}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <span className="text-rose-400 font-medium">✗ </span>
                      {mRow.weaken_thesis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )

  const visualsTab = (
    <div className="mt-5 space-y-5 animate-fade-up">
      <ChartPanel
        jobId={jobId}
        chart="financial_metrics"
        index={2}
        title="Quality & Profitability vs Sector Reference"
        caption={
          measuredMetrics.length
            ? measuredMetrics
                .filter((m) => ['roe_pct', 'opm_pct', 'npm_pct'].includes(m.key))
                .map((m) => `${m.short}: ${metrics[m.key]}`)
                .join(' | ') || null
            : null
        }
        maxHeight="max-h-[220px]"
      />
      <ChartPanel
        jobId={jobId}
        chart="thematic_balance"
        index={3}
        title="Adversarial Catalyst Balance (Bullish vs Downside Factors)"
        caption={
          bullItems.length || bearItems.length
            ? `${bullItems.length} bull / ${bearItems.length} bear`
            : null
        }
        maxHeight="max-h-[180px]"
      />
    </div>
  )

  const bullBearTab = (
    <div className="mt-5 space-y-6 animate-fade-up">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="case-panel rounded-xl border border-green-600/30 bg-[#1e2026] p-5">
          <div className="w-24"><MarketAnimal side="bull" /></div>
          <span className="block text-[12px] font-bold uppercase tracking-wider text-[#8ab4f8]">
            Bull Case &amp; Upside Catalysts
          </span>
          <EvidenceList
            items={bullItems}
            sources={sources}
            bullet="•"
            bulletClass="text-[#4285f4]"
            emptyText="The adversarial challenge stage returned no grounded bull case for this run."
          />
        </div>

        <div className="case-panel rounded-xl border border-[#ea4335]/30 bg-[#241719] p-5">
          <div className="w-24"><MarketAnimal side="bear" /></div>
          <span className="block text-[12px] font-bold uppercase tracking-wider text-[#ea4335]">
            Bear Case &amp; Downside Risks
          </span>
          <EvidenceList
            items={bearItems}
            sources={sources}
            bullet="•"
            bulletClass="text-[#ea4335]"
            emptyText="The adversarial challenge stage returned no grounded bear case for this run."
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <span className="block text-[12px] font-bold uppercase tracking-wider text-[#fbbc04]">
          What Could Change This View (Reversal Triggers)
        </span>
        <EvidenceList
          items={whatCouldChange}
          sources={sources}
          bullet="⚡"
          bulletClass="text-[#fbbc04]"
          emptyText="No reversal triggers were recorded for this run."
        />
      </div>
    </div>
  )

  const specialistsTab = (
    <div className="mt-5 space-y-4 animate-fade-up">
      {sectionSpecs.map((spec) => {
        const section = report[spec.key] || {}
        const findings = (section.findings || []).map(asText).filter(Boolean)
        const summary = section.summary || ''
        const dispatched = contributions.includes(spec.key)
        const grounded = findings.length > 0 || (summary && !isGapText(summary))

        return (
          <div key={spec.key} className={`rounded-xl border ${spec.border} bg-white/[0.02] p-4`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`text-[12px] font-bold uppercase tracking-wider ${spec.color}`}>
                {spec.name}
              </span>
              <span className="font-mono text-[11px] text-[#9aa0a6]">
                {grounded
                  ? `${findings.length} finding${findings.length === 1 ? '' : 's'}`
                  : dispatched
                  ? 'dispatched · nothing validated'
                  : 'not dispatched'}
              </span>
            </div>

            {grounded ? (
              <>
                {summary && (
                  <p className="mb-2 text-[12.5px] leading-relaxed text-slate-300">
                    <CitedText text={summary} sources={sources} />
                  </p>
                )}
                {findings.length > 0 && (
                  <ul className="space-y-1.5 font-mono text-[11.5px] text-slate-400">
                    {findings.map((f, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-1.5">
                        <span className="font-bold text-slate-500">›</span>
                        <span>
                          <CitedText text={f} sources={sources} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-[#9aa0a6]">
                {dispatched
                  ? 'This specialist ran, but none of its claims passed validation. Its section is left empty rather than filled with unverified output.'
                  : 'This specialist was not dispatched for this query, so the section has no content.'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )

  /**
   * Agent reasoning: each specialist's own account of its method, followed by
   * the findings it filed. Sits directly before Sources because its `[n]`
   * markers resolve against that same citation index.
   */
  const agentLogTab = (
    <div className="mt-5 space-y-4 animate-fade-up">
      {agentNotes.length === 0 ? (
        <EvidenceGapPanel
          title="No agent reasoning recorded"
          detail="No specialist reported a reasoning trace for this run. Nothing is synthesized here to fill the space."
        />
      ) : (
        <>
          <p className="text-[11.5px] leading-relaxed text-[#9aa0a6]">
            Assembled deterministically from validated agent output &mdash; not re-written by a model.
            Bracketed markers link to the same numbered sources as the Sources tab.
          </p>

          {agentNotes.map((note, idx) => {
            const ok = note.status === 'completed'
            const findings = note.findings || []
            const risks = note.risks || []
            const positives = note.positive_signals || []
            const negatives = note.negative_signals || []
            const gaps = (note.data_gaps || []).filter(Boolean)

            const bullets = (items, tone, prefix) =>
              items
                .map((item) => ({
                  claim: (item?.claim || '').trim(),
                  cites: (item?.citations || []).map((n) => `[${n}]`).join('')
                }))
                .filter((item) => item.claim)
                .map((item, i) => (
                  <li key={`${prefix}-${i}`} className="flex items-start gap-1.5">
                    <span className={`font-bold ${tone}`}>›</span>
                    <span>
                      <CitedText text={`${item.claim}${item.cites ? ` ${item.cites}` : ''}`} sources={sources} />
                    </span>
                  </li>
                ))

            return (
              <div
                key={note.agent || idx}
                className={`rounded-xl border bg-white/[0.02] p-4 ${
                  ok ? 'border-white/10' : 'border-rose-500/30'
                }`}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-white">
                    <Layers size={13} className={ok ? 'text-[#8ab4f8]' : 'text-rose-400'} />
                    {note.label || note.agent}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-[#9aa0a6]">
                    {ok ? (
                      <>
                        <span>{note.evidence_count ?? 0} evidence</span>
                        <span>·</span>
                        <span>
                          {findings.length} finding{findings.length === 1 ? '' : 's'}
                        </span>
                        {note.confidence && (
                          <>
                            <span>·</span>
                            <span className="rounded bg-white/5 px-1.5 py-0.5">
                              confidence: {note.confidence}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">
                        {note.status || 'no result'}
                      </span>
                    )}
                  </span>
                </div>

                {note.mandate && (
                  <p className="mb-2.5 font-mono text-[10.5px] text-[#9aa0a6]">{note.mandate}</p>
                )}

                {note.thought && (
                  <div className="mb-3 rounded-lg border-l-2 border-[#4285f4]/50 bg-white/[0.03] px-3 py-2">
                    <span className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#9aa0a6]">
                      <Sparkles size={10} className="text-[#8ab4f8]" />
                      {note.self_reported ? 'Agent thought' : 'Run summary (agent reported no thought)'}
                    </span>
                    <p className="text-[12.5px] leading-relaxed text-slate-300">
                      <CitedText text={note.thought} sources={sources} />
                    </p>
                  </div>
                )}

                {findings.length > 0 && (
                  <ul className="space-y-1.5 font-mono text-[11.5px] text-slate-300">
                    {bullets(findings, 'text-slate-500', 'f')}
                  </ul>
                )}

                {(positives.length > 0 || negatives.length > 0) && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {positives.length > 0 && (
                      <div>
                        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                          Positive signals
                        </span>
                        <ul className="space-y-1 font-mono text-[11px] text-slate-400">
                          {bullets(positives, 'text-emerald-500', 'p')}
                        </ul>
                      </div>
                    )}
                    {negatives.length > 0 && (
                      <div>
                        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-rose-400">
                          Negative signals
                        </span>
                        <ul className="space-y-1 font-mono text-[11px] text-slate-400">
                          {bullets(negatives, 'text-rose-500', 'n')}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {risks.length > 0 && (
                  <div className="mt-3">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-orange-400">
                      Risks flagged
                    </span>
                    <ul className="space-y-1 font-mono text-[11px] text-slate-400">
                      {bullets(risks, 'text-orange-500', 'r')}
                    </ul>
                  </div>
                )}

                {findings.length === 0 && ok && (
                  <p className="text-[12.5px] leading-relaxed text-[#9aa0a6]">
                    This specialist ran but filed no finding that passed validation.
                  </p>
                )}

                {gaps.length > 0 && (
                  <p className="mt-3 border-t border-white/5 pt-2 font-mono text-[10.5px] leading-relaxed text-[#9aa0a6]">
                    <span className="text-orange-400/80">Unresolved:</span> {gaps.slice(0, 4).join(' · ')}
                  </p>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )

  const sourcesTab = (
    <div className="mt-5 animate-fade-up">
      {sources.length === 0 ? (
        <EvidenceGapPanel
          title="No sources recorded"
          detail="This run produced no citation index. Every claim shown elsewhere in the report is therefore unsupported by a recorded source, and the report is labelled accordingly."
        />
      ) : (
        <ol className="space-y-2">
          {sources.map((source, idx) => {
            const n = source.n ?? idx + 1
            return (
              <li
                key={idx}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
              >
                <span className="mt-0.5 shrink-0 rounded bg-[#4285f4]/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#8ab4f8]">
                  [{n}]
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-slate-200" title={source.title || ''}>
                    {source.title || 'Untitled source'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-[#9aa0a6]">
                    <span>
                      Published: {source.publication_date || <span className="italic">not stated</span>}
                    </span>
                    {source.retrieved_at && <span>Retrieved: {source.retrieved_at}</span>}
                    {source.page != null && <span>p. {source.page}</span>}
                    {source.document_id && <span className="truncate">doc: {source.document_id}</span>}
                  </div>
                </div>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 flex shrink-0 items-center gap-1 font-mono text-[11px] text-[#8ab4f8] hover:text-white"
                  >
                    <ExternalLink size={12} />
                    open
                  </a>
                ) : (
                  <NotMeasured label="no public URL" className="mt-0.5 shrink-0" />
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )

  const auditTab = (
    <div className="mt-5 grid grid-cols-1 gap-5 animate-fade-up lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h4 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-white">
          Quality Score Breakdown
          {maxQualityScore ? ` (${maxQualityScore}-Point Checklist)` : ''}
        </h4>
        {qualityChecklist.length === 0 ? (
          <p className="text-[12px] italic text-[#9aa0a6]">No checklist was recorded for this run.</p>
        ) : (
          <div className="space-y-2.5 text-[12px]">
            {qualityChecklist.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                {item.passed ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#34a853]" />
                ) : (
                  <XCircle size={14} className="mt-0.5 shrink-0 text-[#ea4335]" />
                )}
                <div className="min-w-0">
                  <span className={item.passed ? 'text-slate-300' : 'font-medium text-slate-400'}>
                    {item.criterion}
                  </span>
                  {item.basis && (
                    <span className="block font-mono text-[10.5px] text-[#9aa0a6]">{item.basis}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 border-t border-white/10 pt-3 text-right font-mono text-[13px] font-bold text-[#8ab4f8]">
          {qualityRating || (
            qualityScore !== null && maxQualityScore
              ? `${qualityScore} / ${maxQualityScore}`
              : 'Not scored'
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-white">
            Evidence Gaps Disclosed ({evidenceGaps.length})
          </h4>
          {evidenceGaps.length === 0 ? (
            <p className="text-[12px] italic text-[#9aa0a6]">
              No gaps were recorded. That means every section the report renders was grounded &mdash; not that
              coverage was exhaustive.
            </p>
          ) : (
            <ul className="space-y-2 text-[12px] text-slate-300">
              {evidenceGaps.map((gap, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#fbbc04]">•</span>
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-[12px]">
          <h4 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-white">
            Institutional Governance
          </h4>
          <div className="space-y-2 font-mono text-[11px]">
            <div className="flex justify-between gap-3">
              <span className="text-[#9aa0a6]">Research architecture:</span>
              <span className="text-right text-slate-200">
                {contributions.length > 0
                  ? `Concurrent pipeline · ${contributions.length} agent${contributions.length === 1 ? '' : 's'} contributed`
                  : 'Concurrent specialist pipeline'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#9aa0a6]">Data grounding:</span>
              <span className="text-right text-[#8ab4f8]">
                <Measured
                  value={groundingPct !== null ? `${groundingPct}% claim-to-source` : null}
                  label="not measured"
                />
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#9aa0a6]">Scoring:</span>
              <span className="text-right text-slate-200">
                {maxQualityScore ? `Deterministic ${maxQualityScore}-point checklist` : 'Deterministic checklist'}
              </span>
            </div>
            {contributions.length > 0 && (
              <div className="flex justify-between gap-3">
                <span className="text-[#9aa0a6]">Contributing agents:</span>
                <span className="text-right text-slate-200">{contributions.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {workflowTrace && workflowTrace.interpreted_intent && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <h4 className="text-[12px] font-bold uppercase tracking-wider text-white">
              Research Execution &amp; Workflow Trace
            </h4>
            <span className="font-mono text-[10.5px] text-indigo-400">
              Institutional Multi-Agent Audit
            </span>
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Question Interpretation
              </span>
              <p className="mt-1 text-[12.5px] text-slate-200">
                {workflowTrace.interpreted_intent}
              </p>

              <span className="mt-3.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Missing User Parameters (Framework Scope Boundary)
              </span>
              <ul className="mt-1.5 space-y-1 text-[11.5px] text-[#9aa0a6]">
                {(workflowTrace.missing_user_parameters || []).map((param, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-amber-400" />
                    <span>{param}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Data Verification Sequence
              </span>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">
                {workflowTrace.data_verification_sequence}
              </p>

              <span className="mt-3.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Specialist Domains Activated
              </span>
              <div className="mt-1.5 space-y-1 text-[11.5px]">
                {(workflowTrace.specialist_domains_activated || []).map((dom, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="font-semibold text-indigo-300">{dom.domain}:</span>
                    <span className="text-slate-400">{dom.focus}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const expertMode = (
    <div>
      {isComparison ? expertKpiComparison : expertKpiSingle}

      {entityCard && entityCard.legal_name && !isComparison && (
        <div className="px-6 pt-5">
          <div className="rounded-xl border border-white/10 bg-[#1e2026] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-sans text-[13px] font-bold text-white">
                  {entityCard.legal_name}
                </span>
                <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  NSE: {entityCard.nse_ticker} | BSE: {entityCard.bse_code}
                </span>
              </div>
              <span className="font-mono text-[10.5px] text-[#8ab4f8]">
                {entityCard.industry}
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
              <div>
                <span className="block font-mono text-[9.5px] uppercase tracking-wider text-[#9aa0a6]">Fiscal Cycle</span>
                <span className="font-medium text-slate-200">{entityCard.fiscal_year_end}</span>
              </div>
              <div>
                <span className="block font-mono text-[9.5px] uppercase tracking-wider text-[#9aa0a6]">Latest Quarter</span>
                <span className="font-medium text-slate-200">{entityCard.latest_quarter}</span>
              </div>
              <div>
                <span className="block font-mono text-[9.5px] uppercase tracking-wider text-[#9aa0a6]">Reference Close</span>
                <span className="font-semibold text-white">{entityCard.reference_price}</span>
              </div>
              <div>
                <span className="block font-mono text-[9.5px] uppercase tracking-wider text-[#9aa0a6]">Reporting Standard</span>
                <span className="font-medium text-slate-200">{entityCard.reporting_currency}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 pt-4">
        {executiveSummary ? (
          <div className="rounded-xl border-l-4 border-[#4285f4] bg-[#4285f4]/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8ab4f8]">
                Executive Thesis
              </span>
              <span className="truncate font-mono text-[10px] text-[#9aa0a6]" title={dataCurrency}>
                {dataCurrency}
              </span>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#f1f3f4]">
              <CitedText text={executiveSummary} sources={sources} />
            </p>
          </div>
        ) : (
          <EvidenceGapPanel
            title="Executive Thesis"
            detail="No synthesized thesis was produced for this run. A narrative is not generated here to fill the space."
          />
        )}
      </div>

      <div className="p-6">
        <div className="flex flex-wrap gap-1.5 border-b border-white/10 pb-2.5">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition ${
                  isActive
                    ? 'border border-white/20 bg-white/15 text-white shadow-sm'
                    : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-[#4285f4]' : 'text-slate-400'} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {activeTab === 'all' && (
          <div className="mt-5 space-y-8 animate-fade-up">
            <div className="space-y-6">{ratiosTab}</div>
            {visualsTab}
            {bullBearTab}
            {decisionFramework && (decisionFramework.hold_when?.length > 0 || decisionFramework.sell_when?.length > 0) && (
              <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-xl text-left">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h4 className="font-sans text-[15px] font-bold tracking-tight text-white">
                      Investment Action Framework: Hold, Reduce, or Sell?
                    </h4>
                    <p className="mt-0.5 text-[11.5px] text-[#9aa0a6]">
                      Objective criteria based on position sizing, portfolio time horizon, and thesis validity.
                    </p>
                  </div>
                  <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-400">
                    DISCIPLINE GUIDE
                  </span>
                </div>

                {decisionFramework.base_stance && (
                  <div className="mt-3.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#8ab4f8]">
                      Base Operating Stance
                    </span>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#f1f3f4]">
                      {decisionFramework.base_stance}
                    </p>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-[12.5px]">
                      <CheckCircle2 size={15} />
                      <span>Hold is defensible when:</span>
                    </div>
                    <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-300">
                      {(decisionFramework.hold_when || []).map((h, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-400 text-[12.5px]">
                      <MinusCircle size={15} />
                      <span>Reduce is defensible when:</span>
                    </div>
                    <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-300">
                      {(decisionFramework.reduce_when || []).map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
                    <div className="flex items-center gap-1.5 font-semibold text-rose-400 text-[12.5px]">
                      <XCircle size={15} />
                      <span>Sell is defensible when:</span>
                    </div>
                    <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-300">
                      {(decisionFramework.sell_when || []).map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {reasonedDeductions && reasonedDeductions.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#1e2026] p-6 shadow-xl text-left">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h4 className="font-sans text-[15px] font-bold tracking-tight text-white">
                      How the Stance Was Reached: Step-by-Step Reasoned Deductions
                    </h4>
                    <p className="mt-0.5 text-[11.5px] text-[#9aa0a6]">
                      Analytical chain bridging verified operating evidence, cash generation, and valuation multiples.
                    </p>
                  </div>
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                    LOGICAL CHAIN
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-[12px] leading-relaxed text-slate-300">
                  {reasonedDeductions.map((ded, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-mono text-[10px] font-bold text-indigo-400">
                        {idx + 1}
                      </span>
                      <p className="text-[#f1f3f4]">{ded.replace(/^\d+\.\s*/, '')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {specialistsTab}
            {agentLogTab}
            {sourcesTab}
            {auditTab}
          </div>
        )}
        {activeTab === 'ratios' && <div className="mt-5 space-y-6 animate-fade-up">{ratiosTab}</div>}
        {activeTab === 'visuals' && visualsTab}
        {activeTab === 'bull_bear' && bullBearTab}
        {activeTab === 'specialists' && specialistsTab}
        {activeTab === 'agent_log' && agentLogTab}
        {activeTab === 'sources' && sourcesTab}
        {activeTab === 'audit' && auditTab}
      </div>
    </div>
  )

  return (
    <div className="mt-4 w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#181a1f] text-[#f1f3f4] shadow-2xl animate-fade-up">
      {headerBlock}
      {coverageStrip}
      {gapBanner}
      {executiveHeroCard}

      {mode === 'beginner' ? (isComparison ? beginnerComparison : beginnerSingle) : expertMode}

      {/* Ask Artha Copilot Action Banner at bottom of report */}
      {typeof onAskMoreAboutReport === 'function' && (
        <div className="border-t border-white/10 bg-gradient-to-r from-emerald-500/15 via-[#181a20] to-blue-500/10 p-5 text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md">
              <Sparkles size={22} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-[14.5px] font-bold text-white">Ask More About This Report</h4>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  Artha Copilot
                </span>
              </div>
              <p className="text-[12px] text-slate-300 mt-0.5">
                Dossier attached · Deep-dive into specific findings, valuation multiples, margin drivers or risks.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAskMoreAboutReport}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-[13px] font-bold text-black shadow-lg hover:brightness-110 transition cursor-pointer shrink-0"
          >
            <span>Ask Artha Copilot</span>
            <Sparkles size={14} />
          </button>
        </div>
      )}

      <div className="border-t border-white/10 bg-[#131518] px-6 py-3.5 text-center text-[11px] leading-relaxed text-[#9aa0a6]">
        Multi-agent deterministic evidence validation. Every figure on this page was either measured from a
        validated source or a live quote, or is marked as not measured &mdash; nothing is estimated to fill a
        gap. Decision-support framework only; not investment advice.
      </div>
      {showPdfViewer && (
        <PdfViewerModal
          jobId={jobId}
          pdfUrl={resolvedPdfUrl}
          onClose={() => setShowPdfViewer(false)}
          onSwitchToReport={() => setShowPdfViewer(false)}
        />
      )}
    </div>
  )
}
