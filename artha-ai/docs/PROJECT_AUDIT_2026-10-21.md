# ArthaLens project audit — 21 October 2026

The project builds and its unit tests pass, but its current reports cannot yet be trusted to stay within the collected evidence. The most urgent work is correcting report assembly and source provenance, enforcing backend ownership, and fixing several broken UI actions. Adding agents or visual effects should come after those corrections.

This is a read-only audit. No application source was changed. Audit scripts, logs, screenshots, and this document were created locally. No live model or paid search requests were intentionally made by the audit probes. Credentials were not printed. No deployment, database migration, or external publication was performed.

## Scope and strength of evidence

Reviewed the React application, authentication, local/Firestore/Storage persistence, FastAPI routes, SQLite job manager, LangGraph stages, all 11 specialist definitions and executable collectors, model gateway, validation, document retrieval, report assembly, PDF/chart generation, hosting configuration, Dockerfile, and existing tests.

The workspace changed during this session through updates outside the audit. The final observed commit was `49ad5b8`; earlier reads included `5ee1db4`. Findings below describe code and behavior actually observed on this date. Recheck referenced functions when applying fixes; line numbers can move. In particular, mobile tab behavior changed during the audit. The final completed-report fixture successfully switched between Artha Copilot and Report Dossier, so that is recorded as a passing check.

Evidence labels:

- **Reproduced:** executed with isolated fixtures or exercised in Chromium.
- **Code-confirmed:** the implementation establishes the defect; the relevant external/live condition was not exercised.
- **Risk or improvement:** a design limitation or a path requiring further verification, rather than a claimed observed outage.

No live-provider reliability, deployed-site security, actual Android/iPhone Safari behavior, Google account completion, or production throughput was certified. Browser checks used Chromium, including a touch/mobile context; external fonts and provider requests were blocked for the layout measurements. A device viewport alone does not reproduce every mobile browser behavior.

## Validation results

| Check | Result | Meaning |
|---|---|---|
| Production frontend build | Passed | Latest observed build completes, with large-chunk warnings. |
| Frontend tests | 53 passed | API error handling, polling, rendering, and query-router fixtures pass. |
| Backend tests | 100 passed | Existing mocked/offline suite passes. It does not establish live provider availability. |
| Frontend lint | 20 errors, 7 warnings | Includes real undefined-reference bugs, a duplicate property, and empty catch blocks. Not every lint error is a runtime failure. |
| Existing browser suite | 1 passed, 2 failed | Failures wait for `Switch to light theme` and `Research TCS` controls. These are test/product drift, not evidence that the entire landing page fails. |
| Layout measurements | 27 route/viewport combinations | Home, login, and chat at 320, 360, 390, 768, 820, 1024, 1440, 1920, and landscape 844 pixels. |
| Targeted mobile checks | Login scroll defect reproduced; completed-report tabs passed | Manual scrolling and tab interactions were checked separately from layout bounds. |
| Accessibility scan | Serious contrast failure on login and chat | Automated WCAG AA scan at 390px; this was not a full accessibility certification. |
| All-agent outage probes | All 11 exercised | Confirmed actual tool attempts and gap behavior without consuming provider quota. |

An initial backend run reported eight fixture errors because sandbox permissions blocked temporary-directory creation. After rerunning with the required permissions, all 100 tests passed. Those fixture errors are not project bugs. The project-local `.venv` lacks `pytest`; the successful backend suite used the installed Python 3.12 environment.

## Critical findings: report truth and access boundaries

### D01 — Citation dates are altered or invented

**Reproduced.** `backend/app/report/schema.py`, `_citation_index`, around line 38.

The code changes a publication date starting with `2024` into `2026`, changes `2023` into `2025`, and assigns `2026-10-10` when the source date is missing. It also has a fixed retrieval timestamp fallback. The reproduced citation for an article dated `2024-01-15` was displayed as `2026-01-15`. An undated search excerpt received `2026-10-10` and the provider label `Primary Audited Financial Statement`.

This corrupts the provenance of otherwise correct evidence. Historical events look recent, and search snippets can look like primary audited disclosures. Freshness checks and the report's credibility are directly affected.

**Recommendation:** preserve source timestamps exactly; retain `null` for unknown dates; derive provider labels from explicit adapter metadata. Store publication date, financial period, quote time, and retrieval time as separate fields. Never rewrite dates to make a report appear current.

**Acceptance:** a 2024 source still displays 2024; an undated source displays “date unavailable”; a search excerpt retains its actual provider and secondary/snippet classification in JSON, UI, and PDF.

### D02 — Zero-evidence reports still recommend holding and buying

**Reproduced.** `report/schema.py`, `_build_action_decision` around line 1148 and `assemble_report` around lines 2105–2180.

For an unknown company with zero evidence, the final classification correctly said `INSUFFICIENT EVIDENCE`, but the executive summary claimed 20% operating profitability, 0.10x debt/equity, safe debt exposure, regular dividends, and a “very safe asset to hold.” It recommended keeping shares and buying gradually. Those values and instructions came from defaults, not research.

The `classification` parameter does not govern the action builder's recommendation. The builder is also used for ordinary single-company reports, even when the user did not request an investment decision. Correct metrics or empty ratios elsewhere do not undo the unsupported summary.

**Recommendation:** fail closed at final assembly. With insufficient evidence, return an unavailable assessment and specific missing inputs; omit action directives, company safety claims, target prices, and portfolio advice. If assessments are offered, define explicit evidence requirements and a methodology rather than unconditional templates.

**Acceptance:** an all-provider outage and an unknown company produce no invented metrics and no buy/hold/sell recommendation anywhere in the serialized report, UI, PDF, or Q&A.

### D03 — Hardcoded market prices, quarterly results, and peer profiles enter research reports

**Reproduced and code-confirmed.** `report/schema.py`: `PEER_PROFILES` around line 289; `_build_quarterly_table` around line 761; `_build_single_peer_benchmarks` around line 1444; profile fallbacks throughout `assemble_report`.

Calling `_build_quarterly_table([], entity='BEL')` returned four fully populated quarters despite no evidence. Several other tickers have fixed quarters, and the generic fallback supplies company results too. Missing prices, P/E ratios, peer fundamentals, workforce information, and company narratives can come from `PEER_PROFILES`.

Comparison summaries also insert fixed claims such as IT stocks falling 5–8% over two months and banks trading in a 2–4% consolidation band. These claims do not depend on the actual time series. The profiles may contain plausible figures; the defect is that they are promoted to current research without a source, period, or refresh mechanism.

**Recommendation:** move static examples into explicitly labeled demo fixtures that production report generation cannot import. Every real report value must carry entity, unit, period, basis, source, and evidence ID. A failed adapter must leave an evidence gap.

**Acceptance:** removing a tool's data removes its corresponding report fields. A report for a new ticker never receives TCS-like quarters or IT-sector narratives. Static landing examples are visibly marked as illustrative.

### D04 — Missing and zero quarterly profit are replaced with estimated profit

**Reproduced.** `report/schema.py`, `_build_quarterly_table`, around lines 879–881.

The expression `net_income or operating_income` treats zero net income as missing. If neither usable value is available, the code computes `revenue * 0.188` and displays the result as net profit. Operating income can also be displayed as net profit, despite being a different metric.

With revenue of ₹1 crore and no net-income evidence, the output showed ₹0.19 crore net profit. Supplying an actual net income of zero produced the same invented ₹0.19 crore.

**Recommendation:** use explicit `is not None` checks. Preserve zero. Keep PAT/net income and operating income in separate columns. Do not estimate reported profit from an assumed margin. Optional scenario estimates must be labeled assumptions and kept separate from historical results.

**Acceptance:** zero profit remains zero; unavailable profit remains unavailable; operating profit is never substituted for PAT.

### D05 — Rejected narrative claims can return to the final report

**Reproduced.** `report/schema.py`, around lines 2004 and 2338.

The report computes a safe subset, then uses the original input when that subset is empty: `safe if safe else items`. The same pattern exists for “what could change the view.” A probe containing unsupported income of 999999 USD with a nonexistent evidence ID survived in the bull case. An invented 888888 USD contract survived in the trigger section. References were rendered as `[unavailable]`, but the claims remained readable as research conclusions.

**Recommendation:** retain only accepted claims. If none pass, show an evidence gap or an empty section. Apply one final semantic/provenance gate after all templates and computed sections have been assembled.

**Acceptance:** bogus evidence IDs and unsupported numerical assertions are absent from the final report, rather than merely given an unavailable citation badge.

### S01 — Backend history and reports are readable without authentication or ownership

**Reproduced locally; code-confirmed for the routes.** `api/research_routes.py`, history/status/report/PDF/ask endpoints; `storage/jobs.py` schema; `api/document_routes.py`.

An isolated unauthenticated client received HTTP 200 for history containing “Private owner A research” and HTTP 200 for that job's report. Jobs do not store an owner UID. The frontend API client does not send an identity token. Backend document uploads/listing and the shared RAG store also have no tenant boundary.

