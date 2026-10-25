import test from 'node:test'
import assert from 'node:assert/strict'

import {
  detectQueryType,
  getCopilotResponse,
  getFollowupSuggestions,
  extractStockEntities,
} from '../utils/queryRouter.js'

test('detectQueryType correctly classifies conceptual and educational finance queries as conversational', () => {
  const conceptualQueries = [
    'Explain PE ratio simply',
    'what is pe ratio',
    'Explain PE ration',
    'Explain ROE simply',
    'what is market cap',
    'what is EBITDA',
    'how does DCF work',
    'Debt to equity ratio explained',
    'what is a bull market',
    'who are you',
    'what can you do',
    'hello',
    'how to read balance sheet',
  ]

  for (const q of conceptualQueries) {
    const result = detectQueryType(q)
    assert.strictEqual(
      result,
      'conversational',
      `Query "${q}" should be classified as 'conversational' but got '${result}'`
    )
  }
})

test('detectQueryType correctly classifies actionable company and ticker queries as stock research', () => {
  const stockQueries = [
    'Analyze TCS fundamentals',
    'Compare Infosys vs Wipro',
    'Should I hold Reliance for 5 years?',
    'TCS',
    'Infosys',
    'INFY.NS',
    'Apple 10-K',
    'NVDA growth analysis',
    'HDFC Bank valuation',
  ]

  for (const q of stockQueries) {
    const result = detectQueryType(q)
    assert.strictEqual(
      result,
      'stock',
      `Query "${q}" should be classified as 'stock' but got '${result}'`
    )
  }
})

test('detectQueryType correctly classifies open-ended stock discovery queries without entities as conversational', () => {
  const discoveryQueries = [
    'Which Indian company stock should be best to buy now for a long term goal?',
    'Best stocks to buy right now',
    'See i have 1lakh inr, i want to invest it into stocks, so which stocks will be best to buy for long term?',
    'where should i invest',
    'top stocks in india for compounding',
  ]

  for (const q of discoveryQueries) {
    const result = detectQueryType(q)
    assert.strictEqual(
      result,
      'conversational',
      `Query "${q}" should be classified as 'conversational' but got '${result}'`
    )
  }
})

test('getCopilotResponse generates summarized P/E ratio explainer in simple words without raw LaTeX', () => {
  const mockUser = { uid: 'user_123', name: 'Anuj Kesharwani', guest: false }
  const response = getCopilotResponse('Explain PE ratio simply', mockUser)

  assert.ok(response.includes('P/E Ratio — In Simple Words'))
  assert.ok(response.includes('P/E Ratio = Current Stock Price ÷ Earnings Per Share (EPS)'))
  assert.ok(response.includes('The Local Café'))
  assert.ok(response.includes('Quick Rule of Thumb'))
  assert.ok(!response.includes('\\text{'))
  assert.ok(!response.includes('\\frac{'))
})

test('getCopilotResponse allows 1-time free report and prompts sign in when free limit exceeded', () => {
  const guestUser = { uid: 'guest_456', guest: true }
  // 1. Guest can ask questions on initial free report / educational queries
  const freeResponse = getCopilotResponse('Explain PE ratio simply', guestUser)
  assert.ok(freeResponse.includes('P/E Ratio'))
  assert.ok(!freeResponse.includes('Sorry, I cannot proceed as you are not logged in'))

  // 2. When guest attempts to exceed free report allowance, prompt to sign in
  const blockedResponse = getCopilotResponse('Analyze Reliance', guestUser, { exceededFreeLimit: true })
  assert.ok(blockedResponse.includes('Free Research Report Limit Reached'))
  assert.ok(blockedResponse.includes('sign in'))
})

test('getFollowupSuggestions provides pure research actions initially, reserving concepts for after-report', () => {
  const defaultSuggestions = getFollowupSuggestions('')
  assert.ok(Array.isArray(defaultSuggestions) && defaultSuggestions.length > 0)
  assert.ok(defaultSuggestions.some((s) => s.label.includes('TCS')))
  assert.ok(defaultSuggestions.some((s) => s.label.includes('Infosys')))
  // Does not have 'Explain PE ratio simply' as initial welcome suggestions
  assert.ok(!defaultSuggestions.some((s) => s.label === 'Explain PE ratio simply'))
})

test('getCopilotResponse recognizes user profile inquiry and reflects user identity', () => {
  const mockUser = { uid: 'user_123', name: 'Anuj Kesharwani', email: 'anuj@example.com', guest: false }
  const response = getCopilotResponse('Who am I?', mockUser, { companyName: 'TCS', ticker: 'TCS.NS' })

  assert.ok(response.includes('Your Investor Profile & Session'))
  assert.ok(response.includes('Anuj Kesharwani'))
  assert.ok(response.includes('anuj@example.com'))
  assert.ok(response.includes('TCS'))
})

