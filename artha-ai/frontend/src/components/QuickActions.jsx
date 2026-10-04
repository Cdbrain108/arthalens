import { ArrowUpRight, TrendingUp, Scale, Rocket, ScanLine } from 'lucide-react'
const EXAMPLES = [
  { icon: TrendingUp, title: 'Decode the movement', category: 'MARKET PULSE', query: 'Why did TCS move today?', tone: 'blue' },
  { icon: Scale, title: 'Think long term', category: 'INVESTMENT THESIS', query: 'Should I hold TCS for five years?', tone: 'purple' },
  { icon: Rocket, title: 'Find the next chapter', category: 'GROWTH & RISK', query: "Analyze Reliance's growth projects and risks", tone: 'peach' },
  { icon: ScanLine, title: 'See the bigger picture', category: 'VALUATION', query: 'Compare TCS and Infosys on valuation', tone: 'blue' },
]
export default function QuickActions({ onPick, disabled }) {
  return <section id="explore" className="explore-section" aria-labelledby="explore-heading">
    <div className="section-heading">
      <h2 id="explore-heading">A good question is a great start.</h2>
      <span id="explore-description">Ideas to get you thinking</span>
    </div>
    <ul className="idea-grid stagger" aria-describedby="explore-description">
      {EXAMPLES.map(({ icon: Icon, title, category, query, tone }, index) => {
        const queryId = `idea-query-${index}`

        return <li key={title} className="idea-item">
          <button
            type="button"
            className={`idea-card ${tone}`}
            onClick={() => onPick(query)}
            disabled={disabled}
            aria-label={`${title}, ${category}`}
            aria-describedby={queryId}
            data-tone={tone}
            data-category={category}
          >
            <div className="idea-top">
              <span className="idea-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.6} /></span>
              <span className="idea-arrow-wrap" aria-hidden="true"><ArrowUpRight size={17} className="idea-arrow" /></span>
            </div>
            <span className="idea-category">{category}</span>
            <div className="idea-card-content">
              <h3>{title}</h3>
              <p id={queryId} className="idea-query">{query}</p>
            </div>
            <span className="idea-cta" aria-hidden="true">Explore idea <ArrowUpRight size={14} /></span>
          </button>
        </li>
      })}
    </ul>
  </section>
}

