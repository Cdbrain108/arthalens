import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  X,
} from 'lucide-react'
import Logo from './Logo'
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
      try {
        if (typeof localStorage !== 'undefined') {
          if (name?.trim()) localStorage.setItem('saved_researcher_name', name.trim())
          if (email?.trim()) localStorage.setItem('saved_researcher_email', email.trim())
        }
      } catch {}
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
      try {
        if (typeof localStorage !== 'undefined' && email?.trim()) {
          localStorage.setItem('saved_researcher_email', email.trim())
        }
      } catch {}
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
    try {
      const { user, error } = await loginWithGoogle()
      setGoogleLoading(false)
      if (error) {
        setErr(error)
      } else if (user) {
        setSuccessMsg(`Welcome, ${user.displayName || user.name || user.email || 'Researcher'}!`)
        onLogin?.(user)
      }
    } catch (e) {
      setGoogleLoading(false)
      setErr(e?.message || 'Google sign-in encountered an issue.')
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
    <div className="welcome-page relative min-h-screen min-h-[100dvh] w-full flex flex-col justify-between overflow-y-auto overflow-x-hidden bg-[#0d1014] text-[#f1f3f4]">
      {/* Background Aurora Lighting */}
      <div className="welcome-aurora pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="absolute -left-24 -top-40 h-96 w-96 rounded-full bg-[#22c55e]/10 blur-3xl" />
        <span className="absolute right-[-12rem] top-1/3 h-[34rem] w-[34rem] rounded-full bg-[#4285f4]/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="welcome-header relative z-10 flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5 sm:px-6 lg:px-12">
        <a className="welcome-logo flex items-center gap-2.5 text-base sm:text-lg font-semibold tracking-[-0.03em] text-white" href="#home" aria-label="ArthaLens AI Home">
          <Logo size={30} />
          <span className="flex items-center gap-1.5 font-bold tracking-tight">
            ArthaLens
            <span className="text-[9px] font-mono font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
              AI
            </span>
          </span>
        </a>

        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <X size={15} /> Close
          </button>
        )}
      </header>

      {/* Main Container: Centered Clean Authentication Card */}
      <main className="welcome-main relative z-10 mx-auto flex flex-1 w-full max-w-md items-center justify-center px-4 py-8 sm:py-12">
        <section className="welcome-access w-full animate-fade-up">
          <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#161a20]/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3.5">
              <div className="flex items-center gap-2">
                <Logo size={24} />
                <span className="text-xs sm:text-sm font-semibold text-white">
                  {mode === 'signin' && 'Sign in to ArthaLens'}
                  {mode === 'signup' && 'Create Research Account'}
                  {mode === 'forgot' && 'Reset your Password'}
                </span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400">
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
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.09] active:scale-[0.98] touch-manipulation select-none disabled:opacity-50 cursor-pointer"
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
                        className="text-[11px] text-[#22c55e] hover:underline cursor-pointer"
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
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Error & Success Alerts */}
              {err && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 animate-fade-in">
                  {err}
                </div>
              )}

              {successMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 animate-fade-in">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.45)',
                  border: '1px solid #6ee7b7',
                }}
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                  <>
                    <span>
                      {mode === 'signin' && 'Sign In to Workspace'}
                      {mode === 'signup' && 'Create Account'}
                      {mode === 'forgot' && 'Send Reset Link'}
                    </span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              {/* Mode Switcher */}
              <div className="pt-2 text-center text-xs text-[#8b949e]">
                {mode === 'signin' && (
                  <p>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-medium text-[#22c55e] hover:underline cursor-pointer"
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
                      className="font-medium text-[#22c55e] hover:underline cursor-pointer"
                    >
                      Sign in instead
                    </button>
                  </p>
                )}

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-medium text-[#22c55e] hover:underline cursor-pointer"
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white cursor-pointer"
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

      <footer className="welcome-footer relative z-10 flex flex-col gap-2 border-t border-white/[0.08] px-6 py-4 text-[10px] tracking-wider text-[#66707c] sm:flex-row sm:items-center sm:justify-between lg:px-12">
        <span>ARTHALENS AI · AUTONOMOUS STOCK RESEARCH</span>
        <p className="tracking-normal">Evidence-based research platform. Not financial investment advice.</p>
        <span>Stock Research © {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
