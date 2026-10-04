// Chat session store — LOCAL for now, DB-ready later.
//
// For now: every finished analysis (job with report/pdf, e.g. "TCS company
// summary") is upserted to localStorage so the chat keeps the report +
// generated details across reloads.
//
// Later (DB mode): swap `loadSessions` to merge `api.getHistory()` — the
// session shape below is intentionally identical to backend JobStatus
// (`job_id, query, status, intent, ...`) so migration is a one-line change.

const KEY = 'artha_chat_sessions_v1'
const MAX = 30

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
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return safeParse(raw).filter((s) => s && (s.job_id || s.query))
  } catch {
    return []
  }
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* private mode — session-only */
  }
}

// Upsert a finished (or running) job snapshot. Call on every terminal
// job change: succeeded / failed. Keeps pdfUrl so reopening is instant.
export function saveSession(job, extra = {}) {
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
    // Full snapshot so reopening works even if backend is down.
    snapshot: job ? { ...job } : extra.snapshot || null,
    pdfUrl: job?.job_id
      ? `/api/research/${encodeURIComponent(job.job_id)}/pdf`
      : extra.pdfUrl || null,
    updatedAt: now,
    createdAt: extra.createdAt || now,
  }
  const prev = loadSessions()
  const without = prev.filter((s) => s.job_id !== jobId)
  // Keep original createdAt on updates.
  const existing = prev.find((s) => s.job_id === jobId)
  if (existing?.createdAt) entry.createdAt = existing.createdAt
  const next = [entry, ...without].slice(0, MAX)
  persist(next)
  return next
}

// Lightweight entry for pure chit-chat (no job/report). Optional — keeps
// the thread list complete.
export function saveChatQuery(query) {
  const q = (query || '').trim()
  if (!q) return loadSessions()
  // Don't duplicate a research session with the same query on top.
  const prev = loadSessions()
  if (prev[0]?.query === q) return prev
  return saveSession(null, {
    job_id: `chat_${Date.now()}`,
    query: q,
    status: 'chat',
  })
}

export function deleteSession(jobId) {
  const next = loadSessions().filter((s) => s.job_id !== jobId)
  persist(next)
  return next
}

export function clearSessions() {
  try {
    localStorage.removeItem(KEY)
  } catch { /* noop */ }
  return []
}

// Merge backend DB history (GET /research/history) with local sessions by
// job_id — backend wins on conflict. This is the future DB-mode path.
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
      pdfUrl: `/api/research/${encodeURIComponent(r.job_id)}/pdf`,
      updatedAt: new Date().toISOString(),
      createdAt: prev?.createdAt || new Date().toISOString(),
    })
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, MAX)
}
