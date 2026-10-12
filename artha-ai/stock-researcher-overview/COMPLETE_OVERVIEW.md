# Stock Researcher (ArthaAI / Bulls Eye) — Complete Overview in Simple Words

> One question in → specialist agents investigate in parallel → every claim is checked → the thesis is attacked → everything is merged into a cited PDF.
> Tagline: **Research Beyond the Noise.**

This file is the single deep explanation of the whole project: how a query flows, what each
agent takes in / processes / outputs, how the "dataset" works here (evidence, not QA pairs),
why there is **no LoRA fine-tuning** in this project (and what LoRA / adapter / learning-rate
mean), the frontend stack, and the RAG system in depth (where vectors live, which model,
which similarity, why FAISS instead of Qdrant, what the metadata means, and how a query
finds the right passages).

Codebase root: `artha-ai/` (backend `backend/app/`, frontend `frontend/src/`).
Verified live on this machine: backend `http://localhost:8001`, frontend `http://localhost:5174`.

---

## 0. Run it on localhost (verified)

Port 8000 and 5173 were already taken on this machine (another API + the AI_Guru Vite app),
so this project runs on **8001 (backend)** and **5174 (frontend)**. The frontend proxy already
points at 8001 (`frontend/vite.config.js`), so no config change is needed.

```bash
# Terminal 1 — backend (FastAPI, from artha-ai/backend/)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
# check: curl http://localhost:8001/api/health  -> {"status":"ok","service":"bullseye"}

# Terminal 2 — frontend (from artha-ai/frontend/)
npm run dev -- --port 5174 --strictPort
# open: http://localhost:5174/
```

Windows one-click scripts exist (`run_backend.bat`, `run_frontend.bat`, `frontend/dev-server.bat`)
but they default to ports 8000 / 5173 — pass explicit ports when those are busy.
Try: *"Should I hold TCS for the next five years?"* — watch the planner route agents, then
download the cited PDF. Verified working: `/api/agents` lists 9 agents, `/api/research/history`
returns past succeeded jobs, frontend returns HTTP 200.

---

## 1. The whole workflow in one picture

```text
USER QUESTION (plain English)
  ↓
QUERY ANALYZER (Agent-0, the "brain" — understands, does NOT research)
  ↓
RESEARCH PLANNER (proposes which specialists are needed)
  ↓
DYNAMIC ROUTER (policy table in pure code — approves/corrects the plan)
  ↓
PARALLEL SPECIALISTS (only the routed ones wake up, all at the same time)
  ├─ Financial (accountant)   ├─ Valuation (appraiser)  ├─ Market (tape reader)
  ├─ News (correspondent)     ├─ Growth (scout)         ├─ Risk (thesis-breaker)
  └─ Workforce / Social (optional) + Document/RAG (archivist)
  ↓  (each returns fixed-shape AgentResult + evidence with source+excerpt)
EVIDENCE POOL → EVIDENCE VALIDATOR (checks sources, dates, units, conflicts)
  ↓
BULL / BEAR / RISK CHALLENGE (attacks the thesis, min 2 bull + 2 bear)
  ↓
SYNTHESIZER (merges validated evidence into structured ReportJSON)
  ↓
REPORT JSON → HTML TEMPLATE → PDF FILE (deterministic, no LLM touches layout)
  ↓
USER (report preview in UI + Open/Download PDF + history)
```

Every stage streams progress events (`analyze_query`, `<name>_agent`, `agent_done/failed`,
`validate_evidence`, `synthesize`, `generate_pdf` …) to the UI's `WorkflowStatus`, and the
API persists job + report + PDF so history survives restarts (`backend/app/crew/runner.py`,
`backend/app/crew/stages.py`, `backend/app/api/research_routes.py`, `backend/app/storage/jobs.py`).

