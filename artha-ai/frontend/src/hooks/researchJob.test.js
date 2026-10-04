import test from 'node:test'
import assert from 'node:assert/strict'
import { createResearchJob, initialResearchState } from './researchJob.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
const job = (status = 'running', job_id = 'job-1') => ({ job_id, status, query: 'TCS' })

function harness(overrides = {}) {
  const starts = [], polls = [], updates = [], timers = new Map()
  let timerId = 0
  const client = {
    startResearch: async (...args) => { starts.push(args); return { job_id: 'job-1' } },
    getStatus: async (...args) => { polls.push(args); return job() },
    ...overrides,
  }
  const controller = createResearchJob(client, (state) => updates.push(state), (fn, delay) => {
    assert.equal(delay, 2000)
    timers.set(++timerId, fn)
    return timerId
  }, (id) => timers.delete(id))
  return {
    controller, starts, polls, updates, timers,
    get state() { return updates.at(-1) || initialResearchState },
    async tick() {
      const [id, fn] = timers.entries().next().value
      timers.delete(id)
      await fn()
    },
  }
}

test('blank input is ignored and pending submission blocks duplicate requests', async () => {
  const pending = deferred()
  let count = 0
  const h = harness({ startResearch: (...args) => {
    count++
    assert.equal(args[0], 'TCS')
    return pending.promise
  } })
  await h.controller.start('   ')
  assert.equal(count, 0)
  const start = h.controller.start(' TCS ')
  assert.equal(h.state.submitting, true)
  await h.controller.start('duplicate')
  assert.equal(count, 1)
  pending.resolve({ job_id: 'job-1' })
  await start
  assert.equal(h.state.submitting, false)
  assert.equal(h.state.job.job_id, 'job-1')
  await h.controller.start('active job duplicate')
  assert.equal(count, 1)
})

test('submission failure unlocks input and preserves the backend message', async () => {
  const h = harness({ startResearch: async () => { throw new Error('query is required') } })
  await h.controller.start('TCS')
  assert.equal(h.state.submitting, false)
  assert.equal(h.state.job, null)
  assert.match(h.state.error, /Could not submit research: query is required/)
  assert.equal(h.timers.size, 0)
})

test('missing job ID never starts polling', async () => {
  const h = harness({ startResearch: async () => ({}) })
  await h.controller.start('TCS')
  assert.match(h.state.error, /job ID/)
  assert.equal(h.polls.length, 0)
})

test('slow status requests do not overlap', async () => {
  const pending = deferred()
  const h = harness({ getStatus: () => pending.promise })
  await h.controller.start('TCS')
  assert.equal(h.timers.size, 0)
  pending.resolve(job())
  await flush()
  assert.equal(h.timers.size, 1)
  await h.tick()
  assert.equal(h.timers.size, 1)
})

test('unchanged status snapshots do not trigger a render update', async () => {
  const h = harness({ getStatus: async () => job('running') })
  await h.controller.start('TCS')
  const updatesBeforeRepeat = h.updates.length
  await h.tick()
  assert.equal(h.updates.length, updatesBeforeRepeat)
  assert.equal(h.timers.size, 1)
})

for (const status of ['succeeded', 'failed', 'cancelled']) {
  test(`${status} stops polling, including an immediately terminal first response`, async () => {
    const h = harness({ getStatus: async () => job(status) })
    await h.controller.start('TCS')
    assert.equal(h.state.job.status, status)
    assert.equal(h.state.polling, false)
    assert.equal(h.timers.size, 0)
    h.controller.resume()
    assert.equal(h.timers.size, 0)
  })
}

test('polling errors pause updates and resume the same job without another submission', async () => {
  let count = 0
  const h = harness({ getStatus: async (id) => {
    assert.equal(id, 'job-1')
    if (++count === 1) throw new Error('temporarily unavailable')
    return job('succeeded')
  } })
  await h.controller.start('TCS')
  assert.equal(h.state.polling, false)
  assert.match(h.state.error, /Status updates paused/)
  h.controller.resume()
  await flush()
  assert.equal(h.state.error, null)
  assert.equal(h.state.job.status, 'succeeded')
  assert.equal(h.starts.length, 1)
})

for (const reject of [false, true]) {
  test(`reset ignores a late submission ${reject ? 'failure' : 'success'}`, async () => {
    const pending = deferred()
    let signal
    const h = harness({ startResearch: (query, ids, options) => {
      signal = options.signal
      return pending.promise
    } })
    const start = h.controller.start('TCS')
    h.controller.reset()
    assert.equal(signal.aborted, true)
    if (reject) pending.reject(new Error('old failure'))
    else pending.resolve({ job_id: 'old' })
    await start
    assert.deepEqual(h.state, initialResearchState)
    assert.equal(h.polls.length, 0)
  })
}

test('late status responses cannot overwrite a replacement job', async () => {
  const pending = deferred()
  let count = 0
  const h = harness({
    startResearch: async () => ({ job_id: ++count === 1 ? 'old' : 'new' }),
    getStatus: (id) => id === 'old' ? pending.promise : Promise.resolve(job('running', 'new')),
  })
  await h.controller.start('old query')
  h.controller.reset()
  await h.controller.start('new query')
  pending.resolve(job('failed', 'old'))
  await flush()
  assert.equal(h.state.job.job_id, 'new')
  assert.equal(h.state.error, null)
  assert.equal(h.timers.size, 1)
})

test('stop updates aborts only monitoring and resume keeps the current job', async () => {
  const pending = deferred()
  let signal
  const h = harness({ getStatus: (id, options) => {
    signal = options.signal
    return pending.promise
  } })
  await h.controller.start('TCS')
  h.controller.pause()
  assert.equal(signal.aborted, true)
  pending.reject(new Error('late abort'))
  await flush()
  assert.equal(h.state.job.job_id, 'job-1')
  assert.equal(h.state.polling, false)
  assert.equal(h.state.error, null)
  assert.equal(h.timers.size, 0)
})

test('dispose clears scheduled work and ignores late responses', async () => {
  const pending = deferred()
  const h = harness({ getStatus: () => pending.promise })
  await h.controller.start('TCS')
  h.controller.dispose()
  const count = h.updates.length
  pending.resolve(job())
  await flush()
  assert.equal(h.updates.length, count)
  assert.equal(h.timers.size, 0)
  // React StrictMode can set up the same controller again after cleanup.
  await h.controller.start('TCS again')
  assert.equal(h.starts.length, 2)
  h.controller.dispose()
  assert.equal(h.timers.size, 0)
})

test('a mismatched status response is not displayed as the current job', async () => {
  const h = harness({ getStatus: async () => job('succeeded', 'wrong') })
  await h.controller.start('TCS')
  assert.equal(h.state.job.job_id, 'job-1')
  assert.match(h.state.error, /Invalid job status response/)
  assert.equal(h.state.polling, false)
})
