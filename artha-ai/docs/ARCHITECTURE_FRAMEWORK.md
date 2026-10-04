# Bulls Eye — Complete Architecture Framework (v4, Consolidated)

> **Product:** Bulls Eye — *Research Beyond the Noise.*
> **Core outcome:** One natural-language company/investment question → dynamically routed specialist agents → evidence validation → synthesized research → professional PDF.
> **Orchestration:** CrewAI Flow (typed state + ordered stages) + isolated specialist Crews + FastAPI + React.
> **Supporting libs:** Python services for FastAPI/SQLite/FAISS/PyMuPDF/calculations/validation/Jinja2-PDF; provider adapters for Gemini/OpenRouter/Ollama. LangGraph is not in the active runtime; LangChain is not in the active CrewAI path.

This document supersedes and consolidates the v3 master plan. It is the single source of truth for **how the system is structured, how decisions are made, and how quality is enforced**. Companion documents:

| Document | Purpose |
|---|---|
| `ROLES_AND_RESPONSIBILITIES.md` | Every role in the system (human + agent + service) with a RACI matrix |
| `AGENT_CONTRACTS.md` | Exact input/output contracts, tools, and failure behavior per agent |
| `API_SPEC.md` | REST contract between the React frontend and FastAPI backend |
| `EVALUATION_AND_TESTING.md` | Benchmarks, routing tests, quality gates, CI checks |

---

## 1. Design Principles (Binding)

1. **Evidence-first.** No important claim reaches the report without provenance (source, date, excerpt, evidence_id). Numeric/event claims link via `Finding.evidence_ids`; unsupported findings become gaps.
2. **LLMs reason, Python computes.** All arithmetic (ratios, growth rates, returns) is deterministic code (`calculate_ratio`, trend/benchmark helpers). The model interprets; it never calculates core numbers.
3. **Dynamic routing is the headline feature.** The planner proposes; deterministic `enforce_policy` disposes (minimums, exclusions, caps). Over-routing is a defect, measured in evaluation.
4. **Explicit state, not chat transcripts.** CrewAI Flow stages exchange typed Pydantic `ResearchState` (`backend/app/crew/state.py`). No free-floating conversation memory between crews.
5. **Fail independently, degrade gracefully.** One specialist Crew's failure marks an evidence gap; the Flow continues with remaining evidence.
6. **Provider-agnostic model layer.** Gemini free tier, OpenRouter, AgentRouter (DeepSeek V4 Flash single-shot + GLM tool loops), or local Ollama behind one CrewAI `build_llm()` factory with key rotation + pacing. Gateway quirks live in provider adapters: allowlisted client UA, raw-JSON contracts (no `response_format`), 16k headroom for thinking models, model fallback + excerpt redaction on content-filter blocks, RSS-URL scrubbing in prompts. No vendor lock-in.
7. **₹0 target cost.** Open-source libraries, free tiers, local embeddings. Paid adapters are optional plugins, never requirements.
8. **UI = control room, PDF = deliverable.** The web UI shows prompt, live agent status, and download. It never displays fabricated metrics or decorative charts.

---

## 2. System Context (C4 Level 1)

```text
                        ┌────────────┐
                        │    User    │
                        └─────┬──────┘
                              │ question / PDF upload
                              ▼
┌──────────────────────────────────────────────────────────┐
│                       Bulls Eye                          │
│                                                           │
│  React SPA ──► FastAPI ──► Job Manager ──► CrewAI Flow   │
│  (control     (REST +     (state, retries,  (typed state│
│   room)        polling)    provenance)       + stages)   │
│                                                           │
│  Sub-systems: Planner · Specialist Agents · Tool Layer ·  │
│  RAG · Validation · Bull/Bear · Synthesizer · PDF Engine  │
└───────┬──────────────┬──────────────┬────────────────────┘
        ▼              ▼              ▼
  Market/Finance   News/Web APIs   Company filings &
  data providers   (permitted)     uploaded PDFs (RAG)
```

---

## 3. Container Architecture (C4 Level 2)

