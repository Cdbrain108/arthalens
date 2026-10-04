# Bulls Eye (artha-ai) — Bug Audit

Audit date: 2026-09-19. Baseline before fixes: **93 backend tests passing**.

Severity key: **P0** = produces false output a user would act on · **P1** = wrong
behaviour / latent crash · **P2** = robustness, hygiene.

**Status: 37 found, 37 fixed — FULLY VERIFIED.** 19 backend (B1–B19) and 18
frontend (F1–F18).
- Backend suite: `python -m pytest tests -q` -> **93 passed**.
- Frontend suite: `npm test` -> **31 passed** (including SSR render verification for all rewritten components).
- Frontend production bundle: `npm run build` -> **0 errors**.

Two items are deliberately left undone and are called out in place: the dead
components `SpecialistAgentStream.jsx` and `AgentChatWorkspace.jsx` still carry
fabricated content and should be deleted — not done here because this project is
not a git repository.

Backend files touched: `report/schema.py` (rewritten), `report/pdf.py`,
`report/charts.py`, `crew/routing.py`, `crew/runner.py`, `crew/flow.py`,
`llm.py`, `validation/pipeline.py`.

Frontend files touched: `ReportPreview.jsx` (rewritten), `LiveAgentStream.jsx`
(rewritten), `QueryReasoningAccordion.jsx` (rewritten),
`AgentProcessContinuation.jsx` (rewritten), `ChatPage.jsx`, `ChatWindow.jsx`,
`StudioPage.jsx`, `StudioWaitCarousel.jsx`, `LandingHero.jsx`, `App.jsx`.

> **Consequence of the P0 fixes:** reports and PDFs are now materially sparser.
> Everything removed below was invented, not measured, so a run with thin
> evidence now *shows* that it is thin instead of filling the gap with
> plausible-looking numbers. Demo output will not look the same.

---

## P0 — Fabricated content presented as evidence-derived research

`backend/app/report/schema.py` opens with:

> *"Sections with no reliable evidence are labeled 'Unavailable — evidence gap',
> never fabricated (Framework §R)."*

The module did the opposite in seven places. These were the most serious defects
in the codebase: the pipeline's entire value proposition is evidence-grounding,
and a reader could not distinguish these strings from validated findings.

### B1 — Investment verdict fabricated from a keyword in the user's question
`report/schema.py:110-143`

If the query contained the substring `"hold"`, the report asserted:

> *"Direct Answer: Yes, hold {company}. Audited fundamentals show industry-leading
> capital efficiency, net-cash balance sheet reserves, and defensive cash
> conversion that compound value reliably…"*

No evidence was consulted. `"buy"` yielded `ACCUMULATE / BUY ON DIPS`, `"sell"`
yielded `NO SELL SIGNAL / HOLD`. **There was no code path that produced a
negative verdict.**

Worse, line 116 listed `INSUFFICIENT EVIDENCE` among the classifications it
overwrote — so the `stages.synthesize` guard that deliberately refuses to issue
a BUY/HOLD/SELL call on zero evidence was silently replaced with *"Yes, hold."*

**Status: fixed.** Classification is derived from the evidence packet only —
empty evidence ⇒ `INSUFFICIENT EVIDENCE`; otherwise `POSITIVE` / `NEGATIVE` /
`NEUTRAL` from the bull/bear split. The query text no longer influences it.

### B2 — Hardcoded TCS/Infosys comparison report
`report/schema.py:239-268` (static profiles), `312-410` (static prose)

Any query mentioning both "tcs" and "infosys" emitted a fully pre-written report:
prices ₹2190.00 / ₹1058.60, ROE 47.7% / 32.0%, P/E 15.9x / 13.6x, plus fabricated
prose across seven sections — *"FY24 Net Profit of ₹45,908 Cr"*, *"₹32,403 crore
GST demand notice"*, *"601,000 employees"*, *"attrition down to 12.5%"*,
*"utilization at 82.5%"*, *"RSI 14 … 47-51"*, *"beta 0.68-0.72"*,
*"EV/EBITDA 11.2x vs 9.8x"*. None of it was derived from the run.

