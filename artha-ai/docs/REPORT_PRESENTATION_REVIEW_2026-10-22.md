# Report wording, layout, and preview review — 22 October 2026

Keep the current report identity, section cards, financial tables, strengths/risks panels, watchlist, and Beginner/Expert choice. The highest-value upgrades are simpler wording, one consistent conclusion, larger readable type, fewer repeated blocks, and easier access to evidence. More decoration will not solve the current reading problems.

This document proposes changes; it does not implement a new report design. Application source was not edited by this review. Local measurement scripts, extracted text, screenshots, and this document were created.

## What was actually inspected

- The three newest saved research PDFs at inspection time: `research_9689fddbd420.pdf`, `research_48848c7f0d66.pdf`, and `research_a9df67a369cb.pdf`, generated on 22 October. Their matching saved report JSON and job records were read locally.
- Two older layout samples: `test_master_compare_report.pdf` and `test_single_stock_layout_v2.pdf`. These are historical references, not proof of today's comparison output.
- The current equity and news PDF templates, report assembly, chart generation, inline report card, full report preview, Studio integration, and PDF viewer.
- The real Studio application with a saved completed-report fixture at 1440×1000 and 390×844. The inline card, PDF opening, Beginner view, and Expert view were exercised. External requests were blocked; the PDF worker was supplied from the installed local package. No new stock research or provider requests were started.

The workspace changed during the review. Initial Studio code showed an inline brief and PDF; later code connected `ReportPreview` into the active report screen. The final browser checks include that connected version, observed around commit `bb9ceb7`, with additional edits occurring outside this review. The older “preview is not connected” observation should not be treated as a current defect. Recheck line numbers when implementing suggestions.

These measurements establish local Chromium behavior, not actual iPhone Safari behavior or all report types. The saved reports were inspected as product output; this review does not certify their financial claims.

## The current reading problems

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

## 1. Make the wording understandable without changing the meaning

Aim for a reader who understands everyday English but has never read a balance sheet. Use common words and explain a financial term at its first appearance. Keep the actual term available so the reader learns it.

### Writing rules

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

### Replace current terminology

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

### Explain metrics carefully

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

### Delete or rewrite these current claims

- “Zero danger of running out of cash.” Replace with the observed debt/cash position and what remains unknown.
- “Your investment is safe” and “very safe asset to hold.” Do not promise a safe outcome from company metrics.
- “Super profitable,” “pristine,” “net cash fortress,” “proven wealth compounder,” and “premier beneficiary.” Replace with dated facts and appropriate comparison.
- “Panic selling is strongly discouraged” and “sell only if.” Replace with supported conditions for reviewing the assessment; avoid inventing a personal instruction.
- “Attractive entry valuation” based only on a P/E threshold. Explain the actual peer/historical comparison and limitations, or say valuation was not established.
- “100% verified,” “audit grade,” “fiduciary standard,” and the news template's “SEBI/NSE Audit Compliant.” Do not present an internal checklist as external certification or factual certainty.

The current plain-summary helper in `ReportPreview.jsx` chooses business claims from classification keywords. A BUY label does not prove sales growth; a SELL label does not prove rising debt. Simplification must use the supported findings behind the assessment.

### Example for the actual inspected incomplete run

“This run found eight news sources, but it did not resolve a company or establish the financial figures needed for a stock assessment. Seven news items were available only as headlines or short excerpts. We cannot judge valuation, debt strength, or whether a stock is suitable to buy from this information. Select a company or ticker to continue.”

This is the appropriate wording for that evidence state. Rewriting the fabricated BEL summary into friendly language would preserve the underlying error.

For a sufficiently supported run, the summary can follow this pattern: answer to the question; strongest supporting finding; main risk; important limitation; what to check next. Only fill slots supported by the run.

## 2. Keep, merge, add, and remove

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

### Add information that answers real reader questions

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

## 3. Improve the current PDF layout

### Typography and spacing

