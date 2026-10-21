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

/**
 * Intelligent query classifier:
 * Returns 'stock' ONLY when there is an actionable stock entity/ticker to analyze.
 * Returns 'conversational' for educational, glossary, conceptual finance, or chit-chat queries.
 */
export function detectQueryType(query = '') {
  const s = query.toLowerCase().trim()
  if (!s) return 'conversational'

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

  // Any general question without an identifiable stock company stays in Copilot!
  return 'conversational'
}

/**
 * Contextual follow-up suggestion pills for Copilot turns
 */
export function getFollowupSuggestions(query = '') {
  const qLower = (query || '').toLowerCase().trim()

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

  // Mandatory authentication guard
  if (!isLoggedIn) {
    if (q) {
      return `Sorry, I cannot proceed as you are not logged in. Please log in to proceed further.`
    }
    return `Hello! I'm **ArthaLens AI Copilot**, your autonomous equity intelligence assistant.\n\nBehind every stock, there's more than one story. I orchestrate 11 specialized autonomous agents cross-examining balance sheets, earnings calls, news catalysts, and downside stress with 100% deterministic math.\n\nSorry, I cannot proceed as you are not logged in. Please log in to proceed further.`
  }

  // 0. Welcome introduction when opened directly without a query
  if (!q) {
    return `Hello${userName ? `, **${userName}**` : ''}! I'm **ArthaLens AI Copilot**, your autonomous equity intelligence assistant.\n\nBehind every stock, there's more than one story. I orchestrate 11 specialized autonomous agents cross-examining balance sheets, earnings calls, news catalysts, and downside stress with 100% deterministic math.\n\nAsk about any company or financial question below to get started, or tap one of the suggested prompts! ✨`
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
    return `Nice to meet you, **${display}!** I'm **ArthaLens AI Copilot**, an evidence-first financial research platform. Ask about any financial concept or compare two stock tickers to get started.`
  }

  // 9. Creator / maker
  if (/(creater|creator|created|who made|who built|who developed|built you|made you|developed you|your founder|your maker|your developer|your team|your company|your owner|behind you)/.test(qLower)) {
    return `I'm **ArthaLens AI Copilot**, an autonomous equity research engine developed with 11 specialist agents, primary regulatory filings, and deterministic financial math. Try *"Analyze TCS fundamentals"*.`
  }

  // 10. Identity
  if (qLower.includes('your name') || qLower.includes('who are you') || qLower === 'who r u') {
    return `I'm **ArthaLens AI Copilot**, your equity intelligence assistant. I collect evidence, check provenance, audit downside risks, and highlight gaps. Verify important claims against original sources. Try *"Compare Infosys vs Wipro"*.`
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

  // 17. Contextual fallback for other concepts or questions
  const short = q.length > 90 ? q.slice(0, 90) + '…' : q
  return `### 💡 Understanding: *"${short}"*

I'm **ArthaLens AI Copilot**, your financial research and educational guide.

Here are ways you can explore:
* **Learn Core Financial Concepts:** Ask *"Explain PE ratio simply"*, *"What is ROE?"*, or *"Explain Debt-to-Equity"*.
* **Deep-Dive Stock Research:** Type *"Analyze TCS fundamentals"* or *"Should I hold Reliance for 5 years?"* to dispatch our 11 autonomous agents.
* **Compare Competitors:** Type *"Compare Infosys vs Wipro"* to see an adversarial head-to-head comparison.`
}
