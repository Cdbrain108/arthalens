import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import QueryReasoningAccordion from '../components/QueryReasoningAccordion'
import LiveAgentStream from '../components/LiveAgentStream'
import AgentProcessContinuation from '../components/AgentProcessContinuation'
import ReportPreview from '../components/ReportPreview'
import StudioWaitCarousel from '../components/StudioWaitCarousel'
import ResearchProcessGraph from '../components/ResearchProcessGraph'
import LandingHero from '../components/LandingHero'
import LandingExperience from '../components/LandingExperience'
import PdfViewerModal from '../components/PdfViewerModal'
import ArthaReasoningBlock from '../components/ArthaReasoningBlock'

test('QueryReasoningAccordion renders with empty state', () => {
  const html = renderToStaticMarkup(
    React.createElement(QueryReasoningAccordion, {
      query: '',
      job: null,
      isRunning: false,
      isDone: false
    })
  )
  assert.ok(html.includes('Query Understanding Agent'))
  assert.ok(html.includes('Routing &amp; intent trace') || html.includes('Routing'))
})

test('QueryReasoningAccordion renders with entities and selected agents', () => {
  const job = {
    entities: [{ name: 'Tata Consultancy Services', ticker: 'TCS', exchange: 'NSE' }],
    selected_agents: ['financial', 'valuation']
  }
  const html = renderToStaticMarkup(
    React.createElement(QueryReasoningAccordion, {
      query: 'Analyze TCS fundamentals',
      job,
      isRunning: false,
      isDone: true
    })
  )
  assert.ok(html.includes('Query Understanding Agent'))
  assert.ok(html.includes('Routing &amp; intent trace') || html.includes('Routing'))
})

test('LiveAgentStream renders with selected agents and status', () => {
  const job = {
    selected_agents: ['financial', 'valuation'],
    completed_agents: ['financial'],
    failed_agents: []
  }
  const html = renderToStaticMarkup(
    React.createElement(LiveAgentStream, {
      job,
      query: 'TCS Analysis',
      running: true,
      isDone: false
    })
  )
  assert.ok(html.includes('Financial Health'))
  assert.ok(html.includes('Valuation'))
})

test('AgentProcessContinuation renders empty and populated pipelines', () => {
  const emptyHtml = renderToStaticMarkup(
    React.createElement(AgentProcessContinuation, {
      job: { selected_agents: [] },
      query: 'General chat',
      running: false,
      isDone: true
    })
  )
  assert.ok(emptyHtml.includes('No specialist agents were dispatched'))

  const job = {
    selected_agents: ['financial', 'risk'],
    completed_agents: ['financial'],
    failed_agents: ['risk']
  }
  const populatedHtml = renderToStaticMarkup(
    React.createElement(AgentProcessContinuation, {
      job,
      query: 'Infosys Risk & Financials',
      running: false,
      isDone: true
    })
  )
  assert.ok(populatedHtml.includes('Specialist Execution Stream'))
  assert.ok(populatedHtml.includes('Financial Health'))
  assert.ok(populatedHtml.includes('Adversarial Risk'))
})

test('ReportPreview renders cleanly without throwing', () => {
  const job = {
    id: 'job-123',
    status: 'succeeded',
    report: {
      company: { name: 'Infosys', ticker: 'INFY' },
      overall_assessment: { classification: 'POSITIVE', rationale: 'Solid fundamentals' },
      executive_summary: 'Report summary here',
      evidence_gaps: ['No forward guidance available']
    }
  }
  const html = renderToStaticMarkup(
    React.createElement(ReportPreview, {
      jobId: 'job-123',
      job,
      pdfUrl: null
    })
  )
  assert.ok(typeof html === 'string')
})

test('StudioWaitCarousel and LandingHero render properly', () => {
  const carouselHtml = renderToStaticMarkup(React.createElement(StudioWaitCarousel))
  assert.ok(typeof carouselHtml === 'string')

  const heroHtml = renderToStaticMarkup(
    React.createElement(LandingHero, { onSelectPrompt: () => {} })
  )
  assert.ok(typeof heroHtml === 'string')
})

test('landing experience and in-app PDF viewer render their core actions', () => {
  const landing = renderToStaticMarkup(React.createElement(LandingExperience, {
    onRun: () => {}, running: false, submitting: false, query: '', onQueryChange: () => {}
  }))
  assert.ok(landing.includes('ArthaLens'))
  assert.ok(landing.includes('Evidence-first research aid'))

  const viewer = renderToStaticMarkup(React.createElement(PdfViewerModal, {
    jobId: 'job-1', pdfUrl: 'blob:report', onClose: () => {}
  }))
  assert.ok(viewer.includes('PDF report viewer'))
  assert.ok(viewer.includes('Preparing your report'))
})

test('ResearchProcessGraph reflects live pipeline state', () => {
  const html = renderToStaticMarkup(
    React.createElement(ResearchProcessGraph, {
      running: true,
      job: {
        status: 'running',
        current_node: 'valuation_agent',
        selected_agents: ['financial', 'valuation'],
        completed_agents: ['financial'],
        failed_agents: [],
        steps: [
          { node: 'analyze_query', state: 'done' },
          { node: 'create_plan', state: 'done' },
          { node: 'apply_routing_policy', state: 'done' },
          { node: 'financial_agent', state: 'done' },
          { node: 'valuation_agent', state: 'running' }
        ]
      }
    })
  )
  assert.ok(html.includes('Live research pipeline'))
  assert.ok(html.includes('Financial health'))
  assert.ok(html.includes('Valuation'))
  assert.ok(html.includes('Working'))
  assert.ok(html.includes('data-node-id="valuation_agent"'))
  assert.ok(html.includes('Jump to live action'))
})

test('ArthaReasoningBlock renders in generating mode with reasoning badge and stage progress', () => {
  const html = renderToStaticMarkup(
    React.createElement(ArthaReasoningBlock, {
      query: 'Explain PE ratio simply',
      isGenerating: true,
      generationStep: 1,
    })
  )
  assert.ok(html.includes('Artha AI Copilot'))
  assert.ok(html.includes('Reasoning'))
  assert.ok(html.includes('Auditing valuation multiples, balance sheets &amp; SEC filings...'))
  assert.ok(html.includes('Financial Health Specialist') || html.includes('Financial Health'))
  assert.ok(html.includes('Valuation Multiples Specialist') || html.includes('Valuation Multiples'))
})

test('ArthaReasoningBlock showcases which agents are doing what and live process', () => {
  const job = {
    entities: [{ name: 'Tata Consultancy Services', ticker: 'TCS', exchange: 'NSE' }],
    selected_agents: ['financial', 'valuation', 'risk'],
    completed_agents: ['financial'],
    agent_statuses: { financial: 'completed', valuation: 'running', risk: 'queued' },
    current_node: 'run_specialists',
  }
  const html = renderToStaticMarkup(
    React.createElement(ArthaReasoningBlock, {
      job,
      query: 'Should I buy TCS stocks now?',
      running: true,
      isDone: false,
    })
  )
  assert.ok(html.includes('TCS'))
  assert.ok(html.includes('Financial Health'))
  assert.ok(html.includes('Valuation Multiples'))
  assert.ok(html.includes('Risk Diligence'))
  assert.ok(html.includes('Balance sheet solvency verified'))
  assert.ok(html.includes('Computing trailing P/E, EV/EBITDA'))
  assert.ok(html.includes('Adversarial Confrontation'))
})