- Start with body text around **10.5–11pt**, table text **9–10pt**, source notes **8.5–9pt**, section headings **13–15pt**, and a report title around **18–22pt**. These are starting design values to verify in print, not universal compliance thresholds.
- Use line height around **1.4–1.5** for prose and **1.25–1.35** for tables. Increase row padding enough to separate values clearly.
- Use one body font family and consistent heading weights. Reserve monospaced type for selected numbers/identifiers rather than every label.
- Make title → section heading → finding → supporting note visibly distinct. Currently many headings and body rows differ by less than two points.
- Reduce all-capital headings, narrow letter spacing, and tiny secondary labels. Prefer “Recent quarterly results” over a long capitalized technical heading.
- Keep the white page and existing navy/blue identity. Use light panel fills and subtle dividers. Reserve green/red/amber for supported positive/risk/unavailable meaning, accompanied by text.
- Use deliberate white space between sections. Remove repeated border-within-border containers where one panel can establish hierarchy.

Do not enforce “exactly four pages” by shrinking text. A focused report may need fewer pages; a comparison or document-heavy query may need more. The report should be as short as its supported answer allows.

### Pagination and tables

- Use the existing sequence—summary, supporting financials, strengths/risks and watchlist, sources—but rebalance the space within it.
- Keep headings with the first paragraph/row. Prevent an individual short row/card splitting badly; allow long tables and long sections to continue naturally.
- Repeat table headers on continuation pages. Use a small “continued” label where useful.
- Avoid applying `break-inside: avoid` to every large section: an oversized section must be able to span pages.
- Add unobtrusive page X of Y, company/report reference, and date. Remove hardcoded page-number labels that become wrong after content grows.
- Right-align numbers, use tabular numerals, and keep units in headers where all rows share a unit. Use one rounding policy; avoid unnecessary 25.20% when 25.2% communicates the precision supported.
- Wrap entity names and explanations. Keep numeric columns legible; split wide comparisons into grouped tables or use an explicitly labeled landscape appendix when needed.
- Display financial periods consistently, for example “Quarter ended 30 Jun 2026 (Q1 FY27).” Fiscal labels must follow the company's calendar.
- Use “Not available” for missing values and explain the gap once. A dash, zero, and not applicable should not be interchangeable.

### Sources and references

The current equity template prints only `report.sources[:15]`. This can omit sources referenced elsewhere when a report has more than 15 sources. Include all cited references, with an appendix if necessary; do not silently truncate the reference list.

In the inspected PDF, external URLs are linked in the sources section, but the main text's bracketed markers are not internal jump links. Make `[n]` jump to the reference entry, and link the entry to the original source. Include page/section for uploaded documents and preserve unavailable publication dates.

A short clickable publisher/title is easier to read than a long raw URL. The full destination should remain intact. Add bookmarks for main PDF sections and selectable text. Verify reading order and tagged-PDF accessibility with the chosen renderer before advertising accessible output.

## 4. Upgrade the app report preview

Keep the existing dark cards and Beginner/Expert control. Both views should present the same facts and assessment; Expert adds inputs, calculations, and source detail. It should not change the conclusion or make citations available only to advanced readers.

### Inline chat report card

- Show a 60–100-word answer and up to three key points. Expand to read the full summary rather than showing several hundred words immediately.
- Preserve paragraphs, bullets, and links using structured blocks. A raw string in one `<p>` collapses intended paragraph breaks.
- Read metrics from the canonical `report.financial.metrics`; the current card reads `company.metrics` or `report.metrics`, which can omit valid financial metrics in other runs.
- Read strengths/risks from the canonical `bull_case`/`bear_case`. The current card reads alternate thesis keys, then substitutes evidence gaps for risks. An existing bull case can therefore disappear while missing-information notices look like company risks.
- Keep “Not enough information” separate from “Business risks.” Both matter but imply different actions.
- Do not add `%` or `x` blindly to preformatted strings. Use typed values and units to avoid duplicate symbols.
- Replace “Synthesis Rationale” with “Why this assessment” and “Open Institutional PDF Dossier”/“PDF Dossier” with a clear “View PDF.”
- Keep one main “Read report” action, then PDF/download. The current newly connected in-app report action is useful; retain it.
- Wrap important risk text or offer expansion. The current clipped list hides a material limitation on the phone.

### Full Beginner view