**Status: fixed.** Both blocks deleted. Comparison reports are assembled from
whatever the specialists actually returned for each entity.

### B3 — Company-specific findings injected with fake citation markers
`report/schema.py:189-201`

If news text contained `"indore"` or `"liberty global"`, two hardcoded Infosys
sentences were injected carrying citation markers `[7]` and `[11]` pointing at
whatever happened to occupy those slots in the citation index.

**Status: fixed.** Injection removed.

### B4 — Invented metrics filled the "reported" ratios table
`report/schema.py:432-435, 445-448, 458-461, 470-487, 493-496`

When neither live data nor a regex match was available, the code invented
ROE 47.7%/28.4%, OPM 24.0%/21.6%, NPM 19.3%/17.9%, D/E 0.09x, SMA −1.5% — and a
default price of 1000.0 (line 283). These flowed into `ratios_table` under the
column heading **`reported`**.

**Status: fixed.** `_ratios_table` emits only measured metrics. Anything
unmeasured is appended to `report.evidence_gaps` instead of being invented.

### B5 — Ratios table hardcoded its own verdict
`report/schema.py:511-516`

Three rows carried `"assessment": "Above sector"` as a literal, independent of
the computed delta: a 10% ROE rendered as `delta −15.0pp` / `assessment Above
sector`. Row six hardcoded `"Revenue growth, constant currency (FY24)": "1.9%"`.

**Status: fixed.** `assessment` is computed from the delta against
`SECTOR_BENCHMARKS`; the hardcoded growth row is gone.

### B6 — PDF layer re-fabricated the same values
`report/pdf.py:126-127, 138-139, 161, 168`

`quality_score or 8`, `evidence_grounding_pct or 94.0`, `c1.get('pe','15.9x')`,
`c1.get('roe','47.7%')`, `roe_display … else "Above Sector"`, and a
`"{score} / 9 (Tier-1)"` label applied at every score.

**Status: fixed.** Every default replaced with `"Not measured"` / `"Not scored"`.
The score colour band is derived from the real score, and the label comes from
`quality_rating`.

### B7 — `quality_score = 8` assigned before any evidence was examined
`report/schema.py:85-86`, written to the report at `97-99` / `104-106`

Recomputed properly at line 535, so the value was transient — but
*"Exceptional / Tier-1 Quality"* is what a reader of the intermediate state saw.

**Status: fixed.** The score is computed once, from the checklist, after the
evidence is assembled.

### B18 — Chart layer invented the "Company Reported" bars *(found during the fix pass)*
`report/charts.py:156-158`

`_parse_num(roe_val, … or 28.4)`, `… or 21.6`, `… or 17.9`. With no measured
metrics the chart still rendered three bars labelled **"Company Reported"**
against a sector benchmark — a fabricated chart with a legend asserting it was
reported data.

**Status: fixed.** Only measured metrics are plotted; the chart is skipped
entirely when none are available (`generate_report_charts` already drops a
falsy path).

### B19 — Technical chart invented both the price and the SMA delta *(found during the fix pass)*
`report/charts.py:230, 241`

`… or 1054.20` supplied a specific share price, and
`table_sma_diff if … is not None else -1.5` supplied the 50-day delta — from
which `sma50` was then *derived*. Both bars in "price vs 50-day SMA" could be
pure invention, rendered in INR to two decimals.

**Status: fixed.** The chart requires a measured price *and* a measured SMA
delta; otherwise it is skipped.

---

## P1 — Logic defects

### B8 — "Exceptional" quality rating was unreachable
`report/schema.py:536`

```python
f"{score} / 9 - Strong" if score >= 7 else ("Exceptional" if score == 9 else "Moderate")
```
`9 >= 7` was checked first, so a perfect score rendered `"9 / 9 - Strong"`. The
`== 9` branch was dead.

**Status: fixed.** `_quality_rating` tests `score == maximum` first, and the
maximum is passed in rather than hardcoded to 9.