| # | Container | Tech | Responsibility |
|---|-----------|------|----------------|
| 1 | **Frontend SPA** | React 18 + Vite + Tailwind + Lucide | Research prompt, live workflow status, evidence drawer, history, PDF download |
| 2 | **API Gateway** | FastAPI + Pydantic v2 | Request validation, job lifecycle, auth-ready, CORS |
| 3 | **Job Manager** | asyncio + SQLite (WAL) | Job state machine (`queued→running→succeeded/failed`), retries, provenance log |
| 4 | **Orchestrator** | **CrewAI Flow** `ResearchFlow` | Typed Pydantic state, ordered stages, deterministic routing, asyncio specialist fan-out/fan-in |
| 5 | **Model Gateway** | CrewAI `LLM` via `build_llm()` | One factory; per-role models; structured output via `output_pydantic` (QueryAnalysis/ResearchPlan/AgentResult/ChallengeOutput/ReportJSON) |
| 6 | **Tool Layer** | Native CrewAI `BaseTool` (`NativeFunctionTool`) | Market, financial, news, web, document tools — Pydantic args_schema, `{ok,data,source,error}` envelopes, `ok:false` on provider failure |
| 7 | **RAG Service** | PyMuPDF + Sentence-Transformers + FAISS | Parse → chunk → metadata → embed → retrieve → rerank |
| 8 | **Validation Service** | Python + LLM-assist | Source existence/relevance, numeric consistency, conflict detection, fact-vs-interpretation |
| 9 | **Report Engine** | Jinja2 HTML → WeasyPrint PDF | Deterministic render from `ReportJSON`; no LLM in the render path |
| 10 | **Storage** | SQLite (jobs/reports metadata) + filesystem (`documents/`, `reports/`, `data/faiss/`) | Documents, reports, cache, checkpoints |

---

## 4. The CrewAI Flow Orchestrator (Core)

Active code: `backend/app/crew/flow.py:ResearchFlow`, `backend/app/crew/state.py:ResearchState`, `backend/app/crew/runner.py`, `backend/app/crew/meta.py`, `backend/app/crew/routing.py`.

### 4.1 Typed Flow state

```python
# backend/app/crew/state.py — authoritative schema (Pydantic, serializable)
class ResearchState(BaseModel):
    query: str; job_id: str; document_ids: list[str]
    entities: list[dict]; intent: str  # price_move|long_term|hiring|compare|document|general
    time_horizon: str | None; compare_mode: bool
    research_plan: dict; selected_agents: list[str]
    agent_results: dict[str, dict]; evidence: list[dict]
    errors: list[dict]; completed_agents: list[str]; failed_agents: list[str]
    validation_results: list[dict]; conflicts: list[dict]
    rejected_evidence: list[dict]; evidence_gaps: list[str]
    bull_case/bear_case/risks/what_could_change_view: list[str]
    synthesis: dict; report: dict | None; pdf_path: str | None
    current_node: str; timestamps: dict[str, str]
```

Evidence contract: `Finding{claim, evidence_ids[]}`; `AgentResult{findings: list[Finding], positive/negative_signals, risks, evidence: list[EvidenceItem], ...}`; `EvidenceItem{evidence_id, claim, value, unit, source_title, source_url, publication_date, retrieved_at, document_id, page, excerpt, agent, source_type: provider|uploaded_document|deterministic_calculation|web_page|news_article, relevance, calc_inputs}`. Every numeric/event claim links to evidence IDs; unlinked findings become gaps.

### 4.2 Flow topology

```text
initialize (@start)
  ↓
analyze_query (meta analyzer Crew: QueryAnalysis)
  ↓
create_plan (meta planner Crew: ResearchPlan)
  ↓
apply_routing_policy (deterministic enforce_policy + document_ids)
  ↓ emits "agents"
run_selected_specialists (asyncio fan-out; one isolated Crew per agent)
  ├─► financial / valuation / market / news / growth / risk
  ├─► workforce / social (optional, only if routed)
  └─► document (RAG branch, only when docs/filings relevant)
  ↓
collect_results (routing-order restore for deterministic synthesis)
  ↓
validate_evidence (source/URL-or-doc-or-provider/date/units/relevance/conflicts/calc-inputs)
  ↓
challenge_thesis (meta challenger Crew: ChallengeOutput, validated evidence only)
  ↓
synthesize_report (meta synthesizer Crew: ReportJSON, validated state only)
  ↓
build_report (deterministic assemble_report; unsupported sections → "Unavailable")
  ↓ emits "report"
generate_pdf (deterministic Jinja2 → PDF)
  ↓
persist_result (JobManager owns persistence; Flow returns typed state)
```