- Put the answer ahead of detailed research metadata. In the mobile screenshot, brand, question, controls, counts, and several headings consume most of the first screen before the answer is readable.
- Keep company, question, short assessment, and main limitation near the top. Move detailed coverage counts into a compact expandable row.
- Start body text around **15–16px** on mobile and **14–16px** on desktop, with comfortable line height. Reserve 12px or smaller text for secondary metadata, not the explanation of an investment risk.
- Merge the plain-summary card and lengthy synthesis when they repeat the same answer. Do not repeat an executive hero above another beginner hero describing the same report.
- Use a single content column on phones. Avoid several nested cards/paddings that leave little horizontal reading space.
- Explain metrics inline or through tap-to-open help. Tooltips that require hovering are insufficient on mobile.
- Preserve citation markers in strengths, risks, and summary. The current `stripCitations` calls remove them from several beginner lists.
- Keep material limitations visible in both modes. Deduplicate the 19 raw gap messages in this fixture into a few meaningful coverage statements, retaining the original trace in technical detail.

### Expert view and navigation

- Keep the existing tabs but shorten names: Overview, Financials, Charts, Strengths & Risks, Coverage, Sources, Method.
- On mobile, provide a compact section picker or a scrollable navigation row instead of multiple rows of long tab labels. Preserve keyboard access and clear selection semantics.
- Consider opening a compact Overview rather than rendering every expert section in the default All view.
- Use expandable calculation inputs and agent activity. The research narrative should show actual supported findings, not repeated accounts of tool execution.
- Add a visible route to the sources and a back-to-overview action for long content. Retain reading position sensibly when switching modes; avoid leaving the reader at an unrelated point.
- Preserve table overflow inside a clearly scrollable container when needed; do not permit whole-page horizontal scrolling. For multi-company mobile comparisons, allow selecting two companies while retaining access to the complete comparison.
- Reserve bottom/safe-area space for the Copilot control so it never covers text, sources, or a table button.
- Use accessible headings, associated tab panels, focus styles, readable contrast, and 44px touch targets as a practical target for compact controls.

### PDF viewer

- Retain fit-to-width as the initial phone mode, but make zoom change actual displayed dimensions and permit pan/pinch.
- Add page jump and, for longer reports, a compact contents/bookmark control. The current continuous page list is acceptable for short PDFs.
- Make open-in-browser/download alternatives easy to find on phones. Do not rely on a desktop-only new-tab control.
- A canvas-only PDF is an image surface: it does not automatically provide selectable text, clickable citation overlays, search, or screen-reader reading order. Add compatible text/annotation layers or offer the accessible HTML report as the primary reading option.
- Preserve the newly added switch back to the in-app report. Use the current labels and behavior when implementing; the viewer changed during this review.

## 5. Add useful visuals sparingly

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

## 6. Build and optimize the upgrade without a rewrite

### A practical implementation sequence

1. **Correct the content contract.** Remove fixed dates/scores/metrics, positive empty-state narratives, unsupported directives, and false source classifications. Pick one entity/period/basis for each value. Resolve assessment contradictions before styling them.
2. **Add a small presentation layer to the existing report schema.** Keep the current sections. Add optional structured summary points, definitions, metric meanings, and limitations with evidence IDs. Retain compatibility with older saved reports. Avoid having JSX invent new conclusions from verdict keywords.
3. **Create one formatting policy.** Shared definitions for currency, units, periods, rounding, loss/zero/missing states, and source numbering must govern PDF, preview, inline card, and Q&A. A backend formatter can prepare canonical labels; both renderers still need their own responsive layout.
4. **Consolidate repeated report content.** Merge overlapping summary/action/watchlist blocks and move formulas/tool details to secondary views. Reduce the writing before tuning pagination.
5. **Tune existing print and screen styles separately.** Print uses points/mm and page rules; the app uses responsive pixels/rem and scrolling. Share visual tokens and hierarchy, not one rigid page layout.
6. **Repair preview integration details.** Correct inline-card field mappings, preserve structure/citations, reserve space for Copilot, and keep Beginner/Expert conclusions identical.
7. **Add one supported chart at a time.** Use typed series and stable per-job artifact paths. Wire charts into the PDF deliberately, and skip them when data is incomplete.
8. **Optimize the viewer and artifact lifecycle.** Lazy-load PDF.js, self-host matching worker/CMaps, render visible pages plus a small buffer, cancel and destroy rendering/loading tasks on close, and release canvases/object URLs.
9. **Verify representative saved fixtures, then a clean deployment image.** Renderer fallback and fonts must produce acceptable output in the actual deployment environment.

### Generation and performance choices

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

## 7. Acceptance criteria before calling the report polished

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

## Evidence files and implementation locations

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