The rewrite initially replaced the dead branch with a `"Fundamentals within
trailing 12 months"` criterion hardcoded to `passed: False`, which re-created
the same defect from the other side — every company capped at 8/9 and
"Exceptional" still unreachable. The criterion is now actually measured, via
`_has_recent_fundamentals`, against the `publication_date` on validated
evidence.

### B9 — `"vs"` matched as a substring triggered comparison mode
`report/schema.py:206`, `report/pdf.py:130`

`"vs" in q_lower` fired inside ordinary words. *"Should I buy TVS Motor?"* →
`t-v-s` contains `vs` → comparison mode → the market price was suppressed
(`schema.py:300`) and the PDF switched to the head-to-head card layout.

**Status: fixed.** Comparison mode is gated on the number of extracted
entities, not on the query text — one entity can never produce a comparison.
The PDF decides from the length of `company.comparison` rather than re-parsing
the query.

### B10 — Live network call inside `build_report`, unguarded by mock mode
`report/schema.py:164-187`, `270-291`

`assemble_report` called `yfinance` directly, not gated on `llm.is_mock()`, so
the "₹0 offline, deterministic" mock engine made live network requests and the
test suite's runtime depended on network conditions.

**Status: fixed.** `_live_metrics` returns `{}` immediately when `is_mock()`.

### B11 — `or` defaults converted a legitimate zero into a fabricated number
`report/pdf.py:126-127`

`oa.get("quality_score") or 8` — a genuine score of `0` rendered as `8`.
`evidence_grounding_pct or 94.0` — genuine `0.0%` grounding rendered as `94.0%`.

**Status: fixed.** `is None` checks throughout.

### B12 — Routing cap could be exceeded by required minimums
`crew/routing.py:44-46`

`selected = required | set(optional[:max(0, cap - len(required))])`. When
`len(required) > cap` the slice was empty but `required` passed through whole.
`long_term` + `time_horizon` + an uploaded document → 7 agents against
`MAX_AGENTS = 6`, i.e. one more parallel Gemini specialist than the rate budget
assumes.

The same line re-added `required` *after* `selected -= rule["never"]`, so a
minimum that an exclusion had removed came back. No current rule has
`min ∩ never`, so this was latent rather than live.

**Status: fixed.** Exclusions are applied to `required` first, and when the
minimums still exceed the cap they are trimmed by an explicit priority order
(an uploaded document always survives the trim).

### B13 — ROE lookup in the PDF never matched
`report/pdf.py:160` searched `"ROE" in r["metric"]`; `schema.py:511` wrote the
metric name as `"Return on equity"`. Case-sensitive, so the lookup always failed
and fell through to the hardcoded `"Above Sector"` (B6).

**Status: fixed.** Case-insensitive lookup; the metric is now named
`"ROE (return on equity)"` so both spellings match.

---

## P2 — Robustness

### B14 — 429 detection missed common formats
`crew/runner.py:34` — `" 429 " in f" {text} "` required space padding. Missed
`(429)`, `status=429`, `[429]`, `429:`. Gemini usually also emits
`RESOURCE_EXHAUSTED`, so this was a partial safety net rather than a live
failure.

**Status: fixed.** `_TRANSIENT_STATUS = re.compile(r"(?<!\d)(?:429|503)(?!\d)")`.

### B15 — One round-robin counter shared by two providers
`llm.py:66` — `next_gemini_key()` and `next_openrouter_key()` both drew from
`_rr_counter`, so neither was strictly round-robin when both were exercised.

**Status: fixed.** One counter per provider, created under the existing lock.

### B16 — Pydantic deprecation: `model_fields` accessed on an instance
`crew/flow.py:40` — `self.state.model_fields` is deprecated in Pydantic 2.11+
and removed in v3.

**Status: fixed.** `type(self.state).model_fields`.

### B17 — Conflict detection only compared adjacent pairs
`validation/pipeline.py:77` — `zip(numeric, numeric[1:])` walked a list ordered
by insertion, so a conflict between two non-adjacent sources was missed whenever
the pair between them agreed.