Meta-agents (analyzer/planner/challenger/synthesizer) are one-agent/one-task Crews with `output_pydantic` and no tools (`backend/app/crew/meta.py`). Deterministic Python owns routing, validation, report assembly, PDF, storage. No active stage calls LangChain `get_structured_llm()`.

### 4.3 Routing policy (the planner's decision table)

Planner proposes; `enforce_policy(analysis, plan, document_ids)` disposes. Minimums, exclusions, caps so a flaky model cannot under-/over-route:

| Intent signal | Minimum agents | Never include |
|---|---|---|
| "why did X move / today / price" | market, news | valuation, growth, workforce, social |
| "5 years / long term / buy / hold" | financial, valuation, market, news, risk (+ growth when horizon set) | workforce, social |
| "hiring / jobs / layoffs" | workforce, news | valuation, social |
| "compare A vs B" | financial, valuation, market, risk | workforce, social |
| "this report / filing / uploaded PDF" | document, financial, risk | social |
| fallback (ambiguous) | market, news, financial | — |

Plus: `document_ids` present → add `document` agent; cap ≤6 (≤8 in compare mode); unknown names dropped; canonical order restored. Examples: price_move→market,news; long_term→financial,valuation,market,news,growth,risk; hiring→workforce,news; compare→financial,valuation,market,risk; document→document,financial,risk; general→market,news,financial.

### 4.4 Parallel specialists (Flow owns concurrency)

Each specialist is one CrewAI Agent (role/goal/backstory, only its tools, `allow_delegation=False`, `max_iter=8`, `output_pydantic=AgentResult`, `async_execution=False`) + one Task. Outer Flow runs `asyncio` fan-out with per-agent timeout, snapshot isolation (workers get deep copies), independent failure → `failed_agents` + gap + `agent_failed` event. Wall-clock ≈ slowest agent, not sum. No CrewAI trailing-async fan-out.

Tools per agent (canonical `backend/app/crew/agents/*/agent.py`): financial→financials/metrics/ratio; valuation→quote/metrics/ratio; market→quote/history/volume/benchmark; news→search/fetch_news; growth→web_search/fetch_page/search_docs; risk→web+news+docs+financials/metrics/quote; workforce→fetch/search_web (LinkedIn blocked in code); social→search_web; document→search_docs/retrieve_evidence.

### 4.5 Tool contracts + optional RAG branch

Native `BaseTool` only (`NativeFunctionTool` with `args_schema`, `name`, `description`, sync `_run`). Envelope: `{ok, data, source{title,url,provider,retrieved_at}, error}`; failures `ok:false`, never empty `ok:true`. RAG (PyMuPDF→chunk→MiniLM→FAISS) is document-only: `document_ids` filter, retriever/index failures → `ok:false`, page/section/date preserved. Trigger: uploaded docs or filing/report/transcript/PDF question; normal price/news/API queries skip RAG; long-term + docs runs both.

### 4.6 Validation, failure behavior, mock mode, report

Validation checks source exists (URL/doc/provider/calc), excerpt, date, units, relevance 0-1, calc inputs retained, conflicts (>2% numeric divergence, same claim+unit, different sources). Rejected → `rejected_evidence` + gaps; conflicts undisclosed → gaps; findings without evidence IDs → gaps. Failures: tool→gap; agent malformed→retry then fail-isolated; stage fatal→`RuntimeError(stage ...)` stops downstream; PDF fail→job failed but ReportJSON retained; stale jobs→failed on startup. Mock mode (no key): same Flow stages, deterministic `llm_mock` + mock specialists, no network for tests, identical ReportJSON schema, same failure semantics. Report: deterministic `assemble_report` + Jinja2→PDF; unsupported sections labeled Unavailable; no LLM in render path. CrewAI storage: project `data/crewai` (created pre-Crew), tests isolated via `BULLSEYE_CREWAI_DIR` tmp.

---

## 5. Layer Responsibilities & Data Flow

