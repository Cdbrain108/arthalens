# Bulls Eye — Agent & Tool Contracts

Every specialist agent is built from the same skeleton: `BaseSpecialistAgent` reads its plan slice, runs a bounded tool-calling loop (LangChain `create_tool_calling_agent` pattern or manual loop), and returns a validated `AgentResult`. Contracts below are binding; the CI contract tests enforce them.

---

## 1. Universal rules

1. **Structured output only** — each agent's final message is parsed by Pydantic into `AgentResult`; parse failure → ≤2 retries with the validation error fed back → agent marked failed (run continues).
2. **No free-floating arithmetic** — financial math calls `calculate_ratio()` / `compute_growth()` tools; the agent explains results, never computes them.
3. **Evidence attachment** — every item in `findings` with a number or event must reference an index in `evidence[]`.
4. **Confidence honesty** — `confidence` reflects evidence coverage, not tone.
5. **Timeouts** — per-agent wall-clock budget (default 120s); overruns → partial result + `data_gaps` entry.

## 2. Per-agent contracts

| Agent | Required tools | Min evidence items | Special obligations |
|---|---|---|---|
| Financial | `get_financials`, `get_company_metrics`, `calculate_ratio` | 4 | state fiscal basis (consolidated/standalone) |
| Valuation | `get_quote`, `get_company_metrics`, `calculate_ratio` | 5 | contextualize each ratio vs history/peers/sector |
| Market | `get_quote`, `get_price_history`, `get_volume` | 2 | label every technical observation with its computation |
| News | `search_news`, `fetch_news` | 3 | chronological event list with dates |
| Growth | `search_web`, `fetch_page`, `search_documents` | 3 | status tags: announced/started/executing/completed |
| Risk | all read tools | 3 | must actively search ≥1 thesis-breaking angle |
| Workforce (opt) | `fetch_page` (career pages), `search_web` | 2 | permitted sources only; log source legality note |
| Social (opt) | `search_web` | 2 | qualitative themes + evidence strength, no fake % |
| Document/RAG | `search_documents`, `retrieve_evidence` | 2 | page + section citation on every excerpt |

## 3. Tool contracts

All tools are LangChain `@tool`s returning normalized dicts with a common envelope:

```json
{ "ok": true, "data": {}, "source": {"title": "...", "url": "...", "fetched_at": "..."},
  "cache": {"hit": false, "ttl_s": 900}, "error": null }
```

| Tool | Input | Output highlights | Cache TTL |
|---|---|---|---|
| `get_quote(ticker, exchange)` | symbol | price, change, currency, as_of | 60 s |
| `get_price_history(ticker, period)` | symbol, period | OHLCV series | 15 min |
| `get_volume(ticker, period)` | symbol | volume stats | 15 min |
| `get_financials(ticker, statement, period)` | income/balance/cashflow | normalized line items + fiscal metadata | 24 h |
| `get_company_metrics(ticker)` | symbol | shares out., mkt cap, book value, EPS | 24 h |
| `calculate_ratio(name, inputs)` | ratio name + numeric inputs | value + formula + inputs retained | n/a (pure) |
| `search_news(query, since)` | query, date | headline list w/ dates | 15 min |
| `fetch_news(url)` | url | full text + pub date | 24 h |
| `search_web(query)` | query | results w/ snippets | 15 min |
| `fetch_page(url)` | url | cleaned text | 24 h |
| `search_documents(query, filters)` | query, company/type/period | ranked chunks w/ metadata | n/a |
| `retrieve_evidence(chunk_ids)` | ids | full excerpts w/ page/section | n/a |
| `build_report_json(state)` | validated state | `ReportJSON` | n/a |
| `render_pdf(report)` | `ReportJSON` | file path | n/a |

## 4. Synthesizer contract

Input: **only** validated fields of `ResearchState`. Output: `ReportJSON` (schema in `report/schema.py`) with the fact / interpretation / conclusion split enforced per paragraph. Anything unsupported is moved to `evidence_gaps` — the synthesizer is forbidden from smoothing over gaps.

## 5. Bull/Bear challenger contract

Receives the same validated evidence. Must produce ≥2 bull points, ≥2 bear points, and ≥1 explicit "what would change the view" trigger — each traceable to evidence IDs. No new facts may be introduced.
