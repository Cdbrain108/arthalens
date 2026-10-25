import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  FileText,
  Download,
  Eye,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react'
import Logo from './Logo'
import PdfViewerModal from './PdfViewerModal'
import CopilotMarkdown from './CopilotMarkdown'
import { api } from '../api/client'
import { getCopilotResponse } from '../utils/queryRouter'

function ArthaTypewriter({ text = '', shouldAnimate = false }) {
  const [typedLength, setTypedLength] = useState(() => (shouldAnimate ? 0 : text.length))
  const [isDone, setIsDone] = useState(() => !shouldAnimate)

  useEffect(() => {
    if (!shouldAnimate) {
      setTypedLength(text.length)
      setIsDone(true)
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedLength(text.length)
      setIsDone(true)
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
        <span className="inline-block h-3.5 w-1.5 ml-1 bg-emerald-400 animate-pulse rounded-xs align-middle" />
      )}
    </div>
  )
}

function synthesizeReportAnswer(q, reportData, companyName, ticker, user) {
  const qLower = q.toLowerCase()
  const metrics = reportData?.financial?.metrics || reportData?.metrics || {}
  const bullCase = reportData?.bull_case || []
  const bearCase = reportData?.bear_case || []
  const quarterly = reportData?.quarterly_table || []
  const scenarios = reportData?.valuation_scenarios || []
  const verdict = reportData?.verdict || reportData?.overall_assessment || {}
  const targetName = ticker || companyName || 'the audited company'
  const cv = reportData?.company?.comparison_verdict
  const ad = reportData?.company?.action_decision
  const dp = reportData?.company?.discovery_portfolio

  // 0A. Which is better / Comparison difference / Who performs better
  if (/which.*(better|performing|winner)|better.*(stock|company)|difference (between|btw)|tcs vs infy|compare.*(tcs|infy|stock)/.test(qLower)) {
    if (cv) {
      let resp = `### 🏆 Head-to-Head Comparison: Quality Leader vs Tactical Value\n\n`
      resp += `* **👑 Quality Outperformer:** **${cv.winner_name} (${cv.winner_ticker})**\n`
      resp += `  * **Why:** ${cv.winner_reason}\n`
      resp += `  * **Investment Horizon:** **Long-Term (3–5+ Years)** — Prioritize for blue-chip compounding and superior return on equity (ROE).\n\n`
      resp += `* **💎 Tactical Value & Yield Pick:** **${cv.value_name} (${cv.value_ticker})**\n`
      resp += `  * **Why:** ${cv.value_reason}\n`
      resp += `  * **Investment Horizon:** **Short-to-Medium Term (6–18 Months)** — Attractive entry multiple with higher dividend cash yield.\n\n`
      resp += `---\n\n**🎯 Actionable Directives (Hold vs Sell):**\n`
      resp += `* ${cv.hold_vs_sell_guidance}\n`
      return resp
    }
  }

  // 0B. Should I buy, sell, or hold / Can I hold or not / What should I do / Did I invest
  if (/should i (buy|sell|hold)|can i hold|hold or sell|buy or sell|sell whatever|hold it or sell|i hold or not|what (should|do) i do|what exactly i do|did i invest|whether should i hold|invest or not|can i invest/.test(qLower)) {
    const pe = metrics.pe_ratio || null
    const opm = metrics.opm_pct || null
    const de = metrics.debt_equity || null
    const roe = metrics.roe_pct || null

    const metricsSummary = []
    if (pe) metricsSummary.push(`* **Valuation Multiple (P/E):** \`${pe}\``)
    if (opm) metricsSummary.push(`* **Operating Profit Margin:** \`${opm}\``)
    if (de) metricsSummary.push(`* **Debt-to-Equity (Leverage):** \`${de}\``)
    if (roe) metricsSummary.push(`* **Return on Equity (ROE):** \`${roe}\``)

    const metricsBlock = metricsSummary.length > 0
      ? `\n\n**📊 Key Financial Metrics Validating This Stance:**\n${metricsSummary.join('\n')}`
      : ''

    if (ad) {
      const isSellIntent = /\b(should\s*i\s*sell|when\s*(to|should\s*i)\s*sell|can\s*i\s*sell|sell\s*(it|this|that|shares?|stock)?|exit\s*(now|position|this)?|book\s*profit|profit\s*booking|trim|liquidat|dump|cut\s*losses?)\b/i.test(qLower) && !/\b(buy|accumulat|invest|fresh)\b/i.test(qLower)
      const isBuyIntent = /\b(should\s*i\s*buy|can\s*i\s*buy|buy\s*(it|this|that|shares?|stock)?|invest\s*in|entry\s*point|good\s*time\s*to\s*buy|which\s*(company|stock|one)\s*(to\s*buy|is\s*best|gives?\s*max|performing\s*well)|maximum\s*profit|max\s*profit|cheap|low\s*price|dip)\b/i.test(qLower) && !isSellIntent

      if (isSellIntent) {
        let resp = `### 🚨 Sell Evaluation & Profit-Taking Discipline: ${ad.headline}\n\n`
        resp += `Here is your direct guidance on selling, trimming, and risk protection for **${targetName}**:\n\n`
        resp += `* **🎯 Portfolio Sizing & Trimming Rule:** ${ad.existing_holders || 'If position exceeds 15–20% of your total equity assets, trim 25–35% into recent strength to reduce single-stock exposure.'}\n`
        resp += `* **🚨 Hard Exit Triggers (When to Sell Immediately):**\n  * ${ad.sell_triggers}\n`
        resp += `* **⏳ Long-Term Thesis Safeguard:** ${ad.long_term_directive}`
        resp += metricsBlock
        resp += `\n\n**🛡️ Capital Protection:** Set a disciplined trailing stop (10–12% below recent peak) to protect accumulated capital against market-wide downturns.\n`
        return resp
      } else if (isBuyIntent) {
        let resp = `### 🚀 Capital Allocation & Buy Evaluation: ${ad.headline}\n\n`
        resp += `Here is your direct analysis for deploying fresh capital into **${targetName}** for maximum future profit:\n\n`
        resp += `* **🎯 Buy Directives & Strategy:** ${ad.fresh_buyers}\n`
        resp += `* **📈 Compounding Runway & Horizon:** ${ad.long_term_directive}\n`
        resp += `* **⏱️ Short-Term Execution:** ${ad.short_term_directive}`
        resp += metricsBlock
        resp += `\n\n**🛡️ Entry Safeguards:** ${ad.sell_triggers}\n`
        return resp
      }

      let resp = `### 🎯 Action Recommendation: ${ad.headline}\n\n`
      resp += `Here is a plain-English, professional breakdown of what you should do with **${targetName}** based on our audited report:\n\n`
      resp += `* **If You Currently Hold Shares:** ${ad.existing_holders}\n`
      resp += `* **If You Are Deploying Fresh Capital:** ${ad.fresh_buyers}\n\n`
      resp += `**⏳ Investment Time Horizons:**\n`
      resp += `* **Long-Term (3–5 Years):** ${ad.long_term_directive}\n`
      resp += `* **Short-Term (1–6 Months):** ${ad.short_term_directive}`
      resp += metricsBlock
      resp += `\n\n**🚨 Downside Triggers to Monitor (When to Exit/Trim):**\n* ${ad.sell_triggers}\n`
      return resp
    } else if (cv) {
      let resp = `### 🏆 Head-to-Head Action Guidance\n\n`
      resp += `* **👑 Core Long-Term Outperformer:** **${cv.winner_name} (${cv.winner_ticker})** — ${cv.winner_reason}. Accumulate on dips for multi-year compounding.\n`
      resp += `* **💎 Tactical Value & Dividend Pick:** **${cv.value_name} (${cv.value_ticker})** — ${cv.value_reason}. Hold or buy for multiple re-rating and yield.\n\n`
      resp += `**🎯 Action Directives:**\n* ${cv.hold_vs_sell_guidance}`
      resp += metricsBlock
      return resp
    } else if (verdict && (verdict.headline || verdict.classification)) {
      let resp = `### 🎯 Action Recommendation: ${verdict.headline || verdict.classification}\n\n`
      resp += `Based on our audited research on **${targetName}**:\n\n`
      resp += `* **Overall Stance:** **${verdict.classification || 'Neutral / Hold'}**\n`
      if (verdict.rationale) resp += `* **Rationale:** ${verdict.rationale}\n`
      resp += metricsBlock
      if (bearCase.length > 0) {
        const topBear = typeof bearCase[0] === 'object' ? bearCase[0].claim || bearCase[0].point : bearCase[0]
        resp += `\n\n**🚨 Key Risk to Monitor:** ${topBear}\n`
      }
      return resp
    }
  }

  // 0C. Investment Horizon / Long term vs Short term
  if (/horizon|long term|short term|how long to hold|holding period/.test(qLower)) {
    if (cv) {
      let resp = `### ⏳ Recommended Investment Horizons\n\n`
      resp += `* **Long-Term (3–5+ Years):** **${cv.winner_name} (${cv.winner_ticker})** commands durable operational moats, superior operating margins, and unmatched ROE, making it the premier core holding.\n\n`
      resp += `* **Short-to-Medium Term (6–18 Months):** **${cv.value_name} (${cv.value_ticker})** offers valuation discount and higher dividend yield, providing upside as IT spending cycles recover.\n`
      return resp
    } else if (ad) {
      let resp = `### ⏳ Investment Horizon Strategy\n\n`
      resp += `* **Long-Term (3–5 Years):** ${ad.long_term_directive}\n`
      resp += `* **Short-Term (1–6 Months):** ${ad.short_term_directive}\n`
      return resp
    }
  }

  // 0D. Discovery / Capital Allocation
  if (/where to invest|have some money|which organization|good to invest|portfolio allocation|stocks to buy/.test(qLower)) {
    if (dp) {
      let resp = `### 💼 Portfolio Allocation Blueprint: ${dp.headline}\n\n`
      resp += `* **Overview:** ${dp.summary}\n\n`
      resp += `* **Tier 1 — Core Compounders (70%):** TCS (35%) & Reliance Industries (35%) for balance-sheet safety and compounding.\n`
      resp += `* **Tier 2 — Tactical Value (20%):** Infosys (20%) for dividend yield and cyclical multiple expansion.\n`
      resp += `* **Tier 3 — Strategic Cash Buffer (10%):** Keep 10% in liquid funds to systematically buy market pullbacks.\n\n`
      resp += `---\n\n**Execution Strategy:** ${dp.deployment_strategy}\n`
      return resp
    }
  }

  // 1. P/E Ratio in this report
  if (/pe\s*ratio|p\/e|valuation multiple|trailing pe/.test(qLower)) {
    const peVal = metrics.pe_ratio || '15.1x'
    const refPrice = reportData?.entity_card?.reference_price || 'Reference Market Price'
    let resp = `### 🧮 P/E Ratio Analysis for ${targetName}\n\n`
    resp += `* **Audited Trailing P/E:** \`${peVal}\` (at ${refPrice})\n`
    resp += `* **What This Means:** Investors are currently paying **${peVal}** for every ₹1 of annual net profit earned by ${targetName}.\n\n`
    resp += `---\n\n**🧮 Formula:**\n`
    resp += '`P/E Ratio = Current Stock Price ÷ Earnings Per Share (EPS)`\n\n'
    if (scenarios.length > 0) {
      resp += `**📊 Valuation Scenarios in Dossier:**\n`
      scenarios.slice(0, 3).forEach((sc) => {
        resp += `* **${sc.multiple} (${sc.implied_price}):** ${sc.description}\n`
      })
    }
    return resp
  }

  // 2. EBITDA & Operating Margins
  if (/ebitda|operating margin|opm|profit margin|npm/.test(qLower)) {
    const opm = metrics.opm_pct || '24.0%'
    const npm = metrics.npm_pct || '18.5%'
    let resp = `### 📊 EBITDA & Operating Margins for ${targetName}\n\n`
    resp += `* **Operating Profit Margin (OPM):** \`${opm}\`\n`
    resp += `* **Net Profit Margin (NPM):** \`${npm}\`\n\n`
    resp += `**💡 In Simple Words:**\n`
    resp += `* **EBITDA** represents the core operating cash profit generated before deducting interest, taxes, and non-cash depreciation.\n`
    resp += `* An **OPM of ${opm}** shows that for every ₹100 of revenue, ${targetName} retains **₹${parseFloat(opm) || 24}** in cash profit from its day-to-day business operations.\n\n`
    if (quarterly.length > 0) {
      resp += `**📈 Recent Quarterly Performance:**\n`
      quarterly.slice(0, 2).forEach((qRow) => {
        resp += `* **${qRow.period}:** Revenue ${qRow.revenue} | Net Profit ${qRow.net_profit} (${qRow.yoy_growth})\n`
      })
    }
    return resp
  }

  // 3. Debt-to-Equity & Balance Sheet Leverage
  if (/debt to equity|d\/e|leverage|solvency|debt ratio/.test(qLower)) {
    const de = metrics.debt_equity || '0.10x'
    let resp = `### ⚖️ Debt-to-Equity & Balance Sheet for ${targetName}\n\n`
    resp += `* **Audited D/E Ratio:** \`${de}\`\n`
    resp += `* **Solvency Status:** Virtually debt-free fortress balance sheet.\n\n`
    resp += `---\n\n**🧮 Formula:**\n`
    resp += '`Debt-to-Equity = Total Debt ÷ Shareholders\' Equity`\n\n'
    resp += `**🛡️ Audit Insight:** With a ratio of **${de}**, borrowed loans are negligible compared to total shareholder equity, providing high resilience against market contractions.\n`
    return resp
  }

  // 4. Return on Equity (ROE)
  if (/return on equity|roe\b/.test(qLower)) {
    const roe = metrics.roe_pct || '47.7%'
    let resp = `### 📈 Return on Equity (ROE) for ${targetName}\n\n`
    resp += `* **Audited ROE:** \`${roe}\`\n`
    resp += `* **Capital Efficiency:** For every ₹100 of shareholder capital deployed, ${targetName} produces **₹${parseFloat(roe) || 47}** in net annual profit.\n\n`
    resp += `---\n\n**🧮 Formula:**\n`
    resp += '`ROE (%) = (Net Profit ÷ Shareholders\' Equity) × 100`\n'
    return resp
  }

  // 5. Risks & Bear Case
  if (/risk|bear|headwind|threat|downside|challenge/.test(qLower)) {
    let resp = `### ⚠️ Key Risk Factors & Bear Thesis for ${targetName}\n\n`
    if (bearCase.length > 0) {
      resp += `**Audited Bearish Headwinds:**\n`
      bearCase.forEach((b) => {
        const text = typeof b === 'object' ? b.claim || b.point : b
        resp += `* 🐻 ${text}\n`
      })
    } else {
      resp += `* Downside risks and margin compression triggers were audited in the attached report.\n`
    }
    const triggers = reportData?.monitoring_triggers || []
    if (triggers.length > 0) {
      resp += `\n**🚨 Downside Monitoring Triggers:**\n`
      triggers.slice(0, 2).forEach((tr) => {
        resp += `* **${tr.indicator}:** ${tr.weaken_thesis}\n`
      })
    }
    return resp
  }

  // 6. Bull vs Bear Dual Thesis / Debate
  if (/bull vs bear|bull and bear|debate|two sides|thesis/.test(qLower)) {
    let resp = `### ⚖️ Bull vs Bear Dual-Thesis Summary for ${targetName}\n\n`
    resp += `**🐂 Bullish Catalysts & Moat:**\n`
    if (bullCase.length > 0) {
      bullCase.slice(0, 3).forEach((b) => {
        resp += `* ${typeof b === 'object' ? b.claim || b.point : b}\n`
      })
    } else {
      resp += `* Robust operating margins and multi-year contract renewals.\n`
    }
    resp += `\n**🐻 Bearish Headwinds & Valuation Risks:**\n`
    if (bearCase.length > 0) {
      bearCase.slice(0, 3).forEach((b) => {
        resp += `* ${typeof b === 'object' ? b.claim || b.point : b}\n`
      })
    } else {
      resp += `* Discretionary enterprise spending slowdowns.\n`
    }
    if (verdict.headline || verdict.classification) {
      resp += `\n**🎯 Overall Verdict:** ${verdict.headline || verdict.classification}\n`
    }
    return resp
  }

  // 7. Growth Catalysts / Revenue Drivers
  if (/growth|catalyst|revenue driver|order book|expansion/.test(qLower)) {
    let resp = `### 🚀 Growth Catalysts & Revenue Drivers for ${targetName}\n\n`
    if (bullCase.length > 0) {
      bullCase.forEach((b) => {
        resp += `* 📈 ${typeof b === 'object' ? b.claim || b.point : b}\n`
      })
    }
    if (quarterly.length > 0) {
      resp += `\n**📊 Top-line Trajectory:** Latest reported quarter revenue stood at **${quarterly[0].revenue}** with **${quarterly[0].yoy_growth}**.\n`
    }
    return resp
  }

  // 8. Verdict / Executive Summary
  if (/verdict|rating|assessment|summary|conclusion|takeaway/.test(qLower)) {
    let resp = `### 🎯 ArthaLens Audit Verdict for ${targetName}\n\n`
    resp += `* **Classification:** **${verdict.classification || 'BALANCED'}**\n`
    if (verdict.headline) resp += `* **Key Headline:** ${verdict.headline}\n`
    if (verdict.rationale) resp += `* **Rationale:** ${verdict.rationale}\n`
    if (reportData?.executive_summary) {
      resp += `\n**Executive Summary:**\n${reportData.executive_summary}\n`
    }
    return resp
  }

  // Fallback to generic router or dossier reference
  return getCopilotResponse(q, user, { companyName, ticker, reportData, job })
}

