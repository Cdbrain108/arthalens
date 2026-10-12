# ArthaAI — Master Project Architecture & Complete Build Blueprint

**Project type:** Resume/portfolio project demonstrating Agentic AI engineering
**Product:** ArthaAI — Research Beyond the Noise.
**Core outcome:** One natural-language company/investment question → dynamically routed specialist agents → evidence validation → synthesized research → professional PDF.
**Primary orchestrator:** LangGraph

---

## A. Final Scope in One View

ArthaAI is deliberately a **focused AI research workspace**, not a financial terminal. The browser interface contains one strong research prompt, lightweight research-progress states, and a final PDF action. The depth lives in the backend workflow and in the generated PDF. Avoid decorative graphs, fake live metrics, arbitrary AI scores, fake sentiment/hiring numbers, or any UI element backed by data that the backend does not actually produce.

```text
USER
  ↓
RESEARCH PROMPT
  ↓
QUERY ANALYZER
  ↓
RESEARCH PLANNER
  ↓
DYNAMIC ROUTING
  ↓
┌───────────────┬───────────────┬───────────────┐
│ Financial     │ Valuation     │ Market        │
│ Agent         │ Agent         │ Agent         │
└───────────────┴───────────────┴───────────────┘
        ┌───────────────┬───────────────┐
        │ News          │ Growth        │ Risk          │
        │ Agent         │ Agent         │ Agent         │
        └───────────────┴───────────────┘
                         ↓
               TOOLS + RAG + DATA
                         ↓
                 EVIDENCE VALIDATOR
                         ↓
                  BULL/BEAR CHECK
                         ↓
                     SYNTHESIZER
                         ↓
                 STRUCTURED REPORT
                         ↓
                    PDF GENERATOR
                         ↓
                    DOWNLOAD PDF
```

## B. What the Resume Project Must Prove

A recruiter should be able to see evidence that the project can: understand an open-ended question; plan a research workflow; choose only relevant agents; execute independent work in parallel; call external tools; retrieve long-form company documents with RAG; calculate deterministic financial ratios; attach provenance to claims; detect conflicts and missing evidence; challenge a thesis with bull/bear/risk reasoning; synthesize structured output; and turn that output into a polished, reproducible PDF.

## C. Architecture Choice: LangGraph vs CrewAI

Both can build the system. For this project, use **LangGraph** as the single orchestration framework. The deciding requirement is not merely multi-agent collaboration; it is explicit state, conditional routing, parallel branches, validation branches, retries, and deterministic transitions. Do not add CrewAI just to increase the technology list. Use one strong orchestration layer. LangChain can remain a supporting library when useful for model/tool/retriever integrations.

```text
LangGraph = workflow/state/orchestration
LangChain  = supporting model/tool/retrieval utilities
FastAPI    = backend API
React      = frontend
RAG        = document evidence retrieval
Python     = deterministic calculations + report building
```

## D. End-to-End Runtime Architecture

```text
                    ┌──────────────────────┐
                    │     React Frontend   │
                    │ Dark AI Workspace    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │       FastAPI        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Research Job Manager │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      LangGraph       │
                    │   Shared State       │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Query Analyzer     │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ Research Planner     │
                    └──────────┬───────────┘
                               │
                  ┌────────────┼────────────┐
                  ▼            ▼            ▼
              Specialist 1 Specialist 2 Specialist N
                  │            │            │
                  └────────────┼────────────┘
                               ▼
                    ┌──────────────────────┐
                    │ Evidence/Fact       │
                    │ Validator            │
                    └──────────┬───────────┘
                               │
                        ┌──────┴──────┐
                        ▼             ▼
                    Validated      Conflict /
                    Evidence       Missing Data
                        │             │
                        └──────┬──────┘
                               ▼
                    ┌──────────────────────┐
                    │ Bull/Bear/Risk       │
                    │ Challenge            │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ Research Synthesizer │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ Structured Report    │
                    │ JSON                 │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ Deterministic PDF    │
                    │ Generator            │
                    └──────────┬───────────┘
                               ▼
                            USER
```

## E. Shared Graph State

Use a typed state object so nodes exchange structured data instead of uncontrolled chat transcripts.