Worked example — *"Should I hold TCS for 5 years?"*:
brain reads company=TCS, intent=long_term, horizon=5y → router picks
financial + valuation + market + news + growth + risk (+document if PDFs uploaded) →
six agents run in parallel (market grabs quote/history, financial pulls statements,
valuation computes P/E deterministically, news builds dated event list, growth tags
projects, risk hunts the bear case) → validator flags one conflicting revenue figure
(kept visible, not hidden) → challenger writes 2 bull / 2 bear / triggers →
synthesizer merges into HOLD-with-rationale plus gaps → PDF renders with ratios,
bull/bear, risks, sources. The *same* pipe answers *"Why did TCS move today?"* with
ONLY market+news — fast and cheap. That selectiveness IS the product.

---

## 2. The brain: analyzer → planner → router (in simple words)

**Stage 1 — Query Analyzer** (`backend/app/crew/stages.py:analyze_query`, `backend/app/crew/meta.py:analyze`).
Input: raw string. Process: think step-by-step (Chain-of-Thought) — which company/ticker?
what is the intent (`price_move | long_term | hiring | compare | document | general |
conversational`)? what time horizon? is it a comparison? A deterministic guardrail forces
known Indian names (TCS, INFY, RELIANCE…) to NSE unless the query says NYSE/NASDAQ/ADR/USD.
Output: `QueryAnalysis{entities[{name,ticker,exchange,confidence}], intent, time_horizon,
compare_mode}` (`backend/app/schemas/models.py`). Greetings ("hi", "who are you?") short-circuit
to `conversational` with no entities.

**Stage 2 — Research Planner** (`backend/app/crew/meta.py:plan`). Input: query + analysis.
Process: one isolated LLM call with no tools that proposes the smallest useful agent set plus
`steps`, `required_evidence`, `rationale`. Output: `ResearchPlan{steps, selected_agents[
financial|valuation|market|news|growth|risk|workforce|social|document], ...}`. Mock-mode
defaults are fixed per intent (e.g. `price_move:[market,news]`, `long_term:[financial,valuation,
market,news,growth,risk]`).

**Stage 3 — Dynamic Router** (`backend/app/crew/routing.py:enforce_policy`). This is pure
code, no LLM — the planner proposes, this table disposes. Per intent it enforces MINIMUM
agents and NEVER-use lists, then caps the total (`MAX_AGENTS=6`, 8 in compare mode):

| User question | Routed agents |
|---|---|
| Why did TCS move today? (`price_move`) | market + news |
| Is TCS good for 5 years? (`long_term`) | financial + valuation + market + news + risk (+growth if horizon) |
| Is TCS hiring? (`hiring`) | workforce + news |
| Compare TCS vs Infosys (`compare`) | financial + valuation + market + risk |
| Explain this annual report (`document`) | document + financial + risk |

A flaky model can therefore never under- or over-route. Over-routing is treated as a
measured defect (see §9).

---

## 3. The 9 specialists: input → process → output (in simple words)

All agents sit **after the router, before the validator**, and run **in parallel**
(`asyncio.to_thread` + per-agent timeout, `backend/app/crew/runner.py:_run_specialists`).
Each one receives the same slim brief — `{query, job_id, entities, intent, time_horizon,
compare_mode, research_plan, document_ids}` — plus its own role/task prompt, calls its
tools in a bounded loop (`max_iter=8, allow_delegation=False`), and returns ONE fixed
shape: `AgentResult{agent, company, timestamp, findings, positive_signals, negative_signals,
risks, evidence[EvidenceItem…], sources, confidence(high|medium|low), data_gaps}`
(`backend/app/crew/agents/_base.py`, `backend/app/schemas/models.py`). One agent failing
never kills the run — it becomes an evidence gap in the report.

1. **Financial — the accountant.** Input: company + statements request. Process: pulls income /
   balance / cash-flow (`get_financials`) + company metrics (`get_company_metrics`), extracts
   revenue, profit, margins, EPS, cash flow, debt, ROE/ROCE, compares across periods, states
   consolidated-vs-standalone basis, min 4 evidence items. **Never does math itself** — calls
   `calculate_ratio`. Tools: `get_financials, get_company_metrics, calculate_ratio,
   get_quarterly_results`.