test('getCopilotResponse explains the 11 autonomous agents and their roles', () => {
  const mockUser = { uid: 'user_123', name: 'Anuj Kesharwani', guest: false }
  const response = getCopilotResponse('What are the different agents and what each will do?', mockUser)

  assert.ok(response.includes('The 11 Autonomous Specialists of ArthaLens & What Each Does'))
  assert.ok(response.includes('Financial Health Specialist'))
  assert.ok(response.includes('Valuation Multiples Specialist'))
  assert.ok(response.includes('Risk Diligence Specialist'))
  assert.ok(response.includes('Filings & Doc RAG Specialist'))
  assert.ok(response.includes('deterministic Python math'))
})

test('getCopilotResponse explains what work is currently being done', () => {
  const mockUser = { uid: 'user_123', name: 'Anuj Kesharwani', guest: false }
  const response = getCopilotResponse('What work are we doing?', mockUser, { companyName: 'Reliance Industries', ticker: 'RELIANCE.NS' })

  assert.ok(response.includes('What Work We Are Doing at ArthaLens'))
  assert.ok(response.includes('Reliance Industries'))
  assert.ok(response.includes('RELIANCE.NS'))
  assert.ok(response.includes('Filing Audit'))
  assert.ok(response.includes('Adversarial Dual-Thesis'))
})

test('detectQueryType classifies non-financial queries as out_of_scope and getCopilotResponse refuses them', () => {
  const outOfScopeQueries = [
    'how to make chocolate cake',
    'write a poem about love',
    'who won the cricket world cup',
    'best restaurants in mumbai',
    'tell me a funny joke',
    'write a python script for sorting an array',
    'what is the weather today',
    'solve x^2 + 5x + 6 = 0',
  ]

  for (const q of outOfScopeQueries) {
    const result = detectQueryType(q)
    assert.strictEqual(
      result,
      'out_of_scope',
      `Query "${q}" should be classified as 'out_of_scope' but got '${result}'`
    )

    const refusal = getCopilotResponse(q)
    assert.ok(refusal.includes('Out of Scope — Equity Research & Finance Only'), `Refusal missing header for "${q}"`)
    assert.ok(refusal.includes('designed exclusively for **equity research'), `Refusal missing boundary text for "${q}"`)
  }
})

test('getCopilotResponse routes open-ended long-term stock discovery to backend chat', () => {
  const query = 'Which Indian company stock should be best to buy now for a long term goal?'
  const mockUser = { uid: 'user_123', name: 'Anuj Kesharwani', guest: false }
  const response = getCopilotResponse(query, mockUser)

  // These open-ended discovery queries are intentionally routed to the backend
  // /research/chat endpoint for live web search + LLM response.
  assert.strictEqual(
    response,
    'USE_BACKEND_CHAT',
    'Open-ended long-term stock discovery should return USE_BACKEND_CHAT sentinel'
  )

  const suggestions = getFollowupSuggestions(query)
  assert.ok(suggestions.some((s) => s.label.includes('TCS') && s.type === 'stock'))
  assert.ok(suggestions.some((s) => s.label.includes('Reliance') && s.type === 'stock'))
})

test('getCopilotResponse identifies Anuj Kesharwani as creator for creator inquiries', () => {
  const q1 = getCopilotResponse('who made you')
  assert.ok(q1.includes('Anuj Kesharwani'))
  assert.ok(q1.includes('portfolio project'))
  assert.ok(q1.includes('production-ready tool'))
  assert.ok(q1.includes('anyone interested in the stock market'))

  const q2 = getCopilotResponse('no i mean creator of that project?')
  assert.ok(q2.includes('Anuj Kesharwani'))
  assert.ok(q2.includes('portfolio project'))

  const q3 = getCopilotResponse('who is the architect and developer behind this?')
  assert.ok(q3.includes('Anuj Kesharwani'))

  const q4 = getCopilotResponse('i am the creator')
  assert.ok(q4.includes('Welcome, **Anuj**!'))
  assert.ok(q4.includes('flagship portfolio project'))

  const q5 = getCopilotResponse('i am Anuj Kesharwani')
  assert.ok(q5.includes('creator of **ArthaLens'))
})

