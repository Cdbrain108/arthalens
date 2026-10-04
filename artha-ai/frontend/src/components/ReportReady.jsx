import { useEffect, useState } from 'react'
import { FileText, Download, RotateCcw, Eye, EyeOff } from 'lucide-react'
import { api } from '../api/client'
import ReportPreview from './ReportPreview'

// Report-ready state — the control room's terminal action: view / download PDF / interactive preview.
export default function ReportReady({ job, onReset }) {
  const jobId = job?.status === 'succeeded' ? job.job_id : null
  const [pdfState, setPdfState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [showPreview, setShowPreview] = useState(true)

  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    let active = true
    let url
    setPdfState({ jobId })
    api.getPdf(jobId, { signal: controller.signal }).then((blob) => {
      if (!active) return
      url = URL.createObjectURL(blob)
      setPdfState({ jobId, url })
    }).catch((error) => {
      if (active) setPdfState({ jobId, error: error.message })
    })
    return () => {
      active = false
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [jobId, attempt])

  if (!jobId) return null
  // A new job must never briefly render the previous job's report link.
  const pdf = pdfState?.jobId === jobId ? pdfState : null
  const selected = job.selected_agents || []

  return (
    <div className="w-full max-w-4xl space-y-3">
      <div className="card card-success animate-pop-in relative w-full overflow-hidden rounded-2xl p-4 shadow-xl border border-white/10 sm:p-5 bg-[#1e2026]">
        {/* Soft success wash */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#4285f4]/10 blur-3xl" aria-hidden />

        <div className="relative flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#34a853]/15 text-[#34a853]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                className="check-draw"
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-[#34a853]">Research complete</h3>
            <p className="mt-1.5 text-[15px] font-medium leading-snug text-primary">{job.query}</p>
            <p className="mt-1 text-[12px] text-muted">
              {pdf?.url ? 'Your multi-agent report & executive charts are ready below.' : 'Research finished. Checking PDF availability…'}
            </p>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="relative mt-3 flex flex-wrap gap-1.5">
            {selected.map((a) => (
              <span key={a} className="rounded-full border border-line bg-panel/60 px-2 py-0.5 text-[10.5px] text-muted">
                {a}
              </span>
            ))}
          </div>
        )}

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          {pdf?.url ? (
            <>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="btn-press flex items-center gap-1.5 rounded-full border border-[#4285f4]/40 bg-[#4285f4]/10 px-4 py-2 text-[13px] font-medium text-[#8ab4f8] hover:bg-[#4285f4]/20"
              >
                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPreview ? 'Hide Interactive Preview' : 'Show Interactive Preview'}
              </button>
              <a href={pdf.url} target="_blank" rel="noreferrer"
                className="btn-press flex items-center gap-1.5 rounded-full border border-line bg-panel/60 px-4 py-2 text-[13px] text-primary hover:border-accent/40 hover:bg-panel">
                <FileText size={14} /> Open PDF
              </a>
              <a href={pdf.url} download={`bullseye_${jobId}.pdf`}
                className="cta-gradient flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold">
                <Download size={14} /> Download PDF
              </a>
            </>
          ) : pdf?.error ? (
            <div role="alert" className="text-[13px] text-rose">
              PDF unavailable: {pdf.error}
              <button onClick={() => setAttempt((value) => value + 1)} className="ml-2 text-accent hover:underline">Retry PDF</button>
            </div>
          ) : <span role="status" className="text-[13px] text-muted">Loading PDF…</span>}
          <button onClick={onReset}
            className="btn-press ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] text-muted hover:text-primary">
            <RotateCcw size={13} /> New research
          </button>
        </div>
      </div>

      {/* Interactive In-Browser Report Preview with KPI Cards & Charts */}
      {showPreview && (
        <ReportPreview jobId={jobId} job={job} pdfUrl={pdf?.url} />
      )}
    </div>
  )
}