The Firestore and Firebase Storage rules correctly check UID ownership, but those rules do not protect FastAPI's SQLite jobs, HTTP PDFs, or document index. The frontend also fetches the global backend history on startup and merges it into local history.

**Recommendation:** validate Firebase ID tokens on the backend, store an immutable owner UID on jobs/documents, and enforce ownership on every read, write, PDF, chart, and Q&A endpoint. Guest access needs a server-issued restricted session, not a client-supplied identity. Define explicitly whether any data is public.

**Acceptance:** owner A can access A's data; owner B and an unauthenticated client cannot. History lists only the caller's resources. Supplied document IDs from another owner are rejected before retrieval.

### S02 — Report limits and account status are client-controlled

**Code-confirmed.** `frontend/src/storage/chatSessions.js`, `canGuestGenerateReport`; `hooks/useAuth.js`; `services/firebase.js`; `api/research_routes.py`, `start_research`.

The one-report limit lives in localStorage. A user can clear it or call the API directly. An object with a non-guest UID is treated as logged in without requiring a validated token. The current Google unauthorized-domain/unsupported-environment fallback still creates a local `guest: false` user. Email login/registration in unconfigured mode also create local users. These do not establish a real Firebase identity and will not satisfy cloud ownership rules.

**Recommendation:** keep local exploration explicitly guest/demo. Enforce quotas, authentication, submission limits, and resource ownership on the server. Derive verified status from the auth SDK/token. Do not use a fabricated identity to make a failed sign-in appear successful.

**Acceptance:** editing localStorage cannot grant authenticated API access or reset server quotas. Auth failures remain failures, with guest access available as a separate user choice.

## High-priority pipeline, retrieval, and API findings

### P01 — Timeout fallback runs synchronous network work on the event loop

**Code-confirmed.** `graph/specialists.py`, `run_all_specialists`, around line 150.

After an executor call fails or times out, the async handler calls `run_specialist_mock` directly. “Mock” here means LLM-free real data collection; it can perform network and filesystem work. This fallback is outside the original `wait_for` deadline and can block status polling and other requests. Timed-out Python threads can also continue running while the fallback repeats their work.

**Recommendation:** use an executor for every blocking adapter; give fallback work a remaining end-to-end deadline. Keep successfully collected partial results instead of recollecting all data. Bound admission across jobs and avoid repeated work after a timeout.

**Acceptance:** an agent timeout never stalls `/api/health` or status polling; total request/job duration respects a measured budget even when every adapter stalls.

### P02 — The inner 30-second explanation timeout does not bound elapsed execution

**Code-confirmed.** `graph/specialists.py`, `execute_specialist`, around lines 108–111.

The code uses a `ThreadPoolExecutor` context manager and calls `future.result(timeout=30)`. When this raises, context-manager exit waits for the running thread to finish before control reaches the exception handler. A slow model explanation can therefore exceed the intended 30-second fallback budget. The outer specialist limit caps state waiting but cannot kill the worker.

**Recommendation:** use a managed/shared executor, provider-native deadlines, and a deliberate shutdown policy. Avoid an implicit `shutdown(wait=True)` on the timeout path. Track orphaned/late work and cap global provider activity.

### P03 — Empty or incomplete agents can be reported as completed

**Reproduced.** `graph/specialists.py`, around lines 134 and 152–160; `graph/news.py`, `_empty_result`.

The runner overwrites a collector's `partial` status as `completed` once there are two evidence items, even with important gaps. Its exception fallback labels an empty result `partial`, adds it to `completed_agents`, and emits `agent_done`. The probe did exactly this with zero evidence. The news empty-result helper separately inherits the schema's default `completed` status; the normal orchestration path later corrects it, but direct agent execution still exposes the misleading status.

**Recommendation:** distinguish execution success from research completeness. Preserve unavailable/partial states; never emit successful completion with zero usable evidence. Determine completeness from required coverage, not a universal count of two.

### P04 — RAG index and metadata can lose alignment after embedding failure

**Reproduced.** `rag/retriever.py`, `add`, around lines 39–50.

Metadata is appended even when vector generation fails. If embeddings work for a later upload, its first vector has index 0, while metadata index 0 still refers to the earlier failed upload. The probe searched for the later correct document and received the earlier wrong document. This can corrupt citations and document attribution; ownership filters alone do not repair the mapping.

**Recommendation:** store an explicit vector-ID-to-chunk-ID mapping and persist it atomically with vectors. Keep failed-vector chunks in a separate keyword-only collection. Validate alignment on startup and rebuild on mismatch. Version indexes by embedding model and dimensionality.

**Acceptance:** failure on upload A followed by success on upload B never maps B's vector to A's metadata, including after restart.

### P05 — Web search's last fallback imports a nonexistent function

**Reproduced.** `tools/web_tools.py`, around line 57.

The fallback imports `_search_rss`, but `news_tools.py` defines `_rss_search`. When DDGS fails and Tavily is unavailable, the supposed RSS fallback is silently skipped because the broad exception catches the import error.

**Recommendation:** use the correct public adapter interface and test the fallback with DDGS deliberately failing. Log which backend failed and which actually served the response.

### P06 — Missing PDFs produce HTTP 500 before recovery can run

**Reproduced.** `api/research_routes.py`, `get_pdf`, around lines 582–601 in the final observed files.

Candidate path construction references `settings.BASE_DIR`, which is not a Settings attribute; `BASE_DIR` is a module-level constant. An existing job without a stored/existing PDF returned HTTP 500 in the probe. The error occurs before the intended on-demand PDF generation path.

**Recommendation:** use the actual module constant or a validated path field. Remove hardcoded `D:/` recovery paths. Move expensive on-demand rendering off the event loop and make retries idempotent. A HEAD request should not trigger unnecessary generation.

**Acceptance:** missing PDF plus valid report generates/retrieves safely; an unavailable report produces a controlled 404/409 response; no path or platform assumptions cause 500.

### P07 — Chart files are shared across jobs

**Code-confirmed.** `report/charts.py`, `thematic_balance.png` and `financial_metrics.png`; `report/pdf.py`, shared charts directory; `api/research_routes.py`, `get_chart`.

Every report writes the same filenames in one directory. The chart endpoint ignores `job_id` when selecting a file. Concurrent renders can overwrite another report's chart or embed mismatched data; sequential requests can return the most recent chart for an older job.

**Recommendation:** use per-job immutable chart paths and enforce job ownership before serving them. Render and read each job's artifacts independently.

### P08 — Job execution and storage are not durable across production instances

**Risk supported by implementation.** `api/research_routes.py`, in-process `asyncio.create_task`; `main.py`, `fail_stale_jobs`; `graph/workflow.py`, graph compiled without a checkpointer; `backend/Dockerfile`.

SQLite, documents, vectors, and PDFs live on local disk. The Cloud Run-style hosting configuration can point to a backend whose filesystem is ephemeral and instance-local. A restart loses in-process work; multiple instances do not share the same job/file state. If multiple workers share a database, each startup's global stale-job sweep can mark another worker's running work failed.

**Recommendation:** queue jobs durably, store structured state in a shared database, store PDFs/documents in object storage, and use worker leases/heartbeats. A checkpoint is useful only when the graph actually uses a durable checkpointer and resume policy. Keep one-process local mode as a documented development setup.

### P09 — Submission and Q&A have no resource/admission controls

**Code-confirmed.** Research routes accept effectively unbounded query/question strings and create background tasks without a global job limit, server quota, or idempotency key. Specialist concurrency limits are per job; they do not limit the number of queued jobs.

**Recommendation:** validate input length and document count, impose per-user and global admission limits, use idempotency keys, and bound model/search cost per job. Define cancellation and cleanup behavior. Return a clear queued/rate-limited response when capacity is full.

### P10 — Model fallback can invent positive research and does not reach all advertised tiers

**Reproduced/code-confirmed.** `llm.py`, `_RobustStructured`, around lines 329–360 and 439–465.

On a structured synthesis outage, the fallback returned “Audited operational evidence reflects core operational profitability” and a BALANCED assessment even when the probe prompt described losses/default. This fallback has no evidence input. Default structured attempts are two, and specialist explanation uses one, so an advertised five-provider chain is not fully traversed. The actual tier order also differs from the comments. Structured Vyce calls use the default model factory and bypass the synthesis-model selection available in `get_llm`.

**Recommendation:** create an explicit per-role provider chain and retry budget; route fallback using the real evidence packet, or return an unavailable explanation. Record selected provider/model and fallback reason in the job. Never return a generic positive narrative after provider failure.

## Agent-by-agent assessment

The project has **11 specialist identities**, not 11 independently autonomous live tool loops. The executed path primarily uses predetermined collectors; optional models explain their evidence. News uses a separate deterministic retrieval flow. This can be a good design for reproducibility, but the documentation claiming a general bounded tool-calling loop does not describe the actual path.

