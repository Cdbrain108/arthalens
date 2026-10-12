# Bulls Eye — Agents Explained (Roles & Tasks)

Companion to `bullseye_mechanism_flow.png` and `bullseye_agents_map.png`.
Every specialist shares one contract (`AgentResult`): `findings`,
`positive_signals`, `negative_signals`, `risks`, `evidence` (each claim with
source + excerpt), `sources`, `confidence`, `data_gaps`. Agents fail
independently — one agent's failure never kills the run; it becomes an
evidence gap in the report.

Pipeline position of ALL agents: after **Dynamic Router**, before
**Evidence Validator**. They run in **parallel** (LangGraph `Send` fan-out).

---

## 1 · Financial Agent — the accountant
**Role:** Establish the company's fundamental health and trajectory.
**Routed when:** any long-term / buy-hold-sell / compare / document question.
**Tasks:**
1. Pull income / balance / cash-flow statements (`get_financials`) and company metrics (`get_company_metrics`).
2. Extract revenue, profit, margins, EPS, free cash flow, debt, cash, ROE, ROCE.
3. Compare across periods for multi-year trends; state fiscal basis (consolidated vs standalone).
4. Attach evidence to every numeric claim (min 4 items). **Never computes ratios itself** — calls `calculate_ratio`.
**Tools:** `get_financials`, `get_company_metrics`, `calculate_ratio`

## 2 · Valuation Agent — the appraiser
**Role:** Answer “is the current price justified?”.
**Routed when:** long-term / compare / valuation questions. Excluded from pure price-move questions.
**Tasks:**
1. Get live price (`get_quote`) + company metrics.
2. Compute P/E, P/B, P/S, EV/EBITDA, EV/Sales, PEG, dividend yield, FCF yield — **only via `calculate_ratio`** (deterministic Python, inputs retained for audit).
3. Contextualise each ratio vs company history, peers, sector, growth, profitability, leverage (min 5 evidence items).
**Tools:** `get_quote`, `get_company_metrics`, `calculate_ratio`

## 3 · Market Agent — the tape reader
**Role:** Report only what the market actually did.
**Routed when:** almost everything (minimum for `price_move`, `long_term`, `compare`, `general`).
**Tasks:**
1. Fetch latest quote, OHLCV history, volume stats.
2. Describe price/volume movement + sector context with dates.
3. Technical observations **only** when computed by a tool, each labelled with its computation. No invented indicators.
**Tools:** `get_quote`, `get_price_history`, `get_volume`

## 4 · News Agent — the correspondent
**Role:** Build the recent event record.
**Routed when:** `price_move` (minimum), `long_term`, `hiring`, `general`.
**Tasks:**
1. Search headlines via Google News RSS (`search_news`), fetch full text (`fetch_news`).
2. Cover earnings, contracts, management changes, regulation, launches, litigation, M&A.
3. Output a **chronological event list with dates** (min 3 evidence items). No editorial opinion.
**Tools:** `search_news`, `fetch_news`

## 5 · Growth & Projects Agent — the scout
**Role:** Map where future growth comes from and how real it is.
**Routed when:** long-term horizons (auto-added for multi-year), growth/project questions.
**Tasks:**
1. Research capex, expansion, products, partnerships, geographic moves via web + documents.
2. Tag **every initiative**: announced / started / executing / completed. Never blur announced with delivered.
**Tools:** `search_web`, `fetch_page`, `search_documents`

## 6 · Risk Agent — the thesis-breaker
**Role:** Deliberately attack the emerging positive thesis.
**Routed when:** `long_term`, `compare`, `document` (minimums) — the devil's advocate is mandatory for decisions.
**Tasks:**
1. Hunt business, competitive, financial, valuation, regulatory, legal, geopolitical, execution, technology risks.
2. **Must** pursue at least one thesis-breaking angle. No soft-pedaling; gaps themselves are reported as risk.
**Tools:** `search_web`, `fetch_page`, `search_news`, `search_documents`

## 7 · Workforce Agent (optional) — the hiring desk
**Role:** Read hiring signals from legitimate sources.
**Routed when:** hiring questions (minimum) — otherwise excluded by policy.
**Tasks:**
1. Check company career pages + public workforce disclosures.
2. Note the **source legality** of each finding. LinkedIn scraping is banned as a dependency.
**Tools:** `fetch_page`, `search_web`

## 8 · Social Agent (optional) — the crowd listener
**Role:** Summarise what public discussion says, honestly.
**Routed when:** only when explicitly relevant; excluded from most intents by policy.
**Tasks:**
1. Report **qualitative themes + evidence strength**.
2. Never emit numeric sentiment percentages without a transparent, documented metric.
**Tools:** `search_web`

## 9 · Document / RAG Agent — the archivist
**Role:** Ground answers in primary documents.
**Routed when:** document questions (minimum), long-term research, or whenever PDFs are uploaded.
**Tasks:**
1. Query the FAISS vector store (local embeddings; keyword fallback) over annual reports, filings, transcripts, decks, uploads.
2. Answer **only** from retrieved passages, citing page + section for every excerpt.
**Tools:** `search_documents`, `retrieve_evidence`

---

## Downstream stages (not agents, but part of the mechanism)
| Stage | Job |
|---|---|
| Evidence Validator | source-exists · source-relevant · date-known · numeric-units checks + cross-source conflict detection → validated evidence + gaps |
| Bull/Bear/Risk Challenge | ≥2 bull + ≥2 bear + risk triggers, each traceable to evidence, no new facts |
| Synthesizer | merges validated state into `ReportJSON`; separates fact / interpretation / conclusion |
| Report + PDF | deterministic Jinja2 → WeasyPrint (`fpdf2` fallback); layout never depends on the LLM |
