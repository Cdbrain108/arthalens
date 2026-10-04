import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Sparkles } from 'lucide-react'
import Sidebar from './components/Sidebar'
import LandingExperience from './components/LandingExperience'
import StudioPage from './components/StudioPage'
import Login from './components/Login'
import { useResearchJob } from './hooks/useResearchJob'
import { isTerminalJob } from './hooks/researchJob'
import { useAuth } from './hooks/useAuth'
import { api } from './api/client'
import {
  loadSessions,
  saveSession,
  saveChatQuery,
  mergeSessions,
  deleteSession
} from './storage/chatSessions'

export default function App() {
  const { user, login, logout } = useAuth()
  const { job, submitting, start, reset, restore } = useResearchJob()
  const [navOpen, setNavOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#chat') return 'chat'
    return 'landing'
  })
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState(() => loadSessions())
  const savedJobRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api.getHistory()
      .then((remote) => {
        if (!cancelled && Array.isArray(remote) && remote.length) {
          setSessions((previous) => mergeSessions(previous, remote))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!job || !isTerminalJob(job)) return
    const key = `${job.job_id}:${job.status}`
    if (savedJobRef.current !== key) {
      savedJobRef.current = key
      setSessions(saveSession(job))
    }
  }, [job])

  const running = submitting || Boolean(job && !isTerminalJob(job))

  const handleStartResearch = useCallback((value) => {
    const trimmed = (value || '').trim()
    if (!trimmed) return
    setQuery(trimmed)
    setCurrentPage('chat')
    if (typeof window !== 'undefined') window.location.hash = '#chat'
    start(trimmed)
  }, [start])

  const handleSelectSession = useCallback((session) => {
    if (!session || running) return
    if (typeof session === 'string') {
      handleStartResearch(session)
      return
    }
    const selectedQuery = session.query || ''
    setQuery(selectedQuery)
    setCurrentPage('chat')
    if (typeof window !== 'undefined') window.location.hash = '#chat'
    if (session.status === 'chat' || !session.job_id || session.job_id.startsWith('chat_')) {
      reset()
      return
    }
    const snapshot = session.snapshot || session
    api.getStatus(session.job_id)
      .then((fresh) => restore(fresh))
      .catch(() => restore(snapshot))
  }, [handleStartResearch, reset, restore, running])

  const handleNewResearch = useCallback(() => {
    if (running) return
    reset()
    setQuery('')
    setCurrentPage('landing')
    if (typeof window !== 'undefined') window.location.hash = '#landing'
  }, [reset, running])

  const handleNavSelect = useCallback((section) => {
    if (section === 'chat' || section === 'research') {
      setCurrentPage('chat')
      if (typeof window !== 'undefined') window.location.hash = '#chat'
      return
    }
    if (section === 'landing' || section === 'explore' || section === 'methodology') {
      setCurrentPage('landing')
      if (typeof window !== 'undefined') window.location.hash = '#landing'
      if (section !== 'landing') {
        setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    }
  }, [])

  if (!user) return <Login onLogin={login} />

  if (currentPage === 'chat') {
    return (
      <StudioPage
        job={job}
        query={query}
        running={running}
        submitting={submitting}
        onStartResearch={handleStartResearch}
        onAskReport={(jobId, question) => api.askReport(jobId, question)}
        onNewResearch={handleNewResearch}
        onBackToStart={() => handleNavSelect('landing')}
        user={user}
      />
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#research-query">Skip to research</a>
      {navOpen && <button aria-label="Close navigation" onClick={() => setNavOpen(false)} className="drawer-overlay" />}

      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        user={user}
        onLogout={() => { reset(); setQuery(''); logout() }}
        onNew={handleNewResearch}
        running={running}
        onNavSelect={handleNavSelect}
        history={sessions}
        onSelectHistory={handleSelectSession}
        onDeleteHistory={(jobId) => setSessions(deleteSession(jobId))}
        currentPage={currentPage}
      />

      <main className="workspace-main" {...(navOpen ? { inert: '' } : {})}>
        <header className="workspace-header">
          <button aria-label="Open navigation" aria-expanded={navOpen} aria-controls="workspace-navigation" onClick={() => setNavOpen(true)} className="mobile-menu">
            <Menu size={20} />
          </button>
          <div className="breadcrumb"><span>Workspace</span><span>/</span><strong>Research overview</strong></div>
          <div className="header-right">
            <button onClick={() => handleNavSelect('chat')} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-[11.5px] font-mono text-[#bdc1c6] transition hover:bg-white/10 hover:text-white">
              <Sparkles size={13} className="text-[#4285f4]" />
              <span>Open research chat</span>
            </button>
            <span className="demo-badge hidden sm:inline">EVIDENCE-FIRST PIPELINE</span>
            <span className="header-avatar" title={user.name}>{(user.name || 'R').trim().charAt(0).toUpperCase()}</span>
          </div>
        </header>
        <div className="workspace-scroll scroll-slim">
          <LandingExperience
            onRun={handleStartResearch}
            running={running}
            submitting={submitting}
            query={query}
            onQueryChange={setQuery}
          />
        </div>
      </main>
    </div>
  )
}
