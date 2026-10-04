# Report Synthesis & PDF Engine (`backend/app/report/`)

## 1. Overview

The **Report Engine** transforms the validated graph state into institutional-grade equity research deliverables:
1. **Machine-Readable Structured JSON (`ReportJSON`)**: Used by the React frontend to render interactive dashboards, charts, and evidence citations.
2. **Publication-Grade PDF Deliverable**: Rendered from semantic HTML/CSS templates, suitable for printing, distribution, or archival storage.

---

## 2. Structure of `ReportJSON`

Defined in `app/schemas/models.py`. The report contains:

- **Metadata**: Target company name, ticker, exchange, research date, and schema version.
- **Executive Summary**: 2-3 paragraph distilled thesis with primary catalysts and timeframe.
- **Overall Assessment**: Formal classification (`BUY`, `HOLD`, `REDUCE`, or `INSUFFICIENT EVIDENCE`) with quantified rationale.
- **Fundamental & Valuation Metrics**: Comprehensive table of computed financial ratios with peer benchmark percentiles.
- **Bull vs Bear Scenarios**: Contrasting adversarial theses with cited evidence IDs.
- **Risk Matrix**: Severity-ranked downside vectors (regulatory, financial, competitive, macro).
- **Evidence Provenance Audit**: Full tabular disclosure of all citations, source URLs, excerpts, and retrieval dates.
- **Disclosed Evidence Gaps**: Transparent listing of missing or unverified data points.

---

## 3. PDF Rendering Engine (`pdf.py`)

Generating PDFs on diverse platforms (especially Windows) is often fragile due to system library dependencies. Artha-AI implements a robust **dual-engine rendering strategy**:

### Primary Renderer: WeasyPrint
- Uses **Jinja2** to inject `ReportJSON` into an institutional HTML+CSS template (`templates/report.html`).
- Renders pixel-perfect typography, clean vector charts, multi-column metrics tables, and formal headers/footers with dynamic page numbering.
- Requires GTK libraries on the host system.

### Fallback Renderer: `fpdf2`
- If WeasyPrint cannot load on Windows due to missing system C-libraries (`libgobject-2.0-0`), the system **automatically and transparently fails over to `fpdf2`**.
- `fpdf2` is pure Python, requires zero system DLLs, and always succeeds deterministically.
- Ensures the user **always gets their PDF download** on any Windows, macOS, or Linux machine without crashes.