| Agent | Actual work observed | Main limitation | Concrete next step |
|---|---|---|---|
| Financial | Company metrics; annual/quarterly income; annual balance/cash flow; deterministic margins, debt/equity, revenue growth | Collector does not generate all advertised ROE/ROCE/FCF analysis; provider coverage differs by company. Report templates can add missing values. Only a short annual history is retained. | Add typed ROE/ROCE/FCF/share-count inputs and fiscal-basis checks; preserve losses/zeros; retain enough periods for true YoY and multi-year trends. |
| Valuation | Quote/metrics; P/E and P/B calculations; peer/historical tools called | Historical result is fetched but not added to collector evidence. Peer selection uses other query entities; a single-company run has no verified sector cohort. Advertised EV/EBITDA, P/S, PEG, FCF yield are not computed in this collector. | Persist historical/peer evidence; resolve comparable peers explicitly; add ratios only with compatible dated inputs; label unavailable metrics. |
| Market | Quote, 1-year history, technicals, volume, benchmark | Latest fast-info quote may lack an as-of timestamp. Closing-price range is not intraday 52-week high/low. Benchmark differs from a sector benchmark. | Carry quote time, currency, session state, adjustment basis, and trading calendar. Keep closing-range labels precise; add sector comparison only with a real cohort. |
| News | Deep RSS retrieval, date/entity filtering, deduplication, fetches accessible articles | Better date hygiene than most other collectors, but headline/article content is publisher reporting, not independent verification. Empty direct results report completed. | Fix empty status; preserve publisher dates; distinguish announcement, news report, and verified primary disclosure; test aliases and broad/ambiguous company names. |
| Growth | One public search query; up to four snippets; optional explanation | No original-page fetching or document tools in the configured path. No enforced announced/started/executing/completed record structure. | Fetch original company disclosures; create initiative records with status, date, source, amount, and delivery evidence. |
| Risk | One public search query about debt/litigation/concentration | No mandatory financial/document cross-check or separate thesis-breaking investigation. Search snippets dominate. | Require at least one explicit downside hypothesis, investigation steps, primary support, and a recorded outcome; combine actual financial and legal disclosures. |
| Workforce | Public official-ATS-style jobs search plus web snippets | Current listings cannot establish hiring velocity or attrition. The domain check is a blocklist, not a verified company/ATS allowlist; it allows unrelated sites. | Resolve verified company career domains, store dated snapshots for growth measures, and use sourced headcount/attrition disclosures. Never infer velocity from one listing. |
| Social | One web query for public investor discussion | No sampling/relevance/deduplication framework or original discussion retrieval; not representative sentiment. | Keep qualitative only; specify platform/date/sample size and limitations. Add numeric sentiment only with an explicit reproducible method and permitted sources. |
| Document | Selected document IDs; chunk search; preserves page/document attribution | Main UI has no wired upload/selection control; section/date metadata is not fully propagated to evidence; vector alignment defect; filter-after-top-20 can miss relevant selected documents. | Fix index consistency, implement upload/selection/removal, enforce ownership, carry page/section/date, and use filtered retrieval that cannot lose selected documents to unrelated global hits. |
| Industry | One search query for demand/competition/sector outlook | Snippets do not establish market size, peer comparability, or measured moats. | Gather dated sector filings, industry classification, actual comparable metrics, and explicit assumptions. |
| Management | One search query for board/governance/capital allocation | No direct board, promoter pledge, compensation, related-party, audit, or capital-allocation disclosure ingestion. | Build a structured governance checklist from filings, with dates and distinction between allegations and established events. |

In the isolated outage probe, all collectors attempted their expected retrieval tools and recorded missing data. Arithmetic tools were appropriately not called when inputs were absent. News's direct empty result was the status exception described above. These checks do not prove that each provider returns usable results for every company.

Broad company research deterministically activates nine specialists, excluding document/social unless relevant. News-only routing remains focused. No agent-count cap silently removes required broad coverage in the current routing policy; the four-agent setting limits concurrent execution, not selection. The normal collector limits comparisons to four entities and records a gap for larger sets.

## Financial methodology and evidence quality

### D06 — Negative metric parsing loses the sign

**Reproduced.** `_parse_float('-10.5%')` returned `10.5`. The comparison ranking can treat negative operating margin or ROE as positive. The same parser returns zero for missing values, so an unavailable P/E can score as very cheap.

**Recommendation:** use typed signed numbers through the pipeline. Keep missing as `null`; exclude or separately classify companies lacking mandatory ranking inputs. Show score components and avoid applying one ranking formula across unrelated sectors.

### D07 — Currency and fiscal basis can be mislabeled at assembly

**Code-confirmed.** `assemble_report` defaults currency to INR when the market section lacks its own currency. A price evidence record can be picked without carrying its evidence unit into the displayed currency. `_fiscal_quarter_label` uses Indian fiscal conventions globally. ADR price, financial currency, and listing currency can differ.

**Recommendation:** choose currency from the selected typed price record, attach fiscal-calendar metadata to each entity, and reject mixed-currency/period combinations. Preserve consolidated/standalone and quarterly/annual/TTM basis on every metric. Add US-company, ADR, bank, loss-making-company, and cross-currency fixtures.

### D08 — Metrics and rankings ignore coverage and comparability

**Code-confirmed.** `_measurements` selects the first matching metric instead of an explicit latest/compatible period. It marks operating margin ≥20% and P/E ≤18 as good without industry context. Comparisons use a fixed OPM/ROE/debt and P/E/dividend formula. Scenario matrices use fixed 0.82/1.00/1.15/1.30 multipliers and can default missing P/E or price. Some bank narratives use default NIM/NPA/CRAR figures.

**Recommendation:** use entity/period/basis keys and an explicit precedence policy. Treat a scenario as a user-visible sensitivity assumption, not fair value or a forecast. Choose sector-appropriate metrics; require minimum complete comparable inputs before selecting a “winner.”

### D09 — Validation checks presence more than factual truth

**Reproduced/code-confirmed.** `validation/pipeline.py` records `date_known` but does not include it in pass criteria; a probe with no publication date passed. Source trust uses substrings such as yfinance/NSE/jobs. Numeric consistency does not recompute the supplied formula from inputs, and `relevance=None` passes without establishing entity relevance. `_safe_prose` checks links and numeric tokens, not whether a cited fact semantically supports the conclusion.

Unknown publication dates need not reject every feed snapshot, but they must remain unknown and must not support a “latest announcement” claim. Introduce checks by evidence type: source identity, entity resolution, period/basis, recomputed calculations, freshness requirements, and genuine support for each narrative claim.

### D10 — Agent notes and charts overstate verification

**Code-confirmed.** `_agent_notes` can invent a generic “audited/verified” finding for an empty agent and attach the first available citation, possibly another agent's source. The catalysts chart counts bull/bear strings while labeling the result “Verified Primary Evidence Points.” Counting arguments is not counting independently verified primary sources or measuring confidence.

**Recommendation:** show the actual tool activity, gaps, and supported findings only. A source from another specialist does not establish work this specialist did not perform. Relabel the chart as argument counts or build it from deduplicated, explicitly primary evidence.

## UI, mobile, authentication, and persistence

### U01 — Desktop dossier and FAQ ticker actions throw ReferenceError

**Reproduced in Chromium.** `LandingExperience.jsx`, around lines 2086 and 2223.

Both use `onSelectSuggestion?.(...)`, but that identifier is not defined. Optional chaining does not protect an undeclared identifier. Clicking the dossier audit action and an FAQ ticker produced `onSelectSuggestion is not defined`.

**Recommendation:** use a declared prop/callback or the existing query/run callback with one documented behavior. Verify the full action through a user-level click, including navigation and the resulting query.

### U02 — Mobile sign-out is broken

**Reproduced in Chromium.** `MobileLanding.jsx`, around line 521.

The component uses `onLogout?.()` without receiving/declaring `onLogout`. Clicking Sign Out raised `onLogout is not defined` and left the session in localStorage.

**Recommendation:** wire the existing logout prop and test both Firebase-authenticated and guest/local sessions. Verify the user state, cloud auth state, private history, and navigation after logout.

### U03 — A Copilot answer fallback references an undefined job

**Code-confirmed by lint.** `ArthaCopilot.jsx`, `synthesizeReportAnswer`, around line 314.

This helper references `job` outside the component scope. When report-specific matching falls through, the UI can produce an error answer rather than the expected generic/report response.

**Recommendation:** pass explicit context into the helper. Preserve the backend's unavailable/fresh-research response; do not replace it based on a fragile substring match. Add a user interaction for an unsupported follow-up.

### U04 — Login controls are clipped on short screens

**Reproduced in a Chromium mobile/touch context.** `styles/arthalens-perfect-fit.css`, global viewport lock; `Login.jsx`, welcome-page layout.