```python
class ResearchState:
    query: str
    entities: list
    intent: str
    time_horizon: str | None
    research_plan: dict
    selected_agents: list
    agent_results: dict
    evidence: list
    conflicts: list
    validation_results: list
    bull_case: list
    bear_case: list
    risks: list
    synthesis: dict
    report: dict
    pdf_path: str | None
    errors: list
    timestamps: dict
```

## F. Graph Nodes

Recommended first graph:

```text
START
 ↓
analyze_query
 ↓
create_plan
 ↓
route_agents
 ↓
parallel_specialists
 ↓
collect_results
 ↓
validate_evidence
 ↓
bull_bear_risk
 ↓
synthesize
 ↓
build_report
 ↓
generate_pdf
 ↓
END
```

Possible conditional edges:

```text
route_agents
 ├── financial?
 ├── valuation?
 ├── market?
 ├── news?
 ├── growth?
 ├── workforce?
 ├── social?
 └── rag/document?
```

## G. Dynamic Routing Is a Core Feature

Do not always invoke every agent. The planner must choose the smallest useful set.

Example:

```text
Why did TCS move today?
      ↓
Market + News
      ↓
Validation → Synthesis → PDF
```

```text
Should I buy TCS for 5 years?
      ↓
Financial + Valuation + Growth + Market + News + Risk + RAG
      ↓
Validation → Bull/Bear → Synthesis → PDF
```

```text
Is TCS hiring?
      ↓
Workforce + Company + News
      ↓
Validation → Synthesis → PDF
```

## H. Specialist-Agent Responsibilities

### Financial Agent
Fundamentals, revenue, profit, margins, EPS, free cash flow, debt, cash, ROE, ROCE and historical financial trends.

### Valuation Agent
P/E, P/B, P/S, EV/EBITDA, EV/Sales, PEG, dividend yield, FCF yield and optional P/A. Ratios are contextualized against company history, peers, sector, growth, profitability and leverage. Arithmetic is deterministic Python code.

### Market Agent
Actual price/volume/history and relevant market or sector context. Technical observations only when they are actually calculated from real data.

### News Agent
Recent earnings, contracts, management changes, regulation, launches, partnerships, litigation, acquisitions and other material developments.

### Growth & Projects Agent
Projects, capex, expansion, products, partnerships, strategic initiatives and execution status. Distinguish announced vs started vs under execution vs completed.

### Workforce Agent
Optional. Use legitimate company career pages, public disclosures, permitted workforce data or authorized access. Never make unauthorized LinkedIn scraping a dependency.

### Social Agent
Optional. Analyze permitted public discussion themes rather than inventing numerical sentiment. Prefer qualitative themes plus evidence strength unless a transparent metric is implemented.

### Risk Agent
Business, competitive, financial, valuation, regulatory, legal, geopolitical, execution and technology risks; actively search for thesis-breaking evidence.

### Document/RAG Agent
Retrieves relevant passages from annual reports, quarterly results, investor decks, earnings-call transcripts, filings and uploaded PDFs.

## I. Tool Architecture

Agents should call explicit tools rather than pretend to know live information.

```text
market tools
  get_quote()
  get_price_history()
  get_volume()

financial tools
  get_financials()
  get_company_metrics()
  calculate_ratio()

news tools
  search_news()
  fetch_news()

web tools
  search_web()
  fetch_page()

document tools
  search_documents()
  retrieve_evidence()

report tools
  build_report_json()
  render_pdf()
```

## J. RAG Architecture

```text
PDF / Filing
   ↓
Parse
   ↓
Clean
   ↓
Chunk
   ↓
Metadata
   ↓
Embeddings
   ↓
Vector Store
   ↓
Retrieve
   ↓
Optional Rerank / Filter
   ↓
Evidence Context
   ↓
Agent
```

Metadata should contain company, document type, period, publication date, source, page, section and document ID.

## K. Evidence-First Data Model

Every important claim should ideally carry:

```json
{
  "claim": "Revenue increased year-over-year",
  "value": 14.2,
  "unit": "percent",
  "source_title": "Annual Report",
  "source_url": "...",
  "publication_date": "...",
  "retrieved_at": "...",
  "document_id": "...",
  "page": 42,
  "excerpt": "...",
  "agent": "financial",
  "evidence_type": "primary",
  "claim_type": "fact",
  "confidence": "high"
}
```

The final report must distinguish fact, interpretation and conclusion. Unsupported information becomes an explicit evidence gap.

## L. Validation Pipeline

```text
Agent Findings
     ↓
Source existence check
     ↓
Source relevance check
     ↓
Date / period check
     ↓
Numeric consistency
     ↓
Cross-source conflict detection
     ↓
Fact vs interpretation
     ↓
Validated Evidence
```

Example conflict:

```text
Provider A: Revenue = 100
Provider B: Revenue = 103
        ↓
Validator flags conflict
        ↓
Check period / accounting basis / revision
        ↓
Resolve or disclose conflict
```

## M. Bull / Bear / Risk Challenge

The system should deliberately challenge its own emerging thesis.

```text
Evidence
 ↓
Bull Case: Why could the positive thesis be true?
 ↓
Bear Case: Why could it be wrong?
 ↓
Risk: What could break the thesis?
 ↓
What Could Change the View?
```

## N. Synthesis Contract

The synthesizer should consume structured validated state, not arbitrary agent prose. It outputs the final structured report object.

```json
{
  "query": "",
  "company": {},
  "executive_summary": "",
  "overall_assessment": {},
  "financial": {},
  "valuation": {},
  "market": {},
  "growth": {},
  "news": {},
  "workforce": {},
  "risk": {},
  "bull_case": [],
  "bear_case": [],
  "evidence_gaps": [],
  "what_could_change_view": [],
  "sources": [],
  "timestamps": {}
}
```

## O. Deterministic Financial Computation Layer

Do not ask an LLM to perform core arithmetic. Implement formulas in code and retain the inputs used.

Examples:

```text
P/E = Market Price per Share / EPS
P/B = Market Price per Share / Book Value per Share
P/S = Market Capitalization / Revenue
Debt/Equity = Total Debt / Shareholders' Equity
ROE = Net Income / Average Shareholders' Equity
FCF Yield = Free Cash Flow / Market Capitalization
```

Document the project's exact definitions and accounting basis.

## P. Data Normalization

Normalize provider differences before analysis:

- currency
- units
- fiscal period
- consolidated vs standalone
- restated/revised values
- date conventions

Internal values should carry period and source metadata.

## Q. Report Generation

The report pipeline should be deterministic after synthesis:

```text
Validated Research State
      ↓
Structured Report JSON
      ↓
HTML / template
      ↓
PDF renderer
      ↓
Final PDF
```

This makes PDF generation independent from the LLM's formatting quality.

## R. PDF Content

Recommended sections:

1. Cover / Research Question
2. Executive Summary
3. Company Identification
4. Market Snapshot
5. Financial Health
6. Valuation & Ratios
7. Growth & Projects
8. Recent News
9. Market Analysis
10. Workforce Signals when evidence exists
11. Risk Analysis
12. Bull Case
13. Bear Case
14. Overall Assessment
15. Decision-Support View
16. Evidence Gaps
17. What Could Change the View
18. Agent Contributions
19. Sources & Citations
20. Data Timestamp
21. Methodology / Limitations

Sections with no reliable evidence should be labeled as unavailable or omitted rather than fabricated.

## S. Web UI Should Remain Small

### Homepage

```text
ArthaAI
Research Beyond the Noise.

[ Ask ArthaAI anything about a company or investment... ]

[ Run Research ]

Examples / modes / minimal source configuration
```

### Researching

```text
Understanding query     ✓
Planning                 ✓
Financial Agent          ✓
Valuation Agent          ✓
Market Agent             ●
News Agent               ●
Validation               ○
PDF generation           ○
```

### Complete

```text
Research complete ✓

TCS — Five-Year Research

[ View Report ] [ Download PDF ]
```

The interface should not try to display the entire research report at once.

## T. Frontend Component Inventory

Reusable components:

```text
AppShell
Sidebar
TopBar
ResearchPrompt
ResearchMode
ExamplePrompt
WorkflowStatus
AgentStatusCard
EvidenceDrawer
ReportPreview
SourceChip
PdfDownload
HistoryList
SettingsPanel
```

## U. Backend Component Inventory

```text
api/
  research_routes
  report_routes
  document_routes

graph/
  state
  nodes
  edges
  routing

agents/
  financial
  valuation
  market
  news
  growth
  risk
  workforce
  social
  document
  synthesizer

tools/
  market
  financial
  news
  web
  documents

rag/
  parser
  chunker
  embeddings
  retriever

validation/
  source_validator
  claim_validator
  conflict_detector

report/
  schema
  renderer
  pdf

storage/
  jobs
  documents
  reports
```

## V. API Endpoints

Minimal API:

```text
POST /api/research
GET  /api/research/{job_id}
GET  /api/research/{job_id}/status
GET  /api/research/{job_id}/report
GET  /api/research/{job_id}/pdf
GET  /api/research/history
POST /api/documents
GET  /api/documents
GET  /api/agents
```

Keep the first implementation smaller if necessary.

## W. Job State

```json
{
  "job_id": "research_123",
  "status": "running",
  "query": "...",
  "current_node": "news_agent",
  "selected_agents": ["financial", "valuation", "news"],
  "completed_agents": ["financial"],
  "errors": []
}
```

The UI should render actual status from this state.

## X. Error Handling

Agents should fail independently where possible.

Example:

```text
News provider unavailable
 ↓
mark news source unavailable
 ↓
continue with available evidence
 ↓
include evidence gap in report
```

Use bounded retries only for transient failures or malformed structured outputs.

## Y. Caching and Reproducibility

Cache repeated public-data requests when appropriate. Every research run should record:

- job ID
- query
- timestamp
- selected agents
- model/provider
- source set
- report schema version

Never present stale cached data as current.

## Z. Evaluation Plan

Create a benchmark of representative questions. Measure:

### Routing
Did the planner choose the appropriate agents?

### Retrieval
Did the system find the right evidence?

### Evidence
Are important claims source-backed?

### Calculation
Are ratios and numerical transformations correct?

### Synthesis
Does the conclusion follow from evidence?

### Citation completeness
Can important claims be traced to a source?

### Efficiency
Were independent tasks parallelized?

Example routing test:

```text
Question: Why did TCS move today?
Expected: Market + News
Actual: Market + News + Financial + Workforce
Result: Over-routed
```

## AA. Development Phases

### Phase 1 — Working Core

```text
UI
 ↓
FastAPI
 ↓
LangGraph
 ↓
Planner
 ↓
Financial + Market + News
 ↓
Validation
 ↓
Synthesis
 ↓
PDF
```

### Phase 2 — Strong Agentic Demo

Add:
- dynamic routing
- valuation
- growth/projects
- RAG
- document upload
- evidence drawer
- history

### Phase 3 — Optional Research Depth

Add only if useful:
- workforce signals
- social analysis
- more connectors
- evaluation harness
- caching
- comparison mode

## AB. What Must Not Delay the MVP

Do not spend major development time on:

- portfolio tracking
- automated trading
- real-time streaming terminal
- complex technical-analysis dashboards
- social-media scraping infrastructure
- unauthorized LinkedIn scraping
- distributed microservices
- elaborate animation systems
- 3D UI

## AC. Project Folder Structure

```text
artha-ai/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── api/
│       ├── hooks/
│       └── styles/
├── backend/
│   └── app/
│       ├── api/
│       ├── graph/
│       ├── agents/
│       ├── tools/
│       ├── rag/
│       ├── schemas/
│       ├── validation/
│       ├── report/
│       └── storage/
├── data/
├── documents/
├── reports/
├── tests/
├── .env.example
├── README.md
└── pyproject.toml
```

## AD. Example End-to-End Run

User asks:

> Should I hold TCS for the next five years?

System:

```text
1. Analyze query
2. Identify TCS
3. Detect 5-year horizon
4. Build research plan
5. Select Financial / Valuation / Growth / Market / News / Risk / RAG
6. Run independent branches in parallel
7. Gather evidence
8. Validate claims and calculations
9. Run bull/bear/risk challenge
10. Synthesize
11. Build report JSON
12. Render PDF
13. Return PDF to user
```

