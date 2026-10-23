// Bulls Eye API client.
const rawBase = (import.meta?.env?.VITE_API_URL || '').replace(/\/+$/, '')
const BASE = rawBase ? `${rawBase}/api` : '/api'

async function request(path, options = {}, responseType = 'json') {
  const headers = { ...(options.headers || {}) }
  if (options.body != null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((item) => item.msg).filter(Boolean).join('; ')
      : typeof body?.detail === 'string' ? body.detail : null
    const error = new Error(body?.error?.message || detail || `Request failed: ${res.status}`)
    error.status = res.status
    throw error
  }
  if (responseType === 'blob') {
    const contentType = res.headers.get('content-type')?.toLowerCase() || ''
    if (contentType.includes('text/html') || (!contentType.includes('application/pdf') && !contentType.includes('octet-stream') && !contentType.includes('binary'))) {
      throw new Error('The backend did not return a PDF')
    }
    return res.blob()
  }
  return res.json()
}

export const api = {
  startResearch: (query, documentIds = [], options = {}) =>
    request('/research', {
      ...options,
      method: 'POST',
      body: JSON.stringify({ query, document_ids: documentIds }),
    }),
  getStatus: (jobId, options) => request(`/research/${encodeURIComponent(jobId)}/status`, options),
  getReport: (jobId, options) => request(`/research/${encodeURIComponent(jobId)}/report`, options),
  askReport: (jobId, question, historyOrOptions, maybeOptions) => {
    const hasHistory = Array.isArray(historyOrOptions) && historyOrOptions.length > 0
    const history = hasHistory ? historyOrOptions : []
    const options = !Array.isArray(historyOrOptions) && historyOrOptions ? historyOrOptions : (maybeOptions || {})
    const payload = hasHistory ? { question, history } : { question }
    return request(`/research/${encodeURIComponent(jobId)}/ask`, {
      ...options,
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  getPdf: (jobId, options) => request(`/research/${encodeURIComponent(jobId)}/pdf`, options, 'blob'),
  pdfUrl: (jobId, download = false) => `${BASE}/research/${encodeURIComponent(jobId)}/pdf${download ? '?download=1' : ''}`,
  getHistory: () => request('/research/history'),
  getAgents: () => request('/agents'),
  uploadDocument: (file, meta = {}) => {
    const form = new FormData()
    form.append('file', file)
    Object.entries(meta).forEach(([k, v]) => v && form.append(k, v))
    return fetch(`${BASE}/documents`, { method: 'POST', body: form }).then(async (res) => {
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail = Array.isArray(body?.detail)
          ? body.detail.map((item) => item.msg).filter(Boolean).join('; ')
          : typeof body?.detail === 'string' ? body.detail : null
        throw new Error(body?.error?.message || detail || `Request failed: ${res.status}`)
      }
      return body
    })
  },
  pdfUrl: (jobId) => `${BASE}/research/${encodeURIComponent(jobId)}/pdf`,
}