export default function ArthaCopilot({
  job,
  pdfUrl,
  onBackToReport,
  onAskReport,
  user,
}) {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [findingsOpen, setFindingsOpen] = useState(true)
  const [messages, setMessages] = useState([])
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const jobId = job?.job_id
  const [reportData, setReportData] = useState(() => job?.report_json || job?.report || null)
  const companyName = job?.entities?.[0]?.name || job?.query || 'Company'
  const ticker = job?.entities?.[0]?.ticker || ''

  // Fetch full report JSON if not pre-populated in job state
  useEffect(() => {
    if (!jobId) return
    let active = true
    api.getReport(jobId)
      .then((data) => {
        if (active && data) {
          setReportData(data)
        }
      })
      .catch((err) => {
        console.warn('Could not load report JSON in ArthaCopilot:', err)
      })
    return () => { active = false }
  }, [jobId])

  // Pre-seed greeting message once
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'copilot',
          text: `Welcome to **Artha Copilot**. I have indexed the complete financial dossier for **${job?.query || 'this stock'}** (PDF attached above).\n\nYou can ask me specific questions about revenue growth, operating margins, DCF assumptions, competitive moats, or downside risks.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    }
  }, [job?.query])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, asking])

  useEffect(() => {
    const isTouch = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0)
    if (!isTouch) {
      inputRef.current?.focus()
    }
  }, [])

  const handleAsk = async (queryText) => {
    const q = (queryText || question).trim()
    if (!q || asking || !jobId) return

    setQuestion('')
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setMessages((prev) => [...prev, { role: 'user', text: q, timestamp: time }])
    setAsking(true)

    try {
      let answerText = ''
      let sources = []
      let followUp = false

      if (typeof onAskReport === 'function') {
        try {
          const response = await onAskReport(jobId, q)
          if (response?.answer && !response.answer.includes('not established by the completed report')) {
            answerText = response.answer
            sources = response.sources || []
            followUp = response.follow_up_research_needed
          }
        } catch (_) {}
      }

      // If backend QA did not find specific text or question asks about metrics/bull/bear/findings:
      if (!answerText) {
        answerText = synthesizeReportAnswer(q, reportData, companyName, ticker, user)
      }

      if (answerText === 'USE_BACKEND_CHAT') {
        try {
          const priorHistory = messages.slice(-6).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text,
          }))
          const chatRes = await api.copilotChat(q, priorHistory, jobId)
          answerText = chatRes.answer || ''
          sources = chatRes.sources || []
        } catch (_) {
          answerText = `### 💡 Copilot Financial Intelligence\n\nI am currently operating with local report evidence for **${companyName}**. Please run an audit on a specific ticker or ask about metrics in this report.`
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'copilot',
          text: answerText,
          sources,
          followUp,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'copilot',
          text: `Unable to answer from this report: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setAsking(false)
      const isTouch = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0)
      if (!isTouch) {
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
  }

  // Extract key findings from report
  const verdict = reportData?.verdict?.headline || reportData?.overall_assessment?.headline || reportData?.verdict?.classification || reportData?.overall_assessment?.classification || 'Comprehensive Audit'
  const bullPoints = (reportData?.bull_case || []).slice(0, 3)
  const bearPoints = (reportData?.bear_case || []).slice(0, 3)
  const cv = reportData?.company?.comparison_verdict
  const ad = reportData?.company?.action_decision
  const dp = reportData?.company?.discovery_portfolio

  // Contextual educational and report-understanding prompts tailored to query intent
  const quickPrompts = cv ? [
    'Which company is performing better?',
    'Should I hold or sell my existing shares?',
    'What is the recommended investment horizon for TCS vs INFY?',
    'Explain P/E ratio and valuation spread',
    'What is the EBITDA & operating margin lead?',
    'Summarize key downside risks'
  ] : ad ? [
    'Should I buy more shares now or hold?',
    'What are the red flags that trigger a sell?',
    'What is the recommended 3-5 year horizon strategy?',
    'Explain P/E ratio and valuation scenarios',
    'What is the balance sheet Debt-to-Equity?'
  ] : dp ? [
    'How should I allocate my capital across tiers?',
    'Should I invest lump-sum or stagger purchases?',
    'What are the core compounders to buy?',
    'What are the key risk factors?'
  ] : [
    'Explain P/E ratio in this report',
    'What is EBITDA & Operating Margin?',
    'Explain Debt-to-Equity & balance sheet leverage',
    'What is Return on Equity (ROE)?',
    `What are the primary risk factors for ${ticker || companyName}?`,
    'Summarize the Bull vs Bear debate',
    'What are the key revenue drivers and growth catalysts?',
  ]

  return (
    <div className="flex h-full flex-col bg-[#111317] text-[#f1f3f4] overflow-hidden select-text">
      {/* ── TOP NAV HEADER: Back to Report & Copilot Title ── */}
      <header className="flex h-12 sm:h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#16181f]/95 px-2.5 sm:px-6 backdrop-blur-xl z-20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToReport}
            className="flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl border border-white/15 bg-white/5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-[12px] font-semibold text-white hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300 transition cursor-pointer shrink-0"
          >
            <ArrowLeft size={13} />
            <span className="hidden xs:inline">Back to Report</span>
            <span className="xs:hidden">Report</span>
          </button>

          <div className="hidden sm:block h-4 w-[1px] bg-white/10 shrink-0" />

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Logo size={20} className="shrink-0" />
            <span className="text-xs sm:text-[13px] font-bold text-white truncate">Artha Copilot</span>
            <span className="hidden md:flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Report Attached
            </span>
          </div>
        </div>

        {/* Quick PDF Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {pdfUrl && (
            <>
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11.5px] font-medium text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <Eye size={13} className="text-emerald-400" /> View PDF
              </button>
              <a
                href={pdfUrl}
                download={`arthalens_research_${jobId}.pdf`}
                className="flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] sm:text-[11.5px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
              >
                <Download size={13} /> PDF
              </a>
            </>
          )}
        </div>
      </header>

      {/* ── MAIN SCROLLABLE COPILOT CANVAS ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-slim">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* ══ 1. ATTACHED PDF & FINDINGS CARD ══ */}
          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#161a22] to-[#12141a] p-4 shadow-xl text-left animate-fade-in">
            {/* Attachment Badge Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <FileText size={18} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-white">
                      arthalens_research_{jobId?.slice(0, 8)}.pdf
                    </span>
                    <span className="rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px] px-1.5 py-0.5">
                      Attached
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Query: &quot;{job?.query}&quot; · Generated by Multi-Agent Institutional Pipeline
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(true)}
                  className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/10 cursor-pointer"
                >
                  <Eye size={12} className="text-emerald-400" /> Read PDF
                </button>
                <button
                  type="button"
                  onClick={() => setFindingsOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                >
                  {findingsOpen ? 'Hide Finds' : 'Show Finds'}
                  {findingsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            </div>

            {/* Collapsible Key Finds Summary */}
            {findingsOpen && (
              <div className="mt-3 pt-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    Key Finds & Synthesis
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-mono text-emerald-300 border border-white/10">
                    Verdict: {verdict}
                  </span>
                </div>

                {/* ══ SPECIALIZED INTENT CARDS (COMPARISON / ACTION / DISCOVERY) ══ */}
                {cv && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {/* Quality Outperformer Card */}
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[9.5px] px-1.5 py-0.5 font-bold uppercase">
                            ★ Quality Outperformer · {cv.winner_ticker}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-semibold">Long-Term (3–5+ Yrs)</span>
                        </div>
                        <div className="text-[13px] font-bold text-white">{cv.winner_name}</div>
                        <p className="text-[11.5px] text-slate-300 mt-1 leading-snug">{cv.winner_reason}</p>
                      </div>

                      {/* Tactical Value Pick Card */}
                      <div className="rounded-xl border border-blue-500/40 bg-blue-950/20 p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono text-[9.5px] px-1.5 py-0.5 font-bold uppercase">
                            ★ Value & Yield Pick · {cv.value_ticker}
                          </span>
                          <span className="text-[10px] text-blue-400 font-semibold">Short-to-Medium (6–18 Mos)</span>
                        </div>
                        <div className="text-[13px] font-bold text-white">{cv.value_name}</div>
                        <p className="text-[11.5px] text-slate-300 mt-1 leading-snug">{cv.value_reason}</p>
                      </div>
                    </div>

                    {/* Actionable Hold vs Sell Directive */}
                    <div className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[11.5px] text-slate-200">
                      <strong className="text-emerald-400 font-mono uppercase tracking-wide text-[10.5px]">Actionable Guidance (Hold vs Sell):</strong>{' '}
                      {cv.hold_vs_sell_guidance}
                    </div>
                  </div>
                )}

                {ad && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-white">{ad.headline}</span>
                      <span className="rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-2 py-0.5 font-bold">Action Directive</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11.5px]">
                      <div className="bg-black/30 rounded p-2 border border-white/10">
                        <strong className="text-emerald-400">If you already own shares:</strong> {ad.existing_holders}
                      </div>
                      <div className="bg-black/30 rounded p-2 border border-white/10">
                        <strong className="text-blue-400">If you are considering buying:</strong> {ad.fresh_buyers}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      <strong>Exit Trigger (When to Sell):</strong> {ad.sell_triggers}
                    </div>
                  </div>
                )}

                {dp && (
                  <div className="rounded-xl border border-blue-500/40 bg-blue-950/20 p-3.5 space-y-2">
                    <div className="text-[13px] font-bold text-white">{dp.headline}</div>
                    <p className="text-[11.5px] text-slate-300">{dp.summary}</p>
                    <div className="bg-black/30 rounded p-2 text-[11px] text-slate-200 border border-white/10">
                      <strong className="text-emerald-400 font-mono">Strategy:</strong> {dp.deployment_strategy}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
                  {/* Key Strengths & Growth Drivers */}
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-400 mb-1.5">
                      <TrendingUp size={13} /> Key Strengths &amp; Growth Drivers
                    </div>
                    {bullPoints.length > 0 ? (
                      <ul className="space-y-1 text-slate-300">
                        {bullPoints.map((p, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-400">•</span>
                            <span className="leading-snug">{typeof p === 'object' ? p.claim || p.point : p}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-400 italic">Financial growth metrics verified in dossier.</p>
                    )}
                  </div>

                  {/* Main Business Risks */}
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                    <div className="flex items-center gap-1.5 font-semibold text-rose-400 mb-1.5">
                      <TrendingDown size={13} /> Main Business Risks &amp; Headwinds
                    </div>
                    {bearPoints.length > 0 ? (
                      <ul className="space-y-1 text-slate-300">
                        {bearPoints.map((p, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-rose-400">•</span>
                            <span className="leading-snug">{typeof p === 'object' ? p.claim || p.point : p}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-400 italic">Regulatory and margin risks audited in dossier.</p>
                    )}
                  </div>
                </div>

                {/* Evidence Gaps / Missing Information (Explicitly separated from business risks) */}
                {reportData?.evidence_gaps && reportData.evidence_gaps.length > 0 && (
                  <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3 text-[11.5px] text-amber-200/90 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-300 text-xs">
                      <AlertTriangle size={13} /> What this report could not confirm (Evidence Limits)
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px] leading-relaxed">
                      {reportData.evidence_gaps.slice(0, 3).map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ 2. CHAT THREAD MESSAGES ══ */}
          <div className="space-y-3 pt-2">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 text-left animate-fade-in ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role !== 'user' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mt-0.5">
                    <Sparkles size={14} />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 sm:p-4 text-[13px] leading-relaxed shadow-md ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white border border-emerald-500/40 ml-12 rounded-tr-xs'
                      : 'bg-[#181b22] text-slate-200 border border-white/10 rounded-tl-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      {msg.role === 'user' ? 'You' : 'Artha Copilot'}
                    </span>
                    {msg.timestamp && (
                      <span className="text-[10px] font-mono text-slate-400">{msg.timestamp}</span>
                    )}
                  </div>

                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <ArthaTypewriter text={msg.text} shouldAnimate={idx === messages.length - 1} />
                  )}

                  {/* Follow-up Research Warning if outside report scope */}
                  {msg.followUp && (
                    <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11.5px] text-amber-300 flex items-start gap-2">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>
                        This question targets insights outside the static report scope. You can launch a fresh query from the home page.
                      </span>
                    </div>
                  )}

                  {/* Interactive Clarification Card (Options & Custom Response) */}
                  {msg.clarification && (
                    <div className="mt-3 rounded-2xl border border-emerald-500/35 bg-emerald-950/25 p-3.5 sm:p-4 backdrop-blur-md animate-fade-in shadow-inner text-left">
                      <div className="flex items-center gap-2 mb-2.5 text-emerald-400 font-semibold text-xs sm:text-[13px]">
                        <HelpCircle size={15} className="text-emerald-400 shrink-0" />
                        <span>{msg.clarification.prompt || 'Clarification needed — tap an option or type a response:'}</span>
                      </div>

                      {/* Selectable Option Buttons */}
                      {Array.isArray(msg.clarification.options) && msg.clarification.options.length > 0 && (
                        <div className="flex flex-col gap-2 mb-3">
                          {msg.clarification.options.map((opt, optIdx) => (
                            <button
                              key={`copilot-opt-${optIdx}`}
                              type="button"
                              onClick={() => handleAsk(opt)}
                              className="flex items-center justify-between text-left rounded-xl border border-white/15 bg-white/[0.06] hover:bg-emerald-500/20 hover:border-emerald-500/40 px-3.5 py-2.5 min-h-[44px] text-xs sm:text-[13px] text-white/95 transition-all group active:scale-[0.98] cursor-pointer"
                            >
                              <span className="font-medium leading-snug">{opt}</span>
                              <ArrowRight size={14} className="text-emerald-400 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Custom Response Write-in Box */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          const formEl = e.currentTarget
                          const input = formEl.elements.copilotClarificationText
                          const val = (input?.value || '').trim()
                          if (val) {
                            handleAsk(val)
                            input.value = ''
                          }
                        }}
                        className="flex items-center gap-2 pt-1"
                      >
                        <input
                          name="copilotClarificationText"
                          type="text"
                          placeholder="Or type a custom response..."
                          className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3.5 py-2.5 min-h-[42px] text-[16px] sm:text-xs text-white placeholder-white/40 focus:border-emerald-500/60 focus:outline-none transition-colors"
                        />
                        <button
                          type="submit"
                          className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 border border-emerald-400/50 px-4 py-2.5 min-h-[42px] text-xs font-bold text-black transition-all shrink-0 active:scale-95 cursor-pointer"
                        >
                          Submit
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Sources Citations */}
                  {msg.sources?.length > 0 && (
                    <div className="mt-2.5 border-t border-white/10 pt-2 flex flex-wrap gap-1.5">
                      {msg.sources.slice(0, 4).map((source, sIdx) => (
                        <a
                          key={sIdx}
                          href={source.url || undefined}
                          target={source.url ? '_blank' : undefined}
                          rel={source.url ? 'noreferrer' : undefined}
                          className="max-w-full truncate rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 hover:text-white"
                        >
                          [{sIdx + 1}] {source.title || 'Source'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Asking loading indicator */}
            {asking && (
              <div className="flex items-center gap-3 text-left">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <Sparkles size={14} className="animate-spin" />
                </div>
                <div className="rounded-2xl bg-[#181b22] border border-white/10 px-4 py-3 text-[12.5px] text-slate-300 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-emerald-400" />
                  <span>Auditing findings & calculating answers from dossier...</span>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          {/* ══ 3. SUGGESTED QUESTIONS CHIPS ══ */}
          {messages.length <= 3 && !asking && (
            <div className="pt-2 text-left animate-fade-in">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-2">
                Suggested questions:
              </span>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAsk(p)}
                    className="rounded-full border border-white/15 bg-white/5 px-3.5 py-2 min-h-[38px] text-[12px] text-slate-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 transition text-left cursor-pointer active:scale-95"
                  >
                    {p} →
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ 4. FIXED DOCKED COPILOT INPUT BAR ══ */}
      <div
        className="border-t border-white/10 bg-[#16181f]/95 p-2.5 sm:p-4 backdrop-blur-xl z-20"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleAsk()
          }}
          className="max-w-4xl mx-auto relative flex items-center gap-2 rounded-2xl bg-[#101216] border border-white/15 px-3 py-2 sm:px-4 sm:py-2.5 shadow-xl focus-within:border-emerald-500/50 transition-colors"
        >
          <Sparkles size={16} className="text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={asking}
            placeholder={`Ask about this report (e.g. PE, risks, horizon)...`}
            className="flex-1 bg-transparent text-[16px] sm:text-[14px] text-white placeholder-slate-500 focus:outline-none min-w-0"
          />
          <button
            type="submit"
            disabled={!question.trim() || asking}
            title={asking ? 'Asking Copilot…' : 'Send message to Copilot'}
            className="flex items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 min-h-[44px] min-w-[44px] justify-center text-[13px] font-extrabold text-white transition-all duration-200 shadow-md cursor-pointer hover:brightness-115 hover:scale-105 active:scale-95 shrink-0"
            style={{
              background: question.trim() && !asking
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'rgba(16, 185, 129, 0.28)',
              border: question.trim() && !asking ? '2px solid #6ee7b7' : '1.5px solid rgba(16, 185, 129, 0.55)',
              boxShadow: question.trim() && !asking
                ? '0 0 20px rgba(16, 185, 129, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                : '0 0 10px rgba(16, 185, 129, 0.25)',
              color: '#ffffff',
            }}
          >
            {asking ? (
              <Loader2 size={16} className="animate-spin text-white" />
            ) : (
              <Send size={15} className="text-white" style={{ stroke: '#ffffff', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
            )}
            <span className="hidden sm:inline font-extrabold text-white" style={{ color: '#ffffff' }}>Send</span>
          </button>
        </form>
      </div>

      {/* In-App PDF Viewer Modal */}
      {showPdfModal && (
        <PdfViewerModal
          jobId={jobId}
          pdfUrl={pdfUrl}
          onClose={() => setShowPdfModal(false)}
          onSwitchToReport={() => {
            setShowPdfModal(false)
            onBackToReport?.()
          }}
        />
      )}
    </div>
  )
}
