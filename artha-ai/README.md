![Bullseye](frontend/public/brand/logo-full.svg)

# Bullseye — Research Beyond the Noise

One natural-language company/investment question → dynamically routed specialist agents → evidence validation → synthesized research → professional PDF.

**Stack:** LangGraph (cyclical StateGraph orchestration) · LangChain (models/tools/retrieval) · OpenRouter / Gemini / Ollama providers (mock fallback = ₹0) · FastAPI · React + Vite + Tailwind · FAISS + Sentence-Transformers (local RAG) · Jinja2 + WeasyPrint / fpdf2 (deterministic PDF).

## Quick start

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env    # add an OpenRouter free key (or Gemini / Ollama — mock works with none)
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Try: *"Should I hold TCS for the next five years?"* — watch the planner route to Financial + Valuation + Growth + Market + News + Risk + RAG, then download the cited PDF.

## Tests

```bash
python -m pytest                     # backend: ratios, routing, validation, pipeline regressions, full E2E, LangGraph
cd frontend && npm test              # frontend: API client + job polling workflow
```

The E2E suite forces the deterministic mock provider and isolated storage — it never spends API quota and never touches real job history.

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
│   ├── agents/                  # 9 Specialist agent definitions (+ deterministic ₹0 mock runners)
│   ├── tools/                   # Market · Financial (deterministic ratios) · News · Web · Documents
│   ├── rag/                     # Parser → Chunker → Embeddings → FAISS retriever
│   ├── validation/              # Evidence validation + conflict detection pipeline
│   ├── report/                  # ReportJSON assembly + Jinja2 template + WeasyPrint/fpdf2
│   └── storage/jobs.py          # Job lifecycle + provenance (SQLite WAL)
├── frontend/src/
│   ├── components/              # IconRail, Sidebar, ResearchPrompt (gradient ring),
│   │                            # QuickActions, WorkflowStatus, ReportReady, …
│   ├── hooks/useResearchJob.js  # 2s status polling; renders ONLY job-state fields
│   └── api/client.js            # mirrors API_SPEC.md
├── inputs/                      # original spec + UI reference (inputs to this build)
└── tests/                       # pytest: ratios, routing policy, validation
```

## The five binding principles

1. **Evidence-first** — no provenance, no claim; gaps are labeled, never filled.
2. **LLMs reason, Python computes** — `calculate_ratio` is pure code with retained inputs.
3. **Dynamic routing** — the planner picks the smallest useful agent set; over-routing is a measured defect.
4. **Explicit typed state** — shared `ResearchState` dict threaded through crew stages; no chat-transcript state.
5. **Mock-mode parity** — with no API key the same crew stages run deterministically (₹0); add a Gemini key and the real `crewai.Crew.kickoff()` takes over.
5. **UI = control room, PDF = deliverable** — zero fabricated metrics on screen.

Full rationale and the ADRs live in `docs/ARCHITECTURE_FRAMEWORK.md`.
