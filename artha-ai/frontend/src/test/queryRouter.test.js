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

test('getCopilotResponse enforces mandatory authentication guard for unauthenticated users', () => {
  const guestUser = { uid: 'guest_456', guest: true }
  const response = getCopilotResponse('Explain PE ratio simply', guestUser)

  assert.ok(response.includes('Sorry, I cannot proceed as you are not logged in'))
})

test('getFollowupSuggestions provides pure research actions initially, reserving concepts for after-report', () => {
  const defaultSuggestions = getFollowupSuggestions('')
  assert.ok(Array.isArray(defaultSuggestions) && defaultSuggestions.length > 0)
  assert.ok(defaultSuggestions.some((s) => s.label.includes('TCS')))
  assert.ok(defaultSuggestions.some((s) => s.label.includes('Infosys')))
  // Does not have 'Explain PE ratio simply' as initial welcome suggestions
  assert.ok(!defaultSuggestions.some((s) => s.label === 'Explain PE ratio simply'))
})
