import { useState } from 'react'
import { ArrowRight, CheckCheck, FileText, Layers, Minus, Plus } from 'lucide-react'
export default function DiscoverBanner() {
  const [expanded, setExpanded] = useState(false)
  return <section id="methodology" className="methodology">
    <div className="section-heading"><h2>From curiosity to clarity.</h2><span>The research process</span></div>
    <div className="process-grid">
      {[{ icon: Layers, title: 'Specialists investigate', text: 'The right research agents for your question.' }, { icon: CheckCheck, title: 'Evidence gets checked', text: 'Sources validated. Missing evidence flagged.' }, { icon: FileText, title: 'Your report, ready', text: 'A cited PDF to read, save, and revisit.' }].map(({ icon: Icon, title, text }, i) => <div className="process-step" key={title}><span className="process-number">0{i + 1}</span><Icon size={19} /><h3>{title}</h3><p>{text}</p>{i < 2 && <ArrowRight size={15} className="process-arrow" />}</div>)}
    </div>
    <button className="method-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="method-details">What goes into my research? {expanded ? <Minus size={15} /> : <Plus size={15} />}</button>
    {expanded && <div id="method-details" className="method-details animate-fade-up">Your question is used to select relevant specialists across financials, valuation, markets, growth, news, and risk. The workflow validates evidence, compares bullish and bearish arguments, and assembles a cited report. Financial ratios are calculated in code. Missing evidence is labelled so you can understand the limits of the research.</div>}
  </section>
}

