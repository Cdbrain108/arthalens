# Bulls Eye — Tool Landscape: Search, Extraction & Market Data (researched Sep 2026)

₹0-first philosophy: **Tier 0 = keyless** (no signup at all) → **Tier 1 = free key**
(no card) → **Tier 2 = paid/optional**. Agents must degrade gracefully down the tiers.

## 1 · Web search (for growth / risk / workforce / social agents)

| Tool | Tier | Free allowance (2026) | Strength | Catch |
|---|---|---|---|---|
| **Tavily keyless** (`X-Tavily-Access-Mode: keyless`) | 0 — no key | Rate-limited free | Search AND extract in one call, `topic="news"`, relevance scores, CrewAI-native | Keyless budget is small; needs key after |
| **Tavily keyed** | 1 | 1,000 credits/mo, no card | Same + higher limits; `search_depth` basic=1 credit / advanced=2 | Aggregated index, advanced = 2–3s latency |
| **Jina Search** (`s.jina.ai`) | 0 | Generous free | Search+read top-5 in ONE call — ideal agent primitive | Snippets, not deep crawl |
| **DuckDuckGo** (`ddgs`, current impl.) | 0 | Unlimited-ish | No key, private | Bot-throttling, thin snippets, no extraction |
| **Serper** | 1 | 2,500 queries/mo | Cheapest Google SERP ($0.001/q), news/images endpoints | Snippets only — pair with an extractor |
| **Exa** | 1 | $10 signup credit (~1k searches) | Neural semantic search + `find_similar`, contents+summary bundled | One-time credit; weak on breaking news |
| **Google Custom Search** | 1 | 100 queries/day (~3k/mo) | Official Google index | Restricted to pre-registered sites (site-search shaped) |
| **SearXNG** (self-host) | 0 | Unlimited | Metasearch, private, free forever | You host it; upstreams may throttle your IP |
| Brave Search API | 2 | ⚠️ free tier **retired Feb 2026** — $5/mo credit, card required | Independent index, fastest (~250–400ms), news endpoint | No longer ₹0 — do NOT make it the default |

**Decision:** Tavily keyless → Tavily keyed → Jina Search → DDG chain, Serper/Exa as keyed
optionals. Never depend on Brave free (it no longer exists).

## 2 · Page fetch & key-info extraction (for `fetch_page`, news bodies, filings)

Ladder by job size — pick the rung, not the brand:

| Rung | Tool | Tier | Notes |
|---|---|---|---|
| Single URL, zero setup | **Jina Reader** (`r.jina.ai/<url>`) | 0 (~10M free tokens) | Prefix-a-URL → clean markdown; handles PDFs; `x-json-schema` header = structured fields, no LLM call |
| Local deterministic clean | **trafilatura** (pip) | 0 | Gold-standard boilerplate removal; metadata (title/author/date); zero network dependency |
| Query-aware (token saver) | **trawl**-pattern (local bge-m3 + rerank) | 0 (self-host) | Returns only the 5–12 chunks relevant to the query (~23× fewer tokens than full dump) |
| Standing high-volume ingest | **Crawl4AI** (self-host) | 0 (your CPU/RAM) | Playwright, deep crawl, CSS/XPath/LLM extraction; zero per-page fee |
| Managed scale | **Firecrawl** | 1 (1k credits/mo) | Scrape/crawl/map + schema-driven LLM extraction; official CrewAI tool |
| Fact verification | **Jina Grounding** (`g.jina.ai`) | 0/1 | Fact-check a claim vs live web — purpose-built for our **Validator** stage |

Current `fetch_page` (raw httpx + regex strip) should become:
`Jina Reader → trafilatura fallback → raw strip`, each result carrying
`extraction_method` + `quality` so the Validator can weight it.

## 3 · Market & financial data (for market / financial / valuation agents)

