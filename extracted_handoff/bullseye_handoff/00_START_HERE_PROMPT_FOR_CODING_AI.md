# START HERE - Prompt to paste into your coding AI

You are improving my portfolio project **Bulls Eye** (assistant name: **RKI**), a multi-agent stock research app (React + Vite + Tailwind, FastAPI, SQLite, FAISS, yfinance). I am a fresher using it to get a job, so correctness, honesty and clean UX matter more than feature count.

Read these files in order and do the work:

1. `01_CHAT_SUMMARY.md` - context and decisions.
2. `02_FIXES_AND_RECOMMENDATIONS.md` - bugs and improvements, in priority order. Do P0 first, then P1, then P2.
3. `03_RATIOS_GLOSSARY_FOR_BEGINNERS.md` - plain-language text to use for Beginner mode explanations.
4. `04_BRANDING_THEMES_LANDING_SPEC.md` + `branding/` - logo, intro animation, themes, landing page, responsive rules.
5. `05_SAMPLE_BEGINNER_REPORT_TCS.pdf` - target style and wording for the generated report.

## Rules
- Do not break the principle "LLMs reason, Python computes": all growth rates and ratios come from deterministic code with inputs stored.
- Never show a number in the UI or PDF that has no evidence ID. Unsupported items go to "Evidence gaps".
- Keep the beginner/expert split: Beginner = short plain sentences + Good/Okay/Watch tags; Expert = ratios, formulas, sources.
- First inspect the real code to decide whether the orchestrator is LangGraph or CrewAI, and update the docs to match.
- Add or update tests for every fix. Run the existing test suite and routing eval before finishing.
- Make small commits, one per fix group.

## Order of work
1. P0 data-correctness fixes (growth calc, unsupported claims, conflict box, real grounding %, full citation list).
2. Report template: sentence-style findings, matching explanations, news relevance filter, plain-English verdict first.
3. Frontend: themes, landing page, intro animation, Beginner/Expert tabs, responsive layout.
4. Eval/CI wiring and README (architecture diagram, demo GIF, routing score).

## When done, report
- What changed per file, test results, and a re-run of "Analyze TCS fundamentals" showing the acceptance checks in file 02 pass.
