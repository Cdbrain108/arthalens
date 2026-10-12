import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Layers3,
  Loader2,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  X,
} from 'lucide-react'
import Logo from './Logo'
import MarketVisual from './MarketVisual'
import { useAuth } from '../hooks/useAuth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login({ onLogin, onCancel }) {
  const { login, signup, loginWithGoogle, sendPasswordReset, loginAsGuest, isFirebaseConfigured } = useAuth()

  // Modes: 'signin' | 'signup' | 'forgot'
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [activeField, setActiveField] = useState(null)

  const clearFeedback = () => {
    if (err) setErr(null)
    if (successMsg) setSuccessMsg(null)
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setErr(null)
    setSuccessMsg(null)
  }

  // Handle Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault()
    clearFeedback()

    if (mode === 'forgot') {
      if (!EMAIL_RE.test(email.trim())) {
        return setErr('Please enter a valid email address.')
      }
      setLoading(true)
      const res = await sendPasswordReset(email.trim())
      setLoading(false)
      if (res.success) {
        setSuccessMsg('Password reset instructions have been sent to your email.')
      } else {
        setErr(res.error || 'Failed to send password reset email.')
      }
      return
    }

    if (mode === 'signup' && name.trim().length < 2) {
      return setErr('Please enter your full name (at least 2 characters).')
    }

    if (!EMAIL_RE.test(email.trim())) {
      return setErr('Please enter a valid email address.')
    }

    if (password.length < 6) {
      return setErr('Password must be at least 6 characters.')
    }

    setLoading(true)

    if (mode === 'signup') {
      const { user, error } = await signup(name.trim(), email.trim(), password)
      setLoading(false)
      if (error) {
        setErr(error)
      } else if (user) {
        setSuccessMsg('Account created successfully!')
        onLogin?.(user)
      }
    } else {
      // signin
      const { user, error } = await login(email.trim(), password)
      setLoading(false)
      if (error) {
        setErr(error)
      } else if (user) {
        setSuccessMsg('Welcome back!')
        onLogin?.(user)
      }
    }
  }

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    clearFeedback()
    setGoogleLoading(true)
    const { user, error } = await loginWithGoogle()
    setGoogleLoading(false)
    if (error) {
      setErr(error)
    } else if (user) {
      onLogin?.(user)
    }
  }

  // Handle Guest Enter
  const handleGuestEnter = () => {
    const guestUser = loginAsGuest('Guest Researcher', 'guest@local')
    onLogin?.(guestUser)
  }

  const fieldClass = (field) => [
    'field w-full rounded-xl border bg-white/[0.045] px-4 py-3 text-sm text-white placeholder:text-[#7d8590] transition duration-200',
    'focus:border-[#22c55e] focus:bg-white/[0.07] focus:outline-none focus:ring-4 focus:ring-[#22c55e]/10',
    activeField === field && !err ? 'border-[#22c55e]/70 bg-white/[0.07]' : 'border-white/10',
  ].join(' ')

  return (
    <div className="welcome-page relative min-h-screen overflow-hidden bg-[#0d1014] text-[#f1f3f4]">
      {/* Background Aurora Lighting */}
      <div className="welcome-aurora pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="absolute -left-24 -top-40 h-96 w-96 rounded-full bg-[#22c55e]/10 blur-3xl" />
        <span className="absolute right-[-12rem] top-1/3 h-[34rem] w-[34rem] rounded-full bg-[#4285f4]/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="welcome-header relative z-10 flex items-center justify-between border-b border-white/[0.08] px-6 py-4 lg:px-12">
        <a className="welcome-logo flex items-center gap-3 text-lg font-semibold tracking-[-0.03em] text-white" href="#home" aria-label="Stock Research Home">
          <Logo size={36} />
          <span className="flex items-center gap-1.5 font-bold tracking-tight">
            Stock Research
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          </span>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-mono font-semibold tracking-widest text-emerald-400">
            PRO PLATFORM
          </span>
        </a>

        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X size={15} /> Close
          </button>
        )}
      </header>

      {/* Main Container */}
      <main className="welcome-main relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-6 pb-16 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:gap-16 lg:px-12 lg:pt-12">
        {/* Left Column: Visual Story */}
        <section className="welcome-story animate-fade-up">
          <div className="welcome-eyebrow flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-[#22c55e]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.9)]" />
            EVIDENCE-FIRST FINANCIAL INTELLIGENCE
          </div>
          <h1 className="mt-5 max-w-2xl text-4xl font-normal leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            See the upside.<br />
            <span className="text-[#22c55e]">Audit the downside.</span>
          </h1>
          <p className="welcome-description mt-5 max-w-xl text-sm leading-relaxed text-[#a8afb8] sm:text-base">
            Autonomous multi-agent stock research that cross-examines financial filings, earnings calls, news, and valuation with verified provenance.
          </p>

          <div className="welcome-tags mt-6 flex flex-wrap gap-2.5 text-xs text-[#c8ced5]">
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5">
              <Check size={14} className="text-[#22c55e]" /> Deterministic Math
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5">
              <Check size={14} className="text-[#22c55e]" /> Primary Filings & Sources
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5">
              <Check size={14} className="text-[#22c55e]" /> Institutional PDF Dossiers
            </span>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-2xl sm:p-5">
            <MarketVisual />
          </div>
        </section>

        {/* Right Column: Authentication Card */}
        <section className="welcome-access animate-fade-up">
          <div className="rounded-3xl border border-white/10 bg-[#161a20]/95 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Logo size={28} />
                <span className="text-sm font-semibold text-white">
                  {mode === 'signin' && 'Sign in to Stock Research'}
                  {mode === 'signup' && 'Create your Research Account'}
                  {mode === 'forgot' && 'Reset your Password'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">
                {isFirebaseConfigured ? 'FIREBASE CLOUD' : 'LOCAL MODE'}
              </span>
            </div>

            {/* Google One-Click Button */}
            {mode !== 'forgot' && isFirebaseConfigured && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || loading}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.09] disabled:opacity-50"
                >
                  {googleLoading ? (
                    <Loader2 size={17} className="animate-spin text-white" />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>Continue with Google</span>
                </button>

                <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-[#666e78]">
                  <span className="h-px flex-1 bg-white/10" />
                  <span>or email credentials</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            )}

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#c8ced5]">Full Name</label>
                  <div className="relative">
                    <UserIcon size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearFeedback() }}
                      onFocus={() => setActiveField('name')}
                      onBlur={() => setActiveField(null)}
                      placeholder="Anuj Kesharwani"
                      required
                      className={`${fieldClass('name')} pl-10`}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#c8ced5]">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFeedback() }}
                    onFocus={() => setActiveField('email')}
                    onBlur={() => setActiveField(null)}
                    placeholder="researcher@firm.com"
                    required
                    className={`${fieldClass('email')} pl-10`}
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-[#c8ced5]">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-[11px] text-[#22c55e] hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearFeedback() }}
                      onFocus={() => setActiveField('password')}
                      onBlur={() => setActiveField(null)}
                      placeholder="••••••••"
                      required
                      className={`${fieldClass('password')} pl-10 pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Feedback messages */}
              {err && (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {err}
                </div>
              )}

              {successMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  {successMsg}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-4 py-3.5 text-sm font-semibold text-[#091a0f] shadow-lg shadow-emerald-500/20 transition hover:bg-[#4ade80] hover:shadow-emerald-500/30 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin text-black" />
                ) : mode === 'signin' ? (
                  <>
                    <span>Enter Research Workspace</span>
                    <ArrowRight size={17} />
                  </>
                ) : mode === 'signup' ? (
                  <>
                    <span>Create Research Account</span>
                    <ArrowRight size={17} />
                  </>
                ) : (
                  <>
                    <span>Send Reset Link</span>
                    <RotateCcw size={16} />
                  </>
                )}
              </button>

              {/* Mode switch links */}
              <div className="pt-2 text-center text-xs text-slate-400">
                {mode === 'signin' && (
                  <p>
                    Don’t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-medium text-[#22c55e] hover:underline"
                    >
                      Create one here
                    </button>
                  </p>
                )}

                {mode === 'signup' && (
                  <p>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className="font-medium text-[#22c55e] hover:underline"
                    >
                      Sign in instead
                    </button>
                  </p>
                )}

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-medium text-[#22c55e] hover:underline"
                  >
                    Back to Sign In
                  </button>
                )}
              </div>

              {/* Guest explorer button */}
              <div className="border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={handleGuestEnter}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <span>Explore as Guest (No Login Required)</span>
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </form>

            <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck size={14} className="shrink-0 text-[#22c55e]" />
              <span>User sessions and private research dossiers are protected with Firebase Firestore and Storage rules.</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="welcome-footer relative z-10 flex flex-col gap-2 border-t border-white/[0.08] px-6 py-5 text-[10px] tracking-wider text-[#66707c] sm:flex-row sm:items-center sm:justify-between lg:px-12">
        <span>STOCK RESEARCH · INDEPENDENT MINDS. INFORMED MOVES.</span>
        <p className="tracking-normal">Evidence-based research platform. Not financial investment advice.</p>
        <span>Stock Research © {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
