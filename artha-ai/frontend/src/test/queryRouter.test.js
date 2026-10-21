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