The global body/root locks overflow, while login has an expanding minimum height rather than a constrained scrolling height. At 320×568 the login element measured approximately 903px tall in the targeted mobile context. Its guest button was below the viewport; scrolling by 600px did not move body, root, or login. Signup measured 963px. In 844×390 landscape, signup was about 927px tall.

A separate automated `scrollIntoView` could force an ancestor's scroll position and click the guest button. That does not mean ordinary touch/wheel scrolling works.

**Recommendation:** give login a viewport-constrained scroll container with `min-height: 0` where needed, or allow normal document scrolling on that route. Do not globally lock the document without making every page own a real scroll area. Verify login, signup, errors, reset mode, keyboard opening, and landscape.

### U05 — Login typography and accessibility need correction

**Measured/code-confirmed.** Login inputs render at 14px; on iOS Safari, fields below 16px commonly trigger viewport zoom. This Safari effect was not directly tested. The automated 390px scan found login divider contrast of 3.38:1 and chat helper text contrast of 3.65:1, below the applicable 4.5:1 minimum.

Labels have no explicit `htmlFor`/input IDs, fields lack useful autocomplete attributes, password toggling has a very small icon hit area, and feedback lacks explicit live/alert semantics. Some placeholders act as accessible names, which is weaker than correctly associated persistent labels.

**Recommendation:** use 16px mobile inputs, associated labels, `name` and appropriate autocomplete tokens, 44px touch targets for compact icons, and announced validation feedback. Test keyboard navigation, VoiceOver/TalkBack, zoom, large text, and contrast.

### U06 — Responsive CSS is difficult to maintain and assumes fixed content height

**Risk/code-confirmed.** Multiple large stylesheets have overlapping `!important` rules, fixed viewport section heights, clipping, and different 767/768/820px breakpoints. Landscape 844px selects desktop landing. Some unused/offscreen sidebar and marquee controls are intentionally outside viewport bounds; they were not counted as document-overflow bugs.

**Recommendation:** consolidate shared tokens, align breakpoints, choose behavior using layout needs and touch capability, and allow content growth at large text/zoom. Use scroll snapping as optional enhancement. Test 200% text, translated copy, safe-area insets, keyboard height, and low-height landscape. Keep the final completed-report tabs that passed the fixture check.

### A01 — Google redirect lifecycle is incomplete

**Code-confirmed; live Google sign-in not retested at the user's request.** `services/firebase.js` imports `getRedirectResult` but does not call it. Redirect is used after popup blocking; the returned `{user:null,error:null}` has no explicit redirect state. Login navigation depends on its immediate callback rather than a clear redirect-return completion path.

The auth observer may restore a successful Firebase session, but redirect errors and route restoration are not surfaced reliably. Cross-site storage behavior also depends on the deployed auth domain and browser. The unauthorized-domain fake-session issue is covered in S02.

**Recommendation:** centralize redirect initialization/error handling and auth readiness, retain intended return route, and test authorized HTTPS hosting on actual Chrome/Safari devices. Treat the current PC/mobile sign-in outcome as unverified until those tests run.

### A02 — Local and remote session ownership are mixed

**Code-confirmed.** `chatSessions.js` uses one global local-history key. Logout does not clear/switch that history. App startup merges global backend history. Auth initialization accepts locally stored non-guest objects, and auth loading remains false rather than representing Firebase initialization.

**Recommendation:** separate local histories by verified UID or guest session; clear private in-memory data on logout; wait for auth initialization before fetching private history; fetch only owner-scoped backend data. Handle cloud failures visibly and make migration of guest data explicit.

### A03 — Cloud PDF persistence is exposed but not wired into completed-report flow

**Code-confirmed.** `persistReportPdfToStorage` is imported into StudioPage but no call was found in the active component. The storage helpers exist, but the main render/completion path does not demonstrate automatic upload. Cloud conversations cannot make instance-local backend PDFs durable on their own.

**Recommendation:** persist PDFs as part of backend completion or an explicit reliable save action; store object metadata, owner, checksum, and retention policy. Report upload failures and retry state. Do not advertise cross-device saved PDFs until that lifecycle is exercised.

### A04 — Free report usage is charged before successful submission

**Code-confirmed.** `App.jsx` records guest usage before `start(trimmed)` succeeds. A server/provider submission failure can consume the only free report without producing a result. Login triggered at the limit closes the modal but does not explicitly resume the blocked research request.

**Recommendation:** implement server-side reservation/commit/refund semantics and explicit pending-intent resumption after login. Define whether a failed research job consumes quota, and make that decision visible.

## PDF, deployment, and maintainability improvements

1. **PDF production engine mismatch.** The requirements/Dockerfile install WeasyPrint dependencies, but current `render_pdf` uses a discovered Chrome/Edge browser and then fpdf. The Dockerfile does not install a browser. Production is therefore expected to take the reduced fpdf path unless the image supplies one separately. Make one supported renderer explicit and test inside the actual deployment image. Keep Unicode fonts so international names and financial symbols survive fallback rendering.
2. **PDF viewer depends on remote assets.** The worker and CMaps come from CDNs. Self-host compatible assets, cancel/destroy loading tasks/documents on unmount, and cap rendering for long PDFs. Current phone canvas width clamps can make “zoom” improve bitmap resolution without materially enlarging the page; verify zoom/pan with a real long PDF. Expose a usable download/open alternative on phones if canvas rendering fails.
3. **Dependency declarations are not reproducible enough.** Backend requirements use broad lower bounds, and matplotlib is directly used for charts but not explicitly listed. The project virtualenv lacks the test runner. Align actual imports, lock/install workflow, and documented environment. A clean-container build should run tests and report generation without relying on packages from the developer's global Python.
4. **Initial assets are large.** Latest observed production output: initial JS 1,043.57kB / 277.86kB gzip; StudioPage JS 579.50kB / 151.44kB gzip; CSS 296.77kB / 51.46kB gzip. The build warns about large chunks. Lazy-load auth/PDF/report features, split heavy Firebase services, reduce duplicate landing CSS, and load PDF.js only when a PDF is opened. Measure before/after on a throttled mobile profile; no Lighthouse score is claimed here.
5. **Dead or misleading controls.** Composer “Add context” and “Voice input” buttons have no handlers in the current implementation. `uploadDocument` exists in the API client without an active upload/selection UI. Implement them or remove/disable them with honest feedback.
6. **Product identity and install assets drift.** ArthaLens, Artha AI, and Bullseye names coexist in title/manifest/components/PDF metadata. The manifest references `/brand/favicon-180.png`, while the available asset is `apple-touch-icon.png` and the relevant favicon sizes differ. Standardize brand/name and verify every manifest asset resolves. Do not infer offline/install reliability merely from a manifest; no service-worker implementation was found.
7. **Health and activity are not live provider status.** Registry health instantiates local classes; `/api/health` explicitly says provider connectivity is not checked. Landing badges and demo figures should not imply live provider health. Track real adapter latency/error/freshness and label static demo data.
8. **CORS and outbound fetching need tightening.** Production can select wildcard origins with credentialed CORS. Public page/article fetching accepts arbitrary HTTP URLs and redirects with no private-address validation or response-size cap. No SSRF exploit was attempted. Configure explicit origins and enforce a public outbound URL policy at every fetch/redirect boundary, especially if future tools accept user URLs.
9. **Retrieval scale/quality.** The vector index assumes 384 dimensions despite a configurable model. Filters run after global top-k×4 retrieval, which can yield no selected-document results even when relevant chunks exist. The process-local lock does not make file writes atomic across workers. Add model/index versioning, filtered retrieval, transactional persistence, and deletion/reindex support.
10. **Configuration and docs drift.** `ResearchRequest.mode` is accepted but not propagated; `run_flow` hardcodes auto. `checkpoint_db` is configured without an active durable checkpointer. `AGENT_CONTRACTS.md` advertises tools/loops not used by several agents. Update documentation to the executable path and validate any exposed request field.
11. **Privacy/retention lifecycle.** Frontend history deletion is local/Firestore-oriented; there is no backend job/document/artifact deletion API. Define deletion across conversations, PDFs, SQLite/shared database, vectors, and backups; log completed cleanup without exposing private query text broadly.
12. **Maintainability.** Duplicate `pdfUrl` in the API object is a confirmed lint defect, though currently both definitions are identical. Empty catches hide failures. Very large StudioPage, LandingExperience, and report/schema modules blur boundaries between collection, provenance, recommendations, and display. Split by responsibility after fixing behavior; avoid a rewrite that preserves the same unsupported defaults.

## Suggested implementation order

### First: make every report honest

1. Remove date rewriting and static values from production research.
2. Fix missing/zero profit handling and signed parsing.
3. Remove rejected-claim fallbacks and generic positive model fallbacks.
4. Gate all assessments/directives on required evidence; add a final report-wide validation pass.
5. Verify the same truth rules in UI, PDF, Q&A, charts, and source lists.

