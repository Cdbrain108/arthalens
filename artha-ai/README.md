![Bullseye](frontend/public/brand/logo-full.svg)

# Bullseye — Research Beyond the Noise

One natural-language company/investment question → dynamically routed specialist agents → evidence validation → synthesized research → professional PDF. Bullseye is a research aid, not financial advice.

**Stack:** LangGraph StateGraph orchestration · LangChain (models/tools/retrieval) · OpenRouter / Gemini / Ollama providers · FastAPI · React + Vite + Tailwind · FAISS + Sentence-Transformers (local RAG) · Jinja2 + WeasyPrint / fpdf2 (deterministic PDF). With no LLM key, the app still performs real tool-based data collection; it does not fabricate offline market data.

## Quick start

```bash
# Backend (http://localhost:8000)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env    # add a provider key, or leave unset for LLM-free tool research
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal, http://localhost:5173)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Try: *"Should I hold TCS for the next five years?"* — watch the planner route to the executable specialist registry, inspect evidence gaps, then download the cited PDF.

## Tests

```bash
python -m pytest                     # backend: ratios, routing, validation, pipeline regressions, full E2E, LangGraph
cd frontend && npm test              # frontend: API client + job polling workflow
cd frontend && npm run lint
cd frontend && npm run test:e2e     # Playwright + axe: intro, themes, widths, no overflow, submission
cd frontend && npm run build
# opt-in live-provider HTTP smoke test (requires the backend running)
python3 scripts/live_smoke.py --query "Research AAPL"
```

The backend test suite forces LLM-free mode, mocks external data boundaries and isolates storage. Browser tests stub API responses. `scripts/live_smoke.py` is the explicit opt-in path for live provider calls.

## Repository map

```text
artha-ai/
├── docs/                        # Architecture & framework guides
│   ├── LANGGRAPH_ARCHITECTURE.md    # Master LangGraph state-machine architecture
│   ├── ARCHITECTURE_FRAMEWORK.md    # Consolidated system design, ADRs, gates
│   ├── ROLES_AND_RESPONSIBILITIES.md# System + human roles, RACI, QA veto
│   ├── AGENT_CONTRACTS.md           # Per-agent & per-tool binding contracts
│   ├── API_SPEC.md                  # REST contract (UI renders only this)
│   └── EVALUATION_AND_TESTING.md    # Benchmarks, gates, provenance
├── backend/app/
│   ├── main.py                  # FastAPI entry
│   ├── config.py / llm.py       # Env config + provider-agnostic model gateway
│   ├── schemas/models.py        # Pydantic contracts (EvidenceItem, AgentResult, ReportJSON…)
│   ├── graph/                   # ACTIVE LangGraph state machine:
│   │                            # state.py · nodes.py · builder.py · runner.py ·
│   │                            # specialists.py · routing.py · meta.py
│   ├── agents/                  # Executable specialist registry + shared tool collectors
│   ├── tools/                   # Market · Financial (deterministic ratios) · News · Web · Documents
│   ├── rag/                     # Parser → Chunker → Embeddings → FAISS retriever
│   ├── validation/              # Evidence validation + conflict detection pipeline
│   ├── report/                  # ReportJSON assembly + Jinja2 template + WeasyPrint/fpdf2
│   └── storage/jobs.py          # Job lifecycle + provenance (SQLite WAL)
├── frontend/src/
│   ├── components/              # IconRail, Sidebar, ResearchPrompt (gradient ring),
│   │                            # QuickActions, WorkflowStatus, ReportReady, …
│   ├── hooks/useResearchJob.js  # cancellable, non-overlapping status polling
│   └── api/client.js            # mirrors API_SPEC.md
├── inputs/                      # original spec + UI reference (inputs to this build)
└── tests/                       # pytest: ratios, routing policy, validation
```

## The five binding principles

1. **Evidence-first** — no provenance, no claim; gaps are labeled, never filled.
2. **LLMs reason, Python computes** — `calculate_ratio` is pure code with retained inputs.
3. **Dynamic routing** — focused questions stay focused; broad company research receives complete core coverage. A concurrency limit never drops selected specialists.
4. **Explicit typed state** — shared `ResearchState` passes through one compiled LangGraph; no chat-transcript state.
5. **Provider honesty** — no LLM key disables model explanation only. Tool failures, partial evidence and unavailable agents remain visible.
6. **UI = control room, PDF = deliverable** — zero fabricated metrics on screen.

Full rationale and the ADRs live in `docs/ARCHITECTURE_FRAMEWORK.md`.
