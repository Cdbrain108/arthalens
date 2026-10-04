# Bulls Eye — Roles & Responsibilities

Two role systems coexist in Bulls Eye, and the framework keeps them strictly separated:

1. **System roles** — the agents and services that run inside the product.
2. **Human roles** — the (portfolio-sized) team responsibilities for building it.

---

## 1. System Roles (Runtime)

| Role | Type | Owns | Inputs | Outputs | Must NOT |
|---|---|---|---|---|---|
| **Query Analyzer** | Graph node (LLM, structured) | Entity extraction, intent classification, time-horizon detection, comparison detection | raw `query` | `entities`, `intent`, `time_horizon`, `compare_mode` | plan research, pick agents |
| **Research Planner** | Graph node (LLM + deterministic policy) | Execution plan, agent selection, required-evidence checklist | analysis results | `research_plan`, `selected_agents` | call tools, gather data |
| **Router** | Deterministic edge logic | Enforce routing table minimums/caps | plan | `Send()` fan-out | reason freely (it is code, not LLM) |
| **Financial Agent** | Specialist | Fundamentals: revenue, profit, margins, EPS, FCF, debt, ROE/ROCE, trends | plan slice + tools | `AgentResult` + evidence | compute ratios in prose (tools calculate) |
| **Valuation Agent** | Specialist | P/E, P/B, P/S, EV/EBITDA, EV/S, PEG, div yield, FCF yield vs history/peers/sector | plan + tools | `AgentResult` + evidence | invent peer data |
| **Market Agent** | Specialist | Price/volume/history, market & sector context; technical observations *only* if computed | plan + tools | `AgentResult` + evidence | quote indicators it didn't compute |
| **News Agent** | Specialist | Earnings, contracts, management, regulation, launches, litigation, M&A; event chronology | plan + tools | `AgentResult` + evidence | editorial opinion |
| **Growth & Projects Agent** | Specialist | Capex, expansion, products, partnerships; status discipline: announced → started → executing → completed | plan + tools + RAG | `AgentResult` + evidence | blur announced vs delivered |
| **Risk Agent** | Specialist | Business/competitive/financial/valuation/regulatory/legal/geopolitical/execution/tech risks; hunts thesis-breakers | plan + all tools | `AgentResult` + risks | soft-pedal negatives |
| **Workforce Agent** | Specialist (optional) | Career pages, public disclosures, permitted workforce data | plan + tools | `AgentResult` + evidence | scrape LinkedIn (hard ban) |
| **Social Agent** | Specialist (optional) | Qualitative discussion themes + evidence strength | plan + tools | `AgentResult` + evidence | emit numeric sentiment without a transparent metric |
| **Document/RAG Agent** | Specialist | Retrieval from filings/transcripts/decks/uploaded PDFs with page-level citations | plan + retriever | evidence excerpts | answer beyond retrieved passages |
| **Result Collector** | Graph node (code) | Fan-in barrier; completeness check vs plan | all branch results | merged state | judge content |
| **Evidence Validator** | Service + node | Source existence/relevance, date & unit checks, numeric consistency, conflict detection, fact-vs-interpretation split | evidence list | `validation_results`, `conflicts`, `evidence_gaps` | gather new evidence |
| **Bull/Bear Challenger** | Graph node (LLM) | Adversarial thesis challenge; "what could change the view" | validated evidence | `bull_case`, `bear_case`, `risks`, `what_could_change_view` | add unsourced claims |
| **Synthesizer** | Graph node (LLM, structured) | Final `ReportJSON` from *validated state only* | validated state | `synthesis`, `report` | read raw agent prose; add new facts |
| **Report Builder** | Code | Section assembly, gap labeling, citation index | `ReportJSON` | render-ready report | rewrite wording |
| **PDF Generator** | Code (Jinja2 + WeasyPrint) | Deterministic render | report | `pdf_path` | call an LLM |
| **Job Manager** | Service | Lifecycle, retries, idempotency, provenance log | API requests | job state | agent logic |
| **Tool Layer** | Code adapters | Provider I/O, normalization, caching | agent tool calls | normalized data | reasoning |

### Agent output contract (all specialists, no exceptions)

```json
{
  "agent": "valuation_agent",
  "company": "TCS",
  "timestamp": "ISO-8601",
  "findings": [],
  "positive_signals": [],
  "negative_signals": [],
  "risks": [],
  "evidence": ["EvidenceItem…"],
  "sources": [],
  "confidence": "high|medium|low",
  "data_gaps": []
}
```

---

## 2. Human Roles (Build Team — solo-portfolio defaults to one person wearing hats)

| Role | Accountable for | Definition-of-done artifacts |
|---|---|---|
| **Orchestration Engineer** | LangGraph topology, state schema, routing policy, checkpointing | `graph/`, routing benchmark green |
| **Agent Engineer** | Specialist prompts, structured outputs, tool wiring | `agents/`, per-agent contract tests |
| **Data & Tools Engineer** | Provider adapters, normalization, caching | `tools/`, normalization unit tests |
| **RAG Engineer** | Parsing, chunking, embeddings, retrieval quality | `rag/`, retrieval benchmark ≥ target recall |
| **Validation Engineer** | Validators, conflict detector, gap surfacing | `validation/`, seeded-conflict tests |
| **Report Engineer** | ReportJSON schema, Jinja2 template, WeasyPrint pipeline | `report/`, golden-file PDF snapshot test |
| **Frontend Engineer** | React workspace per UI spec, job-state-driven rendering | `frontend/`, status-flow e2e test |
| **QA / Eval Lead** | Benchmark set, routing/retrieval/calculation scores, CI gates | `tests/`, `EVALUATION_AND_TESTING.md` metrics |

---

## 3. RACI — Major Decisions

| Decision | Orch Eng | Agent Eng | Data Eng | RAG Eng | Valid Eng | Report Eng | FE Eng | QA |
|---|---|---|---|---|---|---|---|---|
| State schema change | **A** | C | C | C | C | C | I | C |
| Routing policy update | **A** | C | I | I | C | I | I | R |
| New tool/provider adapter | I | C | **A/R** | I | C | I | I | C |
| New specialist agent | C | **A/R** | C | I | C | I | I | C |
| Evidence schema change | C | C | C | C | **A** | C | I | R |
| Report section change | I | I | I | I | C | **A/R** | C | C |
| UI element added | I | I | I | I | I | I | **A/R** | C |
| Eval threshold change | C | C | C | C | C | C | I | **A/R** |

**One veto rule:** QA can block any merge that adds UI elements or report claims not backed by backend data. That veto is the enforcement mechanism for the project's core honesty principle.
