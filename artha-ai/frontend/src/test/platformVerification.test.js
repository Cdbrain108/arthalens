import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import MobileLanding from '../components/MobileLanding'
import LandingExperience from '../components/LandingExperience'
import StudioPage from '../components/StudioPage'
import ReportPreview from '../components/ReportPreview'
import ArthaReasoningBlock from '../components/ArthaReasoningBlock'
import ArthaCopilot from '../components/ArthaCopilot'
import Sidebar from '../components/Sidebar'
import Login from '../components/Login'
import PdfViewerModal from '../components/PdfViewerModal'
import { getCopilotResponse } from '../utils/queryRouter'

const mockUser = {
  uid: 'usr_verified_777',
  name: 'Anuj Kesharwani',
  email: 'anuj@arthalens.ai',
  guest: false,
}

const sampleReport = {
  company: {
    name: 'Tata Consultancy Services',
    ticker: 'TCS',
    exchange: 'NSE',
    currency: 'INR',
    description: 'Leading global IT services and consulting enterprise.',
  },
  overall_assessment: {
    classification: 'ACCUMULATE_QUALITY',
    headline: 'Compounding cash flows with fortress balance sheet.',
    rationale: 'Top-tier operating margins and virtual zero debt.',
    quality_score: 85,
    max_quality_score: 100,
    evidence_grounding_pct: 92,
  },
  financial: {
    metrics: {
      pe_ratio: '28.4x',
      roe_pct: '47.7%',
      debt_equity: '0.10x',
      opm_pct: '24.2%',
      npm_pct: '18.5%',
      market_cap: '₹14,50,000 Cr',
    },
    quarterly_table: [
      { period: 'Q1 FY25', revenue: '₹62,613 Cr', net_profit: '₹12,040 Cr', yoy_growth: '+5.4%' },
    ],
  },
  bull_case: [
    { claim: 'Superior return on equity exceeding 45% with industry-leading margins.', point: 'High ROE' },
    { claim: 'Virtually debt-free fortress balance sheet withstands discretionary slowdowns.', point: 'Low debt' },
  ],
  bear_case: [
    { claim: 'Enterprise client concentration in North American BFSI vertical.', point: 'Client concentration' },
    { claim: 'Premium valuation multiple leaves little room for revenue contraction.', point: 'Valuation stretch' },
  ],
  valuation_scenarios: [
    { multiple: '25.0x', implied_price: '₹3,650', description: 'Conservative bear scenario' },
    { multiple: '29.0x', implied_price: '₹4,200', description: 'Base case fair valuation' },
  ],
  monitoring_triggers: [
    { indicator: 'BFSI Subcontracting cost ratio', weaken_thesis: 'Sustained margin degradation below 23%' },
  ],
  evidence_checklist: [
    { item: 'Statutory 10-K / Annual Filing Audited', status: 'verified' },
    { item: 'Deterministic DCF Arithmetic Certified', status: 'verified' },
  ],
  evidence_gaps: [],
}

test('MobileLanding renders complete hero, typewriter tagline, marquee ticker, and 11 specialists', () => {
  const html = renderToStaticMarkup(
    React.createElement(MobileLanding, {
      onRun: () => {},
      running: false,
      submitting: false,
      query: '',
      onQueryChange: () => {},
      user: mockUser,
      sessions: [],
    })
  )

  // 1. Branding & Header
  assert.ok(html.includes('Artha AI') || html.includes('ArthaLens'))
  // 2. Typewriter & Tagline area
  assert.ok(html.includes('mobile-hero-subtitle') || html.includes('mobile-typed-text'))
  // 3. 3 Core Metric Pills
  assert.ok(html.includes('11 AI Agents'))
  assert.ok(html.includes('60 Seconds'))
  assert.ok(html.includes('Zero Guesswork'))
  // 4. Running Ticker Marquee with chips
  assert.ok(html.includes('mobile-ticker-marquee'))
  assert.ok(html.includes('mobile-ticker-track'))
  assert.ok(html.includes('TCS'))
  assert.ok(html.includes('Reliance'))
  assert.ok(html.includes('Apple'))
  // 5. Sample Question Prompt Bar
  assert.ok(html.includes('mobile-sample-prompt-bar'))
  assert.ok(html.includes('Should I buy TCS stocks now?'))
  // 6. 11 Specialists Section
  assert.ok(html.includes('11 Autonomous Specialists'))
  assert.ok(html.includes('Financial Health'))
  assert.ok(html.includes('Valuation Multiples'))
  // 7. Mobile Taskbar Navigation (Smart auto-hiding navigation)
  assert.ok(html.includes('arg-nav'))
})

