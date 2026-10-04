import { useEffect, useState } from 'react'
import { ArrowUpRight, ArrowRight, Search, Sun, Moon, ShieldCheck, Layers3, FileText, Activity, Scale, ChevronDown } from 'lucide-react'
import { api } from '../api/client'
import Logo from './Logo'
import MarketAnimal from './MarketAnimal'

const STEPS = [
  ['Ask a better question', 'Start with a company, ticker, comparison or uploaded filing. The planner identifies the scope and the evidence needed.', '01 / SCOPE'],
  ['Follow the investigation', 'Relevant specialists collect financial, market and qualitative evidence in parallel. You can see their progress and gaps.', '02 / RESEARCH'],
  ['Hear both sides', 'Evidence is checked for conflicting values and missing sources. Bull and bear perspectives make the trade-offs visible.', '03 / CHALLENGE'],
  ['Keep the reasoning', 'Explore the report, inspect source links, ask follow-up questions and export the research as a PDF.', '04 / UNDERSTAND'],
]
const QUESTIONS = [
  ['Is this financial advice?', 'No. Bullseye is a research aid, not an investment adviser. Its findings can be incomplete or wrong. Verify important information against original filings and consider your own circumstances before making decisions.'],
  ['Where does the evidence come from?', 'Depending on the question: market-data providers, company filings, published news, official hiring boards and documents you upload. Each run lists the sources it actually used, retrieval times and any missing coverage.'],
  ['Does every specialist run for every question?', 'The planner selects relevant specialists. Broad company research needs a broad investigation; a focused news question should stay focused. Selected agents, failures and missing evidence are visible in the research workspace.'],
  ['What happens when data is missing?', 'Missing inputs stay unavailable. Python computes financial ratios only from supplied inputs; language models explain the evidence. Missing or conflicting evidence can prevent a recommendation.'],
  ['Can I compare companies and keep my research?', 'Yes. Ask a comparison question, reopen previous research from this browser’s history, or view and download a completed report as a PDF. Market coverage depends on the configured providers.'],
]
const SUGGESTIONS = ['TCS.NS', 'INFY.NS', 'RELIANCE.NS', 'AAPL', 'MSFT', 'NVDA']

