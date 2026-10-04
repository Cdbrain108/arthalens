# Specialist Agents Architecture (`backend/app/agents/`)

## 1. Overview & Agent Philosophy

The system employs specialized domain agents rather than a single monolithic generalist model. Each specialist agent is responsible for **one distinct analytical lane** of institutional equity research.

### Core Principles
1. **Separation of Concerns**: The Financial Agent never forecasts technical price levels, and the Market Agent never calculates balance sheet debt ratios.
2. **LLMs Reason, Python Computes**: Agents never compute PE ratios, margins, or growth rates in LLM text. They invoke deterministic Python tools (`calculate_ratio`) with raw inputs retained for complete provenance.
3. **No Claim Without Provenance**: Every qualitative or quantitative finding must cite one or more `EvidenceItem` records with source, date, and verbatim excerpt.
4. **Dual-Mode Parity (₹0 Mock vs Live LLM)**: Every agent implements a full deterministic mock mode (`run_mock`) that exercises the identical Python tools without consuming API quota.

---

## 2. The 9 Specialist Agents

### 1. Financial Agent (`financial`)
- **Role**: Senior Financial Analyst
- **Objective**: Evaluates fundamental company health, balance sheet strength, operating cash flow, and multi-year income trends.
- **Tools Attached**:
  - `get_financials`: Historical income statement, balance sheet, and cash flow items.
  - `get_company_metrics`: Market capitalization, enterprise value, and reported metrics.
  - `calculate_ratio`: Pure Python ratio calculator for margins, debt/equity, and returns.
  - `get_quarterly_results`: Recent earnings releases from official exchange filings.
- **Key Evidence Captured**: Revenue growth (YoY/QoQ), Operating Margin, Net Profit, Debt-to-Equity, Free Cash Flow, ROCE/ROE.

---

### 2. Valuation Agent (`valuation`)
- **Role**: Valuation Specialist
- **Objective**: Establishes fair value context through historical multiple bands and peer comparisons.
- **Tools Attached**:
  - `get_quote`: Real-time stock quote and currency.
  - `get_company_metrics`: Fundamental inputs for multiple calculation.
  - `calculate_ratio`: Strict computation of P/E, P/B, EV/EBITDA, and PEG ratios.
  - `get_peer_multiples`: Comparative multiples across industry peers.
  - `get_historical_multiples`: 3Y and 5Y median multiple trends.
  - `search_web`: Contextual commentary regarding target price revisions.
- **Key Evidence Captured**: Trailing P/E vs 5Y median, Peer group discount/premium, EV/EBITDA, Dividend Yield.

---

### 3. Market Agent (`market`)
- **Role**: Market Action Specialist
- **Objective**: Analyzes price action, trading volumes, benchmark relative performance, and momentum.
- **Tools Attached**:
  - `get_quote`: Latest trade price, day's high/low, and 52-week range.
  - `get_price_history`: Historical OHLCV candle series over requested lookback.
  - `get_volume`: Trading volume anomalies and moving average comparisons.
  - `get_benchmark_history`: Relative performance against NIFTY 50, S&P 500, or sector index.
  - `get_technicals`: Calculated 50-day / 200-day Simple Moving Averages and RSI.
  - `search_news`: Market catalyst commentary.
- **Key Evidence Captured**: 52-week position, 50-day / 200-day DMA alignment, RSI momentum, Volume trends.

---

### 4. News Agent (`news`)
- **Role**: News & Corporate Actions Analyst
- **Objective**: Surfaces recent regulatory filings, contract wins, management changes, acquisitions, and earnings surprises.
- **Tools Attached**:
  - `search_news`: Google News RSS headlines with publication date parsing & Tavily fallback.
  - `fetch_news`: Scrapes clean article text from verified news links.
- **Key Evidence Captured**: Chronological log of material corporate events with publication timestamps and direct URLs.

---

### 5. Growth Agent (`growth`)
- **Role**: Growth & Capex Analyst
- **Objective**: Analyzes capital expenditure commitments, capacity expansion, new product launches, and market share trends.
- **Tools Attached**:
  - `get_financials`: Capex and R&D spending from cash flow statements.
  - `search_web`: Management guidance and investor presentation commentary.
  - `search_documents`: RAG lookup across uploaded investor presentation PDFs.
- **Key Evidence Captured**: Committed capital expenditure, capacity utilization, multi-year addressable market expansion.

---

### 6. Risk Agent (`risk`)
- **Role**: Downside & Risk Analyst
- **Objective**: Identifies key downside risks, debt maturity walls, regulatory threats, customer concentration, and macro headwinds.
- **Tools Attached**:
  - `get_financials`: Debt obligations, interest coverage, and short-term debt ratios.
  - `calculate_ratio`: Interest coverage ratio and debt service measurements.
  - `search_news`: Litigation, tax notices, and regulatory scrutiny.
- **Key Evidence Captured**: Debt maturity schedule, interest coverage safety buffer, concentration risks, macroeconomic sensitivity.

---

### 7. Document Agent (`document`)
- **Role**: Filings & Document Specialist
- **Objective**: Retrieves and cites ground-truth disclosures from user-uploaded PDFs and annual reports.
- **Tools Attached**:
  - `search_documents`: Semantic search across FAISS vector store of ingested documents.
  - `retrieve_evidence`: Exact verbatim chunk retrieval with page number and section metadata.
- **Key Evidence Captured**: Verbatim excerpts from 10-K, 10-Q, Annual Reports, and Earnings Transcripts with page citations.

---

### 8. Industry Agent (`industry`)
- **Role**: Industry & Sector Specialist
- **Objective**: Benchmarks company positioning against broader sector cycles and macro tailwinds.
- **Tools Attached**:
  - `get_benchmark_history`: Sector index performance.
  - `search_web`: Industry reports, trade association releases, and regulatory policies.
- **Key Evidence Captured**: Cyclical stage, competitive advantages (moats), industry growth rate.

---

### 9. Workforce / Jobs Agent (`workforce` / `jobs`)
- **Role**: Workforce & Talent Analyst
- **Objective**: Tracks hiring velocity, talent attrition, key executive appointments/departures, and corporate sentiment.
- **Tools Attached**:
  - `search_jobs`: Real ATS job board tracking (Greenhouse, Lever, official career portals).
  - `fetch_job_detail`: In-depth analysis of open technical and executive roles.
- **Key Evidence Captured**: Open headcount trends, expansion into new technology hubs, key leadership changes.

---

## 3. The `AgentResult` Contract

Every agent outputs a strictly-validated Pydantic contract:

```python
class AgentResult(BaseModel):
    agent: str                     # e.g., "financial"
    company: str                   # e.g., "Tata Consultancy Services"
    timestamp: str                 # ISO-8601 execution time
    reasoning: str                 # 2-4 sentence summary of methodology
    findings: list[FindingItem]    # Key insights, each linked to evidence_ids
    positive_signals: list[SignalItem] # Bullish catalysts
    negative_signals: list[SignalItem] # Bearish indicators
    risks: list[RiskItem]          # Vulnerabilities
    evidence: list[EvidenceItem]   # Audited evidence items with values, units, sources
    sources: list[str]             # List of source titles
    confidence: str                # "high", "medium", or "low"
    data_gaps: list[str]           # Unobtainable or missing data points
```
