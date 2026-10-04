import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Fingerprint, Layers3, ShieldCheck, Sparkles } from 'lucide-react'
import Logo from './Logo'
import MarketVisual from './MarketVisual'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login({ onLogin }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState(null)
  const [errorField, setErrorField] = useState(null)
  const [activeField, setActiveField] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus] = useState('')
  const [guestFocused, setGuestFocused] = useState(false)

  const clearFeedback = () => {
    if (err) {
      setErr(null)
      setErrorField(null)
    }
    if (status) setStatus('')
  }

  const submit = (event) => {
    event.preventDefault()
    setSubmitted(true)
    if (name.trim().length < 2) {
      setErrorField('name')
      setActiveField('name')
      return setErr('Please enter a name with at least 2 characters.')
    }
    if (!EMAIL_RE.test(email.trim())) {
      setErrorField('email')
      setActiveField('email')
      return setErr('Please enter a valid email address.')
    }
    setErr(null)
    setErrorField(null)
    setStatus('Opening your workspace…')
    onLogin({ name, email })
  }

  const enterAsGuest = () => {
    setStatus('Opening the guest workspace…')
    onLogin({ name: 'Guest Researcher', email: 'guest@local', guest: true })
  }

  const fieldClass = (field) => [
    'field w-full rounded-xl border bg-white/[0.045] px-4 py-3 text-sm text-white placeholder:text-[#7d8590] transition duration-200',
    'focus:border-[#9cee69] focus:bg-white/[0.07] focus:outline-none focus:ring-4 focus:ring-[#9cee69]/10',
    activeField === field && !err ? 'border-[#9cee69]/70 bg-white/[0.07]' : 'border-white/10',
    errorField === field ? 'border-[#ff8c8c] ring-4 ring-[#ff8c8c]/10' : '',
  ].filter(Boolean).join(' ')

  return <div className="welcome-page relative min-h-screen overflow-hidden bg-[#0d1014] text-[#f1f3f4]">
    <a className="skip-link sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[#9cee69] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#15251a]" href="#login-name">Skip to sign in</a>
    <div className="welcome-aurora pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <span className="absolute -left-24 -top-40 h-96 w-96 rounded-full bg-[#9cee69]/10 blur-3xl" />
      <span className="absolute right-[-12rem] top-1/3 h-[34rem] w-[34rem] rounded-full bg-[#4285f4]/10 blur-3xl" />
    </div>
    <header className="welcome-header relative z-10 flex items-center justify-between border-b border-white/[0.08] px-6 py-5 lg:px-12">
      <a className="welcome-logo flex items-center gap-2.5 text-lg font-semibold tracking-[-0.03em] text-white" href="#welcome-title" aria-label="Bulls Eye home"><Logo size={34} /><span>Bulls Eye<span className="brand-dot text-[#9cee69]">.</span></span><span className="welcome-beta rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.16em] text-[#9aa0a6]">BETA</span></a>
      <nav className="hidden items-center gap-6 text-xs text-[#9aa0a6] sm:flex" aria-label="Welcome navigation"><a className="transition-colors hover:text-white" href="#welcome-features">The advantage</a><a className="flex items-center gap-1 transition-colors hover:text-white" href="#welcome-access">Your workspace <ArrowUpRight size={14} /></a></nav>
    </header>
    <main className="welcome-main relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-6 pb-16 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:gap-20 lg:px-12 lg:pt-16">
      <section className="welcome-story animate-fade-up" aria-labelledby="welcome-title">
        <div className="welcome-eyebrow flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-[#9cee69]"><span className="signal-dot h-1.5 w-1.5 rounded-full bg-[#9cee69] shadow-[0_0_14px_rgba(156,238,105,0.9)]" /> A NEW PERSPECTIVE ON INVESTING</div>
        <h1 id="welcome-title" className="mt-6 max-w-2xl text-5xl font-normal leading-[1.05] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">Find the signal.<br /><span className="text-[#9cee69]">Own your edge.</span></h1>
        <p className="welcome-description mt-6 max-w-xl text-base leading-7 text-[#a8afb8]">Markets move fast. Think a step ahead. Turn your biggest investment questions into clear, evidence-backed research.</p>
        <div className="welcome-tags mt-7 flex flex-wrap gap-2.5 text-xs text-[#c8ced5]"><span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2"><Check size={14} className="text-[#9cee69]" /> In-depth analysis</span><span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2"><Check size={14} className="text-[#9cee69]" /> Sources included</span><span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2"><Check size={14} className="text-[#9cee69]" /> Your perspective</span></div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20 sm:p-5"><MarketVisual /></div>
        <p className="visual-caption mt-4 flex items-center gap-2 text-xs text-[#7d8590]"><span className="h-1 w-1 rounded-full bg-[#9cee69]" /> A little clarity changes the whole picture.</p>
      </section>
      <section id="welcome-access" className="welcome-access animate-fade-up lg:pt-2" aria-labelledby="access-title">
        <div className="access-topline mb-4 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em] text-[#7d8590]"><span>YOUR NEXT CHAPTER</span><Fingerprint size={19} className="text-[#9cee69]" /></div>
        <form onSubmit={submit} className="welcome-form rounded-3xl border border-white/10 bg-[#171b20]/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8" noValidate>
          <div className="access-icon mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-[#9cee69]/20 bg-[#9cee69]/10 text-[#9cee69]"><Sparkles size={24} strokeWidth={1.5} /></div>
          <h2 id="access-title" className="text-3xl font-normal leading-tight tracking-[-0.04em] text-white">Great research<br />starts with you.</h2>
          <p className="mt-3 text-sm leading-6 text-[#9aa0a6]">A space for curious minds.<br />Make it yours and start exploring.</p>
          <div className="mt-7 space-y-2">
            <label htmlFor="login-name" className="block text-xs font-medium text-[#c8ced5]">What should we call you? <span aria-hidden="true" className="text-[#9cee69]">*</span></label>
            <input id="login-name" value={name} onChange={event => { setName(event.target.value); clearFeedback() }} onFocus={() => setActiveField('name')} onBlur={() => setActiveField(null)} placeholder="Your name" autoComplete="name" required minLength={2} className={fieldClass('name')} aria-invalid={errorField === 'name'} aria-describedby={errorField === 'name' ? 'login-error' : undefined} />
          </div>
          <div className="mt-4 space-y-2">
            <label htmlFor="login-email" className="block text-xs font-medium text-[#c8ced5]">Email address <span aria-hidden="true" className="text-[#9cee69]">*</span></label>
            <input id="login-email" type="email" value={email} onChange={event => { setEmail(event.target.value); clearFeedback() }} onFocus={() => setActiveField('email')} onBlur={() => setActiveField(null)} placeholder="you@example.com" autoComplete="email" required className={fieldClass('email')} aria-invalid={errorField === 'email'} aria-describedby={errorField === 'email' ? 'login-error' : undefined} />
          </div>
          <div className="mt-3 min-h-5" aria-live="polite" aria-atomic="true">
            {err && <p id="login-error" role="alert" className="access-error flex items-start gap-2 text-xs leading-5 text-[#ffaaaa]"><span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff8c8c]" />{err}</p>}
            {!err && submitted && name.trim().length >= 2 && EMAIL_RE.test(email.trim()) && <p className="flex items-center gap-2 text-xs text-[#9cee69]"><CheckCircle2 size={14} /> Details look good.</p>}
            {status && <p className="text-xs text-[#9aa0a6]">{status}</p>}
          </div>
          <button className="access-submit mt-3 flex w-full items-center justify-center gap-3 rounded-xl bg-[#9cee69] px-4 py-3.5 text-sm font-semibold text-[#15251a] shadow-lg shadow-[#9cee69]/10 transition duration-200 hover:-translate-y-0.5 hover:bg-[#b1f477] hover:shadow-[#9cee69]/20 active:translate-y-0" type="submit">Enter your workspace <ArrowRight size={18} /></button>
          <div className="access-divider my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[#666e78]"><span className="h-px flex-1 bg-white/10" />or take a look around<span className="h-px flex-1 bg-white/10" /></div>
          <button className={`access-guest flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition duration-200 ${guestFocused ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/10 bg-white/[0.025] text-[#c8ced5] hover:border-white/20 hover:bg-white/[0.06] hover:text-white'}`} type="button" onClick={enterAsGuest} onFocus={() => setGuestFocused(true)} onBlur={() => setGuestFocused(false)} onMouseEnter={() => setGuestFocused(true)} onMouseLeave={() => setGuestFocused(false)} aria-label="Explore the workspace as a guest">Explore as a guest <ArrowUpRight size={16} /></button>
          <p className="access-privacy mt-5 flex items-start gap-2 text-[11px] leading-5 text-[#707984]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#9cee69]" /> Demo profile saved in this browser. Research questions are sent to the research service.</p>
        </form>
        <div className="access-bottom mt-5 flex items-center justify-center gap-2 text-xs text-[#7d8590]"><span className="signal-dot h-1.5 w-1.5 rounded-full bg-[#9cee69]" /> Curiosity looks good on you.<span className="text-[#9cee69]">↗</span></div>
      </section>
      <section id="welcome-features" className="welcome-features grid gap-4 border-t border-white/[0.08] pt-8 sm:grid-cols-3 lg:col-span-2" aria-label="The Bulls Eye advantage">
        {[{ icon: Layers3, label: '01 / GO DEEPER', title: 'One question. Every angle.', text: 'Explore the fundamentals, valuation, growth drivers, and risks that matter.' }, { icon: ShieldCheck, label: '02 / STAY GROUNDED', title: 'Evidence over opinion.', text: 'Follow the sources. See what is known, and where the gaps remain.' }, { icon: ArrowUpRight, label: '03 / THINK CLEARER', title: 'Your thesis, sharpened.', text: 'Bring the research together in a cited report you can revisit and challenge.' }].map(({ icon: Icon, label, title, text }) => <article className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.045]" key={label}><div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.14em] text-[#7d8590]"><span>{label}</span><Icon size={19} className="text-[#9cee69]" /></div><h3 className="mt-5 text-base font-medium text-white">{title}</h3><p className="mt-2 text-xs leading-5 text-[#8f98a3]">{text}</p></article>)}
      </section>
    </main>
    <footer className="welcome-footer relative z-10 flex flex-col gap-2 border-t border-white/[0.08] px-6 py-6 text-[10px] tracking-[0.14em] text-[#66707c] sm:flex-row sm:items-center sm:justify-between lg:px-12"><span>INDEPENDENT MINDS. INFORMED MOVES.</span><p className="tracking-normal">Built for research. Not investment advice.</p><span>Bulls Eye © {new Date().getFullYear()}</span></footer>
  </div>
}
