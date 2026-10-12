# Bulls Eye / ArthaAI — Research Quality & Latency Fix Plan

**Raised by:** user, this session
**Scope:** 8 asks, decomposed below
**Status key:** ✅ done · 🔧 in progress · ⬜ pending

---

## 0. The asks, as stated

> "when the user ask a query about a stock related things the report doesn't look perfect and its
> analysis is not perfectly done … if asked about news only then why it starts multi agents? and why
> news is not perfectly done and all agents are just doing a simple one-two unnecessary analysis, i
> want that in report each agents thought and output (finding) will be shown too, just before that
> references … i can also have tavily … please use that only when required it is a free account one
> … reference are well made … please make a perfect report and insight representation and do it faster"

Decomposed:

| # | Ask | Status |
|---|---|---|
| 1 | News-only query must not fan out to multiple agents | ✅ |
| 2 | News research quality is poor | ✅ |
| 3 | All agents produce 1–2 shallow / redundant findings | ✅ |
| 4 | Show each agent's **thought + findings** in the report, **just before references** | ✅ |
| 5 | Tavily key available — **use only when required** (free tier) | ✅ |
| 6 | Keep the reference/citation index as good as it is | ✅ (preserved by design) |
| 7 | Perfect report + insight representation (PDF + in-app) | ✅ |
| 8 | Make it faster | ✅ |

All eight have code behind them. §6 records what has been verified and by what
means — that is the only part of this document still open.

---

## 1. What I found — root causes, not symptoms

### 1.1 News-only queries fan out to 3 agents — because there is no news intent anywhere

`QueryAnalysis.intent` only allowed
`price_move | long_term | hiring | compare | document | general | conversational`.

"What's the latest news on Infosys?" matched none of them, so `_normalize_intent()` dropped it into
`general`, and `ROUTING_TABLE["general"]` has `min: {market, news, financial}`. The LLM planner never
had a say — `enforce_policy()` **forces** those three as a deterministic minimum.

**This was never a prompt problem. It was a missing table row.**

### 1.2 News is shallow: contradictory instructions + a body-less provider

- `crew/agents/news/agent.py` backstory: *"Min 3 evidence items"*
- `crew/agents/news/task.py` brief: *"Minimum 8 evidence items"*

A model resolves that conflict by doing the cheaper thing → 3 thin items.

Compounding it: the only provider is Google News RSS, which returns a title, a redirect blob URL and
a date — **no article body**. So every quotable excerpt requires a separate blocking `fetch_news`
HTTP round-trip, and the agent runs out of iterations before it runs out of headlines.

### 1.3 "One-two unnecessary analyses" is a contract problem

`crew/agents/_base.py::make_task()` appends a "DEEP-RESEARCH CONTRACT" that sets:

- **no floor** on the number of materially distinct findings, and
- **no lane boundary** between specialists.

Result: every agent writes 1–2 generic claims, and several agents restate the same company
background. Thin *and* redundant simultaneously.

### 1.4 Latency has three sources

1. The forced 3-agent fan-out on every general/news query (3 parallel tool loops, 3× free-tier quota).
2. `tools/news_tools.py::_resolve_url()` — one blocking HTTP GET **per headline**, up to 24 of them,
   8s timeout each, just to turn a redirect blob into a publisher URL.
3. No shared HTTP client anywhere — a fresh TCP + TLS handshake for every single request.

### 1.5 Two real report defects

- **`report/pdf.py:307,309`** reads `row.get("benchmark")` and `row.get("posture")`, but
  `report/schema.py::_ratios_table()` emits the keys `sector` and `assessment`.
  → **The "Sector Benchmark" and "Assessment" columns are blank in every PDF ever generated.**
- **`report/templates/report.html.j2`** prints section *summaries only* — no findings, no KPI cards,
  no sources. It is the WeasyPrint path (dead on Windows, where fpdf2 takes over), but it is wrong.

### 1.6 There is nowhere to put an agent's thought

`ReportJSON.agent_contributions` is a list of **names only**. CrewAI's internal reasoning trace is
not captured anywhere in the pipeline.

---

## 2. The idea — design decisions worth flagging