## AE. Recommended Demo Script

A 3–5 minute portfolio demonstration should be:

```text
Open ArthaAI
  ↓
Enter a real research question
  ↓
Show planner-selected agents
  ↓
Show actual agent progress
  ↓
Show evidence being collected
  ↓
Show validation result
  ↓
Generate report
  ↓
Download PDF
  ↓
Open PDF and inspect citations
```

This is enough to communicate the technical project without building a huge dashboard.

## AF. Resume Positioning

Recommended resume bullet:

> Built ArthaAI, a LangGraph-orchestrated multi-agent company research system that dynamically routes investment questions to specialist financial, valuation, market, news, growth and risk agents; integrates tools and RAG for source-backed research, validates evidence and calculations, and generates professional PDF research reports.

## AG. Final Definition of Done

```text
[ ] User can enter a natural-language query
[ ] Company/entity can be identified
[ ] Planner creates a research plan
[ ] Only required agents are selected
[ ] Independent agents can execute in parallel
[ ] Real tools/data are connected
[ ] RAG works for uploaded/selected documents
[ ] Agent outputs are structured
[ ] Important findings contain evidence
[ ] Validator checks important claims
[ ] Conflicts/data gaps are surfaced
[ ] Bull/bear/risk challenge works
[ ] Synthesizer produces structured report JSON
[ ] PDF is generated deterministically
[ ] PDF can be downloaded
[ ] Research history works
[ ] Basic tests exist
[ ] Routing/retrieval/evidence evaluation exists
[ ] README explains architecture
```

---

# ArthaAI — Project Specification v3
## AI-Powered Company Research & Investment Decision Support

**Positioning:** Resume/portfolio project demonstrating production-minded Agentic AI engineering.  
**Tagline:** Research Beyond the Noise.  
**Primary UX principle:** One question → specialist agents → evidence → synthesis → PDF report.

---

## 1. Product Goal

ArthaAI accepts a natural-language company/investment research question and coordinates a set of specialist AI agents. The system gathers information from permitted data sources and uploaded documents, performs structured analysis, validates important claims, and produces a professional PDF research report.

The project is intentionally **not** a full trading terminal, portfolio manager, or market-prediction product. The goal is to demonstrate orchestration, tool use, RAG, structured outputs, evidence handling, agent collaboration, and report generation.

---

## 2. UX Philosophy

The web application should remain visually simple and focused. It should resemble a modern dark AI workspace: near-black background, subtle borders, restrained blue/purple accents, generous whitespace, and a single primary research prompt.

Do **not** fill the interface with decorative live charts, fake KPIs, artificial confidence numbers, or analytics that are not backed by working data pipelines.

The web UI is the **control room**. The generated PDF is the **detailed deliverable**.

### Primary flow

`User question → Research configuration → Agent execution → Evidence validation → Synthesis → PDF generation`

---

## 3. Website Scope

### Primary screen
A single focused research workspace containing:

- ArthaAI branding
- Global search/history access
- Large natural-language research prompt
- Research mode indicator
- Optional example questions
- Minimal workflow visualization
- Compact specialist-agent status
- Report-ready state
- PDF download action

### Secondary screens
Keep these lightweight:

1. Research History
2. Saved Reports
3. Companies
4. Agents
5. Data Sources
6. Settings

Do not build separate dashboard pages for every metric or data source unless a real backend capability requires them.

---

## 4. Research Prompt

Example:

> Should I buy TCS for a five-year horizon?

Other examples:

- Why has NVIDIA moved recently?
- Compare TCS and Infosys on financial health and valuation.
- Analyze Reliance's growth projects and major risks.
- Is the company's current valuation supported by its fundamentals?

The prompt should support:
- company/ticker identification
- intent classification
- time horizon
- comparison requests
- document-specific questions
- buy/hold/sell decision-support requests

---

## 5. Orchestrator / Planner

The orchestrator should:

1. Parse the user's question.
2. Identify the company/entities.
3. Determine the research intent.
4. Determine the required time horizon.
5. Select only the agents needed for the question.
6. Create an execution plan.
7. Run independent agents in parallel where appropriate.
8. Collect structured agent outputs.
9. trigger validation for important claims.
10. Send validated evidence to the synthesis layer.
11. Generate the final report.

### Dynamic routing examples

| User question | Likely agents |
|---|---|
| Why did TCS move today? | Market + News |
| Is TCS good for 5 years? | Financial + Valuation + Growth + Market + News + Risk |
| Is TCS hiring? | Workforce + Company + News |
| Compare TCS vs Infosys | Financial + Valuation + Growth + Market + Risk |
| Explain this annual report | Document/RAG + Financial + Risk |

---

## 6. Specialist Agents

### Financial Agent
Analyzes:
- revenue
- profit
- margins
- EPS
- cash flow
- debt
- ROE
- ROCE
- historical financial trends

### Valuation Agent
Calculates/interprets, where data is available:
- P/E
- P/B
- P/S
- EV/EBITDA
- EV/Sales
- PEG
- dividend yield
- FCF yield
- optional P/A

Ratios must be contextualized against:
- historical company values
- peers
- sector
- growth
- profitability
- leverage

### Market Agent
Handles:
- price movement
- volume
- relevant market context
- trend/technical observations only when supported by real data

Avoid presenting technical indicators unless they are actually calculated.

### News Agent
Handles:
- recent company news
- material events
- catalysts
- negative developments
- event chronology

### Growth & Projects Agent
Handles:
- expansion
- new projects
- capex
- strategic initiatives
- partnerships
- product launches
- geographic expansion

### Risk Agent
Handles:
- business risks
- financial risks
- valuation risks
- regulatory risks
- execution risks
- evidence gaps

### Workforce Agent (optional)
Handles permitted/authorized workforce signals such as:
- company career pages
- hiring trends from legitimate data sources
- public workforce disclosures

LinkedIn should **not** become a scraping dependency. Use only lawful/authorized access or permitted data.

### Document/RAG Agent
Handles:
- annual reports
- quarterly reports
- investor presentations
- earnings-call transcripts
- regulatory filings
- uploaded PDFs

---

## 7. Agent Output Contract

Every specialist agent should return structured data similar to:

```json
{
  "agent": "valuation_agent",
  "company": "TCS",
  "timestamp": "ISO-8601",
  "findings": [],
  "positive_signals": [],
  "negative_signals": [],
  "risks": [],
  "evidence": [],
  "sources": [],
  "confidence": "high|medium|low",
  "data_gaps": []
}
```

Each evidence item should ideally include:

- claim
- source title
- source URL/document
- publication date
- retrieval timestamp
- page/section when applicable
- evidence excerpt
- calculation method when applicable

---

## 8. Evidence & Validation Layer

Important claims should not reach the final report without traceable evidence where evidence is expected.

The validator should check:

- source exists
- source is relevant
- publication date is known where possible
- numerical claims have consistent units
- calculations are reproducible
- conflicting evidence is surfaced
- fact vs interpretation is separated

The system should explicitly show evidence gaps rather than inventing information.

---

## 9. RAG Architecture

Recommended pipeline:

`Document → Parse → Chunk → Metadata → Embed → Vector Store → Retrieve → Rerank/Filter → Agent Context → Citation`

Recommended free/open-source options:

- PyMuPDF for PDF extraction
- Sentence Transformers for local embeddings
- FAISS or Chroma for vector retrieval
- PostgreSQL for persistent metadata if needed

The initial implementation can use local files and a small vector store.

---

## 10. Model Strategy

The model layer should be provider-agnostic.

Possible development options:

- Gemini API using an available free tier/key
- local models through Ollama
- other permitted model providers

Do not hard-code the entire system around one provider.

Create a model abstraction so the orchestration layer can switch providers later.

---

## 11. Data Source Strategy

### MVP sources

Prioritize:
- uploaded documents
- company annual reports
- quarterly results
- investor presentations
- regulatory filings
- official company announcements
- permitted public web/news information
- permitted/free market-data sources

### Optional integrations

- social signals
- workforce/hiring signals
- external financial-data providers

These should be modular integrations, not mandatory dependencies.

---