test('LandingExperience renders complete PC landing page with multi-agent architecture and research input', () => {
  const html = renderToStaticMarkup(
    React.createElement(LandingExperience, {
      onRun: () => {},
      running: false,
      submitting: false,
      query: '',
      onQueryChange: () => {},
      user: mockUser,
      sessions: [],
    })
  )

  assert.ok(html.includes('ArthaLens') || html.includes('Stock Research'))
  assert.ok(html.includes('11 Autonomous Specialists') || html.includes('Specialists'))
  assert.ok(html.includes('Evidence-first research aid') || html.includes('Evidence'))
  assert.ok(html.includes('Peer Comparison') || html.includes('Compare'))
})

test('ReportPreview renders in Beginner mode by default with metrics and dual-thesis', () => {
  const html = renderToStaticMarkup(
    React.createElement(ReportPreview, {
      jobId: 'tcs-job-1',
      job: { status: 'succeeded', report: sampleReport, entities: [sampleReport.company] },
      initialMode: 'beginner',
    })
  )

  // Mode Toggle (Beginner active by default)
  assert.ok(html.includes('Beginner') || html.includes('beginner'))
  // Company info
  assert.ok(html.includes('Tata Consultancy Services'))
  assert.ok(html.includes('TCS'))
  // Metrics
  assert.ok(html.includes('28.4x'))
  assert.ok(html.includes('47.7%'))
  // Dual-Thesis (Beginner friendly upside & downside pillars)
  assert.ok(html.includes('What’s Working') || html.includes('Strengths') || html.includes('Bull Case'))
  assert.ok(html.includes('What to Watch') || html.includes('Risks') || html.includes('Bear Case'))
})

test('StudioPage renders with ArthaReasoningBlock and guards ungenerated Report on mobile', () => {
  const activeJob = {
    job_id: 'active_123',
    query: 'Should I buy TCS stocks now?',
    status: 'running',
    entities: [{ name: 'Tata Consultancy Services', ticker: 'TCS' }],
    selected_agents: ['financial', 'valuation', 'risk'],
    completed_agents: [],
    agent_statuses: { financial: 'running', valuation: 'queued', risk: 'queued' },
    current_node: 'run_specialists',
  }

  const html = renderToStaticMarkup(
    React.createElement(StudioPage, {
      job: activeJob,
      query: 'Should I buy TCS stocks now?',
      running: true,
      submitting: false,
      user: mockUser,
      onStartResearch: () => {},
      onNewResearch: () => {},
    })
  )

  // 1. Reasoning Block & Specialist showcase
  assert.ok(html.includes('Artha AI Copilot'))
  assert.ok(html.includes('Reasoning'))
  assert.ok(html.includes('Stage 3/6: Parallel Diligence'))
  assert.ok(html.includes('Financial Health'))
  assert.ok(html.includes('Valuation Multiples'))
  assert.ok(html.includes('Risk Diligence'))

  // 2. Guard against premature report access: mobile tab shows Auditing... and is disabled
  assert.ok(html.includes('Auditing...'))
  assert.ok(html.includes('cursor-not-allowed') || html.includes('disabled'))
})

test('ArthaCopilot answers report-specific and conceptual questions with evidence', () => {
  const html = renderToStaticMarkup(
    React.createElement(ArthaCopilot, {
      job: { job_id: 'tcs_report_1', report: sampleReport, entities: [sampleReport.company] },
      user: mockUser,
      onBackToReport: () => {},
    })
  )

  assert.ok(html.includes('Artha Copilot'))
  assert.ok(html.includes('Ask any question about') || html.includes('TCS') || html.includes('Tata Consultancy Services'))
})

test('Sidebar renders research session history and user clearance', () => {
  const sessions = [
    { job_id: 'job_001', query: 'TCS Fundamentals', status: 'succeeded', created_at: new Date().toISOString() },
    { job_id: 'job_002', query: 'Reliance 5-Yr Hold', status: 'succeeded', created_at: new Date().toISOString() },
  ]

  const html = renderToStaticMarkup(
    React.createElement(Sidebar, {
      open: true,
      onClose: () => {},
      sessions,
      onSelectSession: () => {},
      onDeleteSession: () => {},
      user: mockUser,
    })
  )

  assert.ok(html.includes('TCS Fundamentals'))
  assert.ok(html.includes('Reliance 5-Yr Hold'))
  assert.ok(html.includes('Anuj Kesharwani'))
})