test('getCopilotResponse returns current live stock price for single and comparative stock price inquiries', () => {
  const resp1 = getCopilotResponse('what is TCS stock price')
  assert.ok(resp1.includes('₹3,850.50'), 'Should contain TCS live price')
  assert.ok(resp1.includes('Tata Consultancy Services'))
  assert.ok(resp1.includes('52-Week Range'))

  const resp2 = getCopilotResponse('current live price of Infosys and TCS')
  assert.ok(resp2.includes('₹1,745.20'), 'Should contain INFY live price')
  assert.ok(resp2.includes('₹3,850.50'), 'Should contain TCS live price')
})

test('extractTargetOrganization dynamically extracts organizations from natural queries', async () => {
  const { extractTargetOrganization } = await import('../utils/queryRouter.js')
  assert.strictEqual(extractTargetOrganization('tell me about Sarvam'), 'Sarvam')
  assert.strictEqual(extractTargetOrganization('tell me about Sarvam ai'), 'Sarvam AI')
  assert.strictEqual(extractTargetOrganization('tell me about Zoho'), 'Zoho')
  assert.strictEqual(extractTargetOrganization('what is OpenAI'), 'OpenAI')
  assert.strictEqual(extractTargetOrganization('tell me about Tata Motors'), 'Tata Motors')
  assert.strictEqual(extractTargetOrganization('overview of Databricks'), 'Databricks')
  // Concepts, stopwords, and discovery queries must not be extracted as organizations
  assert.strictEqual(extractTargetOrganization('risks'), null)
  assert.strictEqual(extractTargetOrganization('operating margins'), null)
  assert.strictEqual(extractTargetOrganization('Which Indian company stock should be best to buy?'), null)
  assert.strictEqual(extractTargetOrganization('who made you'), null)
  assert.strictEqual(extractTargetOrganization('Who am I?'), null)
})

test('getCopilotResponse and getFollowupSuggestions handle organizations dynamically with clarification card and zero TCS fallback', () => {
  // 1. Generic organization query (Sarvam)
  const sarvamResp = getCopilotResponse('tell me about Sarvam')
  assert.ok(sarvamResp.includes('Sarvam'), 'Should identify Sarvam')
  assert.ok(sarvamResp.clarification, 'Should attach clarification card')
  assert.ok(sarvamResp.clarification.prompt.includes('Sarvam'), 'Prompt must ask whether to create report for Sarvam')
  assert.ok(sarvamResp.clarification.options.some((o) => o.includes('Sarvam')), 'Options must include Sarvam')

  const sarvamSuggestions = getFollowupSuggestions('tell me about Sarvam')
  assert.ok(sarvamSuggestions.every((s) => !s.label.includes('TCS') && !s.label.includes('Infosys')), 'Suggestions must NOT fallback to TCS or Infosys')
  assert.ok(sarvamSuggestions.some((s) => s.label.includes('Sarvam')), 'Suggestions must be dynamically tailored to Sarvam')

  // 2. Another organization (Zoho)
  const zohoResp = getCopilotResponse('tell me about Zoho')
  assert.ok(zohoResp.includes('Zoho'), 'Should identify Zoho')
  assert.ok(zohoResp.clarification, 'Should attach clarification card for Zoho')
  assert.ok(zohoResp.clarification.prompt.includes('Zoho'), 'Prompt must ask whether to create report for Zoho')
  const zohoSuggestions = getFollowupSuggestions('tell me about Zoho')
  assert.ok(zohoSuggestions.every((s) => !s.label.includes('TCS')), 'Zoho suggestions must NOT fallback to TCS')
  assert.ok(zohoSuggestions.some((s) => s.label.includes('Zoho')), 'Suggestions must be tailored to Zoho')

  // 3. Tata Motors
  const tmSuggestions = getFollowupSuggestions('tell me about Tata Motors')
  assert.ok(tmSuggestions.some((s) => s.label.includes('Tata Motors')), 'Suggestions must be tailored to Tata Motors')

  // 4. Organization query when an active report (TCS) is already in context
  const activeReportContext = {
    companyName: 'Tata Consultancy Services',
    job: {
      entities: [{ name: 'Tata Consultancy Services', ticker: 'TCS' }],
      report: { company: { name: 'Tata Consultancy Services' }, overall_assessment: { classification: 'STRONG MOAT' } }
    }
  }
  const zohoWithTcsLoaded = getCopilotResponse('tell me about Zoho', null, activeReportContext)
  assert.ok(zohoWithTcsLoaded.clarification, 'Must provide clarification for Zoho even when TCS report is loaded')
  assert.ok(zohoWithTcsLoaded.clarification.prompt.includes('Zoho'), 'Must ask about Zoho, not TCS')
  assert.ok(!zohoWithTcsLoaded.includes('Tata Consultancy Services'), 'Must not answer with TCS when asking about Zoho')
})


