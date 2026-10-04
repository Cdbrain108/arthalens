# Deterministic Research Tools (`backend/app/tools/`)

## 1. Overview: "LLMs Reason, Python Computes"

A foundational principle of this architecture is that **Large Language Models must never perform arithmetic, financial ratio calculations, or technical indicator computations**.

LLMs frequently hallucinate math, invert divisions, or cite inconsistent multiples. In this codebase:
- **LLMs orchestrate and reason**: They decide *which* ratios to evaluate and *how* to interpret the trends.
- **Python computes deterministically**: Exact math is executed in pure Python with all inputs (numerator, denominator, date) recorded in the result envelope.

---

## 2. Standard Tool Envelope

Every tool in the system returns a uniform, structured envelope:

```python
{
    "ok": True,               # Boolean indicating execution success
    "data": { ... },          # Structured payload (dict, list, or scalar)
    "source": {
        "title": "Yahoo Finance",
        "provider": "yfinance",
        "retrieved_at": "2026-09-30T17:30:00Z"
    },
    "error": None             # String error message if ok is False
}
```

If a tool encounters a network glitch or missing symbol, it **never crashes the agent**. It returns `ok: False` with a descriptive error so the agent can record a data gap and continue.

---

## 3. Tool Suites Breakdown

### A. Financial Tools (`financial_tools.py`)
- **`get_financials(ticker, period)`**: Pulls income statements, balance sheets, and cash flow statements across trailing annual/quarterly periods using `yfinance`.
- **`get_company_metrics(ticker)`**: Fetches market cap, enterprise value, shares outstanding, and reported financial metrics.
- **`calculate_ratio(name, inputs)`**: Pure Python arithmetic engine for financial ratios. Supported ratio names:
  - `pe`: Price to Earnings (`price / eps`)
  - `pb`: Price to Book (`price / book_value_per_share`)
  - `ps`: Price to Sales (`market_cap / revenue`)
  - `evebitda`: Enterprise Value to EBITDA (`enterprise_value / ebitda`)
  - `peg`: PEG Ratio (`pe / (earnings_growth * 100)`)
  - `roe`: Return on Equity (`net_income / total_equity`)
  - `roce`: Return on Capital Employed (`ebit / (total_assets - current_liabilities)`)
  - `debtequity`: Debt to Equity (`total_debt / total_equity`)
  - `currentratio`: Current Assets / Current Liabilities
  - `operatingmargin`: Operating Income / Revenue
  - `netmargin`: Net Income / Revenue
  - `fcfyield`: Free Cash Flow / Market Cap
- **`get_peer_multiples(ticker, peers)`**: Fetches valuation multiples across peer companies for industry benchmarking.
- **`get_historical_multiples(ticker)`**: Computes 3Y and 5Y median multiple trends.

---

### B. Market Tools (`market_tools.py`)
- **`get_quote(ticker, exchange)`**: Fetches real-time trade price, day's high/low, currency, and volume.
- **`get_price_history(ticker, period, interval)`**: Fetches historical OHLCV candle series.
- **`get_volume(ticker, period)`**: Calculates volume moving averages and identifies volume spikes.
- **`get_benchmark_history(benchmark, period)`**: Retrieves comparative benchmark index data (NIFTY 50, S&P 500, Sector indices).
- **`get_technicals(ticker)`**: Computes deterministic 50-day and 200-day Simple Moving Averages and RSI (Relative Strength Index).

---

### C. News Tools (`news_tools.py`)
- **`search_news(query, since, deep)`**:
  - Primary provider: Google News RSS (free, public, no API key needed).
  - Normalizes RFC-822 dates into clean ISO-8601 strings.
  - Resolves redirect tokens to publisher domains (Livemint, Economic Times, Bloomberg, Reuters).
  - Fallback provider: Tavily API (activated only if RSS returns insufficient material).
- **`fetch_news(url)`**: Extracts clean, readable text from target news links.

---

### D. Regulatory & Filings Tools (`filings_tools.py`)
- **`get_edgar_quarterly(ticker)`**: Queries US SEC EDGAR submissions API for official 10-Q, 10-K, and 8-K filings with direct accession links.
- **`get_nse_results(ticker)`**: Generates verified corporate disclosure deep-links for Indian exchange (NSE/BSE) quarterly results.
- **`get_quarterly_results(ticker, exchange)`**: Auto-routes to SEC EDGAR for US tickers or NSE for Indian tickers.

---

### E. Document & RAG Tools (`document_tools.py`)
- **`search_documents(query, company, doc_type, period, document_ids)`**: Queries local FAISS vector store for semantically relevant chunks across uploaded PDF documents.
- **`retrieve_evidence(chunk_ids)`**: Retrieves full chunk passages with exact page number and document metadata.

---

### F. Workforce & Jobs Tools (`jobs_tools.py`)
- **`search_jobs(company, role_query)`**: Queries official company ATS job boards (Greenhouse, Lever) to monitor hiring velocity and expansion.
- **`fetch_job_detail(job_id, url)`**: Inspects requirements and skills for open key roles.

---

### G. Web Search Tools (`web_tools.py`)
- **`search_web(query, limit)`**: Free web search using DuckDuckGo (`ddgs`).
- **`fetch_page(url)`**: Safe HTML downloader with article text extraction and boilerplate stripping.
