import {
  saveConversation as firestoreSaveConversation,
  getUserConversations as firestoreGetUserConversations,
  deleteConversation as firestoreDeleteConversation,
  uploadReportPdf as firebaseUploadReportPdf,
  getUserReports as firestoreGetUserReports,
} from '../services/firebase'

const LOCAL_KEY = 'stock_research_sessions_v2'
const MAX_SESSIONS = 50

function safeParse(raw) {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function loadSessions() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    return safeParse(raw).filter((s) => s && (s.job_id || s.query))
  } catch {
    return []
  }
}

function persist(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, MAX_SESSIONS)))
  } catch {
    /* private mode */
  }
}

// Upsert a finished or running job snapshot.
// If userId is provided, also syncs to Cloud Firestore.
export function saveSession(job, extra = {}, userId = null) {
  if (!job && !extra.query) return loadSessions()
  const jobId = job?.job_id || extra.job_id || `chat_${Date.now()}`
  const now = new Date().toISOString()

  const entry = {
    job_id: jobId,
    query: job?.query || extra.query || '',
    status: job?.status || extra.status || 'succeeded',
    intent: job?.intent || extra.intent || '',
    entities: job?.entities || [],
    selected_agents: job?.selected_agents || [],
    completed_agents: job?.completed_agents || [],
    current_node: job?.current_node || null,
    snapshot: job ? { ...job } : extra.snapshot || null,
    pdfUrl: job?.job_id
      ? `/api/research/${encodeURIComponent(job.job_id)}/pdf`
      : extra.pdfUrl || null,
    storagePdfUrl: extra.storagePdfUrl || null,
    updatedAt: now,
    createdAt: extra.createdAt || now,
  }

  const prev = loadSessions()
  const without = prev.filter((s) => s.job_id !== jobId)
  const existing = prev.find((s) => s.job_id === jobId)
  if (existing?.createdAt) entry.createdAt = existing.createdAt
  if (existing?.storagePdfUrl && !entry.storagePdfUrl) entry.storagePdfUrl = existing.storagePdfUrl

  const next = [entry, ...without].slice(0, MAX_SESSIONS)
  persist(next)

  // Persist to Cloud Firestore if user is authenticated
  if (userId && !String(userId).startsWith('guest_')) {
    firestoreSaveConversation(userId, entry).catch((err) => {
      console.warn('Firestore conversation sync error:', err)
    })
  }

  return next
}

// Pure conversational chat message save
export function saveChatQuery(query, userId = null) {
  const q = (query || '').trim()
  if (!q) return loadSessions()
  const prev = loadSessions()
  if (prev[0]?.query === q) return prev
  return saveSession(
    null,
    {
      job_id: `chat_${Date.now()}`,
      query: q,
      status: 'chat',
    },
    userId
  )
}

export function deleteSession(jobId, userId = null) {
  const next = loadSessions().filter((s) => s.job_id !== jobId)
  persist(next)

  if (userId && !String(userId).startsWith('guest_')) {
    firestoreDeleteConversation(userId, jobId).catch((err) => {
      console.warn('Firestore conversation delete error:', err)
    })
  }

  return next
}

export function clearSessions() {
  try {
    localStorage.removeItem(LOCAL_KEY)
  } catch {}
  return []
}

// Load remote sessions from Cloud Firestore and merge with local
export async function loadUserSessions(userId) {
  const local = loadSessions()
  if (!userId || String(userId).startsWith('guest_')) {
    return local
  }

  try {
    const { conversations, error } = await firestoreGetUserConversations(userId, MAX_SESSIONS)
    if (error || !conversations) return local

    return mergeSessions(local, conversations)
  } catch (err) {
    console.warn('Could not load user sessions from Firestore:', err)
    return local
  }
}

// Merge remote sessions with local sessions by job_id
export function mergeSessions(localList = [], remoteList = []) {
  const byId = new Map()
  for (const s of localList) if (s?.job_id) byId.set(s.job_id, s)
  for (const r of remoteList) {
    if (!r?.job_id) continue
    const prev = byId.get(r.job_id)
    byId.set(r.job_id, {
      job_id: r.job_id,
      query: r.query || prev?.query || '',
      status: r.status || prev?.status || 'succeeded',
      intent: r.intent || prev?.intent || '',
      entities: r.entities || prev?.entities || [],
      selected_agents: r.selected_agents || prev?.selected_agents || [],
      completed_agents: r.completed_agents || prev?.completed_agents || [],
      current_node: r.current_node ?? prev?.current_node ?? null,
      snapshot: { ...(prev?.snapshot || {}), ...r },
      pdfUrl: r.pdfUrl || prev?.pdfUrl || `/api/research/${encodeURIComponent(r.job_id)}/pdf`,
      storagePdfUrl: r.downloadUrl || r.storagePdfUrl || prev?.storagePdfUrl || null,
      updatedAt: r.updatedAt || prev?.updatedAt || new Date().toISOString(),
      createdAt: r.createdAt || prev?.createdAt || new Date().toISOString(),
    })
  }

  const merged = [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, MAX_SESSIONS)

  persist(merged)
  return merged
}

// Upload generated research report PDF to Firebase Storage
export async function persistReportPdfToStorage(userId, jobId, pdfBlob, meta = {}) {
  if (!userId || String(userId).startsWith('guest_') || !pdfBlob) {
    return { downloadUrl: null, storagePath: null }
  }

  try {
    const res = await firebaseUploadReportPdf(userId, jobId, pdfBlob, meta)
    if (res.downloadUrl) {
      // Update session record with the persistent storage PDF URL
      saveSession(null, {
        job_id: jobId,
        query: meta.query || '',
        storagePdfUrl: res.downloadUrl,
      }, userId)
    }
    return res
  } catch (err) {
    console.error('Failed to persist report PDF to Firebase Storage:', err)
    return { downloadUrl: null, storagePath: null, error: err.message }
  }
}

// Fetch saved reports from Firestore
export async function loadUserSavedReports(userId) {
  if (!userId || String(userId).startsWith('guest_')) return []
  const { reports } = await firestoreGetUserReports(userId)
  return reports || []
}