Useful release criteria: no-evidence runs show no recommendation; old sources retain their dates; every number has a unit/period/entity/source; no missing value silently becomes zero or a profile value; unsupported statements remain absent.

### Next: enforce identity, ownership, and durable work

1. Verify tokens and store owner UID on every resource.
2. Scope history/documents/PDFs/charts/Q&A; enforce server quotas.
3. Repair vector/metadata consistency and missing-PDF recovery.
4. Add job admission limits, end-to-end deadlines, and accurate partial/unavailable status.
5. Introduce a queue/shared database/object store for the intended production architecture.

Useful release criteria: A cannot read B's data; restarts/multiple instances do not lose or misattribute jobs; provider stalls do not block unrelated API requests; PDF/chart artifacts are immutable per job.

### Then: make the actual user journeys reliable

1. Fix desktop ticker actions, mobile logout, and Copilot fallback scope.
2. Correct login scroll ownership, touch targets, 16px input sizing, and contrast.
3. Wire document upload/selection and saved-PDF lifecycle.
4. Validate real-device auth, keyboard, orientation, report switching, download, and logout.
5. Update the stale browser tests around the final product behavior.

### Finally: improve research depth and performance

Expand primary-source ingestion, sector-aware metrics, comparable peers, bank metrics, dated workforce snapshots, and meaningful risk investigations. Optimize bundle/CSS/PDF rendering based on measurements. Add feature work only after the report and privacy acceptance criteria pass.

## Tests and evaluations that would close the gaps

Existing passing tests leave important behavior unchecked. For example, `test_report_never_trusts_model_defaults_or_keyword_recommendations` checks classification, empty metrics, and absence of one original number, but does not inspect the substituted executive summary. That is why D02 passes through the suite.

Add meaningful behavior assertions for:

- Zero evidence, losses, zero profit, missing EPS, negative margins, historical source dates, undated sources, and unsupported evidence IDs across the entire serialized report.
- Unknown tickers, US firms, ADRs, bank/non-bank comparisons, currency mismatch, restatements, consolidated/standalone differences, and quarterly/TTM/annual mixing.
- Owner A/B/guest resource boundaries, token expiry, localStorage tampering, quota reservations, repeated submission, and cleanup.
- Embedding failure then recovery, restart, index/metadata mismatch, selected-document retrieval, and concurrent uploads.
- DDGS outage/RSS fallback; agent/model timeout; accurate unavailable states; saturated job capacity; responsive polling under stalls.
- Real user clicks for dossier tickers, FAQ tickers, mobile logout, unsupported Copilot follow-up, login/signup scrolling, keyboard opening, completed tabs, PDF download, and document upload.
- A clean deployment-image install, real PDF text/provenance, Unicode rendering, and two concurrent jobs' charts.

For agent quality, use a versioned set of 20–50 questions covering Indian/US companies, banks, loss-making businesses, comparisons, news, documents, and true provider outages. Score entity correctness, required coverage, source freshness, citation support, numerical accuracy, appropriate unavailable responses, runtime, and request cost. Do not use agent count or attractive output as the quality measure.

## Local evidence and artifacts

All paths below are relative to `artha-ai/` unless otherwise stated.

| Artifact | Contents |
|---|---|
| `scratch/project_audit_probes.py` | Isolated backend/agent/provenance/ownership/RAG reproductions. |
| `scratch/project_audit_probes.json` | Exact reproduced outputs, all 11 agent tool traces, unauthenticated API reads, missing-PDF 500. |
| `scratch/project-audit-ui.cjs` | Chromium viewport/accessibility/action audit. |
| `scratch/project-audit-ui.json` | 27 measurements, accessibility results, desktop action errors, mobile logout error. |
| `scratch/project-audit-targeted.cjs` | Mobile login scroll and completed-report tab fixture. |
| `scratch/project-audit-targeted.json` | Manual-scroll metrics and passing completed-report tab visibility checks. |
| `scratch/audit-login-320.png`, `scratch/audit-login-390.png` | Observed login screenshots. |
| `scratch/project-audit-pytest.log` | Successful 100-test backend run. |
| `scratch/project-audit-frontend-tests-final.log` | Successful 53-test frontend run. |
| `scratch/project-audit-lint-final.log` | Latest 20 lint errors and 7 warnings. |
| `scratch/project-audit-build-final.log` | Successful production build and asset sizes. |
| `scratch/project-audit-e2e.log` | Existing browser suite: 1 pass, 2 failures. |

The fixtures deliberately used synthetic companies/data to make false fallbacks obvious. They are audit evidence, not stock research. Some artifacts live in an ignored scratch directory; retain them explicitly if you need to share the evidence with a reviewer.

## Recommendations: report wording, layout, and in-app preview

Added 22 October 2026. **This section contains recommendations for future improvements to the existing report and app preview. These recommendations have not been implemented by this audit.** Observations below explain the recommendations and retain their review date and verification limits; they do not change the evidence labels or test results of the original 21 October bug audit.

Keep the current report identity, section cards, financial tables, strengths/risks panels, watchlist, and Beginner/Expert choice. The highest-value upgrades are simpler wording, one consistent conclusion, larger readable type, fewer repeated blocks, and easier access to evidence. More decoration will not solve the current reading problems.

This document proposes changes; it does not implement a new report design. Application source was not edited by this review. Local measurement scripts, extracted text, screenshots, and this document were created.

### What was actually inspected

- The three newest saved research PDFs at inspection time: `research_9689fddbd420.pdf`, `research_48848c7f0d66.pdf`, and `research_a9df67a369cb.pdf`, generated on 22 October. Their matching saved report JSON and job records were read locally.
- Two older layout samples: `test_master_compare_report.pdf` and `test_single_stock_layout_v2.pdf`. These are historical references, not proof of today's comparison output.
- The current equity and news PDF templates, report assembly, chart generation, inline report card, full report preview, Studio integration, and PDF viewer.
- The real Studio application with a saved completed-report fixture at 1440×1000 and 390×844. The inline card, PDF opening, Beginner view, and Expert view were exercised. External requests were blocked; the PDF worker was supplied from the installed local package. No new stock research or provider requests were started.

The workspace changed during the review. Initial Studio code showed an inline brief and PDF; later code connected `ReportPreview` into the active report screen. The final browser checks include that connected version, observed around commit `bb9ceb7`, with additional edits occurring outside this review. The older “preview is not connected” observation should not be treated as a current defect. Recheck line numbers when implementing suggestions.

These measurements establish local Chromium behavior, not actual iPhone Safari behavior or all report types. The saved reports were inspected as product output; this review does not certify their financial claims.

### The current reading problems

| Observation | Why it matters | Upgrade within the existing design |
|---|---|---|
| Latest populated PDF has 4 pages and approximately 3,034 words; page 1 alone has 914 words. | The supposed quick summary requires substantial reading. | Put a 100–150-word answer and 3–5 key findings first; move supporting detail into the existing later sections. |
| About 98% of page-1 text is below 8pt; practically all text on pages 2–4 is below 8pt. Common sizes are 5–7pt. | It is hard to read at normal print size and extremely small when fitted to a phone. | Increase body text to roughly 10.5–11pt and tables to roughly 9–10pt. Shorten copy before shrinking type. |
| The pages still leave large blank bottom areas. | Tiny text is not required by the available page space. Forced breaks and compact styling work against each other. | Redistribute sections and use natural pagination, keeping breaks only where they improve reading. |
| Verdict, action hero, market role, strategic pillars, executive summary, action framework, and investor-profile table repeat related conclusions. | Repetition adds length without improving the reader's decision. | State the answer once, explain it once, then show supporting facts and conditions. |
| One saved PDF says CAUTIOUS but also says KEEP HOLDING / BUY ON DIPS. | The reader cannot tell which conclusion controls the report. | Make all summary and action wording derive from one evidence-supported assessment; unresolved evidence should produce an unavailable assessment. |
| The margin is 24.80% in the KPI strip and 25.20% elsewhere. | Different periods are not identified; defaults can look like measured facts. | Use one selected metric record per entity/period/basis and label legitimate period differences. |
| A YoY growth column contains QoQ rows. | Readers compare two different growth measures as though they were the same. | Split YoY and QoQ, or label each row's comparison basis explicitly. |
| The saved run resolved no companies and established no typed financial ratios, yet the PDF presents a BEL profile, quarters, peers, and buy instructions. | Improving the appearance would make unsupported information more convincing. | Remove fallback company facts and directives from production output; show the actual scope and missing inputs. This is a prerequisite for the wording work. |
| The PDF header says 14 October although the report was assembled on 22 October. | Readers cannot assess recency. | Show the actual generation date, quote timestamp, and financial period separately. |
| The inline card flattens a 282-word summary into one paragraph at 13px. | Intended bullets and paragraph separation disappear. | Render structured short paragraphs/bullets and offer “Read more” for detail. |
| The inline card labels missing-information messages as Downside Risks. | A retrieval failure is confused with a weakness in the business. | Give business risks and unavailable information separate blocks. |
| The mobile inline card is about 1,375px tall; Beginner report content is about 9,077px tall and Expert about 18,071px for this fixture. | Important information requires many screens of scrolling. | Reduce repeated summaries, collapse optional detail, and provide a short section navigator. These heights are fixture measurements, not targets for every report. |
| The mobile Copilot floating button overlaps summary text in the report screenshot. | Reading and tapping compete for the same space. | Reserve space for the floating control, use a dock, or keep it in normal flow. |
| On mobile, zooming PDF from 100% to 115% leaves displayed width approximately 372px while increasing bitmap width from 892 to 1,026 pixels. | The page becomes sharper but the text does not meaningfully enlarge. | Separate fit-to-width from zoom; zoom must increase displayed width and allow horizontal pan. |

