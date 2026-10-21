import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import LandingExperience from './components/LandingExperience'
import MobileLanding from './components/MobileLanding'
import Login from './components/Login'
import { useResearchJob } from './hooks/useResearchJob'
import { isTerminalJob } from './hooks/researchJob'
import { useAuth } from './hooks/useAuth'
import { useIsMobile } from './hooks/useIsMobile'
import { api } from './api/client'
import {
  loadSessions,
  saveSession,
  mergeSessions,
  deleteSession,
  loadUserSessions,
  saveChatQuery,
} from './storage/chatSessions'
import { detectQueryType } from './utils/queryRouter'

const StudioPage = lazy(() => import('./components/StudioPage'))

export default function App() {
  const isMobile = useIsMobile(768)
  const { user, logout, loading: authLoading } = useAuth()
  const { job, submitting, error, start, reset, restore } = useResearchJob()

  const [currentPage, setCurrentPage] = useState(() => {
    const hash = window.location.hash
    if (hash === '#chat') return 'chat'
    if (hash === '#login') return 'login'
    return 'landing'
  })
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState(() => loadSessions())
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const savedJobRef = useRef(null)

  const running = submitting || Boolean(job && !isTerminalJob(job))

  const navigate = useCallback((page) => {
    setCurrentPage(page)
    window.location.hash = page === 'chat' ? 'chat' : page === 'login' ? 'login' : 'home'
    window.scrollTo(0, 0)
  }, [])

  // Sync hash changes with navigation
  useEffect(() => {
    const changed = () => {
      const hash = window.location.hash
      if (hash === '#chat') setCurrentPage('chat')
      else if (hash === '#login') setCurrentPage('login')
      else setCurrentPage('landing')
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])

  // When authenticated user changes, load remote Firestore conversations
  useEffect(() => {
    let cancelled = false
    if (user?.uid && !user.guest) {
      loadUserSessions(user.uid).then((loaded) => {
        if (!cancelled && Array.isArray(loaded)) {
          setSessions(loaded)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [user?.uid, user?.guest])

  // Fetch backend history on startup
  useEffect(() => {
    let cancelled = false
    api
      .getHistory()
      .then((remote) => {
        if (!cancelled && Array.isArray(remote) && remote.length) {
          setSessions((previous) => mergeSessions(previous, remote))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Save completed jobs locally and to Firestore
  useEffect(() => {
    if (!job || !isTerminalJob(job)) return
    const key = `${job.job_id}:${job.status}`
    if (savedJobRef.current !== key) {
      savedJobRef.current = key
      setSessions(saveSession(job, {}, user?.uid))
    }
  }, [job, user?.uid])

  const handleStartResearch = useCallback(
    (value) => {
      const trimmed = (value || '').trim()
      if (running) return
      setQuery(trimmed)
      navigate('chat')
      if (!trimmed) {
        return
      }
      start(trimmed)
    },
    [start, navigate, running]
  )

  const handleSelectSession = useCallback(
    (session) => {
      if (!session || running) return
      setQuery(session.query || '')
      navigate('chat')
      if (session.status === 'chat' || !session.job_id || session.job_id.startsWith('chat_')) {
        reset()
        return
      }
      api
        .getStatus(session.job_id)
        .then(restore)
        .catch(() => restore(session.snapshot || session))
    },
    [navigate, reset, restore, running]
  )

  const handleNewResearch = useCallback(() => {
    if (running) return
    reset()
    setQuery('')
    navigate('landing')
  }, [reset, running, navigate])

  const handleDeleteSession = useCallback(
    (jobId) => {
      setSessions(deleteSession(jobId, user?.uid))
    },
    [user?.uid]
  )

  // Login Page route
  if (currentPage === 'login') {
    return (
      <Login
        onLogin={() => {
          setAuthModalOpen(false)
          navigate('landing')
        }}
        onCancel={() => navigate('landing')}
      />
    )
  }

  // Internal Research Studio route
  if (currentPage === 'chat') {
    return (
      <>
        <Suspense fallback={<div className="be-loading" role="status">Opening your research workspace…</div>}>
          <StudioPage
            job={job}
            query={query}
            running={running}
            submitting={submitting}
            error={error}
            onStartResearch={handleStartResearch}
            onAskReport={(jobId, question) => api.askReport(jobId, question)}
            onNewResearch={handleNewResearch}
            onBackToStart={() => navigate('landing')}
            user={user}
            onLogout={logout}
            onOpenAuth={() => setAuthModalOpen(true)}
            sessions={sessions}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
          />
        </Suspense>

        {authModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md">
            <Login
              onLogin={() => setAuthModalOpen(false)}
              onCancel={() => setAuthModalOpen(false)}
            />
          </div>
        )}
      </>
    )
  }

  // Public Landing Experience route (Mobile vs Desktop)
  return (
    <>
      {isMobile ? (
        <MobileLanding
          onRun={handleStartResearch}
          running={running}
          submitting={submitting}
          query={query}
          onQueryChange={setQuery}
          sessions={sessions}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onResume={() => navigate('chat')}
          user={user}
          onLogout={logout}
          onOpenAuth={() => navigate('login')}
        />
      ) : (
        <LandingExperience
          onRun={handleStartResearch}
          running={running}
          submitting={submitting}
          query={query}
          onQueryChange={setQuery}
          sessions={sessions}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onResume={() => navigate('chat')}
          user={user}
          onLogout={logout}
          onOpenAuth={() => navigate('login')}
        />
      )}

      {authModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md">
          <Login
            onLogin={() => setAuthModalOpen(false)}
            onCancel={() => setAuthModalOpen(false)}
          />
        </div>
      )}
    </>
  )
}
