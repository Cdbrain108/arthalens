import test from 'node:test'
import assert from 'node:assert/strict'
import { api } from './client.js'

for (const [name, body, message] of [
  ['FastAPI detail', { detail: 'report not ready' }, 'report not ready'],
  ['FastAPI validation', { detail: [{ msg: 'Field required' }, { msg: 'Invalid query' }] }, 'Field required; Invalid query'],
  ['documented envelope', { error: { message: 'Provider unavailable' } }, 'Provider unavailable'],
  ['empty response', {}, 'Request failed: 404'],
  ['null response', null, 'Request failed: 404'],
]) {
  test(`API errors support ${name}`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status: 404 }))
    await assert.rejects(api.getReport('job-1'), { message, status: 404 })
  })
}

test('non-JSON server errors still show the HTTP status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Gateway error', { status: 502 }))
  await assert.rejects(api.getStatus('job-1'), { message: 'Request failed: 502', status: 502 })
})

test('submission sends the contract body and forwards cancellation signals', async (t) => {
  const controller = new AbortController()
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ job_id: 'job-1' }))
  await api.startResearch('TCS', ['doc-1'], { signal: controller.signal })
  const [url, options] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/research')
  assert.equal(options.method, 'POST')
  assert.equal(options.signal, controller.signal)
  assert.deepEqual(JSON.parse(options.body), { query: 'TCS', document_ids: ['doc-1'] })
})

test('status encodes job IDs and forwards the abort signal', async (t) => {
  const controller = new AbortController()
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'running' }))
  await api.getStatus('a/b', { signal: controller.signal })
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/research/a%2Fb/status')
  assert.equal(fetch.mock.calls[0].arguments[1].signal, controller.signal)
})

test('report questions post to the completed report endpoint', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ answer: 'Grounded answer' }))
  await api.askReport('job/1', 'What changed?')
  const [url, options] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/research/job%2F1/ask')
  assert.equal(options.method, 'POST')
  assert.deepEqual(JSON.parse(options.body), { question: 'What changed?' })
})

test('PDF retrieval returns a blob for view/download instead of navigating to an attachment response', async (t) => {
  const controller = new AbortController()
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('%PDF-1.7', {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment' },
  }))
  const blob = await api.getPdf('job-1', { signal: controller.signal })
  assert.equal(blob.type, 'application/pdf')
  assert.equal(await blob.text(), '%PDF-1.7')
  assert.equal(fetch.mock.calls[0].arguments[1].signal, controller.signal)
})

test('unavailable PDFs expose a retryable UI error rather than a broken link', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'PDF not ready' }, { status: 404 }))
  await assert.rejects(api.getPdf('job-1'), { message: 'PDF not ready', status: 404 })
})

test('a misconfigured proxy returning HTML cannot be advertised as a PDF', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }))
  await assert.rejects(api.getPdf('job-1'), { message: 'The backend did not return a PDF' })
})