The final browser fixture successfully opened both report modes and the PDF with no recorded page errors and no document-wide horizontal overflow. That does not establish that every table, source, or report variant is correct.

### 1. Make the wording understandable without changing the meaning

Aim for a reader who understands everyday English but has never read a balance sheet. Use common words and explain a financial term at its first appearance. Keep the actual term available so the reader learns it.

#### Writing rules

1. Lead each section with the finding, not a description of the analysis process.
2. Prefer sentences of about 12–20 words; treat 25+ words as a review signal, not an automatic rejection.
3. Use one idea per sentence and two or three sentences per paragraph.
4. Follow important numbers with a short explanation of what they mean.
5. Distinguish a reported fact, a calculation, an interpretation, and a scenario assumption.
6. Use conditional language when the evidence is conditional. Do not add reassuring words just to sound simple.
7. Replace generic claims with specific supported observations. “Strong fundamentals” should say which measure is strong and compared with what.
8. Use normal sentence case. All-capital action paragraphs feel like warnings or advertising and are harder to scan.
9. Remove repeated prefixes such as “Plain English Executive Summary” from the content when the section heading already says “Summary.”
10. Keep citation links in the simple view. A novice should be able to inspect a source without switching to Expert.

#### Replace current terminology

| Current wording | Suggested wording |
|---|---|
| Equity Research Dossier | Stock research report |
| Executive Decision & Consensus Verdict | Summary |
| Executive Analytical Synthesis & Plain-Language Guidance | What the findings mean |
| Fresh Capital Deployment | If you are considering buying |
| Investment Persona & Role | Company profile |
| Core Investment Thesis & Strategic Pillars Rubric | Main reasons behind the assessment |
| Core Fundamental Multiples Audit | Financial health and share valuation |
| Audited Quarterly Financial Progression | Recent quarterly results |
| Valuation Sensitivity Analysis | How different assumptions affect the price |
| Strategic Growth Drivers vs Downside Vulnerabilities | Strengths and risks |
| Strategic Pivot Catalysts | What could change this assessment |
| Quarterly Monitoring Indicators & Early-Warning Triggers | What to check next quarter |
| Falsification Rubric | Signs that would weaken the assessment |
| Specialist Multi-Agent Reasoning Grid | Research coverage |
| Intentional Analysis Boundaries & Negative Disclosures | What this report could not establish |
| Verified Primary Evidence Citations Index | Sources |
| Research Governance & Verification Protocol | How this report was prepared |
| Operational resilience / solvency cushion | Ability to handle weaker business conditions / debt pressure |
| Multiple compression / re-rating | Investors paying less / more for the same earnings |
| Dry powder | Cash kept available for future purchases |
| SOTA | Remove; a technical quality label does not explain company quality or research reliability. |

“Reported” is usually a better label than “audited” unless the specific source and financial period were actually audited. Quarterly results and news articles do not automatically qualify.

#### Explain metrics carefully

The following examples demonstrate wording only. Their values must not become defaults in generated reports.

| Metric | Plain wording | Limit to preserve |
|---|---|---|
| Revenue | “Sales were ₹1,000 crore in the quarter.” | Add the quarter, currency, and consolidated/standalone basis. Revenue is not profit. |
| Net profit / PAT | “After costs and tax, the company reported ₹100 crore profit.” | A loss must stay a loss; missing profit must stay unavailable. Profit is not cash received. |
| Operating margin, 20% | “The company kept ₹20 of operating profit from every ₹100 of sales, before interest and tax.” | This does not describe net profit or cash flow. |
| ROE, 18% | “Annual net profit was about ₹18 for each ₹100 of average shareholder equity.” | It does not mean shareholders earned an 18% stock return. Negative or unusually small equity can make ROE misleading. |
| Debt/equity, 0.30x | “Debt was ₹30 for each ₹100 of shareholder equity.” | Low debt alone cannot establish cash safety; use the actual debt definition. |
| P/E, 25x | “The share price was 25 times earnings per share over the last 12 months.” | A P/E alone does not establish cheapness; growth, sector, accounting basis, and losses matter. |
| Dividend yield, 2% | “The annual dividend used in this calculation equals 2% of the reference share price.” | Past dividends are not guaranteed future payments. State trailing or expected basis. |
| Cash flow | “Cash generated by business operations was ₹X.” | Keep operating cash flow separate from profit, investing cash flow, and free cash flow. |
| Margin change | “Operating margin fell from 20% to 18%, a decrease of 2 percentage points.” | Percentage points and percentage changes are different. |
| YoY / QoQ | “Compared with the same quarter last year / the previous quarter.” | Never mix these under an unlabeled growth column. |

#### Delete or rewrite these current claims

- “Zero danger of running out of cash.” Replace with the observed debt/cash position and what remains unknown.
- “Your investment is safe” and “very safe asset to hold.” Do not promise a safe outcome from company metrics.
- “Super profitable,” “pristine,” “net cash fortress,” “proven wealth compounder,” and “premier beneficiary.” Replace with dated facts and appropriate comparison.
- “Panic selling is strongly discouraged” and “sell only if.” Replace with supported conditions for reviewing the assessment; avoid inventing a personal instruction.
- “Attractive entry valuation” based only on a P/E threshold. Explain the actual peer/historical comparison and limitations, or say valuation was not established.
- “100% verified,” “audit grade,” “fiduciary standard,” and the news template's “SEBI/NSE Audit Compliant.” Do not present an internal checklist as external certification or factual certainty.

The current plain-summary helper in `ReportPreview.jsx` chooses business claims from classification keywords. A BUY label does not prove sales growth; a SELL label does not prove rising debt. Simplification must use the supported findings behind the assessment.

#### Example for the actual inspected incomplete run

“This run found eight news sources, but it did not resolve a company or establish the financial figures needed for a stock assessment. Seven news items were available only as headlines or short excerpts. We cannot judge valuation, debt strength, or whether a stock is suitable to buy from this information. Select a company or ticker to continue.”

This is the appropriate wording for that evidence state. Rewriting the fabricated BEL summary into friendly language would preserve the underlying error.

For a sufficiently supported run, the summary can follow this pattern: answer to the question; strongest supporting finding; main risk; important limitation; what to check next. Only fill slots supported by the run.

### 2. Keep, merge, add, and remove

| Existing piece | Recommended action | Specific adjustment |
|---|---|---|
| Brand masthead and question | Keep, simplify | Company/ticker first, then question, actual report date and scope. Reduce the tagline. |
| KPI strip | Keep | Limit to 4–5 useful values. Show value, period, and a short label. Remove fixed quality scores and fallback figures. |
| Verdict hero | Keep | One clear answer with 2–3 reasons. A missing assessment is an explicit state. |
| Market snapshot | Keep when relevant | Label quote time, price currency, adjustment basis, and date range. Remove repeated investment persona/action badges. |
| Strategic pillars + executive synthesis | Merge overlapping content | Keep a short “why” section. Remove a row if it only repeats the summary. |
| Financial ratios | Keep | Value + period + one-sentence meaning; formulas and calculation inputs belong in expandable detail or an appendix. |
| Quarterly results | Keep | Chronological periods for trends; separate revenue, profit, and growth basis; cite rows. Preserve missing values. |
| Peer comparison | Keep when valid | Comparable businesses, common period/currency/basis, and a stated selection reason. Cross-sector portfolios need different labels and analysis. |
| Valuation scenarios | Keep as optional detail | Name assumptions, show EPS/earnings basis, and label outputs as scenarios rather than forecasts or targets. |
| Strengths and risks | Keep | Usually 2–4 supported points per side. Each point should explain likely business impact and uncertainty. |
| Action framework + investor-profile table | Merge | Use one concise conditions table if the question calls for it. Remove duplicate portfolio percentages and automatic buy/hold advice. |
| What could change the view + monitoring table | Merge related items | Indicator, current baseline, relevant change, next check date/event. Avoid generic “monitor everything” lists. |
| Step-by-step deductions | Shorten | Explain observable evidence-to-conclusion links. Keep technical traces out of the main narrative. |
| Agent grid | Move to secondary detail | A coverage table with checked/partial/unavailable status and sources is more useful than nine generic prose cards. |
| Sources | Keep and improve | Preserve every cited source; show publisher, title, publication date, document page, and a clickable reference. |
| Governance table + long footer | Shorten | Actual preparation method and known limitations, once. Keep a short research-use notice readable. |
| Boilerplate text for empty sections | Remove | Show one honest “Not available in this run” line and its consequence, not an invented finding. |

