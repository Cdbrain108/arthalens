# Bullseye handoff audit — 4 October 2026

Read-only audit completed before application edits. All nine handoff files were
read, including every page of the sample PDF and the complete prototype/exporter.
Extraction: `/tmp/omnirush/bullseye-handoff/bullseye_handoff`.

## Detected stack

React 18 / Vite 5 / Tailwind 3 / Lucide; FastAPI / Pydantic; LangChain model and
tool adapters; LangGraph graph definition; SQLite WAL; FAISS + local Sentence
Transformers with keyword fallback; PyMuPDF; Jinja2 / WeasyPrint / fpdf2.
Yahoo Finance, Google News RSS, DDGS, optional Tavily, SEC EDGAR, official ATS
boards, uploaded PDFs. Gemini, OpenRouter, AgentRouter, Ollama adapters.

The HTTP path manually repeated the graph's stages rather than invoking the
compiled LangGraph graph. CrewAI was absent from runtime despite current docs.
Vite defaulted to ports 5175/8002 while README documented 5173/8000.

## Agent inventory before merge

All specialist classes below are in `backend/app/agents/specialists.py`.
Collection was implemented in `agents/base.py`, except News (`graph/news.py`).

| Name | Purpose | Registered | Initialized | Actually called |
|---|---|---|---|---|
| FinancialAgent | Financial statements and cash flow | yes | lazily | yes, but cash-flow tools unused |
| ValuationAgent | Valuation, peers, historical context | yes | lazily | yes, peers/history unused |
| MarketAgent | Price action and technicals | yes | lazily | yes, technical tool unused |
| NewsAgent | News events | yes | dedicated function | yes, bodies explicitly not fetched |
| GrowthAgent | Projects and expansion | yes | lazily | yes, canned IT claims present |
| RiskAgent | Downside risk | yes | lazily | yes, canned IT claims present |
| WorkforceAgent | Hiring/headcount | yes | lazily | hiring only; ATS tool unused |
| SocialAgent | Qualitative discussion | yes | lazily | optional; missing role metadata |
| DocumentAgent | Uploaded-document retrieval | yes | lazily | conditional; document filter omitted |
| Industry | Sector research, `graph/definitions.py` | no | no | no, metadata only |
| Analyzer / planner | `graph/meta.py`, `graph/stages.py` | outside registry | per call | yes; planner emits nonexistent jobs/industry |
| Challenger | Combined Bull/Bear in `graph/meta.py` | outside registry | per call | yes; arbitrary fallback direction |
| Synthesizer / report Q&A | `graph/meta.py` | outside registry | per call | yes; unsafe keyword-driven fallback |

No startup initialization assertion or per-agent health. A six-agent selection
cap removed relevant agents; workforce was explicitly forbidden for investment
and comparison requests. Exceptions were swallowed and empty results marked done.

## Report regressions

`report/schema.py` and `llm_mock.py` reintroduced unsupported hold/buy prose,
85–90% cash conversion, attrition/margin thresholds, IT-specific deductions,
unsourced sector references and invented discovery recommendations. Grounding
was floored at 75% or defaulted to 90%. Fallback PDF cut sources off at 16 and
used “fiduciary”. Findings could become bare evidence titles. Validation could
link unrelated claims by a shared number. Quote timestamps used retrieval time.

## Landing before

The pack requests simpler copy, beginner/expert views, themes and animated
branding; it contains no detailed visual critique. Inspection found two competing
entry pages, login gating a sidebar-bound overview, dense technical copy, rainbow
accents, ArthaAI/Bulls Eye naming, fake static index prices, a fabricated Reliance
preview, and “100% cited” / “zero hallucinations” guarantees. No coherent public
story, FAQ, theme system, or bull/bear identity.

## Design DNA (reference projects read-only)

Samvaad: immersive branded atmosphere, expressive typography, direct question
entry, illustrated storytelling and interactive pipeline explanations. React/Vite,
CSS/IntersectionObserver; Framer Motion and Three exist elsewhere in its app.
ARGUS: dark editorial cards, strong spacing tokens, visible analytical workflow,
demo-first sections, CSS reveals and counters, Lucide, no motion dependency.
Carry these strengths into a restrained green/red fintech identity; improve
contrast, preserve normal scrolling and persistent navigation, avoid fabricated
usage stats and excessive continuous effects. Neither reference project edited.

## Earlier recommendations retained

Root master architecture plan; `WHAT_I_HAVE_DONE.txt`; earlier work summary;
`BUGS.md`; `fixes/00_PLAN.md`; all seven docs; runtime/tests/frontend reviewed.
Retain cached/coalesced tools, crash recovery, non-overlapping polling, news-only
routing, canonical citations, in-app PDF, comparison, RAG and provider abstraction.
See `../CHANGELOG_HANDOFF_MERGE.md` for the complete decision table and migration.