## 12. PDF Report

The PDF is the primary detailed output.

Suggested sections:

1. Cover / Research Question
2. Executive Summary
3. Company Identification
4. Market Snapshot
5. Financial Health
6. Valuation & Key Ratios
7. Growth & Projects
8. Recent News
9. Market Analysis
10. Workforce Signals, when available
11. Risk Analysis
12. Bull Case
13. Bear Case
14. Overall Assessment
15. Confidence & Evidence Gaps
16. What Could Change the View
17. Agent Contributions
18. Sources & Citations
19. Data Timestamp
20. Methodology / Limitations

Only include sections supported by the research plan and available evidence.

---

## 13. Buy / Hold / Sell

The system may provide a:

- BUY
- HOLD
- SELL

**decision-support classification**, but it must not present this as a guaranteed prediction.

The report should explain:

- evidence supporting the classification
- contradictory evidence
- major risks
- confidence
- what could invalidate the conclusion

Avoid arbitrary "AI score" numbers unless a transparent scoring methodology is implemented.

---

## 14. Frontend Architecture

Recommended:

- React
- Vite
- Tailwind CSS
- Lucide icons
- minimal charting only when real data requires visualization

The UI should use reusable components:

- `ResearchPrompt`
- `ResearchMode`
- `WorkflowStatus`
- `AgentStatusCard`
- `EvidenceDrawer`
- `ReportPreview`
- `SourceCitation`
- `ResearchHistory`
- `PDFDownload`

---

## 15. Backend Architecture

Recommended:

- Python
- FastAPI
- LangGraph for orchestration
- LangChain for model/tool integrations where useful
- Pydantic for structured schemas
- FAISS/Chroma for MVP retrieval
- PostgreSQL or SQLite for persistence

High-level:

```text
React
  ↓
FastAPI
  ↓
Research API
  ↓
LangGraph Orchestrator
  ↓
Planner
  ↓
Specialist Agents
  ↓
Tools + RAG + Data Sources
  ↓
Validation
  ↓
Synthesis
  ↓
Report Generator
  ↓
PDF
```

---

## 16. Cost Philosophy

This is a portfolio project, not an enterprise deployment.

Target:

**₹0 development cost wherever practical.**

Use:
- open-source libraries
- free tiers
- available free API keys
- local models where useful
- free/open-source storage and retrieval components

Paid services should be optional adapters, not architectural requirements.

---

## 17. What NOT to Build

Avoid:

- fake live dashboards
- decorative stock charts
- fake sentiment percentages
- fake hiring statistics
- unsupported financial numbers
- unnecessary 3D visualizations
- excessive animations
- portfolio-management features
- automated trading/execution
- dozens of disconnected pages
- metrics that do not come from the backend

Every visible UI element should either:
1. demonstrate a real system capability, or
2. improve usability.

---

## 18. Resume Value

The project should demonstrate:

- Agentic AI
- multi-agent orchestration
- dynamic agent routing
- parallel execution
- tool calling
- RAG
- structured outputs
- evidence validation
- financial-data reasoning
- source attribution
- document intelligence
- PDF report generation
- modular AI architecture

### Example resume description

> Built ArthaAI, a multi-agent AI research system that dynamically routes company-investment questions to specialist agents for financial analysis, valuation, market/news research, RAG-based document analysis, risk assessment, evidence validation, and automated PDF report generation.

---

## 19. Definition of Done for MVP

The MVP is complete when a user can:

1. Enter a natural-language research question.
2. Identify the company automatically or with minimal clarification.
3. See the orchestrator select appropriate agents.
4. Observe agent execution status.
5. Retrieve information from configured sources/documents.
6. Perform real financial calculations where data exists.
7. Attach evidence and citations to important findings.
8. Validate important claims.
9. Generate a coherent synthesis.
10. Produce a professional PDF.
11. Download the PDF.
12. Re-open the research from history.

---

## 20. Core Product Statement

> **ArthaAI turns one research question into a coordinated, evidence-backed investigation by specialist AI agents—and delivers the result as a professional research report.**

This statement should guide both the engineering scope and the UI. If a proposed feature does not strengthen this workflow, it should probably wait.