#### Add information that answers real reader questions

- **What the company does:** two sourced sentences about products/customers and how it earns revenue.
- **Reporting basis:** company/listing, currency, financial period, consolidated or standalone, quote timestamp, and report generation timestamp.
- **Meaning beside the number:** a short explanation directly under important KPI/table values.
- **Trend context:** current value versus a comparable earlier period, not a floating percentage.
- **A short “What we could not confirm” block:** important omissions and how they restrict the assessment.
- **A small glossary:** only terms used in this report, with tap-to-open definitions in the app.
- **Source type:** company filing, exchange disclosure, market-data feed, publisher report, or headline-only excerpt. Label these accurately.
- **Next review event:** the next earnings release or another sourced event; use “date not confirmed” when necessary.
- **One compact takeaway below a complex table/chart:** what it shows and what it does not show.

These can fit in existing cards and later sections. Do not add each as another full page by default.

### 3. Improve the current PDF layout

#### Typography and spacing

- Start with body text around **10.5–11pt**, table text **9–10pt**, source notes **8.5–9pt**, section headings **13–15pt**, and a report title around **18–22pt**. These are starting design values to verify in print, not universal compliance thresholds.
- Use line height around **1.4–1.5** for prose and **1.25–1.35** for tables. Increase row padding enough to separate values clearly.
- Use one body font family and consistent heading weights. Reserve monospaced type for selected numbers/identifiers rather than every label.
- Make title → section heading → finding → supporting note visibly distinct. Currently many headings and body rows differ by less than two points.
- Reduce all-capital headings, narrow letter spacing, and tiny secondary labels. Prefer “Recent quarterly results” over a long capitalized technical heading.
- Keep the white page and existing navy/blue identity. Use light panel fills and subtle dividers. Reserve green/red/amber for supported positive/risk/unavailable meaning, accompanied by text.
- Use deliberate white space between sections. Remove repeated border-within-border containers where one panel can establish hierarchy.

Do not enforce “exactly four pages” by shrinking text. A focused report may need fewer pages; a comparison or document-heavy query may need more. The report should be as short as its supported answer allows.

#### Pagination and tables

- Use the existing sequence—summary, supporting financials, strengths/risks and watchlist, sources—but rebalance the space within it.
- Keep headings with the first paragraph/row. Prevent an individual short row/card splitting badly; allow long tables and long sections to continue naturally.
- Repeat table headers on continuation pages. Use a small “continued” label where useful.
- Avoid applying `break-inside: avoid` to every large section: an oversized section must be able to span pages.
- Add unobtrusive page X of Y, company/report reference, and date. Remove hardcoded page-number labels that become wrong after content grows.
- Right-align numbers, use tabular numerals, and keep units in headers where all rows share a unit. Use one rounding policy; avoid unnecessary 25.20% when 25.2% communicates the precision supported.
- Wrap entity names and explanations. Keep numeric columns legible; split wide comparisons into grouped tables or use an explicitly labeled landscape appendix when needed.
- Display financial periods consistently, for example “Quarter ended 30 Jun 2026 (Q1 FY27).” Fiscal labels must follow the company's calendar.
- Use “Not available” for missing values and explain the gap once. A dash, zero, and not applicable should not be interchangeable.

#### Sources and references

The current equity template prints only `report.sources[:15]`. This can omit sources referenced elsewhere when a report has more than 15 sources. Include all cited references, with an appendix if necessary; do not silently truncate the reference list.

In the inspected PDF, external URLs are linked in the sources section, but the main text's bracketed markers are not internal jump links. Make `[n]` jump to the reference entry, and link the entry to the original source. Include page/section for uploaded documents and preserve unavailable publication dates.

A short clickable publisher/title is easier to read than a long raw URL. The full destination should remain intact. Add bookmarks for main PDF sections and selectable text. Verify reading order and tagged-PDF accessibility with the chosen renderer before advertising accessible output.

### 4. Upgrade the app report preview

Keep the existing dark cards and Beginner/Expert control. Both views should present the same facts and assessment; Expert adds inputs, calculations, and source detail. It should not change the conclusion or make citations available only to advanced readers.

#### Inline chat report card

- Show a 60–100-word answer and up to three key points. Expand to read the full summary rather than showing several hundred words immediately.
- Preserve paragraphs, bullets, and links using structured blocks. A raw string in one `<p>` collapses intended paragraph breaks.
- Read metrics from the canonical `report.financial.metrics`; the current card reads `company.metrics` or `report.metrics`, which can omit valid financial metrics in other runs.
- Read strengths/risks from the canonical `bull_case`/`bear_case`. The current card reads alternate thesis keys, then substitutes evidence gaps for risks. An existing bull case can therefore disappear while missing-information notices look like company risks.
- Keep “Not enough information” separate from “Business risks.” Both matter but imply different actions.
- Do not add `%` or `x` blindly to preformatted strings. Use typed values and units to avoid duplicate symbols.
- Replace “Synthesis Rationale” with “Why this assessment” and “Open Institutional PDF Dossier”/“PDF Dossier” with a clear “View PDF.”
- Keep one main “Read report” action, then PDF/download. The current newly connected in-app report action is useful; retain it.
- Wrap important risk text or offer expansion. The current clipped list hides a material limitation on the phone.

#### Full Beginner view

- Put the answer ahead of detailed research metadata. In the mobile screenshot, brand, question, controls, counts, and several headings consume most of the first screen before the answer is readable.
- Keep company, question, short assessment, and main limitation near the top. Move detailed coverage counts into a compact expandable row.
- Start body text around **15–16px** on mobile and **14–16px** on desktop, with comfortable line height. Reserve 12px or smaller text for secondary metadata, not the explanation of an investment risk.
- Merge the plain-summary card and lengthy synthesis when they repeat the same answer. Do not repeat an executive hero above another beginner hero describing the same report.
- Use a single content column on phones. Avoid several nested cards/paddings that leave little horizontal reading space.
- Explain metrics inline or through tap-to-open help. Tooltips that require hovering are insufficient on mobile.
- Preserve citation markers in strengths, risks, and summary. The current `stripCitations` calls remove them from several beginner lists.
- Keep material limitations visible in both modes. Deduplicate the 19 raw gap messages in this fixture into a few meaningful coverage statements, retaining the original trace in technical detail.

#### Expert view and navigation

- Keep the existing tabs but shorten names: Overview, Financials, Charts, Strengths & Risks, Coverage, Sources, Method.
- On mobile, provide a compact section picker or a scrollable navigation row instead of multiple rows of long tab labels. Preserve keyboard access and clear selection semantics.
- Consider opening a compact Overview rather than rendering every expert section in the default All view.
- Use expandable calculation inputs and agent activity. The research narrative should show actual supported findings, not repeated accounts of tool execution.
- Add a visible route to the sources and a back-to-overview action for long content. Retain reading position sensibly when switching modes; avoid leaving the reader at an unrelated point.
- Preserve table overflow inside a clearly scrollable container when needed; do not permit whole-page horizontal scrolling. For multi-company mobile comparisons, allow selecting two companies while retaining access to the complete comparison.
- Reserve bottom/safe-area space for the Copilot control so it never covers text, sources, or a table button.
- Use accessible headings, associated tab panels, focus styles, readable contrast, and 44px touch targets as a practical target for compact controls.

#### PDF viewer

- Retain fit-to-width as the initial phone mode, but make zoom change actual displayed dimensions and permit pan/pinch.
- Add page jump and, for longer reports, a compact contents/bookmark control. The current continuous page list is acceptable for short PDFs.
- Make open-in-browser/download alternatives easy to find on phones. Do not rely on a desktop-only new-tab control.
- A canvas-only PDF is an image surface: it does not automatically provide selectable text, clickable citation overlays, search, or screen-reader reading order. Add compatible text/annotation layers or offer the accessible HTML report as the primary reading option.
- Preserve the newly added switch back to the in-app report. Use the current labels and behavior when implementing; the viewer changed during this review.

### 5. Add useful visuals sparingly

The inspected latest PDF has tables and colored panels, but no financial chart images beyond its logo. The equity template does not currently place the generated `charts` into the page. Generating a chart is not the same as displaying it in the PDF.

Prefer one or two visuals that reduce reading effort. Avoid filling empty space with graphics that imply evidence you do not have.

