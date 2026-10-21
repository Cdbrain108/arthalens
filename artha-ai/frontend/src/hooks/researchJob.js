export const isTerminalJob = (job) => ['succeeded', 'failed', 'cancelled'].includes(job?.status)

const sameJob = (left, right) => {
  if (!left || !right) return left === right
  // Status payloads are small and this prevents a React tree update when a
  // poll returned exactly the same lifecycle snapshot as the prior poll.
  return JSON.stringify(left) === JSON.stringify(right)
}

export const initialResearchState = { job: null, error: null, submitting: false, polling: false }

// Keep request ownership separate from rendering so late responses cannot revive an old job.
export function createResearchJob(client, onChange, schedule = setTimeout, unschedule = clearTimeout, pollInterval = 2000) {
  let state = initialResearchState
  let generation = 0
  let timer = null
  let request = null

  const update = (patch) => {
    state = { ...state, ...patch }
    onChange(state)
  }

  const invalidate = () => {
    generation += 1
    unschedule(timer)
    timer = null
    request?.abort()
    request = null
  }

  const monitor = (job) => {
    invalidate()
    const owner = generation
    request = new AbortController()
    const { signal } = request
    update({ job, error: null, polling: true })

    const poll = async () => {
      try {
        const next = await client.getStatus(job.job_id, { signal })
        if (owner !== generation) return
        if (next.job_id !== job.job_id || !next.status) throw new Error('Invalid job status response')
        if (!sameJob(state.job, next)) {
          let enrichedJob = { ...next }
          if (next.status === 'succeeded' && !enrichedJob.report) {
            try {
              const rep = await client.getReport(next.job_id, { signal })
              if (rep) enrichedJob.report = rep
            } catch {
              // Ignore failure; ReportPreview will also attempt fetch
            }
          }
          update({ job: enrichedJob, polling: !isTerminalJob(next) })
        } else if (isTerminalJob(next)) {
          // Keep the terminal polling flag correct even if a caller restored a
          // snapshot that already matched the first server response.
          update({ polling: false })
        }
        // Schedule only after the response: slow requests must never overlap.
        if (!isTerminalJob(next)) timer = schedule(poll, pollInterval)
      } catch (error) {
        if (owner !== generation) return
        update({ error: `Status updates paused: ${error.message}`, polling: false })
      }
    }
    void poll()
  }

  // Auto-resume polling immediately when user switches back to browser tab from another mobile app
  const handleForeground = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (state.job && !isTerminalJob(state.job)) {
        unschedule(timer)
        timer = null
        monitor(state.job)
      }
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleForeground)
    window.addEventListener('focus', handleForeground)
  }

  return {
    async start(query) {
      query = query.trim()
      if (!query || state.submitting || (state.job && !isTerminalJob(state.job))) return
      invalidate()
      const owner = generation
      request = new AbortController()
      update({ job: null, error: null, submitting: true, polling: false })
      try {
        const result = await client.startResearch(query, [], { signal: request.signal })
        if (owner !== generation) return
        if (typeof result.job_id !== 'string' || !result.job_id.trim()) {
          throw new Error('The backend did not return a job ID')
        }
        update({ submitting: false })
        monitor({ job_id: result.job_id, status: 'queued', query, selected_agents: [], completed_agents: [] })
      } catch (error) {
        if (owner !== generation) return
        update({ error: `Could not submit research: ${error.message}`, submitting: false })
      }
    },
    pause() {
      invalidate()
      update({ polling: false })
    },
    resume() {
      if (state.job && !isTerminalJob(state.job) && !state.polling) monitor(state.job)
    },
    restore(snapshot) {
      if (!snapshot?.job_id) return
      invalidate()
      const terminal = isTerminalJob(snapshot)
      update({ job: { ...snapshot }, error: null, submitting: false, polling: !terminal })
      // If reopened mid-run (e.g. reload during analysis), resume polling.
      if (!terminal) monitor({ ...snapshot })
    },
    reset() {
      invalidate()
      update(initialResearchState)
    },
    dispose() {
      invalidate()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleForeground)
        window.removeEventListener('focus', handleForeground)
      }
      state = initialResearchState
    },
  }
}
