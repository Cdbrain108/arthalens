# Chat Summary (what we discussed)

**Project:** Bulls Eye (earlier called ArthaAI). Chatbot name: **RKI**.
**Goal of owner:** Fresher's portfolio project to get a job. Wants beginner-friendly research reports plus an expert view.
**Stack (from the docs):** React + Vite + Tailwind frontend, FastAPI backend, SQLite, FAISS RAG, yfinance data, Google News RSS, PDF via Jinja2 + WeasyPrint/fpdf2.

## 1. What I reviewed
8 architecture docs (master plan, agent contracts, API spec, evaluation, LangGraph architecture, roles, tool landscape, architecture framework v4) and the TCS sample PDF (2 copies of the same report, 8 pages).

## 2. Key discussion points

**How the verdict works.** Each specialist agent (Financial, Valuation, Market, News, Growth, Risk) files findings independently. A Bull/Bear challenger then argues both sides, and a Synthesizer produces the final verdict. Bad news does not flip the verdict alone. It becomes one weighted input. In the TCS report this gave "HOLD (CONDITIONAL)".

**Bull case / Bear case.** Bull = reasons it could go well (deal pipeline, strong balance sheet). Bear = reasons it could go wrong (Tata Sons dispute, weak IT spending, AI pricing pressure). The system argues both sides on purpose so it does not just cheerlead.

**Is the report data real?** Numbers come from yfinance and deterministic Python calculation, and news comes from real dated headlines. But the report has consistency problems (see file 02).

**Owner's situation.** Owner built the project with AI help, does not yet know share-market ratios (knows equity, profit, margin). Initialised 9 agents but only 6 run. Wants: beginner section (plain words) and expert section (ratios), clean visuals, a landing page, a bull + animated graph logo/intro, more themes, responsive UI.

## 3. Why only 6 of 9 agents run (likely NOT a bug)
The docs show routing is deliberate:
- Long-term/buy/hold question -> financial, valuation, market, news, growth, risk = **6 agents**
- Document agent runs only when a PDF is uploaded or a filing is asked about
- Workforce agent runs only for hiring questions
- Industry agent is not in the routing table at all (see file 02, item 9)
- Routing is capped at 6 agents (8 in compare mode)

So "6 working" matches the design for a buy/hold question. Test with "Is TCS hiring?" and "Explain this annual report" (with an upload) to see the other agents fire.

## 4. Requests for the coding AI
See `00_START_HERE_PROMPT_FOR_CODING_AI.md`.