| Visual | Where it helps | Required data/labeling |
|---|---|---|
| Quarterly revenue trend | Shows whether sales grow or fluctuate. | Comparable quarters, currency/unit, financial basis, source, and missing-period handling. |
| Quarterly profit trend | Shows profitability separately from sales. | Actual net profit/loss, matching periods; losses remain below zero. |
| Margin trend | Explains changes in operating performance. | Consistent metric definition and date range; label changes in percentage points. |
| Price trend versus an index | Answers price-performance questions. | Same dates, adjusted-price basis, comparison rebased to 100; mark delayed/as-of data. |
| Peer metric bars | Makes a valid comparison faster to read. | Comparable peers and periods. Use an actual calculated cohort median if showing one. |
| Scenario table or compact range | Shows sensitivity to earnings/multiple assumptions. | Stated assumptions, reference date, no implied probability or forecast claim. |
| Dated event timeline | Useful for a news report or a growth plan. | Real dated announcements; distinguish announced, started, and completed activity. |

For the first version, choose revenue/profit trends where data is complete, then add other charts only when the question needs them.

Avoid pie/donut charts of quality scores, decorative gauges, and arguments-as-confidence graphics. The current catalysts chart counts bull/bear strings yet labels them verified primary evidence points; those counts do not establish investment probability or factual certainty. The financial chart also uses fixed 25/18/14 benchmarks under a sector label. Remove or relabel these until the benchmark and count definitions are supported.

Chart rules: visible date range, unit, source, 1-line takeaway, readable labels, and a table/text alternative. Use bars with a zero baseline; avoid unlabeled dual axes and unnecessary 3D effects. Keep red/green meaning consistent but never rely on color alone. A missing chart should say which inputs are unavailable; a network/image failure should not automatically be described as missing financial evidence.

### 6. Build and optimize the upgrade without a rewrite

#### A practical implementation sequence

1. **Correct the content contract.** Remove fixed dates/scores/metrics, positive empty-state narratives, unsupported directives, and false source classifications. Pick one entity/period/basis for each value. Resolve assessment contradictions before styling them.
2. **Add a small presentation layer to the existing report schema.** Keep the current sections. Add optional structured summary points, definitions, metric meanings, and limitations with evidence IDs. Retain compatibility with older saved reports. Avoid having JSX invent new conclusions from verdict keywords.
3. **Create one formatting policy.** Shared definitions for currency, units, periods, rounding, loss/zero/missing states, and source numbering must govern PDF, preview, inline card, and Q&A. A backend formatter can prepare canonical labels; both renderers still need their own responsive layout.
4. **Consolidate repeated report content.** Merge overlapping summary/action/watchlist blocks and move formulas/tool details to secondary views. Reduce the writing before tuning pagination.
5. **Tune existing print and screen styles separately.** Print uses points/mm and page rules; the app uses responsive pixels/rem and scrolling. Share visual tokens and hierarchy, not one rigid page layout.
6. **Repair preview integration details.** Correct inline-card field mappings, preserve structure/citations, reserve space for Copilot, and keep Beginner/Expert conclusions identical.
7. **Add one supported chart at a time.** Use typed series and stable per-job artifact paths. Wire charts into the PDF deliberately, and skip them when data is incomplete.
8. **Optimize the viewer and artifact lifecycle.** Lazy-load PDF.js, self-host matching worker/CMaps, render visible pages plus a small buffer, cancel and destroy rendering/loading tasks on close, and release canvases/object URLs.
9. **Verify representative saved fixtures, then a clean deployment image.** Renderer fallback and fonts must produce acceptable output in the actual deployment environment.

#### Generation and performance choices

- Use the model for explaining accepted evidence in everyday language. Keep numerical calculation, financial definitions, dates, and chart data deterministic.
- Pass a compact accepted-evidence packet with relevant source IDs, not every raw tool trace, into the wording step. Do not truncate away a risk just to fit a prompt.
- Request structured output and validate it. A useful instruction is: “Explain this evidence for someone new to stocks. Preserve numbers, dates, losses, units, uncertainty, and citations. Do not infer missing company facts from the assessment label.”
- Use word ranges as editorial goals: summary 100–150 words, key bullets roughly 15–30 words, and one paragraph per major interpretation. Allow exceptions when the question requires detail.
- Validate simplified statements against the same accepted findings as the detailed report. Readability alone cannot detect an invented guarantee or reversed loss.
- Keep UI text as HTML, not rasterized text. For exported chart assets, use supported vector formats where the renderer handles them, or appropriately sized 150–200dpi PNGs after checking printed quality. Higher resolution is useful only when it improves visible detail.
- Cache completed artifacts by job/report version; do not silently regenerate old reports against newer templates or data. Store a presentation/template version.
- Generate artifacts in background work with a bounded renderer deadline. Store artifacts per job; fixed shared chart filenames can mix reports.
- Standardize a supported PDF engine and local Unicode fonts. The current renderer tries WeasyPrint, then Chromium, then fpdf. These paths do not have identical layout or content behavior. Test the selected production path and make any reduced fallback explicit.
- Subset/embed fonts appropriately and reduce repeated large images. Optimize after measuring generation time, file size, PDF open time, page rendering memory, and mobile reading responsiveness.
- Do not rerun all eleven agents merely to switch Beginner/Expert or reword a completed report. Both are presentations of the same saved evidence.

### 7. Acceptance criteria before calling the report polished

Use representative fixtures: a supported single company, two/four-company comparison, a bank, a loss-making company, zero evidence, news-only, historical sources, a long uploaded document, and unusually long company names.

**Content**

- The answer addresses the user's actual question; unresolved companies do not become an invented ticker.
- Summary, badges, action conditions, tables, PDF, and Q&A agree on assessment and evidence limits.
- Every important number has an entity, period, unit, basis, and source. Zero, loss, missing, and not applicable remain distinct.
- Plain English preserves uncertainty and does not add “safe,” “guaranteed,” or a cheapness claim from a single ratio.
- All cited sources are available; no 15-source truncation or fabricated dates.
- YoY/QoQ and percentage/percentage-point changes are labeled correctly.

**Reading and layout**

- A new reader can find the answer, the main reason, the main risk, and the biggest missing input in about one minute. Test with several people who did not build the project; ask them to explain those points back in their own words.
- Main PDF text is readable at normal A4 print size; no clipped content, isolated headings, tiny source rows, or incorrect page numbers.
- The phone preview shows the answer early, uses legible text, and has no overlay hiding content. Verify at 320/390px, landscape, large text, and 200% browser zoom.
- Important caveats and citations are accessible without switching to Expert. Expert reveals more detail without changing the answer.
- Keyboard and touch users can navigate sections, open sources, return to the report, and download.
- PDF zoom actually enlarges displayed text. A browser-native/HTML alternative remains available when canvas rendering fails.

**Performance and delivery**

- Opening a PDF loads only what is needed for the visible reading area; closing it frees resources.
- Old/new report schemas render acceptably; missing optional fields do not trigger fabricated defaults.
- Two simultaneous reports retain their own charts and citations.
- The clean production image produces readable Unicode text, working links, and the intended layout.

Readability tools and automated screenshots can support these checks. Human comprehension and evidence accuracy remain separate things to test.

### Evidence files and implementation locations

Review artifacts are under `scratch/report-presentation-review/`:

- `pdf-measurements.json`: page counts, words, font sizes, and PDF links.
- `ui-measurements.json`: inline-card size/text, Beginner/Expert scroll lengths, zoom dimensions, and browser errors.
- `research_9689fddbd420-contact.png`: all four pages together.
- `research_9689fddbd420-page-1.png`: current populated first page.
- `app-brief-390.png`, `app-report-beginner-390.png`, `app-report-beginner-1440.png`, and `app-pdf-390.png`: observed app surfaces.
- Extracted `.txt` and `.json` fixtures preserve the inspected saved output.

Scripts: `scratch/report_presentation_review.py` and `scratch/report-presentation-ui.cjs`. Scratch files may be ignored by Git; retain them deliberately when sharing this review.

Primary implementation locations:

- `backend/app/report/schema.py`: supported report content, metric selection, assessments, and defaults.
- `backend/app/report/templates/report.html.j2`: current equity print layout, repeated sections, KPI/source defaults, pagination.
- `backend/app/report/templates/news_report.html.j2`: news wording, date/reference handling, and certification labels.
- `backend/app/report/pdf.py` and `charts.py`: renderers, fonts, chart generation, and artifact handling.
- `frontend/src/components/StudioPage.jsx`: inline card, canonical field mapping, report navigation, and floating Copilot action.
- `frontend/src/components/ReportPreview.jsx`: summary helper, Beginner/Expert duplication, citations, tables, and reading controls.
- `frontend/src/components/PdfViewerModal.jsx`: actual zoom/pan, page loading, text/annotation layers, cleanup, and reading alternatives.

The work should improve these existing surfaces incrementally. Keep the recognizable layout; make its information accurate, readable, and easier to navigate.