### 2.1 Agent "thought" is self-reported, not scraped

Rather than parse CrewAI's internal trace (noisy, version-fragile, and full of tool spam), the
`AgentResult` contract gains a `reasoning: str` field. The agent states **its own** approach: what it
searched, what it weighed, what it discarded and why.

- It survives the `validate_evidence` stage untouched (that stage copies `dict(result)`).
- Where a model omits it, the report falls back to a **deterministic** summary built from evidence
  count, source count, confidence and recorded gaps — never an invented monologue.

### 2.2 `agent_notes` is assembled deterministically, not by the synthesizer LLM

Built in `report/schema.py` from already-validated state, with each finding's `evidence_ids` mapped
to the **same `[n]` citation numbers** as the references index.

- Keeps ask #6 (good references) intact — the agent section and the bibliography share one index.
- Costs zero extra tokens, so it does not fight ask #8 (speed).
- Makes fabrication structurally impossible — it can only echo what passed validation.

### 2.3 Tavily is a fallback, never the default path

Ask #5 says *"only when required — it is a free account"*. Gating, concretely:

- Fires **only** when Google News RSS fails outright, or returns fewer usable items than the floor.
- `search_depth="basic"` (cheapest tier), bounded `max_results`.
- Short TTL cache keyed on `(query, since, deep)` so repeated searches inside one run cost 0 credits.
- Key lives in `artha-ai/.env` as `TAVILY_API_KEY` — **never hardcoded into source**.
- Side benefit for ask #8: Tavily returns article **snippets**, so the agent needs far fewer
  `fetch_news` round-trips to quote something.

### 2.4 A news-only run is exactly one agent