| Tool | Tier | Free allowance | Best for | Catch |
|---|---|---|---|---|
| **yfinance** (current) | 0 | Unofficial ~2k req/hr | Quotes, history, statements, bulk `download()` | No SLA — broke 48h in Dec 2025; Yahoo rate-limits |
| **Stooq CSV** (`stooq.com/q/d/l/?s=tcs.ns&i=d`) | 0 | Unlimited | Dead-simple daily OHLC fallback, no lib needed | Daily only, no fundamentals |
| **Finnhub** | 1 | **60 req/min** | Best free prototyping rate; clean 429s; news + sentiment endpoints | Free excludes fundamentals |
| **Twelve Data** | 1 | 800 credits/day, 8/min | 100-call/day shape; WS trial; MCP server | Time-series = 8 credits/call; delayed on free |
| **Alpha Vantage** | 1 | ⚠️ 25 req/day | Familiar, JSON+Excel | A trap for agents — exhausted in 2–3 queries |
| **Downstox** (India) | 0 | Unauthenticated, no signup | NIFTY/SENSEX overview, sector heatmap, screener count, per-symbol fundamentals+MTF | No published rate guarantee |
| **bfinance** (India, pip) | 0 | Open source | **Drop-in yfinance replacement** + 10yr Ind AS statements, concalls, shareholding, Piotroski/Graham | Community lib — pin version |
| **nsefeed / bseindia** (India, pip) | 0 | Open source | NSE archives CSV, bhavcopy, bulk/block deals, holidays | Unofficial scrapers — rate-limit politely |
| **screener.in** pages | 0 | Public web pages | Richest Indian fundamentals UI → extract via Reader/trafilatura | Respect ToS/robots; no official API |
| **Genka** (India) | 0/1 | Freemium API | XBRL fundamentals, concall transcripts w/ grounded Q&A, corp actions | Newer vendor — verify SLA |

**Decision:** yfinance (primary) → Stooq (quote fallback) → Finnhub/Twelve Data (keyed upgrades);
India depth via bfinance + Downstox. Keep `calculate_ratio` — deterministic layer stays ours.

## 4 · News (for the news agent — replace/augment Google News RSS)

| Source | Tier | Notes |
|---|---|---|
| **Google News RSS** (current) | 0 | Works as of Jul 2026. Add `when:1d` operator, `hl/gl/ceid` locale, `feedparser`, redirect-resolve, dedupe. Caveats: ~100-item cap, **median item age ~6.6 days** — weak on breaking news |
| **Yahoo Finance per-symbol RSS** | 0 | `feeds.finance.yahoo.com/rss/2.0/headline?s=TCS.NS` — tight company relevance |
| **Bing News RSS** | 0 | Second keyless index for cross-validation |
| **GDELT DOC 2.0 API** | 0 | Global news search, no key, ~1 req/5s per IP — best keyless structured news |
| **TickerTick** | 0 | 10 req/min per IP, company news |
| **Finviz news table** | 0 | Quote-page headlines (US; some global) |
| **Tavily `topic="news"`** | 0/1 | LLM-ranked recent articles with content — best keyed upgrade |
| **GNews / NewsAPI / NewsData.io** | 1 | ~100–200 req/day free keys — fine as tertiary fallbacks |

**Decision:** RSS trio (Google + Yahoo-symbol + Bing) + GDELT in Tier 0; Tavily-news when a key exists.

## 5 · Recommended per-agent wiring

| Agent | Tier 0 (now, keyless) | Tier 1 (free key) |
|---|---|---|
| market / financial / valuation | yfinance → Stooq fallback; `calculate_ratio` | Finnhub (60/min) → Twelve Data; bfinance for India depth |
| news | Google RSS (`when:`, feedparser, redirect-resolve) + Yahoo RSS + Bing RSS + GDELT | Tavily `topic=news`; GNews |
| growth / risk | Tavily keyless → Jina Search → DDG | Serper (volume) / Exa (semantic) |
| workforce / social | Jina Search → DDG (+ career-page fetch) | Serper |
| document / RAG | FAISS + trafilatura-chunked filings; query-aware top-k | Firecrawl for hostile JS pages |
| fetch_page (shared) | Jina Reader → trafilatura → raw strip (+method/quality tags) | Firecrawl |
| Validator (stage) | source/date/units/conflict checks (keep) | **Jina Grounding** spot-checks on high-stakes claims |

## 6 · Cross-cutting rules
1. **Search-router pattern**: one internal `search_web` that routes by intent
   (news / semantic / general) across providers + cache `(query, intent)` —
   TTL 1h general / 15min news / 24h reference. Caching saves more quota than any provider choice.
2. **Parallel fan-out needs a token bucket** — keyless tiers punish bursts (this already bit us once in testing).
3. **Every tool returns the envelope** `{ok, data, source, error}` — failures become evidence gaps, never exceptions.
4. **Provenance tags**: `extraction_method` (jina/trafilatura/raw/firecrawl) and published-vs-retrieved dates flow into the citation index.
5. **Respect ToS/robots** for screener.in, NSE/BSE unofficial libs, Yahoo — polite rates, attribution where required.
