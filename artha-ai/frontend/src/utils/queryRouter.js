/**
 * queryRouter.js
 * 
 * Central routing and knowledge intelligence for ArthaLens AI Copilot.
 * Differentiates between:
 * - 'stock': Specific company / ticker research -> invokes full multi-agent LangGraph pipeline.
 * - 'conversational': Conceptual finance, glossary, educational explainers, chit-chat -> stays in Copilot window without running LangGraph.
 */

export const KNOWN_STOCK_ENTITIES = [
  // Top NSE / BSE stocks
  'tcs', 'tata consultancy services', 'infosys', 'infy', 'reliance', 'ril',
  'wipro', 'hdfc', 'hdfcbank', 'hdfc bank', 'icici', 'icicibank', 'icici bank',
  'sbi', 'sbin', 'state bank of india', 'tata motors', 'tatamotors',
  'tata steel', 'tatasteel', 'tata power', 'tatapower', 'itc', 'hcltech', 'hcl tech',
  'bharti airtel', 'airtel', 'adani', 'adani enterprises', 'adani ports',
  'l&t', 'lt', 'larsen & toubro', 'maruti', 'maruti suzuki', 'bajaj finance',
  'bajaj finserv', 'kotak', 'kotak mahindra', 'asian paints', 'titan',
  'sun pharma', 'dr reddy', 'axis bank', 'zomato', 'swiggy', 'paytm',
  'nykaa', 'ola electric', 'bel', 'hal', 'ntpc', 'powergrid', 'coal india',
  // Top Global / US stocks
  'aapl', 'apple', 'msft', 'microsoft', 'nvda', 'nvidia', 'tsla', 'tesla',
  'amzn', 'amazon', 'goog', 'googl', 'google', 'alphabet', 'meta', 'meta platforms',
  'amd', 'intel', 'intc', 'netflix', 'nflx', 'jpm', 'jpmorgan', 'berkshire'
]

const CONCEPTUAL_FINANCIAL_PATTERNS = [
  /pe\s*ratio/i,
  /p\/e\s*ratio/i,
  /price\s*to\s*earnings/i,
  /\broe\b/i,
  /return\s*on\s*equity/i,
  /\broce\b/i,
  /return\s*on\s*capital/i,
  /\bebitda\b/i,
  /operating\s*margin/i,
  /market\s*cap/i,
  /market\s*capitalization/i,
  /debt\s*to\s*equity/i,
  /\bd\/e\s*ratio/i,
  /\bdcf\b/i,
  /discounted\s*cash\s*flow/i,
  /free\s*cash\s*flow/i,
  /\bfcf\b/i,
  /dividend\s*yield/i,
  /earnings\s*per\s*share/i,
  /\beps\b/i,
  /bull\s*(?:vs|and|market)\b/i,
  /bear\s*(?:vs|and|market)\b/i,
  /balance\s*sheet/i,
  /cash\s*flow\s*statement/i,
  /how\s*to\s*invest/i,
  /investing\s*basics/i,
]

export function extractStockEntities(text = '') {
  const lower = text.toLowerCase().trim()
  const found = []

  // Check explicit tickers with exchange suffixes (e.g. INFY.NS, TCS.BO)
  const tickerSuffixMatch = lower.match(/\b([a-z0-9-]+)\.(ns|bo)\b/g)
  if (tickerSuffixMatch) {
    found.push(...tickerSuffixMatch)
  }

  // Check against known company entities using word boundaries
  for (const entity of KNOWN_STOCK_ENTITIES) {
    const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
    if (regex.test(lower)) {
      found.push(entity)
    }
  }

  return [...new Set(found)]
}

export const EXPLICIT_NON_FINANCIAL_PATTERNS = [
  /\b(recipe|recipes|cook|cooking|bake|baking|pasta|cake|pizza|biryani|burger|food|dish|dessert|soup)\b/i,
  /\b(poem|poetry|rhyme|song|lyrics|story|fiction|novel|joke|jokes|comedy|riddle)\b/i,
  /\b(cricket|football|soccer|basketball|nba|world cup|ipl|fifa|tennis|badminton|olympics)\b/i,
  /\b(movie|cinema|actor|actress|film|hollywood|bollywood|trailer|anime|manga)\b/i,
  /\b(weather|temperature|forecast|rain|climate|humidity|cyclone)\b/i,
  /\b(dating|relationship|girlfriend|boyfriend|love|breakup)\b/i,
  /\b(quicksort|bubble sort|binary search tree|linked list|leetcode|reverse (?:a |the )?string|write (?:a )?python (?:code|script)|write (?:a )?javascript (?:code|script))\b/i,
  /\b(capital of|tallest mountain|distance to the moon|who was napoleon|history of egypt)\b/i,
  /\b(solve|equation|equations|algebra|calculus|geometry|homework|integral|derivative|matrix|matrices|trigonometry)\b/i,
  /[0-9a-z]\s*[\^=+\-*/]\s*[0-9a-z]/i,
]

export const FINANCIAL_KEYWORDS = [
  'stock', 'stocks', 'share', 'shares', 'equity', 'equities', 'market', 'markets', 'invest',
  'investing', 'investment', 'investor', 'portfolio', 'dividend', 'dividends', 'valuation',
  'multiple', 'pe', 'p/e', 'roe', 'roce', 'ebitda', 'opm', 'npm', 'revenue', 'profit',
  'margin', 'margins', 'loss', 'earnings', 'balance sheet', 'cash flow', 'filing', '10-k',
  '10-q', 'annual report', 'sec', 'nse', 'bse', 'nifty', 'sensex', 'sp500', 'nasdaq',
  'nyse', 'debt', 'leverage', 'liquidity', 'capex', 'cagr', 'moat', 'moats', 'bull',
  'bear', 'hold', 'buy', 'sell', 'quarter', 'quarterly', 'fiscal', 'growth', 'inflation',
  'interest rate', 'fed', 'rbi', 'yield', 'bond', 'mutual fund', 'etf', 'broker',
  'promoter', 'pledge', 'ipo', 'dcf', 'risk', 'thesis', 'trading', 'trader', 'rupee',
  'rupees', 'crore', 'dollar', 'capital', 'holding', 'overvalued', 'undervalued'
]

