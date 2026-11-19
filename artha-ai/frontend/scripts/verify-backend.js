// Pre-build verification to ensure the production backend URL is live and responsive.
// Prevents baking unreachable or broken backend URLs into the frontend bundle.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envProdPath = path.resolve(__dirname, '../.env.production')
const envPath = path.resolve(__dirname, '../.env')

if (process.env.SKIP_BACKEND_CHECK === 'true' || process.env.SKIP_BACKEND_CHECK === '1') {
  console.log('⚡ SKIP_BACKEND_CHECK is set, skipping backend reachability check.')
  process.exit(0)
}

function getEnvApiUrl() {
  if (process.env.VITE_API_URL && process.env.VITE_API_URL.trim()) {
    return process.env.VITE_API_URL.trim()
  }
  for (const file of [envProdPath, envPath]) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('VITE_API_URL=')) {
          return trimmed.replace('VITE_API_URL=', '').trim().replace(/['"]/g, '')
        }
      }
    }
  }
  return 'https://bullseye-backend-rhl4mlewsa-uc.a.run.app'
}

const rawUrl = getEnvApiUrl()
const cleanBase = rawUrl.replace(/\/+$/, '')
const healthUrl = cleanBase.endsWith('/api') ? `${cleanBase}/health` : `${cleanBase}/api/health`

console.log(`\n🔍 [Pre-build Guard] Validating production backend connectivity...`)
console.log(`   Target: ${healthUrl}`)

async function checkHealth(attempt = 1) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    if (data.status !== 'ok') {
      throw new Error(`Unexpected response payload: ${JSON.stringify(data)}`)
    }

    console.log(`✅ [Pre-build Guard] Backend is healthy! (${data.service || 'service'}, ${(data.agents || []).length} agents ready)`)
    console.log(`   Proceeding with Vite build...\n`)
    process.exit(0)
  } catch (err) {
    if (attempt < 2) {
      console.log(`⏳ [Pre-build Guard] Cold start / slow response (${err.message}). Retrying in 2s...`)
      await new Promise(r => setTimeout(r, 2000))
      return checkHealth(attempt + 1)
    }

    console.error(`\n❌ [Pre-build Guard Error] Production backend is UNREACHABLE!`)
    console.error(`   Target URL: ${healthUrl}`)
    console.error(`   Reason:     ${err.message}`)
    console.error(`\n🚨 BUILD ABORTED: Will not compile frontend with an unreachable backend URL.`)
    console.error(`   Verify Cloud Run status with: gcloud run services describe bullseye-backend --region us-central1`)
    console.error(`   Or set SKIP_BACKEND_CHECK=1 for offline testing.\n`)
    process.exit(1)
  }
}

checkHealth()
