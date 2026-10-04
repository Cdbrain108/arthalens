# Bullseye — handoff merge

Audit: [docs/HANDOFF_AUDIT.md](docs/HANDOFF_AUDIT.md). Source pack read in full;
the prototype and its sample investment recommendations are references only.

## Decision table

| Handoff item | Existing overlap | Decision | Reason |
|---|---|---|---|
| P0.1 Deterministic growth | Repeated arithmetic in agents/report | Merge | Central tool retains inputs, periods, formula and basis |
| P0.2 Contradictory growth prose | Canned report deductions | Adopt handoff | Delete unsupported narrative |
| P0.3 Unsupported claims/benchmarks | Evidence model plus hard-coded IT assumptions | Merge | Keep typed evidence; remove defaults and unsourced benchmarks |
| P0.4 Numerical conflicts | Exact-sentence conflict matcher | Merge | Metric + entity + period + unit + basis comparison, 2% tolerance |
| P0.5 Grounding/fiduciary claims | 75% floor and 90% fallback | Adopt handoff | Actual original-claim coverage; no verification guarantee |
| P0.6 Complete citations | Canonical index; fallback truncates to 16 | Merge | Keep numbering and print every source |
| P1.7 Sentence findings | Validation substitutes short titles | Merge | Preserve explicitly evidence-linked claims |
| P1.8 Consistent explanations | Canned scenario/chart prose | Adopt handoff | Remove unsupported scenarios; explain measured inputs |
| P1.9 Relevant news | Date filters/deduplication already work | Merge | Company relevance, eight items, bounded article fetch, disclosed headline tone |
| P1.10 Plain cover | Existing editorial PDF redesign | Merge | Keep typography/layout; plain supported verdict first |
| P2.11 Architecture/name | CrewAI docs; LangGraph code; multiple brands | Adopt handoff | Bullseye is current name, LangGraph is orchestration framework |
| P2.12 Industry agent | Metadata without implementation | Adopt handoff | Implement in the canonical registry during phase 5 |
| P2.13 Evaluation/CI | Tests, no executable routing benchmark | Merge | Add benchmark and schema/dependency checks during phase 5/6 |
| P2.14 Job-state-only UI | Reliable polling, duplicated status maps | Merge | Retain polling; registry-backed cards and per-agent states |
| P2.15 Stooq/article fetch | Yahoo quotes; unused article tool | Merge | US daily-close fallback; real article excerpts, honest gaps |
| Evidence drawer | Sources and citations already available | Merge | Expose accepted evidence, inputs, dates and excerpts |
| Compare | Existing multi-entity pipeline | Keep existing | Preserve and repair listing-specific provenance |
| SSE | Non-overlapping polling with cancellation | Keep existing | Polling meets progress needs; no extra transport |
| Demo GIF/diagram | Legacy overview/docs | Merge | Capture current interface and document real execution |
| Beginner glossary | Helpful meanings plus arbitrary thresholds | Merge | Use explanations; reject universal Good/Bad cutoffs |
| TCS sample PDF/exporter | Unverified figures and hard-coded advice | Merge | Use visual hierarchy; reject copied data/advice and extra PDF dependency |
| Prototype logo | Blue outlined bull head | Merge | Original green charging bull + target/chart, per current brief |
| Intro | Logo drawing only | Merge | Bull/bear movement and 3–4 second resolution, CSS/SVG |
| Four themes | Existing blue/mint palette | Merge | Refined dark/light with fixed green/red accents per current brief |
| Landing | Sidebar-bound overview and welcome screen | Adopt handoff | Public responsive product story and direct research entry |
| Six-agent routing | Earlier smallest-useful-set policy | Merge | Broad research includes hiring/sector/management; focused news stays focused |
| Free-tier Tavily | Earlier fallback-only requirement was bypassed | Keep existing | Restore fallback-only invocation and discard uncited provider-generated answers |

## Phase 2 implementation

- Replaced report-time provider lookups, fabricated decisions, sensitivity prices,
  IT-specific deductions, benchmarks and inflated scores with evidence-only assembly.
- Added canonical metric provenance, input-retaining growth, claim coverage and
  period-aware conflict detection. Removed loose shared-number citation matching.
- Preserved API report fields, source numbering, job persistence and PDF delivery.
- Simplified the fpdf2 fallback to render the same report, complete citations and
  real gaps. Primary Jinja2 layout retained.
- Removed the two confirmed unimported fabricated-transcript components.
- Repaired Linux frontend dependencies (Windows esbuild binary was installed).
- Baseline: 89 backend tests passed; frontend API/polling passed but component
  tests were blocked by the platform binary. Baseline preserved in Git.

## Migration / compatibility

- Existing database and saved PDFs are preserved. Old saved reports may contain
  the old unsupported defaults; run fresh research to use the corrected pipeline.
- Report JSON retains `schema_version: 1.0`; additions (`evidence`, `conflicts`,
  extra specialist sections and provenance metadata) are optional/additive.
- Missing recommendation is `NOT ASSESSED` or `INSUFFICIENT EVIDENCE`, never an
  invented HOLD. Quality scores and unsourced peer/sector benchmarks are removed.
- `MODEL_PROVIDER=mock` remains an alias for LLM-free real-data research. It does
  not disable network access; automated tests replace tools with fixtures.
- Broad routing changes in phase 5 increase coverage. A concurrency limit bounds
  simultaneous work instead of discarding agents. Focused news behavior remains.
- Git was absent. Commits use the explicit automation identity `OpenCode
  <opencode@local>` via process environment; no Git configuration is changed.

Later phase details and measured verification results are recorded below as work
is completed.

## Phase 3 — original identity

Original charging bull, opposing bear, target/chart mark, full/dark/light SVG
wordmarks, optical small-size favicon, PNG/ICO set and sharing card. Shared Logo,
PDF reader, report cover, README and browser metadata use the new identity.
The export script uses existing WeasyPrint/PyMuPDF/Pillow dependencies. The old
asset files are historical exports; active components use the new asset names.

## Phase 4 — entry motion

Native modal dialog, original SVG characters, charging/rearing motion, opposing
chart strokes and a logo resolve over 3.6 seconds. Skip/Escape, sessionStorage,
reduced-motion 400ms logo fade and focus restoration. App mounts alongside the
intro, so history/registry/data loading is independent. Shared artwork also appears
in both result panels with restrained hover motion.