test('Login modal renders clean authentication options', () => {
  const html = renderToStaticMarkup(
    React.createElement(Login, {
      onLogin: () => {},
      onCancel: () => {},
    })
  )

  assert.ok(html.includes('ArthaLens') || html.includes('Sign In') || html.includes('Google'))
})

test('Account-specific session storage strictly partitions reports by userId', async () => {
  const { getStorageKey } = await import('../storage/chatSessions.js')
  assert.equal(getStorageKey('user_alpha'), 'stock_research_sessions_user_user_alpha')
  assert.equal(getStorageKey('user_beta'), 'stock_research_sessions_user_user_beta')
  assert.equal(getStorageKey(null), 'stock_research_sessions_guest')
  assert.equal(getStorageKey('guest_123'), 'stock_research_sessions_guest')
})

test('PdfViewerModal provides Back to Report Page action and never renders download-triggering iframe, object or embed tags', () => {
  const html = renderToStaticMarkup(
    React.createElement(PdfViewerModal, {
      jobId: 'tcs-job-1',
      pdfUrl: 'https://example.com/report.pdf',
      onClose: () => {},
      onSwitchToReport: () => {},
    })
  )

  assert.ok(html.includes('Back to Report Page'))
  assert.ok(!html.includes('<iframe'))
  assert.ok(!html.includes('<object'))
  assert.ok(!html.includes('<embed'))
})

test('ReportPreview formats synthesis narrative into bold headings and action pill badges', () => {
  const narrativeReport = {
    ...sampleReport,
    executive_summary: `Plain English Executive Summary: For Nvda (NVDA), holding your shares is the smart, low-stress move.

• WHAT EXISTING SHAREHOLDERS SHOULD DO: KEEP HOLDING (Do Not Panic Sell): If you already own NVDA, keep your shares.
• WHAT NEW INVESTORS SHOULD DO: BUY SLOWLY IN STAGES (Do Not Buy All At Once): If you want to invest new cash.
• TIME HORIZON EXPECTATION: LONG-TERM (3–5+ YEARS): Proven Wealth Compounder.
• EXACT RULES FOR WHEN TO SELL: Sell only if operating profit drops.`,
  }

  const html = renderToStaticMarkup(
    React.createElement(ReportPreview, {
      jobId: 'nvda-job-1',
      job: { status: 'succeeded', report: narrativeReport, entities: [{ name: 'Nvidia', ticker: 'NVDA' }] },
      initialMode: 'beginner',
    })
  )

  assert.ok(html.includes('WHAT EXISTING SHAREHOLDERS SHOULD DO'))
  assert.ok(html.includes('KEEP HOLDING (Do Not Panic Sell)'))
  assert.ok(html.includes('WHAT NEW INVESTORS SHOULD DO'))
  assert.ok(html.includes('BUY SLOWLY IN STAGES (Do Not Buy All At Once)'))
  assert.ok(html.includes('TIME HORIZON EXPECTATION'))
  assert.ok(html.includes('EXACT RULES FOR WHEN TO SELL'))
})

test('ArthaReasoningBlock automatically shifts to Pipeline Flow when agents finish', () => {
  const jobAgentsFinished = {
    job_id: 'pipeline_auto_switch',
    query: 'NVDA stock audit',
    current_node: 'synthesize_report',
    selected_agents: ['financial', 'valuation', 'risk'],
    completed_agents: ['financial', 'valuation', 'risk'],
    status: 'running',
    entities: [{ name: 'Nvidia', ticker: 'NVDA' }],
  }

  const html = renderToStaticMarkup(
    React.createElement(ArthaReasoningBlock, {
      job: jobAgentsFinished,
      running: true,
      submitting: false,
      isDone: false,
    })
  )

  // Pipeline flow graph should be rendered because all agents are done
  assert.ok(html.includes('Pipeline Flow'))
  assert.ok(html.includes('Synthesize findings') || html.includes('synthesize') || html.includes('Stage 6/6'))
})