Not "fewer agents" — **one**. This is simultaneously the quality fix (ask #1), the redundancy fix
(ask #3) and the single biggest latency win (ask #8).

---

## 3. Done

| File | Change |
|---|---|
| `backend/app/schemas/models.py` | `news` intent in the `Literal` + `_INTENT_ALIASES` (headlines / updates / announcements / developments / recent_news / press …) |
| `backend/app/schemas/models.py` | `AgentResult.reasoning` + coercion for the aliases models actually emit (`thought`, `analysis`, `approach`, `rationale`, `method`) |
| `backend/app/schemas/models.py` | `ReportJSON.agent_notes: list[dict]` + validator that drops non-dict entries |
| `backend/app/crew/routing.py` | `"news": {min: {news}, never: <every other agent>}` |
| `backend/app/crew/routing.py` | An uploaded document now survives any intent's exclusion list (it was attached to *this* query, so the document specialist always reads it) |
| `backend/app/crew/meta.py` | Analyzer prompt emits `news`, and defines exactly when: news asked **alone**, with no valuation / price-move / buy-hold-sell question attached |

---

## 4. Implemented — and how

### 4.1 ✅ `backend/app/llm_mock.py` — offline parity

**Done:** `INTENT_RULES` gained `(r"\b(news|headline|latest|update|announce|happened|developments?)\b",
"news")` as the **last** rule, so a fundamentals or buy/hold/sell question still wins ("news that
makes TCS a long-term buy" stays `long_term`), and `MOCK_PLAN["news"] = ["news"]`. Mock mode and
live mode now route a news-only ask identically — one agent.

### 4.2 ✅ Gated Tavily — `config.py`, `.env`, `tools/news_tools.py`

**Done:**
1. `config.py`: `tavily_api_key`, `tavily_base_url`, `tavily_min_rss_items: int = 4`, and a
   `tavily_enabled` property over the existing `_usable_key()` guard — a placeholder value can
   never select the live path.
2. `.env`: `TAVILY_API_KEY` + `TAVILY_MIN_RSS_ITEMS` alongside the other provider keys.
3. `news_tools.py`: `_tavily_news(query, since, limit)` → `POST {base}/search` with `topic="news"`,
   `search_depth="basic"` (1 credit), `max_results` clamped to 5–15, `include_raw_content=False`.
   It is reachable from exactly one place — `_should_top_up(items)`, which is true only when
   `tavily_enabled` **and** the RSS pass returned fewer than `tavily_min_rss_items`. Results are
   normalised into the existing item shape plus a `snippet`, and the envelope
   (`ok` / `data` / `source` / `error`) is unchanged, so nothing downstream had to move.

### 4.3 ✅ Speed — `tools/news_tools.py`, `news/agent.py`

**Done:**
- One module-level pooled `httpx.Client` (`_http()`, 32 connections / 16 keep-alive, double-checked
  lock) shared by RSS, redirect resolution and article fetch → no per-request TLS handshake.
- `_resolve_url()` now **streams** (headers only, 6s) instead of downloading the body, and only the
  top `_RESOLVE_LIMIT = 14` ranked items are resolved at all, on a `min(12, len(head))` pool. The
  tail keeps its redirect URL, which still opens correctly.
- A 600s TTL cache keyed on `(query, since, deep)` — repeat searches inside one run cost
  nothing, and a Tavily top-up is never paid for twice. A cache hit returns the identical
  envelope shape as a miss, so an agent cannot behave differently on one.
- The shallow RSS path resolves its redirect links **concurrently** too; in series, one hop per
  headline was that path's entire latency budget.
- News agent `max_iter` 12 → 9: with snippets quotable in place of a fetch, the extra turns were
  only burning quota.

### 4.4 ✅ Depth + de-duplication — `_base.py`, `news/agent.py`, `news/task.py`

**Done:**
- `make_task()` gained a **DEPTH FLOOR**: ≥5 materially distinct findings where the retrieved
  material permits, distinct meaning a different metric, period, event or driver — with an
  explicit instruction to merge near-duplicates rather than pad, and that a shorter honest list
  plus `data_gaps` beats a padded one.
- A **STAY IN YOUR LANE** clause: answer only your own mandate, do not restate company background
  or write another specialist's section, because duplicated coverage is dropped downstream. This is
  what kills the cross-agent redundancy.
- A **REASONING FIELD** clause telling the agent the field is shown to the reader beside its
  findings and must describe method, not repeat the findings.
- `reasoning` is in `_RESULT_SKELETON`, so the AgentRouter raw-JSON path emits it too.
- News: backstory and brief now agree on the same minimum (8 dated events); the 3-vs-8
  contradiction is gone, and both say a `snippet` is quotable without spending a `fetch_news`.

### 4.5 ✅ `report/schema.py` — build `agent_notes`

**Done:** `_citation_index()` is now the single walk that produces **both** `report.sources` and an
`evidence_id → n` map. `_agent_notes(state, citations)` then walks `selected_agents` first and
`agent_results` after (so the order is routing order, and a dispatched agent that returned nothing
is still listed with its recorded error — silence is not a finding), emitting per agent:
`{agent, label, mandate, status, thought, self_reported, confidence,
findings[{claim, citations[n]}], positive_signals, negative_signals, risks, evidence_count,
sources, data_gaps}`.

Because both halves come off one index, an agent's `[n]` and the bibliography's `[n]` cannot drift.
Where an agent reported no `reasoning`, `_deterministic_thought()` supplies a summary that says so
in its first clause. Legacy/mock agents whose findings arrive as bare strings still get citation
numbers, via an exact claim-text match against that agent's own accepted evidence — never a guess
at a nearby source.

### 4.6 ✅ `report/pdf.py` + `report.html.j2`

**Done:**
- `row.get("benchmark")` → `row.get("sector")`, `row.get("posture")` → `row.get("assessment")`, and
  the ratios table went 4 → 5 columns to show the `delta` the schema was already computing. The
  Sector Benchmark and Assessment columns render for the first time.
- New section **"7. Specialist Agent Reasoning & Findings"**, immediately before
  "Verified Sources & Primary Evidence Citations" (ask #4's placement, literally). Per agent: a
  header strip (grey completed / red not) with confidence, evidence count and finding count; the
  mandate; the `Thought:` paragraph; findings as `-` bullets and risks as `!` bullets carrying
  their `[n]` markers; an `Unresolved:` line. Page-break checks at each bullet and each agent.
- `report.html.j2` rewritten to match: a `specialist()` macro that prints summary **and** findings
  (it printed summaries only), the ratios table, and the same agent-reasoning block immediately
  before `<h2>Sources &amp; Citations</h2>`. The WeasyPrint path is no longer a downgrade.

### 4.7 ✅ `frontend/src/components/ReportPreview.jsx` — the in-app view

**Done:** a new expert tab `agent_log` — "Agent Reasoning (n)" — sits in the `tabs` array **directly
before** `sources`. Each card carries the agent label, an evidence/findings/confidence meta row (or
a red status pill), the mandate, a bordered thought block labelled either *Agent thought* or
*Run summary (agent reported no thought)* from `self_reported`, findings bullets, a two-column
positive/negative signal grid, flagged risks, and an `Unresolved:` footer. All claim text goes
through the existing `CitedText`, so `[n]` stays clickable into `report.sources`. Empty state is an
`EvidenceGapPanel`, never filler; an agent that ran and filed nothing says exactly that.

### 4.8 ✅ Per-agent calibration — all nine specialist folders

**Why this was still open.** §4.4 fixed depth *generically*: the DEPTH FLOOR, STAY IN YOUR LANE and
REASONING FIELD clauses in `_base.py::make_task()` reach every agent. But only `news` was rewritten
*individually*. An audit of all 18 `agent.py` / `task.py` files found three defects that a shared
contract cannot reach:

1. **Evidence floors were absent or self-contradictory.** `financial/agent.py` said *"Min 4 evidence
   items"* while the shared contract demands ≥5 evidence-backed findings — the same
   cheaper-number-wins failure that made news shallow (§1.2). `market`, `growth`, `risk`,
   `workforce`, `social` and `document` stated **no floor at all**.
2. **`max_iter` was a uniform 12** regardless of how much each agent's tools return per call.
   `social` has exactly one tool and was given the same 12 turns as `risk`, which has eight; every
   unused turn is a free-tier call the model spends re-reading data it already has.
3. **Seven of nine agents had no tool-use protocol.** `document`'s *"MANDATORY TOOL USE: you MUST
   call search_documents at least twice … a final answer with zero tool calls is invalid and will
   be discarded"* is demonstrably the strongest brief in the codebase, and nothing else used the
   pattern.

**Done — floors, stated identically in the backstory, the brief and the expected output** (three
places, because a model resolves a disagreement by doing the cheapest thing):

| Agent | Tools | `max_iter` | Evidence floor | Protocol added |
|---|---|---|---|---|
| `news` | 2 | 9 | 8 | SEARCH PROTOCOL (deep=true per angle, snippet-first, ≤4 `fetch_news`) |
| `financial` | 4 | 12 → **10** | 4 → **6** | TOOL PROTOCOL — ≥3 fiscal periods before any trend claim |
| `valuation` | 6 | 12 | **5** (was expected-output only) | TOOL PROTOCOL — peer + historical multiples not optional |
| `market` | 6 | 12 → **8** | **6** (was none) | TOOL PROTOCOL — all five data tools, a skip is a declared gap |
| `growth` | 4 | 12 → **10** | **5** (was none) | SEARCH PROTOCOL — ≥3 initiative angles, size + date each |
| `risk` | 8 | 12 | **6** (was none) | SEARCH PROTOCOL — ≥4 risk categories, own search each |
| `workforce` | 4 | 12 → **9** | **4** (was none) | TOOL PROTOCOL — `search_jobs` first, group by function/seniority |
| `social` | 1 | 12 → **6** | **3** (was none) | SEARCH PROTOCOL — ≥3 angles, attribute each theme to a voice |
| `document` | 2 | 12 → **8** | **5** (was none) | MANDATORY TOOL USE (kept) + `retrieve_evidence` step added |

**Anti-padding, per mandate.** Each floor is what that agent's *provider* can realistically return,
not a target to hit: `market` has five structured tools so 6 is cheap, `social` has one search tool
so 3 is honest. Every floor is written as conditional — *"when the provider returns that much"* —
because §5's evidence-first invariant outranks any count. `workforce` (4) and `social` (3) sit below
the generic DEPTH FLOOR of 5 deliberately: those are the optional thin-source agents, and the
contract's *"whenever the retrieved material supports them"* clause is what licenses it.

**What each brief now demands beyond a count** — this is the part that answers "one-two unnecessary
analysis", since a count alone buys padding:

- `financial` — a trend claim needs ≥3 fiscal periods; one period supports a level, never a direction.
- `market` — the move must be stated *against its benchmark over the same window*, not in isolation.
- `valuation` — every multiple must say which way the comparison cuts (cheap / rich / in line).
- `growth` — every initiative carries its announced size and date; one with neither is a headline.
- `risk` — every risk carries severity, its trigger, and the fact that would falsify it.
- `workforce` — postings grouped by function / seniority / location; a raw count of openings is
  **one** finding, not five.
- `social` — each theme attributed to a voice (retail / analyst / customer) and rated strong /
  mixed / thin, because the speaker is the signal.
- `document` — verbatim wording, not paraphrase; "a passage summarised past the point of being
  checkable is not evidence".

**Latency (ask #8), as a side effect.** Total `max_iter` across the nine agents falls from 105 to
84 — a 20% cut in the worst-case tool-loop budget, concentrated exactly where the extra turns were
buying nothing (`social` 12→6, `market` 12→8, `document` 12→8). `valuation` and `risk` keep 12:
six and eight tools against the highest floors is genuine work, not looping.

---

## 5. Invariants this work must not break

1. **Evidence-first.** Nothing in `report/schema.py` may invent a metric, verdict or finding.
   Unsupported items become `evidence_gaps` labelled "Unavailable — evidence gap".
2. **The citation index stays canonical.** One `_build_citation_index()`, one numbering.
3. **Free-tier discipline.** Tavily only on the fallback path; Gemini key rotation and pacing
   untouched.
4. **No secrets in source.** Every key stays in `.env`.
5. **Mock mode stays ₹0 and offline.** No network reachable from the deterministic path.

---

## 6. Verification

### 6.1 The verifier

`fixes/verify_fixes.py` — one standalone script, 29 checks, **no network, no LLM, no Tavily
credit**:

```
cd artha-ai
python fixes/verify_fixes.py      # exit 0 = every check passed
```

It sets `MODEL_PROVIDER=mock` *before* importing `app.config` (settings are built at import
time), which is what makes `_live_metrics()` return `{}` and the whole report-assembly path
offline. Every check either parses source, or drives the deterministic report layer over a
synthetic state in exactly the shape `crew/stages.py::build_report` passes — evidence already
validated, one agent completed, one agent failed.

| Group | Ask | What it proves |
|---|---|---|
| 1 | — | All 14 edited modules `ast.parse`; `report.html.j2` compiles under Jinja2 and its agent section precedes `Sources &amp; Citations` |
| 2 | 1 | `enforce_policy` returns `["news"]` from a 5-agent planner proposal; `["news","document"]` when a file is attached; `general` still fans out to 3; mock `INTENT_RULES` classify 6 news phrasings as `news` while "long-term buy after this news" stays `long_term` |
| 3 | 2, 3 | `_base.py` carries **DEPTH FLOOR**, **STAY IN YOUR LANE** and **REASONING FIELD**; the news backstory and brief now state the *same* minimum (8 dated items) and both mention `snippet` |
| 4 | 5 | AST proof that `_tavily_news` has **exactly one call site** and it sits inside the `if _should_top_up(...)` body; `search_depth=basic`; `_should_top_up([])` follows `tavily_enabled`, `_should_top_up(9 items)` is always `False`; no `tvly-` literal anywhere in `backend/app` or `frontend/src` |
| 5 | 8 | Exactly one `httpx.Client(`; `_RESOLVE_LIMIT ≤ 16`; cache TTL ≥ 300 s; redirects resolve via `.stream("GET")`; both RSS paths use a thread pool; news `max_iter ≤ 9`; a cache hit returns the identical envelope keys as a miss (run against a seeded cache, so still no network) |
| 6 | 4, 7 | `agent_notes` is built in routing order, the failed agent is listed with its recorded error, `self_reported` is `True` only when the agent actually spoke; agent `[n]` markers are the same numbers as `report.sources`; bare-string findings still resolve via claim-text match; `render_html` places the section immediately before the references with `<span class="cite">[n]</span>` intact; the ratios table reads `sector`/`assessment` (not the old `benchmark`/`posture`), emits the 5 expected rows with **exact** reported / benchmark / delta / assessment values, and those cells reach the rendered HTML; an *unmeasured* ratio is omitted and every missing metric is named in `evidence_gaps`; the quality score is 7/9 measured vs 2/9 unmeasured with only the two genuinely-unpassable criteria failing; `render_pdf` completes and the section precedes `Sources & Evidence Table`; the measured PDF is strictly larger than the ratio-less one (so the grid really rendered); and a forced `generate_report_charts` failure still yields a >5 KB PDF |
| 7 | 4 | `ReportPreview.jsx` — `id: 'agent_log'` sits directly before `id: 'sources'` with no tab between, and wires `report.agent_notes`, `self_reported` and `CitedText` |
| 8 | 3 | Per-agent calibration (§4.8): all 9 specialists state an evidence floor in the backstory, the brief **and** the expected output, and all three numbers agree — the news 3-vs-8 class of bug cannot recur anywhere; `max_iter` matches the per-agent table with ≥4 distinct budgets and a 1-tool agent never out-spends an 8-tool one; every brief names a TOOL/SEARCH PROTOCOL clause |

### 6.2 Verified by reading, in this session

- `AgentResult.reasoning` survives `model_dump()` (the override only rewrites findings without
  `evidence_ids`), and coerces from `thought` / `thoughts` / `analysis` / `approach` /
  `rationale` / `method` / `methodology`.
- `ReportJSON.agent_notes` has a before-validator that drops non-dict entries.
- `enforce_policy` subtracts `{"document"}` from `never`, so a news query with an upload routes
  `["news", "document"]` — the only agent that may join a news run.
- The news rule is **last** in `INTENT_RULES`, so a fundamentals or buy/hold/sell question wins.
- `pdf.py` renders the agent block at lines 436-522, immediately before
  `# 8. Sources & Evidence Table` at 524, with page-break checks per bullet and per agent.
- `report.html.j2`'s `specialist()` macro prints summary **and** findings.
- `frontend/.../ReportPreview.jsx` — tab at 1153 before `sources` at 1154, panel at 1800,
  `agentLogTab` at 1441-1591; `CitedText` and `EvidenceGapPanel` signatures match their usage.
- `_live_metrics()` returns `{}` under `is_mock()`, so mock mode reaches no network.
- Mock agents pass a clearly-labelled deterministic `reasoning` ("Deterministic offline run: …"),
  never an invented monologue.

### 6.3 Fixed during verification

- `report/schema.py` — `_cited()` gained a claim-text fallback to citation numbers, so findings
  from legacy/mock agents (bare strings, no `evidence_ids`) still render `[n]` instead of nothing.
  It matches only against **that agent's own accepted evidence**, so it can never point at a
  neighbouring source.
- `report/schema.py` — the no-result branch now emits `self_reported: False` too, so every note
  has one shape.
- `news_tools.py` — the shallow RSS path resolves redirects **concurrently** (it was serial);
  a cache hit now returns the same envelope keys as a miss (`providers`, `fallback_used`,
  `cached`), so an agent cannot behave differently on a cached search.
- `llm_mock.py` — the news pattern missed plurals: "any updates on", "headlines today" and
  "announcements" all fell through to `general` and would have fanned out to 3 agents in mock
  mode. Now `headlines?|updates?|announce(?:d|ment|ments)?`.
- `report/pdf.py` — `_render_pdf_fallback()` called `generate_report_charts()` **unguarded**, so a
  single matplotlib failure (or a missing matplotlib) took down the entire PDF rather than dropping
  one image. The import and the call now sit in a `try`, defaulting to `charts = {}`; every consumer
  already tests `"key" in charts and os.path.exists(...)`, so the report degrades to chart-less
  instead of failing. This is the live path on Windows, where WeasyPrint is unavailable.
- `fixes/verify_fixes.py` — **the ratios-table check was vacuous.** It ran against a fixture whose
  findings state no ratio, and `MODEL_PROVIDER=mock` deliberately makes `_live_metrics()` return
  `{}`, so `_resolve_metrics()` measured nothing, `ratios_table` came back `[]`, and the
  `for row in rows:` body — the blank-column assertion, the whole point of the check — iterated
  **zero times**. The `render_pdf` check inherited the same fixture, so pdf.py's ratio-grid block
  (lines 289-331) and its ROE KPI card were never executed either. The two parts of the report a
  reader is most likely to call "not perfect" were the two the smoke test skipped.
  Fixed by adding a second fixture, `METRIC_PROSE`, whose findings *state* all six metrics in the
  exact phrasings `_resolve_metrics()` parses, plus five new checks (§6.1 group 6): exact cell
  values, the omitted-and-disclosed path, the 7/9-vs-2/9 quality score, a column-overflow check
  measured with fpdf2's own `get_string_width`, and a forced chart failure driven through
  `_render_pdf_fallback` with a stub `app.report.charts` module — which needs no matplotlib and is
  the only way to actually exercise the guard above. 24 checks → 29.
- `report/pdf.py` — **the ratios grid's Assessment column was too narrow for its own longest
  label.** `_assess()` emits `"Net cash / minimal leverage"` (27 chars, ~39mm in bold 7.5pt) into a
  column of `page_w * 0.20` ≈ 38mm, and `fpdf2`'s `cell()` does not clip — it draws the overflow
  across the border and into the neighbouring column. Any company with a clean balance sheet got a
  visibly broken table row, which is precisely the "doesn't look perfect" complaint. Columns
  rebalanced to `0.30 / 0.16 / 0.16 / 0.13 / 0.25` (the metric column had the slack: its longest
  label, `"ROE (return on equity)"`, is ~31mm in 8pt), and a long verdict now steps down to 6.5pt,
  mirroring the KPI cards' existing size-step. The new overflow check measures every verdict
  `_assess()` can return against the column widths **read out of `pdf.py` itself**, so the two
  cannot drift; it fails against the old `0.20`.

### 6.4 Execution status

**No report has ever been generated in any of these sessions.** `python fixes/verify_fixes.py` is
written, statically reviewed, and **still unexecuted**. The sandbox safety classifier that gates the
shell has been down for most of four sessions: it came up long enough to confirm the interpreter
(`Python 3.11.9`) and run two `grep` sweeps, then went down again on every attempt to run the
script — through Bash, PowerShell and Monitor alike.

So the honest inventory, split by what kind of claim it is:

| Claim | Status |
|---|---|
| Prompt-contract text: floors agree across all three statements, `max_iter` table, protocol clauses | **Read-verified.** All 27 floor extractions hand-traced against the file text, including the implicit string-concatenation folding that makes the AST read differ from a raw `grep`. |
| Deterministic routing: a news-only query dispatches one agent | **Read-verified**, `enforce_policy` + `ROUTING_TABLE` traced by hand; group 2 would prove it in ~1 s. |
| `agent_notes` order, citation-number identity, `self_reported` | **Unproven by execution.** Group 6 imports `app.report.schema`. |
| `render_html` / `render_pdf` complete at all | **Unproven by execution.** |
| The fpdf2 fallback — the *live* path on Windows, and the code edited in §6.3 | **Unproven by execution.** The chart guard has never run. |
| Ratios grid `sector` / `assessment` columns | **Was never actually tested** until the §6.3 fixture fix — and the fix immediately exposed a real column-overflow bug. Now covered, still unexecuted. |
| Frontend `agent_log` tab | String-position check only; never rendered in a browser. |
| Whether the agents *obey* the depth floor and produce ≥N distinct evidence-backed findings | **Not a static claim at all.** Only a live paid query can show this — a green verifier proves the contract text is right, not that the model follows it. |

Two things close this out, in order:

```
cd artha-ai
python fixes/verify_fixes.py      # free, offline; exit 0 = all 29 checks pass
```

then one live query — `latest news on Infosys` — to watch a single agent dispatch instead of three,
confirm the Agent Reasoning tab lands before Sources in the rendered report, and time the run
against the old 3-agent fan-out. That query costs tokens; everything above it costs nothing.

