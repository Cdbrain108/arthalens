# Fixes & Recommendations (prioritised)

Found by reading the 8 docs and checking the TCS sample PDF. Items marked VERIFIED were re-calculated by me from numbers printed in the PDF.

## P0 - Correctness / trust (fix first; recruiters check this)

1. **Revenue growth number looks wrong. VERIFIED.**
   PDF says Q1 FY27 revenue growth is +12.1% YoY. Its own table has Q1 FY27 = 72,275 Cr and Q1 FY26 = 63,437 Cr, which is **+13.9%**. Find where 12.1% comes from (different base? constant currency? hallucinated by LLM?) and compute growth only via a deterministic `compute_growth()` tool, then store inputs.

2. **Report contradicts itself on growth.**
   Step 5 of "How the stance was reached" says "headline constant-currency growth remains modest in the low single digits", but the cover says +12.1% (or 13.9%). Pick one source of truth. Remove statements that no tool produced.

3. **Unsupported claims in the report.**
   - "Operating cash flow > 85-90% of Net Income": no cash-flow data was fetched by any agent.
   - "Attrition < 12%", "TCV $9.5 billion", "6-star dividend payer": check each has an evidence ID. If not, move to evidence gaps.
   - Sector benchmarks (ROE 25%, OPM 18%, NPM 14%, D/E 0.5x) appear hard-coded. Either source them (peer median from computed peers) or label them "illustrative assumption".

4. **Conflicting numbers between agents are not flagged.**
   | Metric | Valuation agent | News agent blurb |
   |---|---|---|
   | P/E | 15.08x | 14.79x |
   | P/B | 6.85x | 6.1x |
   | Dividend yield | 3.13% | 5.4% |
   | ROE | 47.7% | 49.11% |
   | Price | 2,075 | 2,238.75 (from a snippet) |
   Your validator should flag same-metric/different-source differences >2% and print a "Data conflicts" box. Also stop News agent from synthesising valuation numbers (it is out of its role per ROLES doc).

5. **"100% Verified" and "Fiduciary institutional framework" are overclaims.**
   News body text was never fetched ("article bodies were not fetched"), so grounding cannot be 100%. Compute grounding as `claims with accepted evidence / total claims` and show the real number. Remove "Fiduciary".

6. **Citation list cut off.** Sources table ends at [16] but report cites up to [37]. Print all, or paginate.

## P1 - Report quality

7. **Findings print as bare titles.** Section 1 shows lines like "TCS FY2026 income statement" and section 3 "TCS quote 2075.0" instead of a sentence with the number. Each finding should read like: "Revenue FY26 was INR X Cr, up Y% vs FY25 [2]".

8. **Beginner text does not match the table next to it.**
   - Valuation sensitivity explanation says "pessimistic (10-11x), fair (13-14x), optimistic (17-18x)" but the table shows 12.4x / 15.1x / 17.3x / 19.6x.
   - "Visual Chart Interpretation" says bars show revenue and profit progression, but the chart shows margins vs sector.
   Generate explanation text from the same values used in the table.

9. **News list has noise.** Hexaware, Atishay, Tata Elxsi, a Nifty market-wrap, Jaguar racing sponsorship, "Opening Bell". Add a relevance filter (company name must be in title/snippet) and show max 8 items, grouped Positive / Negative / Neutral.

10. **Cover page is dense.** 1 plain-English verdict sentence, then 3-4 key numbers max. Move the rest below.

## P2 - Architecture hygiene

11. **Docs disagree on the orchestrator.** Master plan + LANGGRAPH_ARCHITECTURE say LangGraph. ARCHITECTURE_FRAMEWORK v4 says CrewAI Flow and "LangGraph not in runtime". Look at the real code, choose one, and delete or update the other docs. Also make the name consistent (ArthaAI vs Bulls Eye vs RKI).

12. **Industry agent** is listed as one of 9 specialists but is absent from the routing table and agent contracts. Either add to routing/contracts or remove it.

13. **Evaluation not wired in.** `make eval` (routing/retrieval/calculation) is unchecked in the Definition of Done. Finish the routing benchmark (5 questions in EVALUATION doc) and show the score in README. Easy, high-value for a resume.

14. **Frontend must render only job-state data** (also unchecked). Add the schema lint.

15. **Data tools.** TOOL_LANDSCAPE already recommends: Stooq fallback for quotes, Yahoo/Bing RSS + GDELT for news, Jina Reader -> trafilatura for page fetch. Implement at least the Stooq fallback and article fetch so News stops being headline-only.

## P3 - Nice to have
- Evidence drawer in UI (click a number -> see source, date, excerpt).
- Compare mode (TCS vs Infosys).
- SSE instead of polling.
- Demo GIF + architecture diagram in README.

## Acceptance checks for the coding AI
- Re-run "Analyze TCS fundamentals": revenue growth matches a hand calculation; no number appears that lacks an evidence ID; conflicts box lists the P/E difference; sources list is complete; grounding % is computed, not hard-coded.
- Routing eval >= 90%.