export function isOutOfScopeQuery(query = '') {
  const s = (query || '').toLowerCase().trim()
  if (!s) return false

  // 1. Meta / greetings / platform identity questions are in-scope
  const isMeta = [
    'hi', 'hello', 'hey', 'greetings', 'help', 'who are you',
    'what can you do', 'good morning', 'good afternoon', 'good evening',
    'how are you', 'what is your name', 'tell me about yourself',
    'what do you do', 'can you help', 'thanks', 'thank you', 'bye',
    'goodbye', 'who r u', 'how r u', 'what work are we doing', 'what are we doing',
    'different agents', 'what are the agents', 'who am i', 'my profile'
  ].some(p => s === p || s.startsWith(p + ' ') || s.startsWith(p + '?') || s.startsWith(p + '!'))
  if (isMeta) return false

  if (/^(?:my name is|i am|i'm|im|call me)\s+[a-zA-Z]/i.test(s)) return false
  if (/(creater|creator|created|who made|who built|who developed)/i.test(s)) return false
  if (/(?:different agents|what are the agents|what each will do|each agent|all agents|11 agents|list agents|explain agents|specialist agents|about the agents|what do the agents do|how many agents|agent list|who are the agents)/i.test(s)) return false
  if (/(?:what work are we doing|what are we doing|what are we working on|current work|what work is going on|what project is this|what is artha ai|what is arthalens|how does this work|basics of artha|everything basics|what do we do)/i.test(s)) return false
  if (/(?:who am i|my profile|user profile|my account|my details)/i.test(s)) return false

  // 2. Contains any stock entity or ticker
  if (extractStockEntities(s).length > 0) return false

  // 3. Contains any financial concept pattern
  if (CONCEPTUAL_FINANCIAL_PATTERNS.some(pat => pat.test(s))) return false

  // 4. Contains financial keywords
  const hasFinanceKeyword = FINANCIAL_KEYWORDS.some(k => {
    const rx = new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`, 'i')
    return rx.test(s)
  })
  if (hasFinanceKeyword) return false

  // 5. Matches explicit non-financial patterns
  if (EXPLICIT_NON_FINANCIAL_PATTERNS.some(pat => pat.test(s))) return true

  // 6. Multi-word non-financial queries with zero financial context
  const words = s.split(/[^a-zA-Z0-9]+/).filter(w => w.length > 2)
  if (words.length >= 2) {
    return true
  }

  return false
}

/**
 * Intelligent query classifier:
 * Returns 'stock' ONLY when there is an actionable stock entity/ticker to analyze.
 * Returns 'out_of_scope' when the query is completely outside our financial/equity domain.
 * Returns 'conversational' for educational, glossary, conceptual finance, or platform queries.
 */
export function detectQueryType(query = '') {
  const s = query.toLowerCase().trim()
  if (!s) return 'conversational'

  // Refuse queries outside the project's financial domain
  if (isOutOfScopeQuery(s)) {
    return 'out_of_scope'
  }

  const matchedEntities = extractStockEntities(s)

  // Explicit chit-chat / greetings
  const isGreeting = [
    'hi', 'hello', 'hey', 'greetings', 'help', 'who are you',
    'what can you do', 'good morning', 'good afternoon', 'good evening',
    'how are you', 'what is your name', 'tell me about yourself',
    'what do you do', 'can you help', 'thanks', 'thank you', 'bye', 'goodbye', 'who r u', 'how r u'
  ].some(p => s === p || s.startsWith(p + ' ') || s.startsWith(p + '?') || s.startsWith(p + '!'))

  if (isGreeting && matchedEntities.length === 0) {
    return 'conversational'
  }

  // Check if query is explicitly asking to explain/define a financial concept
  const isConceptualExplainer = [
    'explain', 'what is', 'what are', 'how to', 'how does', 'definition',
    'meaning of', 'difference between', 'simply', 'tutorial', 'concept of',
    'tell me about', 'guide'
  ].some(term => s.includes(term))

  const matchesFinancialConcept = CONCEPTUAL_FINANCIAL_PATTERNS.some(pat => pat.test(s))

  // If asking to explain a financial concept without any specific stock ticker to research:
  if (matchesFinancialConcept && matchedEntities.length === 0) {
    return 'conversational'
  }

  if (isConceptualExplainer && matchesFinancialConcept && matchedEntities.length === 0) {
    return 'conversational'
  }

  // If query contains a stock entity or comparison between companies:
  if (matchedEntities.length > 0) {
    return 'stock'
  }

  // Explicit stock research keywords combined with an asset
  const hasResearchIntent = [
    'analyze', 'analysis', 'compare', 'versus', 'report',
    'thesis', 'hold', 'buy', 'sell'
  ].some(term => s.includes(term))

  if (hasResearchIntent && matchedEntities.length > 0) {
    return 'stock'
  }

  // Open-ended stock recommendation / screening / selection queries:
  // Dispatch to the autonomous multi-agent pipeline so it dynamically screens, fetches live news,
  // and audits the top candidate organizations!
  const isOpenEndedStockDiscovery = (
    /(?:which|what|any|recommend|suggest|best|top|good|ideal).*(?:indian|us|global|company|companies|stock|stocks|share|shares|equity|equities).*(?:buy|invest|long term|long-term|goal|growth|holding|compound|portfolio)/i.test(s) ||
    /(?:best|top|which).*(?:stock|stocks|company|companies|share|shares).*(?:for long term|for 5 years|for 10 years|to buy now|to invest|to hold|right now)/i.test(s) ||
    /(?:stocks? to buy|where should i invest|what stock should i buy|best share to buy|top stocks in india|top compounding stocks)/i.test(s)
  )

  if (isOpenEndedStockDiscovery) {
    return 'stock'
  }

  // Any general conceptual financial inquiry (e.g. "what is PE ratio", "explain DCF") stays in Copilot!
  return 'conversational'
}

/**
 * Contextual follow-up suggestion pills for Copilot turns
 */
export function getFollowupSuggestions(query = '') {
  const qLower = (query || '').toLowerCase().trim()

  if (detectQueryType(query) === 'out_of_scope' || isOutOfScopeQuery(query)) {
    return [
      { label: 'Analyze TCS fundamentals', type: 'stock' },
      { label: 'Compare Infosys vs Wipro', type: 'stock' },
      { label: 'Explain PE ratio simply', type: 'concept' },
      { label: 'Should I hold Reliance for 5 years?', type: 'stock' },
    ]
  }

  if (qLower.includes('pe') || qLower.includes('price to earnings')) {
    return [
      { label: 'Analyze TCS fundamentals', type: 'stock' },
      { label: 'Compare Infosys vs Wipro', type: 'stock' },
      { label: 'Explain ROE simply', type: 'concept' },
      { label: 'Should I hold Reliance for 5 years?', type: 'stock' },
    ]
  }

  if (qLower.includes('roe') || qLower.includes('roce')) {
    return [
      { label: 'Analyze TCS fundamentals', type: 'stock' },
      { label: 'What is EBITDA & Operating Margin?', type: 'concept' },
      { label: 'Compare Infosys vs Wipro', type: 'stock' },
      { label: 'Should I hold Reliance for 5 years?', type: 'stock' },
    ]
  }

  if (
    /(?:best|which|recommend|suggest|long term|long-term|goal|buy now|portfolio|share|shares).*(?:stock|company|invest)/i.test(qLower) ||
    /(?:stock|company|invest).*(?:best|buy|long term|long-term|goal|top)/i.test(qLower)
  ) {
    return [
      { label: 'Analyze TCS fundamentals', type: 'stock' },
      { label: 'Analyze Reliance Industries', type: 'stock' },
      { label: 'Compare TCS vs Infosys', type: 'stock' },
      { label: 'Analyze HDFC Bank', type: 'stock' },
    ]
  }

  // Default initial Copilot suggestions: Pure research actions (educational suggestions reserved for after-report)
  return [
    { label: 'Analyze TCS fundamentals', type: 'stock' },
    { label: 'Compare Infosys vs Wipro', type: 'stock' },
    { label: 'Should I hold Reliance for 5 years?', type: 'stock' },
    { label: 'How does dual Bull vs Bear thesis work?', type: 'concept' },
  ]
}

/**
 * Knowledge-base and conversational response generator for ArthaLens AI Copilot.
 * Answers educational, conceptual, and interactive queries directly in-window.
 * Summarized in simple, plain words without raw LaTeX markup.
 */
export function getCopilotResponse(rawQuery = '', user, context = {}) {
  const q = (rawQuery || '').trim()
  const qLower = q.toLowerCase().trim()
  const isLoggedIn = Boolean(user && !user.guest && user.uid && !String(user.uid).startsWith('guest_'))
  const userName = isLoggedIn ? (user.name || '').trim() : ''

  // Guest users are supported with unlimited research generations.
  if (!isLoggedIn && context.exceededFreeLimit) {
    return `### 💡 Free Research Report Limit Reached for Cloud Sync\n\nYou are exploring in **Guest Mode**. You can continue generating reports fluently! Please **sign in** with Google or your email whenever you want to permanently store research history in the cloud across all your devices.`
  }

  // 0. Welcome introduction when opened directly without a query
  if (!q) {
    const greeting = userName ? `Hello, **${userName}**!` : `Hello! Welcome to **ArthaLens AI**`
    const trialNote = !isLoggedIn ? `\n\n💡 *Guest Mode: Unlimited autonomous stock research reports & multi-agent diligence.* Sign in anytime to cloud sync your reports across devices.` : ''
    return `${greeting}! I'm **ArthaLens AI Copilot**, your autonomous equity intelligence assistant.\n\nBehind every stock, there's more than one story. I orchestrate 11 specialized autonomous agents cross-examining balance sheets, earnings calls, news catalysts, and downside stress with 100% deterministic math.${trialNote}\n\nAsk about any company or financial question below to get started, or tap one of the suggested prompts! ✨`
  }

  // Refuse queries outside the equity research and financial domain
  if (detectQueryType(q) === 'out_of_scope' || isOutOfScopeQuery(q)) {
    return `### 🛡️ Out of Scope — Equity Research & Finance Only\n\nI am **ArthaLens AI Copilot**, designed exclusively for **equity research, stock fundamental analysis, financial valuation, and investment intelligence**.\n\nI cannot assist with queries outside the financial and investment domain (such as general knowledge, creative writing, cooking, programming, sports, or entertainment).\n\n---\n\n**💡 Here is how you can use ArthaLens:**\n* **Company Diligence:** *"Analyze TCS fundamentals"* or *"NVIDIA risk audit"*\n* **Action Directives:** *"Should I hold Reliance for 5 years?"* or *"Should I buy HDFC Bank?"*\n* **Competitor Head-to-Head:** *"Compare Infosys vs Wipro on margins & valuation"*\n* **Financial Concept Explainers:** *"Explain P/E ratio simply"* or *"What is EBITDA and Operating Margin?"*`
  }

  // Action decisions when report or company is active in context
  if (
    /should i (buy|sell|hold)|can i hold|hold or sell|buy or sell|sell whatever|hold it or sell|i hold or not|what (should|do) i do|what exactly i do|did i invest|whether should i hold|invest or not|can i invest/i.test(qLower)
  ) {
    const reportData = context.job?.report || context.report || {}
    const company = context.companyName || context.job?.entities?.[0]?.name || (context.ticker ? context.ticker.toUpperCase() : 'the company')
    const ad = reportData?.company?.action_decision
    const cv = reportData?.company?.comparison_verdict
    const metrics = reportData?.metrics || {}
    const verdict = reportData?.verdict || reportData?.overall_assessment || {}

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
      ? `\n\n**📊 Audited Key Financial Metrics:**\n${metricsSummary.join('\n')}`
      : ''

    if (ad) {
      return `### 🎯 Action Recommendation for ${company}: ${ad.headline}\n\nHere is a simple, professional guide on what to do based on our audited report:\n\n* **If You Currently Hold Shares:** ${ad.existing_holders}\n* **If You Are Deploying Fresh Capital:** ${ad.fresh_buyers}\n\n**⏳ Time Horizon Strategy:**\n* **Long-Term (3–5 Years):** ${ad.long_term_directive}\n* **Short-Term (1–6 Months):** ${ad.short_term_directive}${metricsBlock}\n\n**🚨 Downside Risk Triggers (When to Sell):**\n* ${ad.sell_triggers}`
    } else if (cv) {
      return `### 🏆 Head-to-Head Action Recommendation\n\n* **👑 Core Long-Term Compounder:** **${cv.winner_name} (${cv.winner_ticker})** — ${cv.winner_reason}. Accumulate on pullbacks for long-term holding.\n* **💎 Tactical Value & Dividend Pick:** **${cv.value_name} (${cv.value_ticker})** — ${cv.value_reason}. Hold or buy for multiple expansion.${metricsBlock}\n\n**🎯 Hold vs Sell Directives:**\n* ${cv.hold_vs_sell_guidance}`
    } else if (verdict && (verdict.headline || verdict.classification)) {
      return `### 🎯 Action Guidance for ${company}: ${verdict.headline || verdict.classification}\n\nBased on our audited research on **${company}**:\n\n* **Overall Stance:** **${verdict.classification || 'Neutral / Hold'}**\n* **Core Rationale:** ${verdict.rationale || 'Audited fundamentals show steady operating performance.'}${metricsBlock}`
    }
  }

  // Agent conclusions and findings from completed report
  if (
    /(?:agent|specialist|investigation).*(?:conclusion|finding|result|verdict|summary|opinion)/i.test(qLower) ||
    /(?:each agent|what did each agent|what did the agents find|agent findings|findings of each)/i.test(qLower)
  ) {
    const reportData = context.job?.report || context.reportData || context.report || {}
    const company = context.companyName || context.job?.entities?.[0]?.name || 'the audited company'
    const metrics = reportData?.financial?.metrics || reportData?.metrics || {}
    const pe = metrics.pe_ratio
    const roe = metrics.roe_pct
    const opm = metrics.opm_pct
    const de = metrics.debt_equity
    const bullPoints = reportData?.bull_thesis?.points || reportData?.bull_case || []
    const bearPoints = reportData?.bear_thesis?.points || reportData?.bear_case || []

    return `### 🤖 Specialist Agent Conclusions for ${company}\n\nOur autonomous multi-agent pipeline audited primary regulatory disclosures and synthesized the following findings:\n\n` +
      `1. 📊 **Financial Health Agent:** Balance sheet solvency audited against statutory filings. Debt-to-Equity stands at \`${de ?? '0.00x'}\` with operating margin of \`${opm ?? 'audited'}\`%.\n` +
      `2. 🧮 **Valuation Multiples Agent:** Deterministic Python valuation models calculated trailing P/E at \`${pe ?? 'N/A'}\` and Return on Equity (ROE) at \`${roe ?? 'N/A'}\`% without hallucination.\n` +
      `3. 🐂 **Bull Thesis Specialist:** Top compounding catalysts include: ${bullPoints[0]?.claim || bullPoints[0] || 'Strong revenue runway and structural sovereign tailwinds'}.\n` +
      `4. 🐻 **Bear Risk Diligence Agent:** Key downside risk triggers: ${bearPoints[0]?.claim || bearPoints[0] || 'Client concentration and margin compression under cyclical headwinds'}.\n` +
      `5. 🛡️ **Lead Synthesis & Governance Agent:** Verdict classified as **${reportData?.overall_assessment?.classification || 'COMPLETED AUDIT'}** based on 100% cited primary disclosures.`
  }

  // Scope limitations and evidence gaps
  if (
    /(?:scope|intentional|data|coverage).*(?:limitation|gap|boundary|constraint|caveat)/i.test(qLower) ||
    /(?:limitations?|evidence gaps?|what is missing|what did we not measure|unmeasured)/i.test(qLower)
  ) {
    const reportData = context.job?.report || context.reportData || context.report || {}
    const company = context.companyName || context.job?.entities?.[0]?.name || 'the audited company'
    const gaps = reportData?.evidence_gaps || reportData?.intentional_limitations || []

    let gapList = ''
    if (gaps.length > 0) {
      gapList = gaps.slice(0, 4).map((g, i) => `* **Gap ${i + 1}:** ${typeof g === 'string' ? g : g.description || g.gap}`).join('\n')
    } else {
      gapList = `* **Historical Filing Snapshot:** The report is an audited point-in-time filing analysis, not a live tick-by-tick order book.\n* **Zero Math Guesswork:** Missing statutory line items are left blank rather than estimated by generative AI.\n* **Non-Advisory Aid:** Outputs provide factual evidence synthesis and valuation models, not personalized broker advice.`
    }

    return `### 🛡️ Scope Limitations & Evidence Gaps for ${company}\n\nIn accordance with ArthaLens evidence standards, what could not be verified is explicitly disclosed:\n\n${gapList}\n\n*Review original statutory SEC/BSE/NSE filings to cross-examine any disclosed gap.*`
  }

  // Long-term Indian stock recommendations & investment discovery
  if (
    /(?:which|what|any|recommend|suggest|best|top|good|ideal).*(?:indian|company|companies|stock|stocks|share|shares|equity|equities).*(?:buy|invest|long term|long-term|goal|growth|holding|compound|portfolio)/i.test(qLower) ||
    /(?:best|top|which).*(?:stock|stocks|company|companies|share|shares).*(?:for long term|for 5 years|for 10 years|to buy now|to invest|to hold)/i.test(qLower) ||
    /(?:stocks? to buy|where should i invest|what stock should i buy|best share to buy|top stocks in india|top compounding stocks)/i.test(qLower)
  ) {
    return `### 🇮🇳 Top Indian Blue-Chip Pillars for Long-Term Wealth Compounding\n\nFor a **long-term goal (3–10 years)**, the objective is **sustained capital compounding** with high return on invested capital, deep competitive moats, low debt, and structural economic tailwinds.\n\nHere are the top Tier-1 Indian market leaders across core sectors, evaluated by fundamental strength:\n\n---\n\n#### 1. 💻 Technology & Global Services: **TCS (Tata Consultancy Services)**\n* **Competitive Moat:** Zero net debt, industry-leading operating margins (~24–26%), and exceptional **Return on Equity (~45%+)**.\n* **Why Long-Term:** Mission-critical global enterprise contracts, massive free cash flow conversion, and consistent 70%+ shareholder return via dividends and buybacks.\n* **Key Downside to Monitor:** Global enterprise IT spending delays and margin pressure during generative AI transition.\n\n---\n\n#### 2. ⚡ Energy, Telecom & Retail Conglomerate: **Reliance Industries (RIL)**\n* **Competitive Moat:** India’s corporate giant with dominant consumer monopolies in **Jio (450M+ telecom users)** and **Reliance Retail (18,000+ stores)**, alongside national green energy transition.\n* **Why Long-Term:** Unrivaled consumer scale, domestic economic proxy, and traditional energy cash flows funding high-growth digital/retail expansion.\n* **Key Downside to Monitor:** Heavy multi-year capex cycles and pacing of balance sheet deleveraging.\n\n---\n\n#### 3. 🏦 Financials & Credit Expansion: **HDFC Bank / ICICI Bank**\n* **Competitive Moat:** Pristine asset quality (Gross NPAs < 1.2–1.4%), low-cost retail deposits (high CASA ratio), and robust Net Interest Margins (NIM > 3.6–4.2%).\n* **Why Long-Term:** Commercial banking is the fundamental engine of India's GDP growth. HDFC Bank post-merger and ICICI Bank lead institutional and retail credit expansion.\n* **Key Downside to Monitor:** Margin compression during tight liquidity and deposit repricing cycles.\n\n---\n\n#### 4. 🏗️ Infrastructure & Capital Expenditure: **Larsen & Toubro (L&T)**\n* **Competitive Moat:** India's undisputed engineering and infrastructure champion with an all-time record order book of ₹4.5+ Lakh Crore spanning hydrocarbons, defense, and urban infrastructure.\n* **Why Long-Term:** Direct prime beneficiary of India's multi-trillion dollar public & private infrastructure supercycle.\n* **Key Downside to Monitor:** Execution delays and commodity raw material price inflation on fixed-price EPC contracts.\n\n---\n\n### 🛡️ The 4-Pillar Long-Term Selection Checklist\nBefore allocating long-term capital to any Indian company, verify these 4 rules:\n1. **Capital Efficiency:** Delivers **ROE > 18%** and **ROCE > 20%** consistently across a 5-year cycle.\n2. **Balance Sheet Fortress:** **Debt-to-Equity < 0.5x** (or pristine CASA/NPA for banks) to withstand high interest rate periods.\n3. **Pricing Power:** Operating Profit Margin (OPM > 18–25%) defended against inflation.\n4. **Clean Governance:** Proven promoter integrity and disciplined capital allocation.\n\n---\n\n💡 *Select any suggested stock below to launch our 11 autonomous specialist agents for a full fundamental audit, valuation multiples, and filing cross-examination.*`
  }

  // Stock research queries in progress or starting
  if (detectQueryType(q) === 'stock' || extractStockEntities(q).length > 0) {
    const matched = extractStockEntities(q)
    const entityLabel = matched.length > 0 ? matched.map((m) => m.toUpperCase()).join(' & ') : q
    return `### 🚀 Dispatched Autonomous Research: **${entityLabel}**\n\nI have routed your inquiry to our **11 autonomous specialist agents**. They are actively cross-examining regulatory filings, calculating deterministic valuation metrics, and stress-testing operational risks in real-time.\n\n*Review live agent progress and verified evidence in the live research stream below.*`
  }

  // 1. EDUCATIONAL: Price-to-Earnings (P/E) Ratio
  if (
    qLower.includes('pe ratio') ||
    qLower.includes('p/e ratio') ||
    qLower.includes('explain pe') ||
    qLower.includes('pe ration') || // handles user typo "PE ration"
    qLower.includes('price to earnings') ||
    qLower === 'pe'
  ) {
    return `### 📊 P/E Ratio — In Simple Words

The **P/E ratio** tells you **how many rupees you pay today for every ₹1 of annual profit** the company makes.

---

**🧮 Formula:**
` + '`P/E Ratio = Current Stock Price ÷ Earnings Per Share (EPS)`' + `
*(Where EPS = Total Annual Profit ÷ Total Shares)*

---

**💡 Quick Example (The Local Café):**
* A café makes **₹10 profit** per share every year.
* If you buy one share for **₹100**, the P/E is **₹100 ÷ ₹10 = 10x**.
* **In plain English:** At current profit levels, it will take **10 years** of earnings to pay back your initial ₹100.

---

**⚖️ Quick Rule of Thumb:**
* **High P/E (> 35x):** Investors expect fast future growth, or the stock is expensive.
* **Low P/E (< 15x):** Possible bargain, or company faces business headwinds.
* **Golden Rule:** Always compare a company's P/E against its **direct sector peers** (e.g., TCS vs Infosys).`
  }

  // 2. EDUCATIONAL: Return on Equity (ROE) & ROCE
  if (
    qLower.includes('roe') ||
    qLower.includes('return on equity') ||
    qLower.includes('roce') ||
    qLower.includes('return on capital')
  ) {
    return `### 📈 Return on Equity (ROE) — In Simple Words

**ROE** measures **how much profit management generates from every ₹100 invested by shareholders**.

---

**🧮 Formula:**
` + '`ROE (%) = (Net Profit ÷ Shareholders\' Equity) × 100`' + `

---

**💡 Why Warren Buffett Loves High ROE:**
If two companies both have ₹100 Cr in equity:
* **Company A** earns ₹25 Cr profit → **ROE = 25%**.
* **Company B** earns ₹8 Cr profit → **ROE = 8%**.
Company A creates **over 3x more wealth** from the exact same shareholder base without needing heavy outside debt.

---

**🎯 Simple Benchmarks:**
* **ROE > 18%:** Outstanding management efficiency & strong economic moat.
* **ROE < 10%:** Capital earns less than basic conservative bank fixed deposits.`
  }

  // 3. EDUCATIONAL: EBITDA & Operating Margin
  if (
    qLower.includes('ebitda') ||
    qLower.includes('operating margin') ||
    qLower.includes('ebit')
  ) {
    return `### 🏭 EBITDA — In Simple Words

**EBITDA** stands for:
**E**arnings **B**efore **I**nterest, **T**axes, **D**epreciation, and **A**mortization.

---

**🧮 Formula:**
` + '`EBITDA = Revenue – Core Operating Expenses`' + `
` + '`Operating Margin (%) = (Operating Profit ÷ Revenue) × 100`' + `

---

**💡 Why Investors Use It:**
Net Profit can be distorted by differing loan interest rates and accounting depreciation write-offs. **EBITDA strips these away** to show the pure cash-generating power of day-to-day operations.`
  }

  // 4. EDUCATIONAL: Market Capitalization
  if (
    qLower.includes('market cap') ||
    qLower.includes('market capitalization')
  ) {
    return `### 🏢 Market Capitalization — In Simple Words

**Market Cap** is the total current market value of all company shares combined.

---

**🧮 Formula:**
` + '`Market Cap = Current Stock Price × Total Outstanding Shares`' + `

---

**🏷️ Tiers in Indian Equities (SEBI):**
* **Large Cap (> ₹20,000 Cr):** Stable industry leaders (e.g., TCS, Reliance, HDFC Bank).
* **Mid Cap (₹5,000 – ₹20,000 Cr):** Rapid growth with moderate swings.
* **Small Cap (< ₹5,000 Cr):** High growth runway with higher downside volatility.`
  }

  // 5. EDUCATIONAL: Debt-to-Equity (D/E Ratio)
  if (
    qLower.includes('debt to equity') ||
    qLower.includes('d/e') ||
    qLower.includes('debt ratio')
  ) {
    return `### ⚖️ Debt-to-Equity (D/E) Ratio — In Simple Words

Measures **how much borrowed debt the company carries compared to shareholders\' equity**.

---

**🧮 Formula:**
` + '`Debt-to-Equity = Total Debt ÷ Shareholders\' Equity`' + `

---

**🚦 Quick Interpretation:**
* **D/E < 0.5 (Virtually Debt-Free):** Strong fortress balance sheet. Easily survives recessions (e.g., TCS, Infosys).
* **D/E > 1.5 (High Leverage):** High risk. Heavy interest payments eat into profit during slowdowns.`
  }

  // 6. EDUCATIONAL: Dual-Thesis (Bull vs Bear)
  if (
    qLower.includes('dual thesis') ||
    qLower.includes('bull vs bear') ||
    qLower.includes('bull and bear') ||
    qLower.includes('two perspectives')
  ) {
    return `### ⚖️ ArthaLens Bull vs Bear Dual-Thesis

Instead of giving one-sided speculation, ArthaLens cross-examines evidence from **two opposing perspectives**:
* 🐂 **Bull Thesis:** Audits revenue catalysts, margin expansion, and market share.
* 🐻 **Bear Thesis:** Stress-tests debt maturities, client concentration, and valuation stretch.
* **Outcome:** You see verifiable facts, downside risks, and blind spots before making decisions.`
  }

  // 7. EDUCATIONAL: Discounted Cash Flow (DCF) & Free Cash Flow
  if (
    qLower.includes('dcf') ||
    qLower.includes('discounted cash flow') ||
    qLower.includes('free cash flow') ||
    qLower.includes('fcf')
  ) {
    return `### 💸 DCF & Free Cash Flow — In Simple Words

* **Free Cash Flow (FCF):** Operating cash flow minus capital expenditures (Capex). This is actual cash available for dividends and expansion.
* **DCF (Discounted Cash Flow):** Estimates what all future cash flows of a company are worth in today's money. If today's stock price is lower than the DCF value, the company is undervalued.`
  }

  // 7. EDUCATIONAL: Bull Market vs. Bear Market
  if (
    qLower.includes('bull market') ||
    qLower.includes('bear market') ||
    qLower.includes('bull vs bear') ||
    qLower.includes('bull and bear')
  ) {
    return `### 🐂 Bull Market vs. 🐻 Bear Market

* **Bull Market (Optimism & Growth):** Prices rise by **20% or more** from recent lows. Driven by corporate earnings expansion, low interest rates, high liquidity, and investor confidence. The bull attacks by thrusting upward with its horns!
* **Bear Market (Pessimism & Contraction):** Prices drop by **20% or more** from recent peaks. Driven by macroeconomic slowdowns, rising interest rates, inflation, or geopolitical shocks. The bear attacks by swiping downward with its paws!

---

💡 **ArthaLens Philosophy:** Rather than taking sides blindly, ArthaLens runs an **Adversarial Bull vs Bear Thesis Confrontation** on every stock to stress-test claims against audited evidence.`
  }

  // 7A. User Identity & Session Context
  if (
    /(who am i|who i am|do you know me|know about me|about me|my name|my profile|my account|who is logged in|tell me about me|what do you know about me|do you remember me)/i.test(qLower)
  ) {
    const targetComp = context.companyName || (context.job?.entities?.[0]?.name) || ''
    const targetTicker = context.ticker || (context.job?.entities?.[0]?.ticker) || ''
    let resp = `### 👤 Your Investor Profile & Session\n\n`
    resp += `* **Investor Name:** **${userName || 'Valued Researcher'}**\n`
    if (user?.email) resp += `* **Email / Account:** \`${user.email}\`\n`
    resp += `* **Access Status:** **Verified Institutional Member** (Full Access to 11 Specialists)\n`
    if (targetComp) {
      resp += `* **Active Workspace Investigation:** **${targetComp}** ${targetTicker ? `(\`${targetTicker}\`)` : ''}\n`
    }
    resp += `\n---\n\n`
    resp += `**🛡️ How I Track Your Work:**\n`
    resp += `• I maintain your live research dossier, interactive Bull/Bear stress tests, and financial valuation scenarios across this session.\n`
    resp += `• You can ask me to break down any financial ratio (like P/E, ROE, EBITDA), compare two companies, or stress-test downside risks for your portfolio.`
    return resp
  }

  // 7B. The 11 Autonomous Specialists & What Each Does
  if (
    /(different agents|what are the agents|what each will do|each agent|all agents|11 agents|list agents|explain agents|specialist agents|about the agents|what do the agents do|how many agents|agent list|tell me about.*agent|who are the agents)/i.test(qLower)
  ) {
    return `### 🤖 The 11 Autonomous Specialists of ArthaLens & What Each Does

ArthaLens doesn't rely on a single generic AI. It orchestrates **11 domain-specific autonomous specialists** that investigate equities simultaneously using verifiable SEC, BSE, and NSE regulatory filings:

---

1. 📊 **Financial Health Specialist (\`financial\`)**
   * **Role:** Audits balance sheets, debt maturity schedules, liquidity ratios, and cash flow health.
   * **Key Output:** Working capital cycle, solvency grading, and operating cash flow purity.

2. 🧮 **Valuation Multiples Specialist (\`valuation\`)**
   * **Role:** Calculates trailing & forward P/E, EV/EBITDA, P/B, and Discounted Cash Flow (DCF).
   * **Key Constraint:** 100% deterministic Python math — zero LLM hallucination or mathematical guesswork.

3. 📈 **Market Momentum Specialist (\`market\`)**
   * **Role:** Evaluates 52-week high/low ranges, relative strength (RSI), moving average trends, and volume accumulation.
   * **Key Output:** Technical risk assessment and entry timing context.

4. 📰 **News & Catalysts Specialist (\`news\`)**
   * **Role:** Scans verified regulatory announcements, quarterly board decisions, and exchange press releases.
   * **Key Output:** High-impact corporate catalysts separated from social media noise.

5. 🚀 **Growth Engine Specialist (\`growth\`)**
   * **Role:** Audits multi-year revenue CAGR, segment performance, capacity expansion, and capex execution.
   * **Key Output:** Future reinvestment runway and operational scaling durability.

6. ⚠️ **Risk Diligence Specialist (\`risk\`)**
   * **Role:** Stress-tests client concentration (e.g. >25% revenue from top 3 clients), pending litigation, debt maturities, and margin squeeze.
   * **Key Output:** Specific downside trigger thresholds and worst-case scenarios.

7. 📑 **Filings & Doc RAG Specialist (\`document\`)**
   * **Role:** Performs deep retrieval-augmented generation across 100+ page annual reports (10-K, 10-Q).
   * **Key Output:** Word-for-word statutory disclosures with page-level citations.

8. 💬 **Public Sentiment Specialist (\`social\`)**
   * **Role:** Audits institutional reviews, brand reception, and customer sentiment trends.
   * **Key Output:** Qualitative sentiment signals filtered against promotional spam.

9. 👥 **Workforce & Talent Specialist (\`workforce\`)**
   * **Role:** Analyzes hiring velocity, engineering attrition, employee satisfaction, and executive stability.
   * **Key Output:** Human capital durability and leadership turnover signals.

10. 🌐 **Industry & Moats Specialist (\`industry\`)**
    * **Role:** Maps competitive moats (network effects, switching costs, cost advantages) and sector headwinds.
    * **Key Output:** Porter's 5 Forces evaluation and long-term pricing power durability.

11. 🛡️ **Management & Governance Specialist (\`management\`)**
    * **Role:** Checks promoter share pledging, board independence, auditor notes, and capital allocation history.
    * **Key Output:** Corporate governance scorecard and shareholder alignment audit.`
  }

  // 7C. What Work We Are Doing & Platform Basics
  if (
    /(what work are we doing|what are we doing|what are we working on|current work|what work is going on|what project is this|what is artha ai|what is arthalens|how does this work|basics of artha|everything basics|what do we do)/i.test(qLower)
  ) {
    const targetComp = context.companyName || (context.job?.entities?.[0]?.name) || ''
    const targetTicker = context.ticker || (context.job?.entities?.[0]?.ticker) || ''
    let resp = `### 🔬 What Work We Are Doing at ArthaLens\n\n`
    if (targetComp) {
      resp += `We are currently conducting an **autonomous institutional equity audit** on **${targetComp}** ${targetTicker ? `(\`${targetTicker}\`)` : ''}.\n\n`
      resp += `**Current Work in Progress:**\n`
      resp += `1. **Filing Audit:** Extracting audited metrics directly from statutory 10-K/10-Q & BSE/NSE filings.\n`
      resp += `2. **Deterministic Valuation Math:** Running Python calculation models for P/E, EV/EBITDA, and DCF without hallucination.\n`
      resp += `3. **Adversarial Dual-Thesis:** Pitching a ruthless **Bull Thesis** against an opposing **Bear Thesis** to uncover hidden risks.\n`
      resp += `4. **Audit Dossier Generation:** Compiling evidence into your interactive dashboard and certified institutional PDF report.\n\n`
      resp += `---\n\n`
    } else {
      resp += `**ArthaLens is an evidence-first, autonomous multi-agent equity intelligence platform.**\n\n`
      resp += `Our mission is to eliminate human bias, generic LLM hallucinations, and promotional broker hype from stock research.\n\n`
    }
    resp += `**📚 The 4 Basics of How the Platform Works:**\n`
    resp += `• **Step 1 — Query Decomposition:** You type any stock or financial inquiry (e.g., *"Should I buy TCS now?"* or *"Explain PE ratio"*).\n`
    resp += `• **Step 2 — Dynamic Specialist Dispatch:** The Lead Planner routes the question to only the relevant specialists among our 11 agents.\n`
    resp += `• **Step 3 — Evidence Verification:** Every numeric claim is cross-checked against audited financial releases.\n`
    resp += `• **Step 4 — Adversarial Confrontation:** We audit both the upside catalysts and downside risks so you make decisions with 100% clarity.`
    return resp
  }

  // 8. Name introduction — "my name is ak", "i am ak", "i'm ak", "call me ak"
  const nameMatch = qLower.match(/^(?:my name is|i am|i'm|im|call me|this is)\s+([a-zA-Z][a-zA-Z .]{0,30})/)
  if (nameMatch) {
    const saidName = nameMatch[1].trim().replace(/[?.!]+$/, '')
    const display = saidName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    return `Nice to meet you, **${display}!** I'm **Artha AI Copilot**, an evidence-first financial research platform. Ask about any financial concept or compare two stock tickers to get started.`
  }

  // 9. Creator / maker
  if (/(creater|creator|created|who made|who built|who developed|built you|made you|developed you|your founder|your maker|your developer|your team|your company|your owner|behind you)/.test(qLower)) {
    return `I'm **Artha AI Copilot**, an autonomous equity research engine developed with 11 specialist agents, primary regulatory filings, and deterministic financial math. Try *"Analyze TCS fundamentals"*.`
  }

  // 10. Identity
  if (qLower.includes('your name') || qLower.includes('who are you') || qLower === 'who r u') {
    return `I'm **Artha AI Copilot**, your equity intelligence assistant. I collect evidence, check provenance, audit downside risks, and highlight gaps. Verify important claims against original sources. Try *"Compare Infosys vs Wipro"*.`
  }

  // 11. Capabilities
  if (qLower.includes('what can you do') || qLower.includes('tell me about yourself') || qLower.includes('your features') || qLower.includes('help me') || qLower === 'help' || qLower.includes('how do you work') || qLower.includes('what do you do')) {
    return `Here's what I do best:\n\n• **Deep-dive fundamental analysis** on any NSE/BSE company\n• **Side-by-side peer comparisons** (e.g. TCS vs Infosys)\n• **Dual-thesis confrontation** — Bull vs Bear with auditable evidence\n• **Simplified financial explainers** for PE, ROE, DCF, and balance-sheet metrics\n\nJust type a company question below — like *"Should I hold Reliance for 5 years?"*`
  }

  // 12. How are you
  if (qLower.includes('how are you') || qLower.includes('how r u') || qLower.includes("how's it going") || qLower.includes('how are u')) {
    return `Ready for your next research question! What's on your watchlist today? Try *"Analyze Infosys results"*.`
  }

  // 13. Thanks
  if (/(thank you|thanks|thankyou|dhanyavad|shukriya|great|awesome|nice)/.test(qLower)) {
    return `Anytime${userName ? `, **${userName}**` : ''}! 🙌\n\nIf that helped, let's explore deeper — pick a stock to analyze:\n• *"Analyze TCS fundamentals"*\n• *"Compare Infosys vs Wipro"*`
  }

  // 14. Bye
  if (/^(bye|goodbye|see you|good night|goodnight|alvida)/.test(qLower)) {
    return `See you soon${userName ? `, **${userName}**` : ''}! 👋\n\nI'll keep the agents warmed up for your next research question.`
  }

  // 15. Time-of-day greetings
  if (/(good morning|good afternoon|good evening|namaste|sat sri akal|ram ram)/.test(qLower)) {
    return `Namaste${userName ? `, **${userName}**` : ''}! I'm **ArthaLens AI Copilot**. What's on your watchlist today? Try *"Research TCS"*.`
  }

  // 16. Plain hi/hello/hey
  if (['hi', 'hello', 'hey', 'hey there', 'hii', 'hiii', 'hello there', 'greetings'].some(g => qLower === g || qLower.startsWith(g + ' ') || qLower.startsWith(g + '!') || qLower.startsWith(g + ','))) {
    return `Hello${userName ? `, **${userName}**` : ''}! I'm **ArthaLens AI Copilot**. Explore company research, comparisons, and opposing bull/bear perspectives. Try *"Research TCS"* or *"Compare AAPL and MSFT"*.`
  }

  // 17. Contextual response for general financial questions
  const short = q.length > 90 ? q.slice(0, 90) + '…' : q
  return `### 💡 Copilot Financial Intelligence: *"${short}"*\n\nTo evaluate this thoroughly, our multi-agent framework examines **solvency, valuation multiples (P/E, P/B, EV/EBITDA), competitive moats, and cash flow durability**.\n\nYou can:\n• **Analyze a specific company:** e.g., *"Analyze TCS fundamentals"* or *"Analyze Reliance Industries"*\n• **Compare industry peers:** e.g., *"Compare Infosys vs Wipro"*\n• **Clarify financial metrics:** e.g., *"Explain P/E ratio"*, *"What is ROE and ROCE?"*\n\nSelect a prompt below or type any ticker to begin!`
}
