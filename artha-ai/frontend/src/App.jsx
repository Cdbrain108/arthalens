import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api/client'
import { isTerminalJob } from './hooks/researchJob'
import { useAuth } from './hooks/useAuth'
import { useIsMobile } from './hooks/useIsMobile'
import { useResearchJob } from './hooks/useResearchJob'
import LandingExperience from './components/LandingExperience'
import MobileLanding from './components/MobileLanding'
import Login from './components/Login'
import {
  canGuestGenerateReport,
  deleteSession,
  loadSessions,
  loadUserSessions,
  mergeSessions,
  recordGuestReportUsage,
  saveSession,
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

  // Persist active running job so mobile tab discard/reload or app switch never loses the session
  useEffect(() => {
    if (job && !isTerminalJob(job)) {
      try {
        localStorage.setItem(
          'artha_active_job',
          JSON.stringify({
            job_id: job.job_id,
            query: query || job.query || '',
            savedAt: Date.now(),
          })
        )
      } catch {}
    } else if (job && isTerminalJob(job)) {
      try {
        localStorage.removeItem('artha_active_job')
      } catch {}
    }
  }, [job, query])

  // Restore running or last viewed research on startup or mobile tab reload
  useEffect(() => {
    let cancelled = false
    try {
      if (sessionStorage.getItem('artha_new_research') === 'true') {
        return
      }
      const savedActive = localStorage.getItem('artha_active_job')
      if (savedActive) {
        const parsed = JSON.parse(savedActive)
        if (parsed?.job_id && Date.now() - (parsed.savedAt || 0) < 2 * 60 * 60 * 1000) {
          if (parsed.query) setQuery(parsed.query)
          api
            .getStatus(parsed.job_id)
            .then((statusSnapshot) => {
              if (cancelled) return
              if (statusSnapshot && statusSnapshot.job_id) {
                restore(statusSnapshot)
                navigate('chat')
              }
            })
            .catch(() => {
              try {
                localStorage.removeItem('artha_active_job')
              } catch {}
            })
          return
        }
      }
      const lastViewedId = localStorage.getItem('artha_last_viewed_job_id')
      if (lastViewedId && window.location.hash === '#chat') {
        api
          .getStatus(lastViewedId)
          .then((statusSnapshot) => {
            if (cancelled) return
            if (statusSnapshot && statusSnapshot.job_id) {
              restore(statusSnapshot)
            }
          })
          .catch(() => {})
      }
    } catch {}
    return () => {
      cancelled = true
    }
  }, [restore, navigate])

  // Track active job ID so reloads on #chat preserve the active view
  useEffect(() => {
    if (job?.job_id && !job.job_id.startsWith('chat_')) {
      try {
        localStorage.setItem('artha_last_viewed_job_id', job.job_id)
      } catch {}
    }
  }, [job])

  // Guard beforeunload during active generation
  useEffect(() => {
    if (!running) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = 'Artha AI is actively generating your report. Are you sure you want to leave?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [running])

  // When authenticated user changes, load their account-specific sessions
  useEffect(() => {
    let cancelled = false
    const userId = user?.uid && !user.guest ? user.uid : null
    if (userId) {
      loadUserSessions(userId).then((loaded) => {
        if (!cancelled && Array.isArray(loaded)) {
          setSessions(loaded)
        }
      })
    } else {
      setSessions(loadSessions(null))
    }
    return () => {
      cancelled = true
    }
  }, [user?.uid, user?.guest])

  // Restore latest completed research session on page reload when visiting #chat or #report
  const hasRestoredCompletedSessionRef = useRef(false)
  useEffect(() => {
    if (running || job || hasRestoredCompletedSessionRef.current) return
    if (!['chat', 'report'].includes(currentPage)) return
    if (!sessions || sessions.length === 0) return

    const latestResearchSession = sessions.find((s) => s.job_id && !s.job_id.startsWith('chat_')) || sessions[0]
    if (!latestResearchSession) return

    hasRestoredCompletedSessionRef.current = true
    if (latestResearchSession.query && !query) {
      setQuery(latestResearchSession.query)
    }

    if (latestResearchSession.job_id && !latestResearchSession.job_id.startsWith('chat_')) {
      api
        .getStatus(latestResearchSession.job_id)
        .then((snapshot) => {
          if (snapshot && snapshot.job_id) {
            restore(snapshot)
          } else if (latestResearchSession.snapshot) {
            restore(latestResearchSession.snapshot)
          }
        })
        .catch(() => {
          if (latestResearchSession.snapshot) {
            restore(latestResearchSession.snapshot)
          }
        })
    }
  }, [currentPage, running, job, sessions, query, restore])


  // Save completed jobs locally and to Firestore under active account
  useEffect(() => {
    if (!job || !isTerminalJob(job)) return
    const key = `${job.job_id}:${job.status}`
    if (savedJobRef.current !== key) {
      savedJobRef.current = key
      const userId = user?.uid && !user.guest ? user.uid : null
      setSessions(saveSession(job, {}, userId))
    }
  }, [job, user?.uid, user?.guest])

  const handleStartResearch = useCallback(
    (value) => {
      const trimmed = (value || '').trim()
      if (running) return
      try {
        sessionStorage.removeItem('artha_new_research')
      } catch {}
      setQuery(trimmed)
      navigate('chat')
      if (!trimmed) {
        return
      }
      // Conversational/conceptual queries stay in Copilot without launching backend LangGraph
      if (detectQueryType(trimmed) === 'conversational') {
        reset()
        return
      }

      // Enforce 1-time free report limit for non-logged-in users
      if (!canGuestGenerateReport(user)) {
        setAuthModalOpen(true)
        return
      }

      // Record 1st report usage for guest
      const isLoggedIn = Boolean(user && !user.guest && user.uid && !String(user.uid).startsWith('guest_'))
      if (!isLoggedIn) {
        recordGuestReportUsage()
      }

      start(trimmed)
    },
    [start, navigate, running, reset, user]
  )

  const handleSelectSession = useCallback(
    (session) => {
      if (!session || running) return
      try {
        sessionStorage.removeItem('artha_new_research')
        if (session.job_id) {
          localStorage.setItem('artha_last_viewed_job_id', session.job_id)
        }
      } catch {}
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
    try {
      localStorage.removeItem('artha_active_job')
      localStorage.removeItem('artha_last_viewed_job_id')
      sessionStorage.setItem('artha_new_research', 'true')
    } catch {}
    reset()
    setQuery('')
    navigate('chat')
  }, [reset, running, navigate])

  const handleDeleteSession = useCallback(
    (jobId) => {
      const userId = user?.uid && !user.guest ? user.uid : null
      setSessions(deleteSession(jobId, userId))
    },
    [user?.uid, user?.guest]
  )

  const handleLoginSuccess = useCallback(
    (loggedInUser) => {
      setAuthModalOpen(false)
      if (query || job) {
        navigate('chat')
      } else {
        navigate('landing')
      }
    },
    [query, job, navigate]
  )

  // Login Page route
  if (currentPage === 'login') {
    return (
      <Login
        onLogin={handleLoginSuccess}
        onCancel={() => {
          if (query || job) {
            navigate('chat')
          } else {
            navigate('landing')
          }
        }}
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
              onLogin={handleLoginSuccess}
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
          job={job}
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
          job={job}
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
            onLogin={handleLoginSuccess}
            onCancel={() => setAuthModalOpen(false)}
          />
        </div>
      )}
    </>
  )
}