| Layer | Owns | Must NOT do |
|---|---|---|
| Frontend | Prompt, status rendering, PDF download | Compute anything; show data not in job state |
| API | Validation, auth, rate limits | Business logic |
| Job Manager | Lifecycle, idempotency keys, retries | Agent logic |
| Orchestrator | State transitions, routing | Direct HTTP calls to providers (tools do that) |
| Agents | Reasoning over evidence, tool selection | Arithmetic on financials; writing the report |
| Tools | Provider I/O, normalization, caching | Reasoning |
| Validation | Trust decisions | New evidence gathering |
| Report Engine | Rendering | Wording (synthesizer's job) |

**Normalization boundary:** all provider responses are normalized at the tool layer (currency, units, fiscal period, consolidated/standalone, restatements, date conventions) into canonical `EvidenceItem`s *before* any agent sees them. Agents never parse raw provider payloads.

---

## 6. Failure & Resilience Model

```text
Tool failure        → bounded retry (2, exp backoff) → mark source unavailable → evidence_gap
Agent LLM malformed → retry with schema error feedback (max 2) → agent marked failed → run continues
Planner malformed   → deterministic fallback routing (market+news+financial)
Validation conflict → resolve via period/basis/revision check → else disclose conflict in report
PDF render failure  → job fails with report JSON still downloadable
```

Every failure lands in `state.errors[]` and appears in the PDF's *Evidence Gaps / Methodology* section — failures are first-class output, not hidden.

---

## 7. Technology Decisions (ADR Summary)

| # | Decision | Choice | Rejected | Why |
|---|----------|--------|----------|-----|
| ADR-1 | Orchestration | **CrewAI Flow + Crews** | LangGraph, AutoGen | Typed Pydantic state, ordered stages, dynamic specialist fan-out owned by Flow, native `output_pydantic` contracts; LangGraph not in runtime |
| ADR-2 | Model/tool glue | **CrewAI native (LLM + BaseTool)** | LangChain | Provider factory + key rotation/pacing, Pydantic `args_schema`, structured task outputs; LangChain removed from active path (compat shim only) |
| ADR-3 | Vector store | **FAISS** (local) | Pinecone, Weaviate | ₹0, no external service, sufficient at document scale |
| ADR-4 | Embeddings | Sentence-Transformers `all-MiniLM-L6-v2` | paid embedding APIs | local, free, reproducible |
| ADR-5 | Persistence | SQLite (WAL) | Postgres (MVP) | zero-ops portfolio project; adapter pattern keeps Postgres a drop-in upgrade |
| ADR-6 | PDF | Jinja2 HTML → WeasyPrint | LLM-written markdown→PDF | deterministic layout; decoupled from LLM formatting quality |
| ADR-7 | Frontend | React+Vite+Tailwind | Next.js | single SPA, no SSR need; Vite = fastest dev loop |
| ADR-8 | Job status | Polling (`/status`) MVP → SSE upgrade path | WebSockets first | polling is enough; SSE adapter defined in API spec |

---

## 8. Development Phases & Gates

| Phase | Scope | Exit gate |
|---|---|---|
| **P1 — Working Core** | UI → API → Flow → planner → financial+market+news → validation → synthesis → PDF | End-to-end run on "Should I hold TCS for 5 years?" produces cited PDF |
| **P2 — Agentic Demo** | dynamic routing, valuation, growth, RAG + upload, evidence drawer, history | Routing benchmark ≥ 90% correct; RAG answers from uploaded annual report |
| **P3 — Depth (optional)** | workforce, social, eval harness, caching, comparison mode, SSE | Only if P2 gates pass |

**Explicit non-goals (do not let them delay MVP):** portfolio tracking, trading, streaming terminal, TA dashboards, LinkedIn scraping, microservices, 3D/animation.

---

## 9. Definition of Done (system level)

The full 19-item checklist from the v3 plan stands, plus:
- [x] CrewAI Flow is the active orchestrator (LangGraph/LangChain out of runtime)
- [x] Routing decisions enforced deterministically with rationale per run
- [x] Every PDF claim traces to evidence_id/source or is labeled an evidence gap
- [x] Native BaseTool contracts with `ok:false` failure envelopes
- [x] Mock-mode parity (same stages, same schema, no network in tests)
- [ ] `make eval` runs the routing/retrieval/calculation benchmark in CI
- [ ] Frontend renders only job-state-backed data