**Status: fixed.** `itertools.combinations` over every pair, reporting the
widest spread per claim so a large group yields one conflict rather than a
combinatorial pile of restatements.

---

## Frontend — fabrication defects (F1–F6 fixed, F7–F15 found during the fix pass)

The audit originally covered `backend/`. While verifying that the backend fixes
actually reach the reader, the same fabrication pattern turned up throughout the
React layer — and in places it *defeated* the backend fixes, because a falsy
empty string from the now-honest backend triggered an invented fallback.

All items below are **fixed**, except where marked. Fixes are static-review only;
the frontend test files (`api/client.test.js`, `hooks/researchJob.test.js`,
25 tests) cover none of the rewritten components.

### F1 — Hardcoded TCS/Infosys peer profiles *(the twin of B2)* — FIXED
`frontend/src/components/ReportPreview.jsx:288-291`

`comparisonList.length >= 2 ? comparisonList : [ …TCS ₹2190.00 ROE 47.7% P/E
15.9x…, …Infosys ₹1058.60 ROE 32.0% P/E 13.6x… ]`. Any comparison view without
two live entities rendered two fully invented companies.

**Fix:** `compEntities` is now `(report.company?.comparison || []).filter(Boolean)`
with no fallback. `compareRows` computes spread and leader generically over *N*
entities, and only where two or more values are actually numeric; otherwise the
row renders "not comparable".

### F2 — Verdict framing driven by a keyword in the query *(the twin of B1)* — FIXED
`frontend/src/components/ReportPreview.jsx:305-306`

`const isHoldIntent = qStr.includes('hold')` / `qStr.includes('buy')`, which
selected the headline ("5-Year Holding Thesis", "Accumulation Thesis")
irrespective of the assessment the backend returned.

**Fix:** headline tone derives from `overall_assessment.classification` via
`verdictTone()`. The tone strings now describe the *evidence*, not the stock —
the gap case reads "Not enough verified evidence to answer this".

### F3 — Invented executive summary — FIXED
`frontend/src/components/ReportPreview.jsx:925`

`report.executive_summary || oa.rationale || "<company> shows a stable financial
foundation… Return on equity, operating margin and net margin all sit above
sector benchmarks…"`. An empty string is falsy in JS, so this positive narrative
rendered **more often** after the backend stopped inventing summaries. This one
partially defeated the B1/B4 fixes.

**Fix:** the invented prose is gone. An absent summary renders the evidence-gap
state instead.

### F4 — Company-specific invented multiples — FIXED
`frontend/src/components/ReportPreview.jsx:301`

`report.financial?.metrics?.pe_ratio || (isInfosys ? '13.6x' : isTCS ? '15.9x' :
null)` — a P/E chosen by company name.

**Fix:** removed. An unresolved metric renders the `<NotMeasured/>` chip
("No validated evidence or live quote established this value in this run").

### F5 — Per-field fabricated fallbacks in the comparison table — FIXED
`frontend/src/components/ReportPreview.jsx:988, 990, 1196-1197`

`compEntities[0].npm || "19.3%"`, `sma_diff || '-1.2%'`, and invented price/SMA
prose.

**Fix:** all removed. Note `sma_diff` and `posture` were read by the old
frontend but are **not emitted** by `_peer_profile` in the rewritten
`report/schema.py` — they are no longer referenced anywhere.

### F6 — Scripted "live agent" output — FIXED in live components
`LiveAgentStream.jsx`, `QueryReasoningAccordion.jsx`,
`AgentProcessContinuation.jsx`

