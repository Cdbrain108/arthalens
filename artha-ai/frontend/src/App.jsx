import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import LandingExperience from './components/LandingExperience'
import { useResearchJob } from './hooks/useResearchJob'
import { isTerminalJob } from './hooks/researchJob'
import { useAuth } from './hooks/useAuth'
import { api } from './api/client'
import { loadSessions, saveSession, mergeSessions, deleteSession } from './storage/chatSessions'

const StudioPage = lazy(() => import('./components/StudioPage'))

export default function App() {
  const { user } = useAuth()
  const { job, submitting, start, reset, restore } = useResearchJob()
  const [currentPage, setCurrentPage] = useState(() => window.location.hash === '#chat' ? 'chat' : 'landing')
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState(() => loadSessions())
  const savedJobRef = useRef(null)
  const running = submitting || Boolean(job && !isTerminalJob(job))
  const navigate = useCallback(page => { setCurrentPage(page); window.location.hash = page === 'chat' ? 'chat' : 'home'; window.scrollTo(0, 0) }, [])

  useEffect(() => {
    const changed = () => setCurrentPage(window.location.hash === '#chat' ? 'chat' : 'landing')
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  useEffect(() => {
    let cancelled = false
    api.getHistory().then(remote => {
      if (!cancelled && Array.isArray(remote) && remote.length) setSessions(previous => mergeSessions(previous, remote))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!job || !isTerminalJob(job)) return
    const key = `${job.job_id}:${job.status}`
    if (savedJobRef.current !== key) { savedJobRef.current = key; setSessions(saveSession(job)) }
  }, [job])

  const handleStartResearch = useCallback(value => {
    const trimmed = (value || '').trim()
    if (!trimmed || running) return
    setQuery(trimmed); navigate('chat'); start(trimmed)
  }, [start, navigate, running])
  const handleSelectSession = useCallback(session => {
    if (!session || running) return
    setQuery(session.query || ''); navigate('chat')
    if (session.status === 'chat' || !session.job_id || session.job_id.startsWith('chat_')) { reset(); return }
    api.getStatus(session.job_id).then(restore).catch(() => restore(session.snapshot || session))
  }, [navigate, reset, restore, running])
  const handleNewResearch = useCallback(() => {
    if (running) return
    reset(); setQuery(''); navigate('landing')
  }, [reset, running, navigate])

  if (currentPage === 'chat') return <Suspense fallback={<div className="be-loading" role="status">Opening your research workspace…</div>}><StudioPage
    job={job} query={query} running={running} submitting={submitting}
    onStartResearch={handleStartResearch} onAskReport={(jobId, question) => api.askReport(jobId, question)}
    onNewResearch={handleNewResearch} onBackToStart={() => navigate('landing')} user={user || { name: 'Researcher', guest: true }}
  /></Suspense>
  return <LandingExperience onRun={handleStartResearch} running={running} submitting={submitting} query={query} onQueryChange={setQuery}
    sessions={sessions} onSelectSession={handleSelectSession} onDeleteSession={id => setSessions(deleteSession(id))} onResume={() => navigate('chat')} />
}