test('Copilot answers comparison margin, P/E, and downside risks from completed report', () => {
  const comparisonReport = {
    company: {
      name: 'TCS vs Infosys',
      is_comparison: true,
      comparison: [
        { name: 'Tata Consultancy Services', ticker: 'TCS', opm: '26.0%', npm: '19.5%', pe: '28.4x' },
        { name: 'Infosys', ticker: 'INFY', opm: '21.5%', npm: '16.2%', pe: '24.1x' },
      ],
      comparison_verdict: {
        winner_name: 'Tata Consultancy Services',
        winner_ticker: 'TCS',
        winner_reason: 'Highest structural operating profit margins (26%) and premium scale',
        value_name: 'Infosys',
        value_ticker: 'INFY',
        value_reason: 'Tactical valuation discount with higher dividend yield',
        hold_vs_sell_guidance: 'Hold both core IT leaders; accumulate TCS for low-volatility compound returns and INFY for multiple recovery',
      },
    },
  }

  // 1. Margin inquiry
  const marginResp = getCopilotResponse('Which company has higher operating margins (OPM)?', null, {
    reportData: comparisonReport,
  })
  assert.ok(marginResp.includes('Operating Margin (OPM) & Net Margin Comparison'))
  assert.ok(marginResp.includes('Tata Consultancy Services'))
  assert.ok(marginResp.includes('26.0%'))
  assert.ok(marginResp.includes('21.5%'))

  // 2. P/E valuation multiples inquiry
  const peResp = getCopilotResponse('Compare P/E valuation multiples & verdict', null, {
    reportData: comparisonReport,
  })
  assert.ok(peResp.includes('Valuation Multiple & P/E Comparison'))
  assert.ok(peResp.includes('28.4x'))
  assert.ok(peResp.includes('24.1x'))

  // 3. Downside risk watchpoints
  const riskResp = getCopilotResponse('What are the key downside risk watchpoints?', null, {
    reportData: comparisonReport,
  })
  assert.ok(riskResp.includes('Key Downside Risk Watchpoints'))
  assert.ok(riskResp.includes('BFSI'))

  // 4. Short-term risks inquiry (user's exact question)
  const shortTermRiskResp = getCopilotResponse('what are the risks for short term investment here?', null, {
    reportData: comparisonReport,
  })
  assert.ok(shortTermRiskResp.includes('Short-Term Investment Risks'))
  assert.ok(shortTermRiskResp.includes('Enterprise IT Budget Scrutiny'))
  assert.ok(shortTermRiskResp.includes('debt-free balance sheets'))

  // 5. Holding period / horizon inquiry
  const horizonResp = getCopilotResponse('what is the time horizon or holding period?', null, {
    reportData: comparisonReport,
  })
  assert.ok(horizonResp.includes('Investment Horizon Strategy'))
  assert.ok(horizonResp.includes('Long-Term Horizon'))

  // 6. Any other follow-up question with report loaded never shows generic starter prompt
  const generalFollowup = getCopilotResponse('what about the business landscape?', null, {
    reportData: comparisonReport,
  })
  assert.ok(!generalFollowup.includes('type any ticker to begin'))
  assert.ok(generalFollowup.includes('Audited Report Findings') || generalFollowup.includes('Tata Consultancy Services'))

  // 7. Ambiguous/broad queries trigger interactive clarification options
  const ambiguousResp = getCopilotResponse('risks', null, {
    reportData: comparisonReport,
  })
  assert.ok(ambiguousResp.clarification, 'Expected clarification object for broad query')
  assert.ok(ambiguousResp.clarification.options.length >= 2, 'Expected at least 2 clarification options')
  assert.ok(ambiguousResp.includes('Clarification Needed'), 'Expected Clarification Needed header')
})

test('StudioPage renders clean new research workspace and does not resurrect older reports', () => {
  const pastSessions = [
    {
      job_id: 'old-job-999',
      query: 'TCS vs Infosys',
      snapshot: {
        job_id: 'old-job-999',
        status: 'succeeded',
        report: { company: { name: 'Old TCS vs Infosys' } },
        entities: [{ name: 'TCS' }, { name: 'Infosys' }],
      },
    },
  ]

  // When job is null and query is empty (as when user clicks New Research)
  const html = renderToStaticMarkup(
    React.createElement(StudioPage, {
      job: null,
      query: '',
      running: false,
      submitting: false,
      sessions: pastSessions,
      onNewResearch: () => {},
      onStartResearch: () => {},
      user: mockUser,
    })
  )

  // Should render the fresh workspace hero, NOT the old report
  assert.ok(html.includes('Suggested Financial Inquiries'))
  assert.ok(html.includes('Artha AI Copilot'))
  assert.ok(!html.includes('Old TCS vs Infosys'))
})