2. **Valuation — the appraiser.** Answers "is the price justified?" Process: gets live price
   (`get_quote`) + metrics, computes P/E, P/B, P/S, EV/EBITDA, EV/Sales, PEG, dividend + FCF
   yield **only via `calculate_ratio`** (deterministic Python, inputs retained for audit),
   contextualises each vs history/peers/sector/growth/leverage, min 5 evidence items. Never
   routed for pure price-move questions.
3. **Market — the tape reader.** Reports only what the market actually did. Process: latest
   quote, OHLCV history, volume stats, benchmark series, dated price/volume description +
   sector context. Technical claims only if a tool computed them (via `get_technicals`:
   total return, SMA-20/50, volatility, high/low). Tools: `get_quote, get_price_history,
   get_volume, get_benchmark_history, get_technicals, search_news`.
4. **News — the correspondent.** Builds the recent event record. Process: headline search via
   Google News RSS (`search_news`), full-text fetch (`fetch_news`), covers earnings, contracts,
   management, regulation, launches, litigation, M&A as a **dated chronological list** (min 3),
   no editorial opinion.
5. **Growth & Projects — the scout.** Maps where future growth comes from and how real it is.
   Process: web + document research on capex, expansion, products, partnerships; tags **every**
   initiative announced / started / executing / completed (never blurs announced with
   delivered). Tools: `search_web, fetch_page, search_documents, search_news`.
6. **Risk — the thesis-breaker.** Deliberately attacks the positive thesis (mandatory for
   decision-grade questions). Process: hunts business/competitive/financial/valuation/
   regulatory/legal/execution/tech risks across web + news + documents + market data; **must**
   pursue at least one thesis-breaking angle. Tools: full web stack + `get_financials,
   get_company_metrics, get_quote, get_technicals`.
7. **Workforce (optional) — the hiring desk.** Only for hiring questions. Reads company career
   pages + public disclosures; notes source legality per finding; LinkedIn scraping is banned
   as a dependency. Tools: `fetch_page, search_web, search_jobs, fetch_job_detail`.
8. **Social (optional) — the crowd listener.** Only when explicitly relevant. Reports
   **qualitative themes + evidence strength**; never emits numeric sentiment percentages
   without a transparent documented metric. Tools: `search_web` only.
9. **Document/RAG — the archivist.** Grounds answers in primary documents. Process: queries the
   local FAISS store over annual reports, filings, transcripts, decks, uploads (top-5 chunks
   are pre-seeded into its context), answers **only** from retrieved passages with page +
   section cites. Tools: `search_documents, retrieve_evidence`. (Full RAG deep dive: §6.)

Agent contracts (exact prompts, min-evidence counts, banned behaviours) live in
`docs/AGENT_CONTRACTS.md`; the tool catalogue in `docs/TOOL_LANDSCAPE.md`.

---

## 4. Tools + the deterministic calculation layer (why "LLMs reason, Python computes")

Agents never fetch data or do arithmetic by themselves — they call explicit tools
(`backend/app/tools/`), each returning a uniform envelope `{ok, data, source, error}`.
`ok:false` becomes a visible `data_gap`, never a hallucination:

- **market_tools** — `get_quote / get_price_history / get_volume / get_benchmark_history /
  get_technicals` via yfinance (auto `.NS`/`.BO` suffix for NSE/BSE, bare symbols for US,
  `^INDEX` passthrough, NaN rows dropped).
- **financial_tools** — `get_financials / get_company_metrics / calculate_ratio` via
  yfinance (+ quarterly results / peer & historical multiples helpers).
- **news_tools** — `search_news / fetch_news` via Google News RSS + httpx (dates normalised
  to UTC ISO).
- **web_tools** — `search_web / fetch_page` via DuckDuckGo (`ddgs`) + httpx (linkedin.com
  blocked).
- **document_tools** — `search_documents / retrieve_evidence` over the local RAG store
  (provider tagged `"faiss"`).

