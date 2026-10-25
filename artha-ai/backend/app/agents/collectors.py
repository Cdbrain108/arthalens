"""Bounded evidence collection shared by every model provider.

One failing tool records a gap and does not discard already collected evidence.
No model can create source records, calculations, dates or tool success here.
"""
from datetime import datetime, timezone
import hashlib
import math

from ..schemas.models import AgentResult, EvidenceItem, Finding
from ..tools import financial_tools as ft, market_tools as mt, web_tools as wt
from ..tools import jobs_tools as jt, document_tools as dt
from .base import _workforce_hit_allowed


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _resolve_ent_exchange(ent: dict) -> str | None:
    ex = ent.get('exchange')
    if ex and str(ex).strip() and str(ex).strip().lower() not in ('none', 'null', ''):
        return str(ex).strip()
    from ..tools.base import resolve_ticker_info
    t = (ent.get('ticker') or '').strip()
    n = (ent.get('name') or '').strip()
    info = resolve_ticker_info(t or n)
    if info and info.get('exchange'):
        return info['exchange']
    return None


class Collector:
    def __init__(self, name, state):
        self.name, self.state = name, state
        self.now = datetime.now(timezone.utc).isoformat()
        self.evidence, self.findings, self.gaps = [], [], []
        self.calls = []

    def call(self, tool, **args):
        self.calls.append(tool.name)
        try:
            output = tool.invoke(args)
            if not isinstance(output, dict) or not output.get("ok"):
                error = output.get("error") if isinstance(output, dict) else "invalid response"
                self.gaps.append(f"{self.name}: {tool.name} {args.get('ticker', args.get('company', ''))}: {error or 'unavailable'}")
                return {}
            return output
        except Exception as exc:
            self.gaps.append(f"{self.name}: {tool.name} failed ({type(exc).__name__})")
            return {}

    def add(self, out, entity, claim, *, value=None, metric=None, unit=None,
            period=None, basis=None, formula=None, inputs=None, **extra):
        if value is not None and not finite(value):
            return
        source = out.get("source") or {}
        data = out.get("data") or {}
        item = EvidenceItem(
            claim=claim, agent=self.name, value=value, metric=metric, unit=unit,
            entity=entity, period=period, basis=basis, formula=formula,
            calc_inputs=inputs or {}, source_title=source.get("title") or "Source unavailable",
            source_url=source.get("url"), retrieved_at=source.get("retrieved_at") or self.now,
            excerpt=claim, publication_date=data.get("publication_date"),
            source_type="deterministic_calculation" if inputs else "provider", **extra)
        item.evidence_id = "ev_" + hashlib.sha256(
            f"{self.name}|{entity}|{claim}|{item.source_url}|{period}".encode()).hexdigest()[:16]
        self.evidence.append(item)
        self.findings.append(Finding(claim=claim, evidence_ids=[item.evidence_id]))

    def number(self, out, ticker, metric, value, unit, period, basis, **kwargs):
        if finite(value):
            if unit == "%":
                val_str = f"{value:.2f}%"
            elif unit == "x":
                val_str = f"{value:.2f}x"
            elif unit in ("INR", "₹") and abs(value) >= 1e12:
                val_str = f"₹{value/1e12:.2f}T (₹{value/1e7:,.0f} Cr)"
            elif unit in ("INR", "₹") and abs(value) >= 1e7:
                val_str = f"₹{value/1e7:,.2f} Cr"
            elif unit in ("USD", "$") and abs(value) >= 1e12:
                val_str = f"${value/1e12:.2f}T"
            elif unit in ("USD", "$") and abs(value) >= 1e9:
                val_str = f"${value/1e9:.2f}B"
            elif unit in ("USD", "$") and abs(value) >= 1e6:
                val_str = f"${value/1e6:.2f}M"
            elif abs(value) >= 100:
                val_str = f"{value:,.2f} {unit}"
            else:
                val_str = f"{value:.2f} {unit}"

            claim = f"{ticker}: {metric.replace('_', ' ')} = {val_str}; period {period}; basis {basis}."
            sentiment = kwargs.pop("sentiment", None)
            if not sentiment:
                if metric in ("revenue_growth_pct", "opm_pct", "npm_pct", "roe_pct", "roce_pct"):
                    sentiment = "positive" if value > 0 else "negative"
                elif metric == "debt_equity":
                    sentiment = "positive" if value <= 0.8 else ("negative" if value > 1.5 else "neutral")
                elif metric == "free_cash_flow":
                    sentiment = "positive" if value > 0 else "negative"
                elif metric == "total_return":
                    sentiment = "positive" if value > 0 else "negative"
                else:
                    sentiment = "neutral"

            self.add(out, ticker, claim, value=value, metric=metric, unit=unit,
                     period=period, basis=basis, sentiment=sentiment or "neutral", **kwargs)

    def financial(self, ent):
        ticker, exchange = ent['ticker'], _resolve_ent_exchange(ent)
        args = dict(ticker=ticker, exchange=exchange)
        metrics = self.call(ft.get_company_metrics, **args)
        md = metrics.get('data') or {}
        currency = md.get('currency') or 'currency unspecified'
        for metric in ('market_cap', 'total_debt', 'eps_trailing', 'book_value_per_share'):
            self.number(metrics, ticker, metric, md.get(metric), currency, 'provider snapshot', 'provider-reported')
        for statement, period in [('income', 'annual'), ('income', 'quarterly'), ('balance', 'annual'), ('cashflow', 'annual')]:
            out = self.call(ft.get_financials, **args, statement=statement, period=period)
            data = out.get('data') or {}
            lines = data.get('line_items') or {}
            currency, basis = data.get('currency') or 'currency unspecified', data.get('basis') or 'provider-reported'
            fields = {
                'income': {'revenue': ['Total Revenue', 'Operating Revenue'], 'net_income': ['Net Income', 'Net Income Common Stockholders'], 'operating_income': ['Operating Income']},
                'balance': {'total_debt': ['Total Debt'], 'equity': ['Stockholders Equity', 'Total Equity Gross Minority Interest'], 'cash': ['Cash And Cash Equivalents']},
                'cashflow': {'operating_cash_flow': ['Operating Cash Flow'], 'free_cash_flow': ['Free Cash Flow'], 'capital_expenditure': ['Capital Expenditure']},
            }[statement]
            def values(row):
                return {metric: next((row[k] for k in aliases if finite(row.get(k))), None) for metric, aliases in fields.items()}
            dates = sorted(lines, reverse=True)
            if not dates:
                self.gaps.append(f'{ticker}: {period} {statement} statement unavailable')
            for date in dates[:4 if period == 'quarterly' else 2]:
                row = values(lines[date])
                for metric, value in row.items():
                    self.number(out, ticker, metric, value, currency, f'{period} ended {date}', basis)
                if statement == 'income' and finite(row.get('revenue')) and row['revenue'] > 0:
                    for metric, numerator in [('npm_pct', 'net_income'), ('opm_pct', 'operating_income')]:
                        if finite(row.get(numerator)):
                            inputs = {'numerator': row[numerator], 'denominator': row['revenue']}
                            ratio = self.call(ft.calculate_ratio, name='margin_pct', inputs=inputs)
                            self.number(ratio, ticker, metric, (ratio.get('data') or {}).get('value'), '%', f'{period} ended {date}', basis,
                                        formula='numerator / denominator × 100', inputs=inputs)
                if statement == 'balance' and finite(row.get('total_debt')) and finite(row.get('equity')) and row['equity'] > 0:
                    inputs = {'total_debt': row['total_debt'], 'equity': row['equity']}
                    ratio = self.call(ft.calculate_ratio, name='debt_equity', inputs=inputs)
                    self.number(ratio, ticker, 'debt_equity', (ratio.get('data') or {}).get('value'), 'x', f'annual ended {date}', basis,
                                formula='total_debt / equity', inputs=inputs)
            if statement == 'income' and period == 'annual' and len(dates) >= 2:
                current, previous = values(lines[dates[0]]).get('revenue'), values(lines[dates[1]]).get('revenue')
                if finite(current) and finite(previous):
                    growth = self.call(ft.compute_growth, current=current, previous=previous, current_period=dates[0], previous_period=dates[1], basis=basis)
                    gd = growth.get('data') or {}
                    self.number(growth, ticker, 'revenue_growth_pct', gd.get('value'), '%', f'{dates[1]} to {dates[0]}', basis,
                                formula=gd.get('formula'), inputs=gd.get('inputs'))
            if statement == 'income' and period == 'quarterly' and len(dates) >= 2:
                # 4 quarters prior represents exact YoY for quarterly financial statements
                prev_idx = 4 if len(dates) >= 5 else 1
                current, previous = values(lines[dates[0]]).get('revenue'), values(lines[dates[prev_idx]]).get('revenue')
                label = "YoY" if prev_idx == 4 else "QoQ"
                if finite(current) and finite(previous):
                    growth = self.call(ft.compute_growth, current=current, previous=previous, current_period=dates[0], previous_period=dates[prev_idx], basis=f"quarterly {label} {basis}")
                    gd = growth.get('data') or {}
                    self.number(growth, ticker, f'quarterly_{label.lower()}_revenue_growth_pct', gd.get('value'), '%', f'{dates[prev_idx]} to {dates[0]}', basis,
                                formula=gd.get('formula'), inputs=gd.get('inputs'))

    def valuation(self, ent):
        ticker, exchange = ent['ticker'], _resolve_ent_exchange(ent)
        args = dict(ticker=ticker, exchange=exchange)
        metrics, quote = self.call(ft.get_company_metrics, **args), self.call(mt.get_quote, **args)
        md, qd = metrics.get('data') or {}, quote.get('data') or {}
        for name, key, denominator, metric in [('pe', 'eps', 'eps_trailing', 'pe_ratio'), ('pb', 'book_value_per_share', 'book_value_per_share', 'pb_ratio')]:
            if finite(qd.get('price')) and finite(md.get(denominator)) and md[denominator] > 0:
                if md.get('currency') and qd.get('currency') and md['currency'] != qd['currency']:
                    self.gaps.append(f'{ticker}: quote and fundamental currencies differ; {name} not computed')
                    continue
                inputs = {'price': qd['price'], key: md[denominator]}
                out = self.call(ft.calculate_ratio, name=name, inputs=inputs)
                # Retain the underlying source links in the calculation record.
                out.setdefault('source', {})['url'] = quote.get('source', {}).get('url')
                self.number(out, ticker, metric, (out.get('data') or {}).get('value'), 'x', qd.get('as_of') or 'quote date unavailable',
                            f"provider trailing inputs; {qd.get('currency') or 'currency unspecified'}", formula=f'price / {key}', inputs=inputs)
            else:
                self.gaps.append(f'{ticker}: positive {denominator} and price required for {name}')
        peers = [e['ticker'] for e in self.state.get('entities', []) if e.get('ticker') and e['ticker'] != ticker and (e.get('exchange') or 'NSE') == exchange]
        peer_data = self.call(ft.get_peer_multiples, **args, peers=peers)
        for row in (peer_data.get('data') or {}).get('peers', []):
            for metric in ('pe', 'pb', 'ps', 'ev_ebitda'):
                self.number(peer_data, row.get('ticker'), f'peer_{metric}', row.get(metric), 'x', 'provider snapshot', 'user comparison set, not a sector benchmark')
        history = self.call(ft.get_historical_multiples, **args, period='1y')

    def market(self, ent):
        ticker, exchange = ent['ticker'], _resolve_ent_exchange(ent)
        args = dict(ticker=ticker, exchange=exchange)
        quote = self.call(mt.get_quote, **args)
        qd = quote.get('data') or {}
        self.number(quote, ticker, 'price', qd.get('price'), qd.get('currency') or 'currency unspecified', qd.get('as_of') or 'provider date unavailable', qd.get('quote_type') or 'provider quote')
        history = self.call(mt.get_price_history, **args, period='1y')
        tech = self.call(mt.get_technicals, **args, period='1y')
        td = tech.get('data') or {}
        series = (history.get('data') or {}).get('series') or []
        period = f"{series[0]['date']} to {series[-1]['date']}" if series else 'history period unavailable'
        closes = [p['close'] for p in series if finite(p.get('close'))]
        inputs = {'closes': closes} if closes else None
        for metric in ('last_close', 'total_return', 'volatility_daily', 'high_52w', 'low_52w'):
            self.number(tech, ticker, metric, td.get(metric), 'decimal' if metric in ('total_return', 'volatility_daily') else qd.get('currency') or 'price units',
                        period, 'provider adjusted closes; range is closing-price range', formula=td.get('computation'), inputs=inputs)
        for metric, value in (td.get('sma') or {}).items():
            self.number(tech, ticker, metric, value, qd.get('currency') or 'price units', period, 'adjusted closes', formula=td.get('computation'), inputs=inputs)
        volume = self.call(mt.get_volume, **args)
        for key in ('avg_volume', 'latest_volume'):
            self.number(volume, ticker, key, (volume.get('data') or {}).get(key), 'shares', '3mo provider history', 'reported volume')
        benchmark = self.call(mt.get_benchmark_history, **args, period='1y')
        bd = benchmark.get('data') or {}
        points = bd.get('series') or []
        if points:
            self.number(benchmark, bd.get('ticker'), 'benchmark_close', points[-1].get('close'), 'index points', points[-1].get('date'), 'market benchmark, not sector benchmark')

    def narrative(self, ent):
        company, ticker = ent.get('name') or ent.get('ticker'), ent.get('ticker') or ent.get('name')
        angles = {'growth': 'company expansion capital expenditure products partnerships status',
                  'risk': 'company risks debt litigation customer concentration regulatory filing',
                  'industry': 'industry competition demand market structure sector outlook',
                  'management': 'company board management governance capital allocation annual report',
                  'workforce': 'official careers annual report employees hiring attrition',
                  'social': 'public investor discussion company stock'}
        if self.name == 'workforce':
            jobs = self.call(jt.search_jobs, company=company, limit=5)
            for row in (jobs.get('data') or {}).get('jobs', []):
                if not _workforce_hit_allowed(row):
                    continue
                out = {'source': {**jobs.get('source', {}), 'url': row.get('url')}, 'data': {}}
                self.add(out, ticker, f"{company}: listed role {row.get('title')} — {row.get('location') or 'location not supplied'}.", coverage='official ATS listing')
            self.gaps.append(f'{company}: a current job listing is not a hiring-growth or attrition measure.')
        out = self.call(wt.search_web, query=f'"{company}" {angles[self.name]}')
        hits = (out.get('data') or {}).get('results') or []
        for hit in hits[:4]:
            if self.name == 'workforce' and not _workforce_hit_allowed(hit):
                continue
            url = hit.get('url') or hit.get('href')
            text = hit.get('body') or hit.get('snippet')
            if not url or not text:
                continue
            self.add({'source': {**out.get('source', {}), 'url': url, 'title': hit.get('title') or 'Search result'}, 'data': {}}, ticker,
                     f"Search excerpt about {company}: {text[:700]}", confidence='low', coverage='search snippet; page not verified', claim_type='interpretation')
        if not hits:
            self.gaps.append(f'{company}: no {self.name} search results')
        self.gaps.append(f'{company}: {self.name} search snippets require original-page verification; publication dates may be unavailable.')

    def documents(self):
        ids = self.state.get('document_ids') or []
        if not ids:
            self.gaps.append('No documents selected; upload and select a PDF to enable document research.')
            return
        out = self.call(dt.search_documents, query=self.state.get('query', ''), document_ids=ids)
        for chunk in (out.get('data') or {}).get('chunks', []):
            md = chunk.get('metadata') or {}
            if md.get('document_id') not in ids:
                continue
            text = chunk.get('text', '')
            if text:
                self.add({'source': {'title': md.get('source') or md.get('title') or 'Uploaded document'}, 'data': {}}, md.get('company'), text[:1000],
                         document_id=md['document_id'], page=md.get('page'), coverage='retrieved document excerpt', evidence_type='primary')
                self.evidence[-1].source_type = 'uploaded_document'
        if not self.evidence:
            self.gaps.append('No passages matched the selected documents.')

    def result(self):
        status = 'partial' if self.evidence and self.gaps else 'completed' if self.evidence else 'unavailable'
        return AgentResult(agent=self.name, company=' / '.join(e.get('name') or e.get('ticker') or 'Unknown' for e in self.state.get('entities', [])),
                           timestamp=self.now, status=status, evidence=self.evidence, findings=self.findings,
                           sources=sorted({e.source_title for e in self.evidence}), data_gaps=list(dict.fromkeys(self.gaps)),
                           confidence='medium' if self.evidence else 'low',
                           reasoning=f"Called {', '.join(dict.fromkeys(self.calls)) or 'no tools'}. Retained {len(self.evidence)} tool evidence items. Collection used Python; sources were not independently verified.")


def collect(name, state):
    collector = Collector(name, state)
    if name == 'document':
        collector.documents()
    else:
        entities = [e for e in state.get('entities', []) if e.get('name') or e.get('ticker')]
        if not entities:
            collector.gaps.append('No company or ticker resolved. Specify a company or exchange-qualified ticker.')
        for entity in entities[:4]:
            if name in ('financial', 'valuation', 'market'):
                if entity.get('ticker'):
                    getattr(collector, name)(entity)
                else:
                    collector.gaps.append(f"No ticker resolved for {entity.get('name')}")
            else:
                collector.narrative(entity)
        if len(entities) > 4:
            collector.gaps.append('This run covers the first four resolved entities; split larger comparisons into separate runs.')
    return collector.result()