function Registry() {
  const [agents, setAgents] = useState(null)
  const [error, setError] = useState(false)
  const [attempt, retry] = useState(0)
  useEffect(() => {
    let active = true
    setError(false)
    api.getAgents().then(data => {
      if (!Array.isArray(data) || !data.length) throw new Error('Registry unavailable')
      if (active) setAgents(data)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [attempt])
  return <section className="be-section" id="agents" aria-labelledby="agents-heading">
    <div className="be-section-heading"><div><p className="be-kicker">SPECIALISTS, WITH A PURPOSE</p><h2 id="agents-heading">Many lenses.<br />A fuller picture.</h2></div><p>A shared evidence trail, with a different question for every specialist. This list comes directly from the backend registry.</p></div>
    {error ? <div className="be-empty" role="status"><p>The agent registry is currently unavailable. Start the backend to see configured capabilities.</p><button className="be-text-button" onClick={() => retry(attempt + 1)}>Retry registry <ArrowRight size={16} /></button></div>
      : !agents ? <p className="be-empty" role="status">Loading the specialist registry…</p>
        : <div className="be-agent-grid">{agents.map((agent, index) => <article className="be-agent-card" key={agent.name}>
          <div className="be-card-top"><span className="be-number">{String(index + 1).padStart(2, '0')}</span><span className="be-tag">{agent.status || 'configured'}</span></div>
          <h3>{agent.label || agent.name.replaceAll('_', ' ')}</h3><p>{agent.description}</p>
          <details><summary>Explore capabilities <ChevronDown size={14} /></summary><p>{agent.tools?.join(' · ') || 'Capabilities unavailable'}</p>{agent.limitations && <p>{agent.limitations}</p>}</details>
        </article>)}</div>}
  </section>
}

export default function LandingExperience({ onRun, running = false, submitting = false, query = '', onQueryChange, sessions = [], onSelectSession, onDeleteSession, onResume }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('bullseye:theme') || 'dark' } catch { return 'dark' }
  })
  const [step, setStep] = useState(0)
  const [perspective, setPerspective] = useState('bull')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('bullseye:theme', theme) } catch { /* storage unavailable */ }
  }, [theme])
  const focusSearch = () => document.getElementById('research-query')?.focus()
  const busy = running || submitting
  const submit = event => { event.preventDefault(); if (!busy && query.trim()) onRun?.(query) }
  return <div className="be-landing" data-theme={theme}>
    <a className="be-skip" href="#research-query">Skip to research</a>
    <header className="be-nav"><a className="be-brand" href="#home" aria-label="Bullseye home"><Logo size={35} /><span>Bullseye<span className="be-brand-dot">.</span></span></a>
      <nav aria-label="Main navigation"><a href="#methodology">The process</a><a href="#agents">The specialists</a><a href="#transparency">Our principles</a></nav>
      <div className="be-nav-actions"><button className="be-icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button><a className="be-button be-button-small" href="#research">Start research <ArrowUpRight size={16} /></a></div>
    </header>
    <main id="home">
      <section className="be-hero be-container" aria-labelledby="hero-heading">
        <div className="be-hero-copy"><p className="be-kicker"><span className="be-status-dot" /> EQUITY RESEARCH. WITH PERSPECTIVE.</p>
          <h1 id="hero-heading">See the upside.<br />Understand<br /><span>the other side.</span></h1>
          <p className="be-hero-description">Behind every stock, there’s more than one story. Explore the bull case, challenge it with the bear case, and follow the evidence.</p>
          <a className="be-text-link" href="#methodology">A clearer way to do your homework <ArrowDownIcon /></a>
        </div>
        <div className="be-hero-art" aria-hidden="true"><div className="be-art-grid" /><div className="be-orbit be-orbit-one" /><div className="be-orbit be-orbit-two" />
          <svg className="be-art-chart" viewBox="0 0 520 440" fill="none"><path d="M0 340L60 280L125 300L195 204L260 234L350 115L420 148L510 44" /><path d="M10 80L80 150L145 124L220 200L285 178L370 300L430 272L520 357" /></svg>
          <span className="be-art-label be-art-label-up">THE POSSIBILITY ↗</span><div className="be-hero-bull"><MarketAnimal side="bull" lazy={false} /></div><div className="be-hero-bear"><MarketAnimal side="bear" lazy={false} /></div><span className="be-art-label be-art-label-down">↘ THE COUNTERPOINT</span>
          <div className="be-art-center"><Logo size={38} /></div><span className="be-art-caption">TWO PERSPECTIVES. ONE CLEARER PICTURE.</span>
        </div>
      </section>
      <section id="research" className="be-search-section be-container" aria-label="Start stock research">
        <form className="be-search" onSubmit={submit}><label htmlFor="research-query">YOUR NEXT QUESTION STARTS HERE</label><div className="be-search-row"><Search aria-hidden="true" size={22} /><input id="research-query" name="query" list="stock-suggestions" value={query} onChange={e => onQueryChange?.(e.target.value)} placeholder="A company, a ticker, a question…" required maxLength={2000} autoComplete="off" disabled={busy} /><button className="be-button" type="submit" disabled={busy || !query.trim()}>{submitting ? 'Starting…' : 'Research'}<ArrowUpRight size={20} /></button></div>
          <datalist id="stock-suggestions">{SUGGESTIONS.map(ticker => <option key={ticker} value={ticker} />)}</datalist>
        </form>
        <div className="be-suggestions"><span>Try asking</span>{['Research TCS', 'Compare TCS and Infosys', 'Latest news on Apple'].map(text => <button key={text} disabled={busy} onClick={() => { onQueryChange?.(text); focusSearch() }}>{text}<ArrowUpRight size={13} /></button>)}</div>
        {running && <button className="be-text-button" onClick={onResume}>Return to your active research <ArrowRight size={16} /></button>}
        <p className="be-search-note"><ShieldCheck size={14} /> Research aid. Not financial advice. Provider coverage and freshness vary.</p>
        {sessions.length > 0 && <details className="be-history"><summary>Your previous research ({sessions.length})</summary><ul>{sessions.slice(0, 10).map(session => <li key={session.job_id}><button disabled={busy} onClick={() => onSelectSession?.(session)}>{session.query || session.job_id}<ArrowUpRight size={16} /></button><button disabled={busy} aria-label={`Remove ${session.query || session.job_id} from local history`} onClick={() => onDeleteSession?.(session.job_id)}>Remove</button></li>)}</ul></details>}
      </section>
      <div className="be-ticker" aria-label="Illustrative ticker strip, no live prices"><div className="be-container"><span className="be-tag">DEMO · NOT LIVE QUOTES</span>{['NIFTY 50', 'SENSEX', 'S&P 500', 'NASDAQ'].map((name, i) => <span className="be-ticker-item" key={name}>{name}<svg viewBox="0 0 70 24" aria-hidden="true"><path d={i % 2 ? 'M0 5L12 11L25 8L37 17L49 13L70 23' : 'M0 22L12 14L25 17L37 8L49 11L70 1'} className={i % 2 ? 'be-down' : 'be-up'} /></svg><span>—</span></span>)}</div></div>
      <div className="be-container">
        <section className="be-section" id="methodology" aria-labelledby="process-heading"><div className="be-section-heading"><div><p className="be-kicker">LESS NOISE. MORE UNDERSTANDING.</p><h2 id="process-heading">From a question<br />to a point of view.</h2></div><p>No black box to take on faith. A visible research process, from the first source to the final summary.</p></div>
          <div className="be-process"><div className="be-process-tabs">{STEPS.map(([title, , number], i) => <button key={number} aria-pressed={step === i} onClick={() => setStep(i)} aria-controls="process-detail"><span>{number}</span><strong>{title}</strong><ArrowUpRight size={20} /></button>)}</div><div className="be-process-detail" id="process-detail"><Layers3 size={40} strokeWidth={1} /><span className="be-kicker">{STEPS[step][2]}</span><h3>{STEPS[step][0]}</h3><p>{STEPS[step][1]}</p><div className="be-process-trail"><span>Question</span><ArrowRight size={14} /><span>Evidence</span><ArrowRight size={14} /><span>Perspective</span></div></div></div>
        </section>
        <Registry />
        <section className="be-section" id="perspectives" aria-labelledby="perspective-heading"><div className="be-section-heading"><div><p className="be-kicker">CONVICTION NEEDS A COUNTERPOINT</p><h2 id="perspective-heading">Meet the bull.<br />Make room for the bear.</h2></div><div><p>Better questions emerge when you consider both sides.</p><span className="be-tag">INTERACTIVE DEMO · HYPOTHETICAL</span></div></div>
          <div className="be-perspectives"><div className={`be-animal-stage case-panel ${perspective}`}><MarketAnimal side={perspective} /><span>{perspective === 'bull' ? 'Look for the opportunity.' : 'Ask what could go wrong.'}</span></div><div className="be-perspective-copy"><div className="be-toggle" aria-label="Demo perspective"><button aria-pressed={perspective === 'bull'} onClick={() => setPerspective('bull')}>↗ Bull case</button><button aria-pressed={perspective === 'bear'} onClick={() => setPerspective('bear')}>↘ Bear case</button></div><h3>{perspective === 'bull' ? 'What could go right?' : 'What could break the thesis?'}</h3><p>{perspective === 'bull' ? 'If a company reports sustained revenue growth and improving cash conversion, the bull asks whether that momentum can last.' : 'If the same company depends on a few customers or takes on more debt, the bear asks how resilient that growth really is.'}</p><ul>{(perspective === 'bull' ? ['Is growth backed by reported results?', 'Are margins and cash flows improving?', 'Is the opportunity already priced in?'] : ['How concentrated are the revenue streams?', 'Can cash flow support debt obligations?', 'Which evidence would change the thesis?']).map(item => <li key={item}><Scale size={16} />{item}</li>)}</ul><p className="be-fine-print">Illustrative questions, not findings about any company. Actual cases depend on the evidence collected in your run.</p></div></div>
        </section>
        <section className="be-section be-report-section" id="report" aria-labelledby="report-heading"><div><p className="be-kicker">A REPORT YOU CAN QUESTION</p><h2 id="report-heading">The reasoning.<br />Not just the rating.</h2><p className="be-body-copy">Start with the plain-English view. Dig into calculations and sources. Keep the full picture with an exportable research report.</p><ul className="be-feature-list"><li><FileText size={18} />Beginner & expert reading modes</li><li><Activity size={18} />Source-linked findings & explicit gaps</li><li><ArrowUpRight size={18} />Follow-up questions & PDF export</li></ul><a className="be-text-link" href="#research">Build your first report <ArrowRight size={17} /></a></div>
          <div className="be-report-preview"><div className="be-card-top"><Logo size={30} /><span className="be-tag">LAYOUT PREVIEW</span></div><div className="be-preview-title"><span>COMPANY RESEARCH</span><h3>Your company. In context.</h3><p>Evidence before opinion.</p></div><div className="be-preview-metrics">{['Revenue growth', 'P/E ratio', 'Debt / equity'].map(label => <div key={label}><span>{label}</span><strong>—</strong><small>Awaiting evidence</small></div>)}</div><div className="be-preview-cases"><div><span>↗ THE BULL CASE</span><p>Source-linked opportunities</p></div><div><span>↘ THE BEAR CASE</span><p>Risks and counter-evidence</p></div></div><div className="be-preview-footer"><ShieldCheck size={15} /><span>Sources · Timestamps · Calculation inputs</span></div><p className="be-fine-print">Preview only. No investment verdict or company data is shown.</p></div>
        </section>
        <section className="be-section" id="transparency" aria-labelledby="principles-heading"><div className="be-section-heading"><div><p className="be-kicker">BUILT FOR HEALTHY SKEPTICISM</p><h2 id="principles-heading">Trust the trail.<br />Check the conclusion.</h2></div><p>Useful research shows its workings and tells you where the evidence ends.</p></div><div className="be-principles">{[[ShieldCheck, 'Sources you can inspect', 'Open the source, check its date, and decide how much weight it deserves. A citation is a starting point for verification.'], [Activity, 'Math with a paper trail', 'Python computes ratios from explicit inputs. Missing inputs stay missing; conflicting values are surfaced.'], [Scale, 'Uncertainty stays visible', 'An incomplete investigation is shown as incomplete. Evidence may be too weak for any recommendation.']].map(([Icon, title, text]) => <article key={title}><Icon size={28} strokeWidth={1.4} /><h3>{title}</h3><p>{text}</p></article>)}</div><p className="be-disclaimer"><strong>Research aid, not financial advice.</strong> Markets involve risk, including loss of capital. Verify original sources and use your own judgment. AI-generated explanations can be wrong.</p></section>
        <section className="be-section be-faq" aria-labelledby="faq-heading"><div><p className="be-kicker">GOOD QUESTIONS</p><h2 id="faq-heading">A little more<br />perspective.</h2></div><div>{QUESTIONS.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>
        <section className="be-final-cta"><Logo size={48} /><p className="be-kicker">CURIOSITY IS A GOOD STARTING POINT.</p><h2>What’s your next<br /><span>investment question?</span></h2><a href="#research" className="be-button" onClick={focusSearch}>Follow the evidence <ArrowUpRight size={19} /></a></section>
      </div>
    </main>
    <footer className="be-footer be-container"><a className="be-brand" href="#home"><Logo size={30} /><span>Bullseye.</span></a><p>Two perspectives. One clearer picture.</p><a href="#transparency">Research, responsibly <ArrowUpRight size={14} /></a><span>© {new Date().getFullYear()} Bullseye</span></footer>
  </div>
}

function ArrowDownIcon() { return <ArrowRight size={16} style={{ transform: 'rotate(45deg)' }} aria-hidden="true" /> }