`calculate_ratio` is the project's core principle in code (`backend/app/tools/financial_tools.py:
RATIO_FORMULAS`): `P/E = price/EPS`, `P/B = price/book-value-per-share`, `P/S = market-cap/
revenue`, `Debt/Equity = debt/equity`, `ROE = net-income/avg-equity`, `FCF-yield = FCF/
market-cap`, `EV/EBITDA`, `EV/Sales`, `dividend-yield = DPS/price`, `PEG = (P/E)/EPS-growth`.
Inputs must be finite numbers; the tool returns `{value, inputs}` with a
`deterministic_calculation` source so every ratio is reproducible and auditable. Market
technicals are likewise computed (`total_return, SMA-20/50, volatility, avg/latest/trend
volume`), never invented by the LLM.

---

## 5. Model strategy + the LoRA question (honest answer)

**What this project uses (no fine-tuning).** A provider-agnostic gateway
(`backend/app/config.py`, `backend/app/llm.py`): `MODEL_PROVIDER = gemini | openrouter |
agentrouter | ollama | mock`, auto-falling back to **mock** when no usable key exists
(placeholders like `your-key` are rejected). Exact models in this checkout: Gemini
`gemini-2.0-flash` (+ cheap `gemini-3.1-flash-lite` for analyzer/planner/validator roles);
OpenRouter primary `nvidia/nemotron-3-super-120b-a12b:free` with fallbacks
`nex-agi/nex-n2.5-mini:free, google/gemma-4-31b-it:free`; AgentRouter meta
`deepseek-v4-flash` + tool-loop model `glm-5.3`; Ollama `llama3.1`; embeddings
`sentence-transformers/all-MiniLM-L6-v2`. Robustness comes from engineering, not training:
round-robin key rotation across all Gemini/OpenRouter keys, per-role cheap-vs-main models,
3–5 structured-output retries with fresh key per attempt, 429-aware backoff (waits the
provider-advised window), and a global Gemini rate limiter (`gemini_slot`, paced LLM
subclasses) so six parallel agents don't saturate free-tier RPM. With no key, the same
pipeline runs deterministically in **mock mode (₹0)** — same stages, canned data, real
validation/PDF code paths.

**What LoRA / adapter / learning-rate mean (simple words, for reference).** Fine-tuning
teaches a base model a new skill by training on examples. Full fine-tuning rewrites ALL
weights (expensive). **LoRA (Low-Rank Adaptation)** freezes the big model and trains a tiny
add-on matrix pair instead — **rank (e.g. 16)** is the width of that add-on: bigger rank =
more capacity to learn but more parameters. The **adapter** is that small trained add-on
file loaded alongside the frozen base at inference. **Learning-rate (e.g. 0.0002)** is the
step size per training update: too big = unstable/forgetful, too small = never learns.
Serverless supervised training (e.g. on GCP) just means renting GPUs per-job to run that
process on prompt→answer pairs.

**Why this project chose NOT to fine-tune.** There is no QA-pair training set here and none
is needed: the product is evidence-grounded research (live prices, filings, news, cited
PDFs), not answering from memorised knowledge. Prompt-engineered specialists + real tools +
validation + deterministic math deliver citations and auditability that a LoRA adapter cannot
(price data goes stale; memorised ratios hallucinate). It also keeps cost at ₹0 and keeps
every provider swappable. Fine-tuning would only make sense later for a narrow, stable skill
(e.g. query→intent classification or report-style rewriting) once thousands of graded
examples exist — and even then the tools/RAG/validator architecture would stay.

---

## 6. RAG system in depth (the archivist's memory)

Pipeline (`backend/app/rag/`): `PDF → Parse → Clean → Chunk → Metadata → Embed →
FAISS → Retrieve → Filter → Agent context → Citation`.

- **Parse** (`rag/parser.py`): PyMuPDF (`fitz`) extracts per-page text: `[{page, text}]`.
- **Chunk** (`rag/chunker.py`): 800 characters with 120 overlap, per page
  (`config.py: chunk_size=800, chunk_overlap=120`); `chunk_id = sha1(document_id:page:start)[:16]`.
- **Embed** (`rag/embeddings.py`): `sentence-transformers/all-MiniLM-L6-v2` → **384-dimensional,
  L2-normalised** vectors. Small, fast, local, no API key, runs on CPU — chosen because the
  corpus is small (uploaded PDFs/filings) and retrieval quality at this scale doesn't justify
  a large or GPU-hosted embedder.
- **Store** (`rag/retriever.py`): **FAISS `IndexFlatIP`** in `data/faiss/` (`index.faiss` +
  `meta.jsonl`). FlatIP on normalised vectors = exact **cosine similarity** search.
  `RETRIEVAL_TOP_K=5`, implemented as over-fetch `top_k*4` then post-filter to 5.
- **Retrieve + filter**: exact-match metadata filters (`company`, `doc_type`, `period`,
  `document_ids` allowlist) + cosine-ranked text match; `fetch(chunk_ids)` returns full
  excerpts with page/section. **No reranker** — FAISS score order (or keyword-count order
  in fallback).
- **Fallback**: if embeddings/FAISS are unavailable or a search throws, a deterministic
  keyword search (terms longer than 2 chars, count occurrences, top-k) keeps document tools
  working — degraded but never dead (`retriever.py:_keyword_search`).

**Why FAISS and not Qdrant/Chroma/Postgres?** At this scale FAISS wins on simplicity and
cost: zero server, zero API key, two local files, exact search over thousands of chunks with
no ops burden — matching the project's ₹0 philosophy. Qdrant (or any serverful vector DB)
pays off with large multi-user corpora, distributed serving, rich payload indexing, and
hybrid-search features this MVP doesn't need; Chroma adds a server layer for little gain
here; Postgres/pgvector is for when metadata + vectors must live in one transactional store.
If the corpus grows to 100k+ chunks with many users, migrating the retriever behind the
`search_documents` tool interface to Qdrant would be the natural next step.

**Why this embedding model?** `all-MiniLM-L6-v2` is the standard small******/fast local
embedder (384-d, ~80MB): good enough semantic ranking for filing passages, CPU-friendly,
offline, free. A bigger model (or ONNX-runtime-optimised variant) would buy a few points of
retrieval quality at the cost of RAM/latency/complexity — unnecessary until evaluation
(§9) shows retrieval, not planning or sources, is the bottleneck.

**Metadata — what "enriched" means here.** Every chunk carries
`{chunk_id, document_id, page, company, doc_type, period, publication_date, source, section}`
(`rag/chunker.py`). `section` is heuristically detected (numbered headings / ALL-CAPS titles).
A naive version (no metadata) can only do "find similar text" — it mixes companies together,
can't scope to an uploaded PDF, and can't cite page/section. The enriched version enables:
"only TCS annual reports FY24", "only uploaded document X", and every excerpt cited as
*Source … p.42 §Risk Factors* — which is what makes the final PDF trustworthy.

**How a user query finds passages (simple words).** The agent's question is embedded with the
same MiniLM model → FAISS compares it against every chunk by **cosine similarity** (angle
between meaning-vectors: 1 = same meaning, 0 = unrelated) → top candidates are filtered by
metadata (right company? right document?) → top-5 excerpts with page/section go into the
agent's context → the agent may only repeat what's in those excerpts → the validator checks
each claim's source exists → the PDF cites them. Filters answer *"which documents"*,
cosine answers *"which passages"*.

---

## 7. After the agents: validation → challenge → synthesis → PDF

**Evidence pool + validator** (`backend/app/crew/stages.py:validate_evidence`,
`backend/app/validation/pipeline.py`). Every claim ideally carries `{claim, value, unit,
source_title, source_url, publication_date, retrieved_at, document_id, page, excerpt, agent,
evidence_type, claim_type(fact|interpretation), confidence}`. Checks: source exists (trusted
providers: yfinance, deterministic layer, ddgs, Google News RSS, FAISS store, SEC EDGAR, NSE/BSE…),
excerpt present, date known, numeric claims typed with units, calculation inputs retained,
relevance scored. Cross-source conflict detection: same fact + same unit from different
sources differing by >2% → flagged `Conflict` (kept visible or excluded + gap, never silently
averaged). Findings without accepted evidence are dropped; agents left with nothing get
`confidence=low` + "no validated evidence". Unsupported info becomes an explicit evidence gap.

**Bull/Bear/Risk challenge.** Deliberately attacks the emerging thesis: ≥2 bull points, ≥2
bear points, risk triggers — each traceable to evidence, zero new facts allowed. No evidence
→ "insufficient evidence" instead of invented arguments.

**Synthesizer.** Consumes structured validated state (never raw agent prose) and outputs the
`ReportJSON` contract: query, company, executive summary, overall assessment, per-section
findings (financial/valuation/market/growth/news/risk…), bull/bear, risks, evidence gaps,
what-could-change-the-view, sources, timestamps — separating **fact vs interpretation vs
conclusion** (`backend/app/report/schema.py`). It also computes a 0–9 quality checklist and
`evidence_grounding_pct`.

**PDF** (`backend/app/report/pdf.py`, `templates/report.html.j2`). Deterministic:
ReportJSON → Jinja2 HTML → **WeasyPrint** → `reports/{job_id}.pdf`, with **fpdf2** fallback
(WeasyPrint needs GTK on Windows). No LLM touches rendering, so layout never depends on the
model. 20-section structure (cover, summary, company, market snapshot, financials, valuation,
growth, news, risks, bull/bear, assessment, decision-support BUY/HOLD/SELL with rationale +
contradictory evidence + confidence + invalidators, gaps, agent contributions, sources,
timestamps, methodology/limitations) — sections without evidence are labelled unavailable,
never fabricated.

---

## 8. Frontend overview (the control room, not the report)

**Stack** (`frontend/package.json`, `vite.config.js`): React 18 + Vite 5 + Tailwind CSS 3 +
lucide-react icons. Dev server port 5173 (5174 here — see §0), `/api` proxied to the backend.
No chart libraries — the UI shows zero metrics that the backend didn't produce (binding
principle: UI = control room, PDF = deliverable).

**Screens.** One focused research workspace (prompt → live agent status → report-ready + PDF
actions) plus lightweight history/saved-reports/companies/agents/sources/settings views.
Key components (`frontend/src/components/`): `ResearchPrompt` (gradient-ring composer, Enter
= submit), `QuickActions` (4 example questions), `WorkflowStatus` (honest pipeline stages —
see below), `SpecialistAgentStream / LiveAgentStream / AgentProcessContinuation`
(per-agent live cards), `QueryReasoningAccordion` (query understanding), `ReportPreview`
(Beginner/Expert toggle, ratios, bull/bear, quality checklist), `ReportReady` (PDF prefetch +
Open/Download), `Sidebar` (history + new research), `StudioPage / ChatWindow / ChatPage`
(layout variants), `Login / UserProfile / MarketVisual / Logo / IconRail / TopBanner /
DiscoverBanner / StudioWaitCarousel / TypingText`.

**Data flow.** `src/api/client.js` mirrors `docs/API_SPEC.md`: `POST /api/research
{query, document_ids}`, `GET /api/research/:id/status|report|pdf`, `GET /api/research/history`,
`GET /api/agents`, `POST /api/documents`. `src/hooks/researchJob.js` polls status every
**2s** (scheduled only after each response — never overlapping; AbortController per
generation; pause/resume/restore so reloading mid-run resumes instead of restarting).
`WorkflowStatus` renders ONLY real job fields (`selected_agents, completed_agents,
current_node, status`) as Understanding → Planning → per-agent → Validation → Bull/Bear →
Synthesis → Report → PDF with a progress bar. PDF arrives two ways: prefetched blob URL
with retry (`ReportReady`) or direct `/api/research/:id/pdf` link. History merges backend
history with `localStorage` sessions (max 30, backend wins, `src/storage/chatSessions.js`).

---

## 9. Backend API, storage, evaluation, and what was deliberately NOT built

**API** (`backend/app/api/`, `backend/app/main.py`, `docs/API_SPEC.md`):
`POST /api/research → 202 {job_id}` (background `_run_job`, strongly referenced so GC can't
kill it; CancelledError marks failure; stale "running" jobs fail on restart),
`GET /api/research/:id | /status | /report | /pdf (bullseye_:id.pdf) | /charts/:name |
/history`, `POST /api/documents`, `GET /api/documents`, `GET /api/agents`,
`GET /api/health`. CORS allows the Vite origin. Job state:
`{job_id, status(queued|running|succeeded|failed), query, current_node, selected_agents,
completed_agents, failed_agents, errors}`.

**Storage** (`backend/app/storage/jobs.py`, `config.py`): SQLite WAL (`data/jobs.sqlite`)
with connection hygiene, corrupt-row tolerance, history limit 1–200; FAISS + metadata in
`data/faiss/`; uploads in `documents/`; PDFs in `reports/`; all paths absolute and
root-anchored (CWD-independent). Every run records job ID, query, timestamp, agents, model,
sources, schema version; caching never presents stale data as current.

**Evaluation** (`docs/EVALUATION_AND_TESTING.md`, `tests/`): 62 backend pytest + 25 frontend
tests. Benchmarks measure routing (right agents? over-routing flagged), retrieval (right
evidence?), evidence (claims source-backed?), calculation (ratios correct?), synthesis
(conclusion follows evidence?), citation completeness, efficiency (parallelised?). Example:
*"Why did TCS move today?"* expected Market+News; actual +Financial+Workforce → over-routed.

**Cost philosophy: ₹0.** Open-source libraries, free tiers, local models/embeddings/FAISS,
mock mode with no key; paid services are optional adapters, never requirements.

**NOT built (on purpose):** portfolio tracking, auto-trading, live terminal dashboards,
decorative charts, fake sentiment/hiring/AI scores, unsupported numbers, social scraping
infra, LinkedIn scraping, microservices, 3D UI. If a feature doesn't strengthen
question → agents → evidence → PDF, it waits.

---

## 10. Resume positioning + demo script + definition of done

**Resume bullet:** Built ArthaAI, a CrewAI-orchestrated multi-agent company research system
that dynamically routes investment questions to specialist financial, valuation, market,
news, growth and risk agents; integrates tools and FAISS RAG for source-backed research,
validates evidence and deterministic calculations, challenges the thesis bull-vs-bear, and
generates professional PDF research reports (FastAPI + React + SQLite + WeasyPrint, ₹0).

**3-minute demo:** open the UI → enter a real question (e.g. *"Should I hold TCS for five
years?"*) → show planner-selected agents → live per-agent progress → evidence collected →
validation result → report preview → download PDF → open it and inspect page-cited sources.

**Done when:** natural-language query works; company auto-identified; planner routes the
minimal agent set; agents run in parallel with real tools/data; RAG answers from uploads with
citations; outputs are structured; claims carry evidence; validator checks them; conflicts
and gaps surface; bull/bear challenge runs; synthesis yields ReportJSON; deterministic PDF
downloads; history re-opens; routing/retrieval/evidence evaluation exists; README explains
the architecture.

*Further reading: `docs/ARCHITECTURE_FRAMEWORK.md` (design + ADRs), `docs/AGENT_CONTRACTS.md`
(agent/tool contracts), `docs/API_SPEC.md` (REST contract), `docs/TOOL_LANDSCAPE.md`,
`docs/EVALUATION_AND_TESTING.md`, `working-mechanism-view/COMPLETE_PIPELINE.txt` and
`AGENTS_EXPLAINED.md` (pipeline narrative + per-agent cards).*
