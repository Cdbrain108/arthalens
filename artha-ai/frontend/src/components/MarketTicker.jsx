/**
 * Research-coverage marquee. Symbols only — never prices, so nothing can be
 * read as a live quote. The list is duplicated (second copy aria-hidden) so
 * the CSS translateX(-50%) loop is seamless. Paused on hover; under
 * prefers-reduced-motion CSS stops the loop and allows manual scrolling.
 */
const SYMBOLS = [
  'TCS.NS', 'INFY.NS', 'RELIANCE.NS', 'HDFCBANK.NS', 'ICICIBANK.NS',
  'TATAMOTORS.NS', 'WIPRO.NS', 'SBIN.NS', 'LT.NS', 'BAJFINANCE.NS',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'JPM', 'XOM',
]

export default function MarketTicker({ label = 'Research coverage universe' }) {
  const row = SYMBOLS.map(symbol => (
    <li key={symbol} className="be-ticker-item">{symbol}</li>
  ))

  return (
    <div className="be-ticker" role="group" aria-label={label}>
      <span className="be-ticker-label">Coverage</span>
      {/* Focusable so the clipped/scrollable strip is reachable by keyboard
          (axe scrollable-region-focusable / WCAG 2.1.1). */}
      <div className="be-ticker-viewport" role="group" tabIndex={0} aria-label="Scrollable coverage list">
        <div className="be-ticker-track">
          <ul className="be-ticker-list">{row}</ul>
          <ul className="be-ticker-list" aria-hidden="true">{row}</ul>
        </div>
      </div>
    </div>
  )
}