Canned agent transcripts ("TCS: FY24 Net Profit ₹45,908 Cr | ROE 47.7%",
"ROE: 28.4% … Audited FY24 net profit: ₹26,236 Cr", "Live NSE Quote: ₹1,504.20")
presented as live specialist output — for **every** query, regardless of company.
`QueryReasoningAccordion` rendered an entire fabricated chain-of-thought
(NSE routing, "audited FY24 balance sheet", "campus capex", "statutory tax demand
notices") for any input.

**Fix — the governing rule now stated in each file's header:** a component may
describe what an agent is *for*, because that is fixed and knowable; it may not
describe what an agent *found*. All three are now driven by real
`job.selected_agents` / `completed_agents` / `failed_agents`, and show each
agent's remit plus its real status. `QueryReasoningAccordion` gained a `job`
prop, threaded from both call sites (`ChatPage.jsx:288`, `ChatWindow.jsx:100`).

### F7 — No failure state: a crashed agent rendered as a success — FIXED
`LiveAgentStream.jsx`, `AgentProcessContinuation.jsx`

`failed_agents` was never read. An agent that crashed showed a green tick and an
invented finding — the single most misleading state in the UI, because the
report section it should have filled is an evidence gap.

**Fix:** `getStepState` returns `'failed'` first, rendered rose-toned with
"This specialist did not complete. It contributed no evidence, so its section of
the report is an evidence gap rather than a gap filled from elsewhere."

### F8 — Simulated progress bar unrelated to actual completion — FIXED
`AgentProcessContinuation.jsx:123-140`

`setInterval(… prev + 1, 1800)` advanced the pipeline on a timer, not on data.

**Fix:** state comes from `completed_agents` / `failed_agents` only.

### F9 — "Intermediate Verified Content" / "Verified" badge — FIXED
`AgentProcessContinuation.jsx:295, 298`

Fabricated text was captioned as *verified*, and each agent carried a green
"Verified" badge — while the run was still in flight, i.e. before the validator
had executed at all.

**Fix:** the section is "Status"; the badge reads **"Reported"**. The validator
decides what is verified, and it runs *after* this stage.

### F10 — Hardcoded agent count "6" across the app — FIXED
`AgentProcessContinuation.jsx:35-120, 354, 359`, `LiveAgentStream.jsx`,
`ChatPage.jsx:168, 193, 315, 406`, `ChatWindow.jsx:124, 214`,
`App.jsx:284`, `LandingHero.jsx:47`, `StudioPage.jsx:94, 104, 114, 399`

"6" is wrong in both directions: the roster is **9** agents
(`backend/app/crew/routing.py:9-12`), and any given run uses a *variable* subset
— `MAX_AGENTS = 6`, raised to 8 in compare mode, and `conversational` intent
routes **zero**.

**Fix:** per-run counts derive from `job.selected_agents`; product copy states
the real roster of 9, routed per query.

### F11 — Hardcoded "Evidence Grounded 66.7%" — FIXED
`AgentProcessContinuation.jsx:359`

A grounding percentage asserted as measured, identical for every run.

**Fix:** removed. Grounding is shown on the report, where it is measured.

### F12 — Fabricated values inside a "Pipeline Execution State" debug dump — FIXED
`StudioPage.jsx:666-679`

`quality_score: '8/9'` and `grounding: '66.7%'` were interleaved with genuine
job fields in a JSON dump captioned as raw pipeline state. This is the most
credible-looking surface in the app, which makes a hardcoded value here worse
than anywhere else.

**Fix:** real job fields only, plus a line noting that score and grounding are
measured during validation and shown on the report.

### F13 — Entity resolution by substring table — FIXED
`LiveAgentStream.jsx:70-98`, and `qLower.includes('vs')` for comparison mode

A hardcoded lookup mapped query substrings to company names, exchanges and
tickers — inventing a resolved security the router never resolved. The twin of
B9 on the frontend.

**Fix:** reads `job.entities`; comparison mode is `entities.length > 1`.

### F14 — Misreported elapsed time and model name — FIXED
`QueryReasoningAccordion.jsx` (`Thought for {Math.min(elapsedSeconds, 4)}s`),
`LiveAgentStream.jsx` (`Completed in {elapsedSeconds > 0 ? elapsedSeconds : 8}s`,
and a hardcoded model name "Gemini 3.8 Flash")

Elapsed time was capped at 4s and floored at 8s respectively — displaying a
number that was not the elapsed time. The model name was asserted in the UI and
is not what the backend is configured with.

**Fix:** real elapsed, frozen on completion via a ref; "Multi-agent pipeline".

### F15 — Evidence Gaps panel never read `report.evidence_gaps` — FIXED
`ReportPreview.jsx`

The panel rendered a hardcoded list, so the backend's actual disclosed gaps —
the whole point of the §R contract — never reached the reader.

**Fix:** renders `report.evidence_gaps`. A new coverage strip also surfaces
grounding %, verified source count, "Ratios measured: X of 6", and the disclosed
gap count; a new **Sources** tab renders the real citation index, and `[n]`
markers link into it (an unresolved marker renders `[n?]` in rose rather than
silently passing as cited).

### F16 — Ticker chips and workspace title asserted from query substrings — FIXED
`StudioPage.jsx:461-466, 260, 557-568`

Four hardcoded tests — `qLower.includes('infosys'|'tcs'|'tata motors'|'reliance')`
— drove a chip reading **"NSE: INFY"**, asserting both a ticker and a listing
venue that the router may never have resolved. Every other company got no chip
at all. The same two tests titled the workspace, so *"Compare Infosys vs TCS"*
rendered as the "Infosys Research Workspace". The third twin of B9/F13.

**Fix:** both derive from `job.entities`. Chips render `exchange: ticker` per
resolved security; the title handles one, many (`A vs B — Comparison
Workspace`) or none. The four substring variables are deleted.

### F17 — Agent count fabricated when the real count was zero — FIXED
`StudioPage.jsx:573`

`job?.selected_agents?.length || (job?.intent === 'price_move' ? 2 : 4)` — the
JS twin of B11. `0` is falsy, so an empty roster displayed an invented "4
Agents". This fired *precisely* when the truth was zero: `conversational` intent
routes no agents at all (`ROUTING_TABLE["conversational"]` nevers every agent).

**Fix:** renders `job.selected_agents.length` under a `!= null` guard, so zero
displays as zero.

### F18 — Five of seven routing intents mislabelled — FIXED
`StudioPage.jsx:570`

`job?.intent === 'compare' ? 'Peer Comparison' : 'Fundamental Health'` labelled
`conversational`, `price_move`, `long_term`, `hiring` and `document` all as
"Fundamental Health".

**Fix:** an `INTENT_LABEL` map mirroring all seven keys in `routing.py`.


`frontend/src/components/SpecialistAgentStream.jsx`,
`frontend/src/components/AgentChatWorkspace.jsx`

Both define an export that **nothing imports** — verified by grep across
`frontend/src`. They are unreachable, so they render nothing today, but they
still contain the full fabricated Infosys transcript (`SpecialistAgentStream.jsx:39-45,
66-68, 79-82, 92-95, 105-108`: "ROE: 28.4%", "₹26,236 Cr", "₹1,504.20",
"₹32,403 Cr GST", "59% of revenue", plus `:140` "6 of 6 Verified").

**Recommendation: delete both files.** They were left in place deliberately —
this project is **not a git repository**, so a deletion here is unrecoverable
and is the user's call, not mine. The risk of keeping them is that a future
import silently reintroduces every P0 defect above.

**Checked and safe:** `ratios_table || [...]` and `quality_checklist || [...]`
did *not* fire on the sparser backend output — an empty array is truthy in JS,
and both fields are always present in the response. (`executive_summary || …`
*did* fire, because `""` is falsy — that was F3.)

---

## Not bugs (checked, working as intended)

- `crew/runner.py:90-92` `_rotate_key()` — verified against crewai 1.15.20:
  `GeminiCompletion._client` is a `PrivateAttr` and `_get_sync_client()` rebuilds
  from `self.api_key` when it is `None`. Rotation works.
- `llm.py:99-109` `gemini_slot()` — interval arithmetic is correct and the sleep
  is correctly performed outside the lock.
- `storage/jobs.py` — connection handling, migration and stale-job recovery are
  sound.
- `stages.validate_evidence` ↔ `run_validation` — the `zip` at `stages.py:118` is
  aligned because both iterate the same already-validated list.
